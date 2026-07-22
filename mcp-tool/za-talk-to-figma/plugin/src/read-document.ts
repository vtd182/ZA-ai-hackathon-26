import {
  deduplicateStyles,
  getBounds,
  isMixed,
  serializeNode,
  serializeStyles,
  serializeText,
} from "./serializers";
import type { PluginToolRequest, PluginToolResponse } from "./protocol";

type ReadDetail = "minimal" | "summary" | "compact" | "full";

type SerializeOptions = {
  detail: ReadDetail;
  maxDepth: number;
  maxNodes: number;
  maxTimeMs: number;
  compactInstances: boolean;
  requestId: string;
  progressLabel: string;
};

type SerializeState = {
  visitedNodes: number;
  startedAt: number;
  deadline: number;
  budgetReason: string;
  lastProgressAt: number;
};

const DEFAULT_READ_BUDGET = {
  document: { maxDepth: 12, maxNodes: 3000, maxTimeMs: 18000 },
  node: { maxDepth: 12, maxNodes: 1800, maxTimeMs: 12000 },
  nodeContext: { maxDepth: 3, maxNodes: 1200, maxTimeMs: 10000 },
  designContext: { maxDepth: 2, maxNodes: 1600, maxTimeMs: 12000 },
  search: { maxVisited: 3000, maxTimeMs: 10000 },
  scan: { maxVisited: 3500, maxTimeMs: 12000 },
  fonts: { maxVisited: 4000, maxTimeMs: 12000 },
};

const postProgress = (requestId: string, progress: number, message: string) => {
  figma.ui.postMessage({
    type: "progress_update",
    requestId,
    progress,
    message,
  });
};

const yieldToUI = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const toPositiveInt = (value: any, fallback: number) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
};

const toNonNegativeInt = (value: any, fallback: number) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
};

const normalizeDetail = (value: any, fallback: ReadDetail): ReadDetail => {
  switch (value) {
    case "minimal":
    case "summary":
    case "compact":
    case "full":
      return value;
    default:
      return fallback;
  }
};

const childCountOf = (node: any) => ("children" in node ? node.children.length : 0);

const buildRecommendedNextCalls = (node: any, detail: ReadDetail, depth: number) => [
  {
    tool: "get_node_context",
    args: {
      nodeId: node.id,
      detail: detail === "full" ? "compact" : detail,
      depth: Math.max(1, Math.min(depth + 1, 4)),
      maxNodes: 1800,
      maxTimeMs: 12000,
    },
  },
  {
    tool: "scan_nodes_by_types",
    args: {
      nodeId: node.id,
      types: ["FRAME", "INSTANCE", "TEXT"],
      maxVisited: 2500,
      maxTimeMs: 8000,
    },
  },
];

const fallbackNode = (
  base: any,
  node: any,
  reason: string,
  detail: ReadDetail,
  depth: number,
) => ({
  ...base,
  truncated: true,
  fallbackUsed: true,
  fallbackReason: reason,
  recommendedNextCalls: buildRecommendedNextCalls(node, detail, depth),
});

const budgetReason = (state: SerializeState, opts: SerializeOptions) => {
  if (state.budgetReason) return state.budgetReason;
  if (state.visitedNodes >= opts.maxNodes) {
    state.budgetReason = `Traversal budget exceeded (${opts.maxNodes} nodes).`;
    return state.budgetReason;
  }
  if (Date.now() >= state.deadline) {
    state.budgetReason = `Traversal time budget exceeded (${opts.maxTimeMs} ms).`;
    return state.budgetReason;
  }
  return "";
};

const maybeReportProgress = async (
  state: SerializeState,
  opts: SerializeOptions,
  message: string,
) => {
  const now = Date.now();
  if (now-state.lastProgressAt < 200 && state.visitedNodes % 50 !== 0) {
    return;
  }
  state.lastProgressAt = now;
  const nodeProgress = Math.min(70, Math.round((state.visitedNodes / opts.maxNodes) * 100));
  const timeProgress = Math.min(70, Math.round(((now - state.startedAt) / opts.maxTimeMs) * 100));
  const progress = Math.max(5, Math.min(95, Math.max(nodeProgress, timeProgress)));
  postProgress(opts.requestId, progress, message);
  await yieldToUI();
};

const buildNodeSummary = async (node: any, detail: ReadDetail): Promise<any> => {
  const summary: any = {
    id: node.id,
    name: node.name,
    type: node.type,
    bounds: getBounds(node),
  };

  const childCount = childCountOf(node);
  if (childCount > 0) summary.childCount = childCount;
  if ("visible" in node && !node.visible) summary.visible = false;
  if ("opacity" in node && node.opacity !== 1) summary.opacity = node.opacity;

  if (detail === "minimal") return summary;

  if (detail === "summary" || detail === "compact" || detail === "full") {
    const styles = await serializeStyles(node);
    if (Object.keys(styles).length > 0) summary.styles = styles;
  }

  if (node.type === "TEXT") {
    summary.characters = node.characters;
    if (detail === "compact" || detail === "full") {
      summary.fontSize = isMixed(node.fontSize) ? "mixed" : node.fontSize;
      summary.fontName = isMixed(node.fontName) ? "mixed" : node.fontName;
    }
  }

  if (node.type === "INSTANCE" && (detail === "compact" || detail === "full")) {
    const mainComponent = await node.getMainComponentAsync();
    summary.mainComponentId = mainComponent?.id ?? null;
    if (node.componentProperties) {
      const componentProperties: Record<string, any> = {};
      for (const [key, property] of Object.entries(node.componentProperties)) {
        componentProperties[key] = (property as any).value;
      }
      if (Object.keys(componentProperties).length > 0) {
        summary.componentProperties = componentProperties;
      }
    }
  }

  return summary;
};

const serializeNodeWithBudget = async (
  node: any,
  opts: SerializeOptions,
  state: SerializeState,
  depth: number,
): Promise<any> => {
  await maybeReportProgress(state, opts, `${opts.progressLabel}: ${node.name}`);

  const beforeReason = budgetReason(state, opts);
  if (beforeReason) {
    return fallbackNode(await buildNodeSummary(node, "summary"), node, beforeReason, opts.detail, depth);
  }

  state.visitedNodes++;

  if (opts.compactInstances && node.type === "INSTANCE" && depth > 0) {
    return fallbackNode(
      await buildNodeSummary(node, "compact"),
      node,
      "Instance subtree compacted for a large traversal.",
      opts.detail,
      depth,
    );
  }

  let current: any;
  if (opts.detail === "full") {
    const base = await buildNodeSummary(node, "compact");
    current = node.type === "TEXT" ? await serializeText(node, base) : base;
  } else {
    current = await buildNodeSummary(node, opts.detail);
  }

  const childCount = childCountOf(node);
  if (childCount === 0) return current;

  if (depth >= opts.maxDepth) {
    return fallbackNode(current, node, `Depth limit reached at ${opts.maxDepth}.`, opts.detail, depth);
  }

  const children: any[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const reason = budgetReason(state, opts);
    if (reason) break;
    if (i > 0 && i % 25 === 0) {
      await maybeReportProgress(state, opts, `${opts.progressLabel}: ${node.name} (${i}/${node.children.length})`);
    }
    children.push(await serializeNodeWithBudget(node.children[i], opts, state, depth + 1));
  }

  if (children.length === node.children.length) {
    return { ...current, children };
  }

  return fallbackNode(
    {
      ...current,
      children,
      childCount,
    },
    node,
    state.budgetReason || "Traversal stopped early for a large subtree.",
    opts.detail,
    depth,
  );
};

const makeSerializeOptions = (
  request: any,
  defaults: { maxDepth: number; maxNodes: number; maxTimeMs: number },
  fallbackDetail: ReadDetail,
  fallbackCompactInstances: boolean,
): SerializeOptions => {
  const params = request.params || {};
  return {
    detail: normalizeDetail(params.detail, fallbackDetail),
    maxDepth: toNonNegativeInt(params.depth, defaults.maxDepth),
    maxNodes: toPositiveInt(params.maxNodes, defaults.maxNodes),
    maxTimeMs: toPositiveInt(params.maxTimeMs, defaults.maxTimeMs),
    compactInstances: typeof params.compactInstances === "boolean"
      ? params.compactInstances
      : fallbackCompactInstances,
    requestId: request.requestId,
    progressLabel: request.type,
  };
};

const createState = (opts: SerializeOptions): SerializeState => ({
  visitedNodes: 0,
  startedAt: Date.now(),
  deadline: Date.now() + opts.maxTimeMs,
  budgetReason: "",
  lastProgressAt: 0,
});

const serializeSelectionSummary = async (selection: readonly SceneNode[]) =>
  Promise.all(selection.map((node) => buildNodeSummary(node, "compact")));

const collectMainComponentIDs = (node: any, ids: Set<string>) => {
  if (!node || typeof node !== "object") return;
  if (typeof node.mainComponentId === "string" && node.mainComponentId !== "") {
    ids.add(node.mainComponentId);
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => collectMainComponentIDs(child, ids));
  }
};

const traversalExceeded = (visited: number, deadline: number, maxVisited: number, maxTimeMs: number) => {
  if (visited >= maxVisited) return `Traversal budget exceeded (${maxVisited} nodes).`;
  if (Date.now() >= deadline) return `Traversal time budget exceeded (${maxTimeMs} ms).`;
  return "";
};

export const handleReadDocumentRequest = async (
  request: PluginToolRequest,
): Promise<PluginToolResponse | null> => {
  switch (request.type) {
    case "get_document": {
      const opts = makeSerializeOptions(request, DEFAULT_READ_BUDGET.document, "full", false);
      const state = createState(opts);
      const raw = await serializeNodeWithBudget(figma.currentPage, opts, state, 0);
      const { tree, globalVars } = deduplicateStyles(raw);
      return {
        type: request.type,
        requestId: request.requestId,
        data: globalVars ? { ...tree, globalVars } : tree,
      };
    }

    case "get_selection":
      return {
        type: request.type,
        requestId: request.requestId,
        data: await serializeSelectionSummary(figma.currentPage.selection),
      };

    case "get_node":
    case "get_node_context": {
      const nodeId = request.nodeIds && request.nodeIds[0];
      if (!nodeId) throw new Error("nodeIds is required for get_node");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node || node.type === "DOCUMENT") {
        throw new Error(`Node not found: ${nodeId}`);
      }
      const defaults = request.type === "get_node_context"
        ? DEFAULT_READ_BUDGET.nodeContext
        : DEFAULT_READ_BUDGET.node;
      const opts = makeSerializeOptions(
        request,
        defaults,
        request.type === "get_node_context" ? "compact" : "full",
        request.type === "get_node_context",
      );
      const state = createState(opts);
      return {
        type: request.type,
        requestId: request.requestId,
        data: await serializeNodeWithBudget(node, opts, state, 0),
      };
    }

    case "get_nodes_info": {
      if (!request.nodeIds || request.nodeIds.length === 0) {
        throw new Error("nodeIds is required for get_nodes_info");
      }
      const opts = makeSerializeOptions(request, DEFAULT_READ_BUDGET.nodeContext, "compact", true);
      const nodes = await Promise.all(request.nodeIds.map((id: string) => figma.getNodeByIdAsync(id)));
      const data: any[] = [];
      for (const node of nodes) {
        if (!node || node.type === "DOCUMENT") continue;
        const state = createState(opts);
        data.push(await serializeNodeWithBudget(node, opts, state, 0));
      }
      return {
        type: request.type,
        requestId: request.requestId,
        data,
      };
    }

    case "get_design_context": {
      const params = request.params || {};
      const dedupeComponents = !!params.dedupeComponents;
      const opts = makeSerializeOptions(
        request,
        DEFAULT_READ_BUDGET.designContext,
        normalizeDetail(params.detail, "full"),
        dedupeComponents,
      );
      const selection = figma.currentPage.selection;
      const roots = selection.length > 0 ? selection : [figma.currentPage];
      const rawContextNodes: any[] = [];
      for (const root of roots) {
        const state = createState(opts);
        rawContextNodes.push(await serializeNodeWithBudget(root, opts, state, 0));
      }
      const { tree: dedupedNodes, globalVars } = deduplicateStyles({ children: rawContextNodes });
      const contextNodes = (dedupedNodes as any).children;

      let componentDefs: Record<string, any> | undefined;
      if (dedupeComponents) {
        const componentIDs = new Set<string>();
        contextNodes.forEach((node: any) => collectMainComponentIDs(node, componentIDs));
        if (componentIDs.size > 0) {
          componentDefs = {};
          for (const componentID of componentIDs) {
            const componentNode = await figma.getNodeByIdAsync(componentID);
            if (!componentNode || componentNode.type === "DOCUMENT") continue;
            const componentOpts = makeSerializeOptions(
              {
                ...request,
                params: {
                  ...params,
                  detail: "compact",
                  depth: 1,
                  compactInstances: false,
                },
              },
              DEFAULT_READ_BUDGET.nodeContext,
              "compact",
              false,
            );
            const componentState = createState(componentOpts);
            componentDefs[componentID] = await serializeNodeWithBudget(componentNode, componentOpts, componentState, 0);
          }
        }
      }

      return {
        type: request.type,
        requestId: request.requestId,
        data: {
          fileName: figma.root.name,
          currentPage: {
            id: figma.currentPage.id,
            name: figma.currentPage.name,
          },
          selectionCount: selection.length,
          context: contextNodes,
          ...(componentDefs ? { componentDefs } : {}),
          ...(globalVars ? { globalVars } : {}),
        },
      };
    }

    case "get_metadata":
      return {
        type: request.type,
        requestId: request.requestId,
        data: {
          fileName: figma.root.name,
          currentPageId: figma.currentPage.id,
          currentPageName: figma.currentPage.name,
          pageCount: figma.root.children.length,
          pages: figma.root.children.map((page) => ({
            id: page.id,
            name: page.name,
          })),
        },
      };

    case "get_pages":
      return {
        type: request.type,
        requestId: request.requestId,
        data: {
          currentPageId: figma.currentPage.id,
          pages: figma.root.children.map((page) => ({
            id: page.id,
            name: page.name,
          })),
        },
      };

    case "get_viewport":
      return {
        type: request.type,
        requestId: request.requestId,
        data: {
          center: { x: figma.viewport.center.x, y: figma.viewport.center.y },
          zoom: figma.viewport.zoom,
          bounds: {
            x: figma.viewport.bounds.x,
            y: figma.viewport.bounds.y,
            width: figma.viewport.bounds.width,
            height: figma.viewport.bounds.height,
          },
        },
      };

    case "get_fonts": {
      const params = request.params || {};
      const maxVisited = toPositiveInt(params.maxVisited, DEFAULT_READ_BUDGET.fonts.maxVisited);
      const maxTimeMs = toPositiveInt(params.maxTimeMs, DEFAULT_READ_BUDGET.fonts.maxTimeMs);
      const deadline = Date.now() + maxTimeMs;
      const fontMap = new Map<string, any>();
      let visited = 0;
      let truncated = false;
      let reason = "";

      const collectFonts = async (node: any) => {
        if (truncated) return;
        visited++;
        if (visited % 75 === 0) {
          postProgress(request.requestId, 20, `Scanning fonts… (${visited} nodes)`);
          await yieldToUI();
        }
        reason = traversalExceeded(visited, deadline, maxVisited, maxTimeMs);
        if (reason) {
          truncated = true;
          return;
        }
        if (node.type === "TEXT") {
          const fontName = node.fontName;
          if (typeof fontName !== "symbol" && fontName) {
            const key = `${fontName.family}::${fontName.style}`;
            if (!fontMap.has(key)) {
              fontMap.set(key, { family: fontName.family, style: fontName.style, nodeCount: 0 });
            }
            fontMap.get(key).nodeCount++;
          }
        }
        if ("children" in node) {
          for (const child of node.children) {
            await collectFonts(child);
            if (truncated) break;
          }
        }
      };

      await collectFonts(figma.currentPage);
      const fonts = Array.from(fontMap.values()).sort((a, b) => b.nodeCount - a.nodeCount);
      return {
        type: request.type,
        requestId: request.requestId,
        data: {
          count: fonts.length,
          fonts,
          visitedNodes: visited,
          truncated,
          ...(reason ? { fallbackReason: reason } : {}),
        },
      };
    }

    case "search_nodes": {
      const params = request.params || {};
      const query = params.query ? String(params.query).toLowerCase() : "";
      const scopeNodeId = params.nodeId;
      const types = Array.isArray(params.types) ? params.types : [];
      const limit = toPositiveInt(params.limit, 50);
      const maxVisited = toPositiveInt(params.maxVisited, DEFAULT_READ_BUDGET.search.maxVisited);
      const maxTimeMs = toPositiveInt(params.maxTimeMs, DEFAULT_READ_BUDGET.search.maxTimeMs);
      const root = scopeNodeId ? await figma.getNodeByIdAsync(scopeNodeId) : figma.currentPage;
      if (!root) throw new Error(`Node not found: ${scopeNodeId}`);

      const results: any[] = [];
      let visited = 0;
      let truncated = false;
      let reason = "";
      const deadline = Date.now() + maxTimeMs;

      const search = async (node: any) => {
        if (truncated || results.length >= limit) return;
        visited++;
        if (visited % 75 === 0) {
          postProgress(request.requestId, 25, `Searching nodes… (${visited} visited)`);
          await yieldToUI();
        }
        reason = traversalExceeded(visited, deadline, maxVisited, maxTimeMs);
        if (reason) {
          truncated = true;
          return;
        }
        if (node !== root) {
          const nameMatch = !query || node.name.toLowerCase().includes(query);
          const typeMatch = types.length === 0 || types.includes(node.type);
          if (nameMatch && typeMatch) {
            results.push({
              id: node.id,
              name: node.name,
              type: node.type,
              bounds: getBounds(node),
              childCount: childCountOf(node),
            });
          }
        }
        if ("children" in node) {
          for (const child of node.children) {
            await search(child);
            if (truncated || results.length >= limit) break;
          }
        }
      };

      await search(root);
      return {
        type: request.type,
        requestId: request.requestId,
        data: {
          count: results.length,
          nodes: results,
          visitedNodes: visited,
          truncated,
          ...(reason ? { fallbackReason: reason } : {}),
          ...(truncated
            ? { recommendedNextCalls: buildRecommendedNextCalls(root, "compact", 2) }
            : {}),
        },
      };
    }

    case "get_reactions": {
      const nodeId = request.nodeIds && request.nodeIds[0];
      if (!nodeId) throw new Error("nodeId is required for get_reactions");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node || node.type === "DOCUMENT") throw new Error(`Node not found: ${nodeId}`);
      const reactions = "reactions" in node ? node.reactions : [];
      return {
        type: request.type,
        requestId: request.requestId,
        data: { nodeId: node.id, name: node.name, reactions },
      };
    }

    case "scan_text_nodes": {
      const params = request.params || {};
      const nodeId = params.nodeId;
      if (!nodeId) throw new Error("nodeId is required for scan_text_nodes");
      const root = await figma.getNodeByIdAsync(nodeId);
      if (!root) throw new Error(`Node not found: ${nodeId}`);
      const maxVisited = toPositiveInt(params.maxVisited, DEFAULT_READ_BUDGET.scan.maxVisited);
      const maxTimeMs = toPositiveInt(params.maxTimeMs, DEFAULT_READ_BUDGET.scan.maxTimeMs);
      const deadline = Date.now() + maxTimeMs;

      const textNodes: any[] = [];
      let visited = 0;
      let truncated = false;
      let reason = "";

      const findText = async (node: any) => {
        if (truncated) return;
        visited++;
        if (visited % 75 === 0) {
          postProgress(request.requestId, 15, `Scanning text nodes… (${visited} visited)`);
          await yieldToUI();
        }
        reason = traversalExceeded(visited, deadline, maxVisited, maxTimeMs);
        if (reason) {
          truncated = true;
          return;
        }
        if (node.type === "TEXT") {
          textNodes.push({
            id: node.id,
            name: node.name,
            characters: node.characters,
            fontSize: isMixed(node.fontSize) ? "mixed" : node.fontSize,
            fontName: isMixed(node.fontName) ? "mixed" : node.fontName,
          });
        }
        if ("children" in node) {
          for (const child of node.children) {
            await findText(child);
            if (truncated) break;
          }
        }
      };

      await findText(root);
      return {
        type: request.type,
        requestId: request.requestId,
        data: {
          count: textNodes.length,
          textNodes,
          visitedNodes: visited,
          truncated,
          ...(reason ? { fallbackReason: reason } : {}),
        },
      };
    }

    case "scan_nodes_by_types": {
      const params = request.params || {};
      const nodeId = params.nodeId;
      const types = Array.isArray(params.types) ? params.types : [];
      if (!nodeId) throw new Error("nodeId is required for scan_nodes_by_types");
      if (types.length === 0) throw new Error("types must be a non-empty array");
      const root = await figma.getNodeByIdAsync(nodeId);
      if (!root) throw new Error(`Node not found: ${nodeId}`);

      const maxVisited = toPositiveInt(params.maxVisited, DEFAULT_READ_BUDGET.scan.maxVisited);
      const maxTimeMs = toPositiveInt(params.maxTimeMs, DEFAULT_READ_BUDGET.scan.maxTimeMs);
      const deadline = Date.now() + maxTimeMs;

      const matchingNodes: any[] = [];
      let visited = 0;
      let truncated = false;
      let reason = "";

      const findByTypes = async (node: any) => {
        if (truncated) return;
        visited++;
        if (visited % 75 === 0) {
          postProgress(request.requestId, 15, `Scanning nodes… (${visited} visited)`);
          await yieldToUI();
        }
        reason = traversalExceeded(visited, deadline, maxVisited, maxTimeMs);
        if (reason) {
          truncated = true;
          return;
        }
        if ("visible" in node && !node.visible) return;
        if (types.includes(node.type)) {
          matchingNodes.push({
            id: node.id,
            name: node.name,
            type: node.type,
            bounds: getBounds(node),
            childCount: childCountOf(node),
          });
        }
        if ("children" in node) {
          for (const child of node.children) {
            await findByTypes(child);
            if (truncated) break;
          }
        }
      };

      await findByTypes(root);
      return {
        type: request.type,
        requestId: request.requestId,
        data: {
          count: matchingNodes.length,
          matchingNodes,
          searchedTypes: types,
          visitedNodes: visited,
          truncated,
          ...(reason ? { fallbackReason: reason } : {}),
          ...(truncated
            ? { recommendedNextCalls: buildRecommendedNextCalls(root, "compact", 2) }
            : {}),
        },
      };
    }

    default:
      return null;
  }
};
