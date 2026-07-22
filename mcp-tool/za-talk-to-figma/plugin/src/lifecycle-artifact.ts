import type { PluginToolRequest, PluginToolResponse } from "./runtime/protocol";

const metadataKey = "za-pm-lifecycle";
const maxScannedNodes = 5000;

type JsonRecord = Record<string, any>;

const readMetadata = (node: BaseNode): JsonRecord | null => {
  const raw = node.getPluginData(metadataKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as JsonRecord : null;
  } catch {
    return null;
  }
};

const writeMetadata = (node: BaseNode, metadata: JsonRecord) => {
  node.setPluginData(metadataKey, JSON.stringify(metadata));
};

const walkPage = (page: PageNode): BaseNode[] => {
  const found: BaseNode[] = [];
  const queue: BaseNode[] = [...page.children];
  while (queue.length > 0 && found.length < maxScannedNodes) {
    const node = queue.shift()!;
    found.push(node);
    if ("children" in node) queue.push(...node.children);
  }
  return found;
};

const findArtifactRoot = (page: PageNode, idempotencyKey: string): BaseNode | null =>
  walkPage(page).find((node) => {
    const metadata = readMetadata(node);
    return metadata?.kind === "artifact_root" && metadata.idempotencyKey === idempotencyKey;
  }) ?? null;

const requireCurrentPage = (targetPageId: unknown): PageNode => {
  if (typeof targetPageId !== "string" || !targetPageId) throw new Error("targetPageId is required");
  if (figma.currentPage.id !== targetPageId) {
    throw new Error(`TARGET_NOT_ALLOWED: current page ${figma.currentPage.id} does not match ${targetPageId}`);
  }
  return figma.currentPage;
};

const localComponentByKey = async (key: string): Promise<ComponentNode> => {
  for (const page of figma.root.children) {
    await page.loadAsync();
    const local = page.findAllWithCriteria({ types: ["COMPONENT"] }).find((component) => component.key === key);
    if (local?.type === "COMPONENT") return local;
  }
  try {
    return await figma.importComponentByKeyAsync(key);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`COMPONENT_UNAVAILABLE: ${key}: ${detail}`);
  }
};

const flattenEdges = (screens: JsonRecord[]): JsonRecord[] =>
  screens.flatMap((screen) => Array.isArray(screen.prototypeEdges) ? screen.prototypeEdges : []);

const applyArtifact = async (params: JsonRecord): Promise<JsonRecord> => {
  const resolvedPlan = params.preflightPlan as JsonRecord | undefined;
  const source = resolvedPlan?.source as JsonRecord | undefined;
  const planHash = typeof params.planHash === "string" ? params.planHash : "";
  const metadata = source?.metadata as JsonRecord | undefined;
  const screens = Array.isArray(source?.screens) ? source.screens as JsonRecord[] : [];
  const resolvedSlots = Array.isArray(resolvedPlan?.resolvedSlots) ? resolvedPlan.resolvedSlots as JsonRecord[] : [];
  if (!resolvedPlan || !source || !metadata || screens.length === 0 || !planHash) {
    throw new Error("preflightPlan, planHash, metadata and screens are required");
  }
  const page = requireCurrentPage(params.targetPageId);
  const idempotencyKey = String(metadata.idempotencyKey ?? "");
  if (!idempotencyKey) throw new Error("lifecycle idempotencyKey is required");

  const existing = findArtifactRoot(page, idempotencyKey);
  if (existing) {
    const existingMetadata = readMetadata(existing)!;
    if (existingMetadata.planHash !== planHash) {
      throw new Error(`IDEMPOTENCY_CONFLICT: ${idempotencyKey} already exists with another plan hash`);
    }
    return { ...readArtifact(page, idempotencyKey), idempotent: true };
  }

  const root = figma.createSection();
  root.name = `PM Lifecycle · ${String(metadata.specId ?? "Artifact")} · v${String(metadata.specVersion ?? "")}`;
  root.x = 0;
  root.y = 0;
  page.appendChild(root);
  writeMetadata(root, {
    ...metadata,
    kind: "artifact_root",
    planHash,
    targetHash: source.target?.targetHash,
    targetPageId: page.id,
  });

  try {
    for (const [index, screen] of screens.entries()) {
      const frame = figma.createFrame();
      frame.name = `${String(screen.screenId)} · ${String(screen.name)}`;
      frame.resize(360, 720);
      frame.x = index * 420;
      frame.y = 80;
      frame.layoutMode = "VERTICAL";
      frame.primaryAxisSizingMode = "FIXED";
      frame.counterAxisSizingMode = "FIXED";
      frame.itemSpacing = 16;
      frame.paddingTop = 24;
      frame.paddingRight = 16;
      frame.paddingBottom = 24;
      frame.paddingLeft = 16;
      root.appendChild(frame);
      writeMetadata(frame, {
        ...metadata,
        kind: "screen",
        screenId: screen.screenId,
        requirementIds: screen.requirementIds,
        planHash,
      });

      const screenSlots = resolvedSlots.filter((slot) => slot.screenId === screen.screenId);
      for (const slot of screenSlots) {
        let node: SceneNode;
        if (slot.resolution === "component" && typeof slot.componentKey === "string") {
          const component = await localComponentByKey(slot.componentKey);
          node = component.createInstance();
        } else if (source.mode === "free" && slot.resolution === "primitive_fallback") {
          const fallback = figma.createFrame();
          fallback.name = `Fallback · ${String(slot.slotKey)}`;
          fallback.resize(328, 56);
          node = fallback;
        } else {
          throw new Error(`STRICT_PLAN_VIOLATION: unresolved slot ${String(slot.slotKey)}`);
        }
        node.name = `${String(slot.slotKey)} · ${node.name}`;
        frame.appendChild(node);
        writeMetadata(node, {
          ...metadata,
          kind: "slot",
          screenId: screen.screenId,
          requirementIds: screen.requirementIds,
          slotKey: slot.slotKey,
          componentKey: slot.componentKey ?? null,
          semanticRole: slot.semanticRole ?? null,
          primitiveFallback: slot.resolution === "primitive_fallback",
          planHash,
        });
      }
    }
    root.resizeWithoutConstraints(Math.max(420, screens.length * 420), 840);
    writeMetadata(root, { ...readMetadata(root), prototypeEdges: flattenEdges(screens) });
    figma.commitUndo();
    return { ...readArtifact(page, idempotencyKey), idempotent: false };
  } catch (error) {
    root.remove();
    throw error;
  }
};

const readArtifact = (page: PageNode, idempotencyKey: string): JsonRecord => {
  const root = findArtifactRoot(page, idempotencyKey);
  if (!root) throw new Error(`ARTIFACT_NOT_FOUND: ${idempotencyKey}`);
  const rootMetadata = readMetadata(root)!;
  const screens = "children" in root ? root.children.flatMap((node) => {
    const metadata = readMetadata(node);
    if (metadata?.kind !== "screen") return [];
    const childSlots = "children" in node ? node.children.flatMap((child) => {
      const slot = readMetadata(child);
      return slot?.kind === "slot" ? [{
        slotKey: String(slot.slotKey),
        componentKey: typeof slot.componentKey === "string" ? slot.componentKey : null,
        semanticRole: typeof slot.semanticRole === "string" ? slot.semanticRole : null,
        primitiveFallback: Boolean(slot.primitiveFallback),
      }] : [];
    }) : [];
    return [{
      nodeId: node.id,
      screenId: String(metadata.screenId),
      name: node.name,
      componentKey: null,
      semanticRole: null,
      metadata: {
        namespace: metadata.namespace,
        runId: metadata.runId,
        threadId: metadata.threadId,
        actionId: metadata.actionId,
        specId: metadata.specId,
        specVersion: metadata.specVersion,
        idempotencyKey: metadata.idempotencyKey,
        screenId: metadata.screenId,
        requirementIds: metadata.requirementIds,
        planHash: metadata.planHash,
      },
      childSlots,
    }];
  }) : [];
  return {
    schemaVersion: 1,
    targetHash: String(rootMetadata.targetHash ?? ""),
    planHash: String(rootMetadata.planHash),
    idempotencyKey,
    rootNodeIds: [root.id],
    screens,
    prototypeEdges: Array.isArray(rootMetadata.prototypeEdges) ? rootMetadata.prototypeEdges : [],
    readAt: new Date().toISOString(),
  };
};

export const handleLifecycleArtifactRequest = async (
  request: PluginToolRequest,
): Promise<PluginToolResponse | null> => {
  const params = request.params ?? {};
  switch (request.type) {
    case "apply_lifecycle_artifact_plan":
      return { type: request.type, requestId: request.requestId, data: await applyArtifact(params) };
    case "read_lifecycle_artifact": {
      const page = requireCurrentPage(params.targetPageId);
      const idempotencyKey = typeof params.idempotencyKey === "string" ? params.idempotencyKey : "";
      if (!idempotencyKey) throw new Error("idempotencyKey is required");
      return { type: request.type, requestId: request.requestId, data: readArtifact(page, idempotencyKey) };
    }
    default:
      return null;
  }
};
