import type { PluginToolRequest, PluginToolResponse } from "./runtime/protocol";

const metadataKey = "za-pm-lifecycle";

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

const findArtifactRoot = (page: PageNode, idempotencyKey: string): BaseNode | null =>
  page.children.find((node) => {
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

const solid = (r: number, g: number, b: number): SolidPaint => ({
  type: "SOLID",
  color: { r: r / 255, g: g / 255, b: b / 255 },
});

const readableLabel = (slotKey: unknown): string => String(slotKey ?? "Component")
  .replace(/^\d+-/, "")
  .split("-")
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(" ");

const appendText = async (
  parent: ChildrenMixin,
  characters: string,
  fontSize: number,
  color: SolidPaint,
): Promise<TextNode> => {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  const text = figma.createText();
  text.fontName = { family: "Inter", style: "Regular" };
  text.fontSize = fontSize;
  text.characters = characters;
  text.fills = [color];
  parent.appendChild(text);
  return text;
};

const styleScreen = (frame: FrameNode) => {
  frame.fills = [solid(255, 255, 255)];
  frame.strokes = [solid(210, 220, 225)];
  frame.strokeWeight = 1;
  frame.cornerRadius = 20;
  frame.clipsContent = true;
};

const createFallbackSlot = async (slot: JsonRecord): Promise<FrameNode> => {
  const fallback = figma.createFrame();
  const key = String(slot.slotKey ?? "");
  const isPrimary = key.includes("primary-button");
  const isStatus = key.includes("status-message") || key.includes("pickup-code");
  const isHeader = key.includes("app-header");
  fallback.name = `Fallback · ${key}`;
  fallback.resize(328, isHeader ? 52 : 64);
  fallback.layoutMode = "VERTICAL";
  fallback.primaryAxisSizingMode = "FIXED";
  fallback.counterAxisSizingMode = "FIXED";
  fallback.paddingTop = 16;
  fallback.paddingRight = 16;
  fallback.paddingBottom = 16;
  fallback.paddingLeft = 16;
  fallback.cornerRadius = isPrimary ? 10 : 8;
  fallback.strokes = isPrimary ? [] : [solid(210, 220, 225)];
  fallback.strokeWeight = 1;
  fallback.fills = [isPrimary
    ? solid(0, 104, 225)
    : isStatus
      ? solid(230, 248, 240)
      : isHeader
        ? solid(232, 242, 255)
        : solid(248, 250, 251)];
  await appendText(
    fallback,
    readableLabel(key),
    isPrimary ? 14 : 13,
    isPrimary ? solid(255, 255, 255) : isStatus ? solid(18, 112, 78) : solid(35, 49, 56),
  );
  return fallback;
};

const artifactX = (page: PageNode): number => {
  const rightEdge = page.children.reduce((right, node) => {
    if (!("x" in node) || !("width" in node)) return right;
    return Math.max(right, node.x + node.width);
  }, 0);
  return rightEdge + 240;
};

const focusArtifact = (node: SceneNode) => {
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
};

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
    focusArtifact(existing as SceneNode);
    return { ...readArtifact(page, idempotencyKey), idempotent: true };
  }

  const root = figma.createSection();
  root.name = `PM Lifecycle · ${String(metadata.specId ?? "Artifact")} · v${String(metadata.specVersion ?? "")}`;
  root.x = artifactX(page);
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
      styleScreen(frame);
      root.appendChild(frame);
      writeMetadata(frame, {
        ...metadata,
        kind: "screen",
        screenId: screen.screenId,
        requirementIds: screen.requirementIds,
        planHash,
      });
      const title = await appendText(frame, String(screen.name ?? screen.screenId), 20, solid(25, 36, 43));
      title.name = "Screen title";
      const purpose = await appendText(frame, String(screen.purpose ?? ""), 12, solid(94, 110, 118));
      purpose.name = "Screen purpose";

      const screenSlots = resolvedSlots.filter((slot) => slot.screenId === screen.screenId);
      for (const slot of screenSlots) {
        let node: SceneNode;
        if (slot.resolution === "component" && typeof slot.componentKey === "string") {
          const component = await localComponentByKey(slot.componentKey);
          node = component.createInstance();
        } else if (source.mode === "free" && slot.resolution === "primitive_fallback") {
          node = await createFallbackSlot(slot);
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
    root.resizeWithoutConstraints(Math.max(420, screens.length * 420), 900);
    writeMetadata(root, { ...readMetadata(root), prototypeEdges: flattenEdges(screens) });
    focusArtifact(root);
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
