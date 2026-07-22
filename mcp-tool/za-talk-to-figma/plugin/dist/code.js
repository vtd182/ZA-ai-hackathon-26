var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
(function() {
  "use strict";
  const isMixed = (value) => typeof value === "symbol";
  const pixelRound = (v) => Math.round(v * 100) / 100;
  const toHex = (color) => {
    const clamp = (v) => Math.min(255, Math.max(0, Math.round(v * 255)));
    const [r, g, b] = [clamp(color.r), clamp(color.g), clamp(color.b)];
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  };
  const serializePaints = (paints) => {
    if (isMixed(paints)) return "mixed";
    if (!paints || !Array.isArray(paints)) return void 0;
    const result = paints.filter((paint) => paint.visible !== false).map((paint) => {
      var _a, _b;
      const opacity = (_a = paint.opacity) != null ? _a : 1;
      if (paint.type === "SOLID") {
        const entry2 = { type: "SOLID", color: toHex(paint.color) };
        if (opacity !== 1) entry2.opacity = Math.round(opacity * 100) / 100;
        return entry2;
      }
      if (typeof paint.type === "string" && paint.type.startsWith("GRADIENT_")) {
        const entry2 = { type: paint.type };
        if (opacity !== 1) entry2.opacity = Math.round(opacity * 100) / 100;
        if (Array.isArray(paint.gradientStops)) {
          entry2.gradientStops = paint.gradientStops.map((stop) => {
            var _a2;
            const s = {
              position: Math.round(stop.position * 1e3) / 1e3,
              color: toHex(stop.color)
            };
            if (((_a2 = stop.color) == null ? void 0 : _a2.a) != null && stop.color.a !== 1)
              s.colorOpacity = Math.round(stop.color.a * 100) / 100;
            return s;
          });
        }
        return entry2;
      }
      if (paint.type === "IMAGE") {
        const entry2 = { type: "IMAGE", scaleMode: paint.scaleMode };
        if (opacity !== 1) entry2.opacity = Math.round(opacity * 100) / 100;
        return entry2;
      }
      const entry = { type: (_b = paint.type) != null ? _b : "UNKNOWN" };
      if (opacity !== 1) entry.opacity = Math.round(opacity * 100) / 100;
      return entry;
    });
    return result.length > 0 ? result : void 0;
  };
  const getBounds = (node) => {
    if ("x" in node && "y" in node && "width" in node && "height" in node) {
      return {
        x: pixelRound(node.x),
        y: pixelRound(node.y),
        width: pixelRound(node.width),
        height: pixelRound(node.height)
      };
    }
    return void 0;
  };
  const serializeStyles = (node) => __async(null, null, function* () {
    const styles = {};
    if ("fills" in node) {
      if (node.fillStyleId && typeof node.fillStyleId === "string") {
        const style = yield figma.getStyleByIdAsync(node.fillStyleId);
        if (style) styles.fillStyle = style.name;
      }
      const fills = serializePaints(node.fills);
      if (fills !== void 0) styles.fills = fills;
    }
    if ("strokes" in node) {
      if (node.strokeStyleId && typeof node.strokeStyleId === "string") {
        const style = yield figma.getStyleByIdAsync(node.strokeStyleId);
        if (style) styles.strokeStyle = style.name;
      }
      const strokes = serializePaints(node.strokes);
      if (strokes !== void 0) styles.strokes = strokes;
    }
    if ("cornerRadius" in node) {
      const cr = isMixed(node.cornerRadius) ? "mixed" : node.cornerRadius;
      if (cr !== 0) styles.cornerRadius = cr;
    }
    if ("paddingLeft" in node) {
      styles.padding = {
        top: node.paddingTop,
        right: node.paddingRight,
        bottom: node.paddingBottom,
        left: node.paddingLeft
      };
    }
    if ("effects" in node && Array.isArray(node.effects) && node.effects.length > 0) {
      if (node.effectStyleId && typeof node.effectStyleId === "string") {
        const style = yield figma.getStyleByIdAsync(node.effectStyleId);
        if (style) styles.effectStyle = style.name;
      }
      const effects = node.effects.filter((e) => e.visible !== false).map((e) => {
        var _a, _b, _c, _d, _e;
        if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
          const entry = {
            type: e.type,
            color: toHex(e.color),
            offset: { x: pixelRound((_b = (_a = e.offset) == null ? void 0 : _a.x) != null ? _b : 0), y: pixelRound((_d = (_c = e.offset) == null ? void 0 : _c.y) != null ? _d : 0) },
            radius: e.radius
          };
          if (((_e = e.color) == null ? void 0 : _e.a) != null && e.color.a !== 1)
            entry.colorOpacity = Math.round(e.color.a * 100) / 100;
          if (e.spread != null && e.spread !== 0) entry.spread = e.spread;
          if (e.blendMode && e.blendMode !== "NORMAL") entry.blendMode = e.blendMode;
          return entry;
        }
        if (e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR") {
          return { type: e.type, radius: e.radius };
        }
        return { type: e.type };
      });
      if (effects.length > 0) styles.effects = effects;
    }
    return styles;
  });
  const serializeLineHeight = (lineHeight) => {
    if (isMixed(lineHeight)) return "mixed";
    if (!lineHeight || lineHeight.unit === "AUTO") return void 0;
    return { value: lineHeight.value, unit: lineHeight.unit };
  };
  const serializeLetterSpacing = (letterSpacing) => {
    if (isMixed(letterSpacing)) return "mixed";
    if (!letterSpacing || letterSpacing.value === 0) return void 0;
    return { value: letterSpacing.value, unit: letterSpacing.unit };
  };
  const serializeText = (node, base) => __async(null, null, function* () {
    var _a, _b;
    let fontFamily;
    let fontStyle;
    if (typeof node.fontName === "symbol") {
      fontFamily = "mixed";
      fontStyle = "mixed";
    } else if (node.fontName) {
      fontFamily = node.fontName.family;
      fontStyle = node.fontName.style;
    }
    const textStyleName = node.textStyleId && typeof node.textStyleId === "string" ? (_b = (_a = yield figma.getStyleByIdAsync(node.textStyleId)) == null ? void 0 : _a.name) != null ? _b : void 0 : void 0;
    return Object.assign({}, base, {
      characters: node.characters,
      styles: Object.assign({}, base.styles, __spreadProps(__spreadValues({}, textStyleName ? { textStyle: textStyleName } : {}), {
        fontSize: isMixed(node.fontSize) ? "mixed" : node.fontSize,
        fontFamily,
        fontStyle,
        fontWeight: isMixed(node.fontWeight) ? "mixed" : node.fontWeight,
        textDecoration: isMixed(node.textDecoration) ? "mixed" : node.textDecoration !== "NONE" ? node.textDecoration : void 0,
        lineHeight: serializeLineHeight(node.lineHeight),
        letterSpacing: serializeLetterSpacing(node.letterSpacing),
        textAlignHorizontal: isMixed(node.textAlignHorizontal) ? "mixed" : node.textAlignHorizontal
      }))
    });
  });
  const deduplicateStyles = (tree) => {
    const counts = /* @__PURE__ */ new Map();
    const countWalk = (node) => {
      var _a, _b;
      if (!node || typeof node !== "object") return;
      const s = node.styles;
      if (s) {
        if (Array.isArray(s.fills)) counts.set(JSON.stringify(s.fills), ((_a = counts.get(JSON.stringify(s.fills))) != null ? _a : 0) + 1);
        if (Array.isArray(s.strokes)) counts.set(JSON.stringify(s.strokes), ((_b = counts.get(JSON.stringify(s.strokes))) != null ? _b : 0) + 1);
      }
      if (Array.isArray(node.children)) node.children.forEach(countWalk);
    };
    countWalk(tree);
    let counter = 0;
    const keyToRef = /* @__PURE__ */ new Map();
    const refs = {};
    for (const [key, count] of counts) {
      if (count > 1) {
        const ref = `s${++counter}`;
        keyToRef.set(key, ref);
        refs[ref] = JSON.parse(key);
      }
    }
    if (keyToRef.size === 0) return { tree, globalVars: void 0 };
    const replaceWalk = (node) => {
      if (!node || typeof node !== "object") return node;
      let result = node;
      const s = node.styles;
      if (s) {
        let newStyles = s;
        if (Array.isArray(s.fills)) {
          const ref = keyToRef.get(JSON.stringify(s.fills));
          if (ref) newStyles = __spreadProps(__spreadValues({}, newStyles), { fills: ref });
        }
        if (Array.isArray(s.strokes)) {
          const ref = keyToRef.get(JSON.stringify(s.strokes));
          if (ref) newStyles = __spreadProps(__spreadValues({}, newStyles), { strokes: ref });
        }
        if (newStyles !== s) result = __spreadProps(__spreadValues({}, node), { styles: newStyles });
      }
      if (Array.isArray(node.children)) {
        const newChildren = node.children.map(replaceWalk);
        result = __spreadProps(__spreadValues({}, result), { children: newChildren });
      }
      return result;
    };
    return { tree: replaceWalk(tree), globalVars: { styles: refs } };
  };
  const serializeVariableValue = (value) => {
    if (typeof value !== "object" || value === null) return value;
    if ("type" in value && value.type === "VARIABLE_ALIAS") {
      return { type: "VARIABLE_ALIAS", id: value.id };
    }
    if ("r" in value && "g" in value && "b" in value) {
      return {
        type: "COLOR",
        r: value.r,
        g: value.g,
        b: value.b,
        a: "a" in value ? value.a : 1
      };
    }
    return value;
  };
  const DEFAULT_READ_BUDGET = {
    document: { maxDepth: 12, maxNodes: 3e3, maxTimeMs: 18e3 },
    node: { maxDepth: 12, maxNodes: 1800, maxTimeMs: 12e3 },
    nodeContext: { maxDepth: 3, maxNodes: 1200, maxTimeMs: 1e4 },
    designContext: { maxDepth: 2, maxNodes: 1600, maxTimeMs: 12e3 },
    search: { maxVisited: 3e3, maxTimeMs: 1e4 },
    scan: { maxVisited: 3500, maxTimeMs: 12e3 },
    fonts: { maxVisited: 4e3, maxTimeMs: 12e3 }
  };
  const postProgress = (requestId, progress, message) => {
    figma.ui.postMessage({
      type: "progress_update",
      requestId,
      progress,
      message
    });
  };
  const yieldToUI = () => __async(null, null, function* () {
    yield new Promise((resolve) => setTimeout(resolve, 0));
  });
  const toPositiveInt = (value, fallback) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return Math.floor(value);
  };
  const toNonNegativeInt = (value, fallback) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return fallback;
    }
    return Math.floor(value);
  };
  const normalizeDetail = (value, fallback) => {
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
  const childCountOf = (node) => "children" in node ? node.children.length : 0;
  const buildRecommendedNextCalls = (node, detail, depth) => [
    {
      tool: "get_node_context",
      args: {
        nodeId: node.id,
        detail: detail === "full" ? "compact" : detail,
        depth: Math.max(1, Math.min(depth + 1, 4)),
        maxNodes: 1800,
        maxTimeMs: 12e3
      }
    },
    {
      tool: "scan_nodes_by_types",
      args: {
        nodeId: node.id,
        types: ["FRAME", "INSTANCE", "TEXT"],
        maxVisited: 2500,
        maxTimeMs: 8e3
      }
    }
  ];
  const fallbackNode = (base, node, reason, detail, depth) => __spreadProps(__spreadValues({}, base), {
    truncated: true,
    fallbackUsed: true,
    fallbackReason: reason,
    recommendedNextCalls: buildRecommendedNextCalls(node, detail, depth)
  });
  const budgetReason = (state, opts) => {
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
  const maybeReportProgress = (state, opts, message) => __async(null, null, function* () {
    const now = Date.now();
    if (now - state.lastProgressAt < 200 && state.visitedNodes % 50 !== 0) {
      return;
    }
    state.lastProgressAt = now;
    const nodeProgress = Math.min(70, Math.round(state.visitedNodes / opts.maxNodes * 100));
    const timeProgress = Math.min(70, Math.round((now - state.startedAt) / opts.maxTimeMs * 100));
    const progress = Math.max(5, Math.min(95, Math.max(nodeProgress, timeProgress)));
    postProgress(opts.requestId, progress, message);
    yield yieldToUI();
  });
  const buildNodeSummary = (node, detail) => __async(null, null, function* () {
    var _a;
    const summary = {
      id: node.id,
      name: node.name,
      type: node.type,
      bounds: getBounds(node)
    };
    const childCount = childCountOf(node);
    if (childCount > 0) summary.childCount = childCount;
    if ("visible" in node && !node.visible) summary.visible = false;
    if ("opacity" in node && node.opacity !== 1) summary.opacity = node.opacity;
    if (detail === "minimal") return summary;
    if (detail === "summary" || detail === "compact" || detail === "full") {
      const styles = yield serializeStyles(node);
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
      const mainComponent = yield node.getMainComponentAsync();
      summary.mainComponentId = (_a = mainComponent == null ? void 0 : mainComponent.id) != null ? _a : null;
      if (node.componentProperties) {
        const componentProperties = {};
        for (const [key, property] of Object.entries(node.componentProperties)) {
          componentProperties[key] = property.value;
        }
        if (Object.keys(componentProperties).length > 0) {
          summary.componentProperties = componentProperties;
        }
      }
    }
    return summary;
  });
  const serializeNodeWithBudget = (node, opts, state, depth) => __async(null, null, function* () {
    yield maybeReportProgress(state, opts, `${opts.progressLabel}: ${node.name}`);
    const beforeReason = budgetReason(state, opts);
    if (beforeReason) {
      return fallbackNode(yield buildNodeSummary(node, "summary"), node, beforeReason, opts.detail, depth);
    }
    state.visitedNodes++;
    if (opts.compactInstances && node.type === "INSTANCE" && depth > 0) {
      return fallbackNode(
        yield buildNodeSummary(node, "compact"),
        node,
        "Instance subtree compacted for a large traversal.",
        opts.detail,
        depth
      );
    }
    let current;
    if (opts.detail === "full") {
      const base = yield buildNodeSummary(node, "compact");
      current = node.type === "TEXT" ? yield serializeText(node, base) : base;
    } else {
      current = yield buildNodeSummary(node, opts.detail);
    }
    const childCount = childCountOf(node);
    if (childCount === 0) return current;
    if (depth >= opts.maxDepth) {
      return fallbackNode(current, node, `Depth limit reached at ${opts.maxDepth}.`, opts.detail, depth);
    }
    const children = [];
    for (let i = 0; i < node.children.length; i++) {
      const reason = budgetReason(state, opts);
      if (reason) break;
      if (i > 0 && i % 25 === 0) {
        yield maybeReportProgress(state, opts, `${opts.progressLabel}: ${node.name} (${i}/${node.children.length})`);
      }
      children.push(yield serializeNodeWithBudget(node.children[i], opts, state, depth + 1));
    }
    if (children.length === node.children.length) {
      return __spreadProps(__spreadValues({}, current), { children });
    }
    return fallbackNode(
      __spreadProps(__spreadValues({}, current), {
        children,
        childCount
      }),
      node,
      state.budgetReason || "Traversal stopped early for a large subtree.",
      opts.detail,
      depth
    );
  });
  const makeSerializeOptions = (request, defaults, fallbackDetail, fallbackCompactInstances) => {
    const params = request.params || {};
    return {
      detail: normalizeDetail(params.detail, fallbackDetail),
      maxDepth: toNonNegativeInt(params.depth, defaults.maxDepth),
      maxNodes: toPositiveInt(params.maxNodes, defaults.maxNodes),
      maxTimeMs: toPositiveInt(params.maxTimeMs, defaults.maxTimeMs),
      compactInstances: typeof params.compactInstances === "boolean" ? params.compactInstances : fallbackCompactInstances,
      requestId: request.requestId,
      progressLabel: request.type
    };
  };
  const createState = (opts) => ({
    visitedNodes: 0,
    startedAt: Date.now(),
    deadline: Date.now() + opts.maxTimeMs,
    budgetReason: "",
    lastProgressAt: 0
  });
  const serializeSelectionSummary = (selection) => __async(null, null, function* () {
    return Promise.all(selection.map((node) => buildNodeSummary(node, "compact")));
  });
  const collectMainComponentIDs = (node, ids) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.mainComponentId === "string" && node.mainComponentId !== "") {
      ids.add(node.mainComponentId);
    }
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => collectMainComponentIDs(child, ids));
    }
  };
  const traversalExceeded = (visited, deadline, maxVisited, maxTimeMs) => {
    if (visited >= maxVisited) return `Traversal budget exceeded (${maxVisited} nodes).`;
    if (Date.now() >= deadline) return `Traversal time budget exceeded (${maxTimeMs} ms).`;
    return "";
  };
  const handleReadDocumentRequest = (request) => __async(null, null, function* () {
    switch (request.type) {
      case "get_document": {
        const opts = makeSerializeOptions(request, DEFAULT_READ_BUDGET.document, "full", false);
        const state = createState(opts);
        const raw = yield serializeNodeWithBudget(figma.currentPage, opts, state, 0);
        const { tree, globalVars } = deduplicateStyles(raw);
        return {
          type: request.type,
          requestId: request.requestId,
          data: globalVars ? __spreadProps(__spreadValues({}, tree), { globalVars }) : tree
        };
      }
      case "get_selection":
        return {
          type: request.type,
          requestId: request.requestId,
          data: yield serializeSelectionSummary(figma.currentPage.selection)
        };
      case "get_node":
      case "get_node_context": {
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeIds is required for get_node");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node || node.type === "DOCUMENT") {
          throw new Error(`Node not found: ${nodeId}`);
        }
        const defaults = request.type === "get_node_context" ? DEFAULT_READ_BUDGET.nodeContext : DEFAULT_READ_BUDGET.node;
        const opts = makeSerializeOptions(
          request,
          defaults,
          request.type === "get_node_context" ? "compact" : "full",
          request.type === "get_node_context"
        );
        const state = createState(opts);
        return {
          type: request.type,
          requestId: request.requestId,
          data: yield serializeNodeWithBudget(node, opts, state, 0)
        };
      }
      case "get_nodes_info": {
        if (!request.nodeIds || request.nodeIds.length === 0) {
          throw new Error("nodeIds is required for get_nodes_info");
        }
        const opts = makeSerializeOptions(request, DEFAULT_READ_BUDGET.nodeContext, "compact", true);
        const nodes = yield Promise.all(request.nodeIds.map((id) => figma.getNodeByIdAsync(id)));
        const data = [];
        for (const node of nodes) {
          if (!node || node.type === "DOCUMENT") continue;
          const state = createState(opts);
          data.push(yield serializeNodeWithBudget(node, opts, state, 0));
        }
        return {
          type: request.type,
          requestId: request.requestId,
          data
        };
      }
      case "get_design_context": {
        const params = request.params || {};
        const dedupeComponents = !!params.dedupeComponents;
        const opts = makeSerializeOptions(
          request,
          DEFAULT_READ_BUDGET.designContext,
          normalizeDetail(params.detail, "full"),
          dedupeComponents
        );
        const selection = figma.currentPage.selection;
        const roots = selection.length > 0 ? selection : [figma.currentPage];
        const rawContextNodes = [];
        for (const root of roots) {
          const state = createState(opts);
          rawContextNodes.push(yield serializeNodeWithBudget(root, opts, state, 0));
        }
        const { tree: dedupedNodes, globalVars } = deduplicateStyles({ children: rawContextNodes });
        const contextNodes = dedupedNodes.children;
        let componentDefs;
        if (dedupeComponents) {
          const componentIDs = /* @__PURE__ */ new Set();
          contextNodes.forEach((node) => collectMainComponentIDs(node, componentIDs));
          if (componentIDs.size > 0) {
            componentDefs = {};
            for (const componentID of componentIDs) {
              const componentNode = yield figma.getNodeByIdAsync(componentID);
              if (!componentNode || componentNode.type === "DOCUMENT") continue;
              const componentOpts = makeSerializeOptions(
                __spreadProps(__spreadValues({}, request), {
                  params: __spreadProps(__spreadValues({}, params), {
                    detail: "compact",
                    depth: 1,
                    compactInstances: false
                  })
                }),
                DEFAULT_READ_BUDGET.nodeContext,
                "compact",
                false
              );
              const componentState = createState(componentOpts);
              componentDefs[componentID] = yield serializeNodeWithBudget(componentNode, componentOpts, componentState, 0);
            }
          }
        }
        return {
          type: request.type,
          requestId: request.requestId,
          data: __spreadValues(__spreadValues({
            fileName: figma.root.name,
            currentPage: {
              id: figma.currentPage.id,
              name: figma.currentPage.name
            },
            selectionCount: selection.length,
            context: contextNodes
          }, componentDefs ? { componentDefs } : {}), globalVars ? { globalVars } : {})
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
              name: page.name
            }))
          }
        };
      case "get_pages":
        return {
          type: request.type,
          requestId: request.requestId,
          data: {
            currentPageId: figma.currentPage.id,
            pages: figma.root.children.map((page) => ({
              id: page.id,
              name: page.name
            }))
          }
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
              height: figma.viewport.bounds.height
            }
          }
        };
      case "get_fonts": {
        const params = request.params || {};
        const maxVisited = toPositiveInt(params.maxVisited, DEFAULT_READ_BUDGET.fonts.maxVisited);
        const maxTimeMs = toPositiveInt(params.maxTimeMs, DEFAULT_READ_BUDGET.fonts.maxTimeMs);
        const deadline = Date.now() + maxTimeMs;
        const fontMap = /* @__PURE__ */ new Map();
        let visited = 0;
        let truncated = false;
        let reason = "";
        const collectFonts = (node) => __async(null, null, function* () {
          if (truncated) return;
          visited++;
          if (visited % 75 === 0) {
            postProgress(request.requestId, 20, `Scanning fonts… (${visited} nodes)`);
            yield yieldToUI();
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
              yield collectFonts(child);
              if (truncated) break;
            }
          }
        });
        yield collectFonts(figma.currentPage);
        const fonts = Array.from(fontMap.values()).sort((a, b) => b.nodeCount - a.nodeCount);
        return {
          type: request.type,
          requestId: request.requestId,
          data: __spreadValues({
            count: fonts.length,
            fonts,
            visitedNodes: visited,
            truncated
          }, reason ? { fallbackReason: reason } : {})
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
        const root = scopeNodeId ? yield figma.getNodeByIdAsync(scopeNodeId) : figma.currentPage;
        if (!root) throw new Error(`Node not found: ${scopeNodeId}`);
        const results = [];
        let visited = 0;
        let truncated = false;
        let reason = "";
        const deadline = Date.now() + maxTimeMs;
        const search = (node) => __async(null, null, function* () {
          if (truncated || results.length >= limit) return;
          visited++;
          if (visited % 75 === 0) {
            postProgress(request.requestId, 25, `Searching nodes… (${visited} visited)`);
            yield yieldToUI();
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
                childCount: childCountOf(node)
              });
            }
          }
          if ("children" in node) {
            for (const child of node.children) {
              yield search(child);
              if (truncated || results.length >= limit) break;
            }
          }
        });
        yield search(root);
        return {
          type: request.type,
          requestId: request.requestId,
          data: __spreadValues(__spreadValues({
            count: results.length,
            nodes: results,
            visitedNodes: visited,
            truncated
          }, reason ? { fallbackReason: reason } : {}), truncated ? { recommendedNextCalls: buildRecommendedNextCalls(root, "compact", 2) } : {})
        };
      }
      case "get_reactions": {
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required for get_reactions");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node || node.type === "DOCUMENT") throw new Error(`Node not found: ${nodeId}`);
        const reactions = "reactions" in node ? node.reactions : [];
        return {
          type: request.type,
          requestId: request.requestId,
          data: { nodeId: node.id, name: node.name, reactions }
        };
      }
      case "scan_text_nodes": {
        const params = request.params || {};
        const nodeId = params.nodeId;
        if (!nodeId) throw new Error("nodeId is required for scan_text_nodes");
        const root = yield figma.getNodeByIdAsync(nodeId);
        if (!root) throw new Error(`Node not found: ${nodeId}`);
        const maxVisited = toPositiveInt(params.maxVisited, DEFAULT_READ_BUDGET.scan.maxVisited);
        const maxTimeMs = toPositiveInt(params.maxTimeMs, DEFAULT_READ_BUDGET.scan.maxTimeMs);
        const deadline = Date.now() + maxTimeMs;
        const textNodes = [];
        let visited = 0;
        let truncated = false;
        let reason = "";
        const findText = (node) => __async(null, null, function* () {
          if (truncated) return;
          visited++;
          if (visited % 75 === 0) {
            postProgress(request.requestId, 15, `Scanning text nodes… (${visited} visited)`);
            yield yieldToUI();
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
              fontName: isMixed(node.fontName) ? "mixed" : node.fontName
            });
          }
          if ("children" in node) {
            for (const child of node.children) {
              yield findText(child);
              if (truncated) break;
            }
          }
        });
        yield findText(root);
        return {
          type: request.type,
          requestId: request.requestId,
          data: __spreadValues({
            count: textNodes.length,
            textNodes,
            visitedNodes: visited,
            truncated
          }, reason ? { fallbackReason: reason } : {})
        };
      }
      case "scan_nodes_by_types": {
        const params = request.params || {};
        const nodeId = params.nodeId;
        const types = Array.isArray(params.types) ? params.types : [];
        if (!nodeId) throw new Error("nodeId is required for scan_nodes_by_types");
        if (types.length === 0) throw new Error("types must be a non-empty array");
        const root = yield figma.getNodeByIdAsync(nodeId);
        if (!root) throw new Error(`Node not found: ${nodeId}`);
        const maxVisited = toPositiveInt(params.maxVisited, DEFAULT_READ_BUDGET.scan.maxVisited);
        const maxTimeMs = toPositiveInt(params.maxTimeMs, DEFAULT_READ_BUDGET.scan.maxTimeMs);
        const deadline = Date.now() + maxTimeMs;
        const matchingNodes = [];
        let visited = 0;
        let truncated = false;
        let reason = "";
        const findByTypes = (node) => __async(null, null, function* () {
          if (truncated) return;
          visited++;
          if (visited % 75 === 0) {
            postProgress(request.requestId, 15, `Scanning nodes… (${visited} visited)`);
            yield yieldToUI();
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
              childCount: childCountOf(node)
            });
          }
          if ("children" in node) {
            for (const child of node.children) {
              yield findByTypes(child);
              if (truncated) break;
            }
          }
        });
        yield findByTypes(root);
        return {
          type: request.type,
          requestId: request.requestId,
          data: __spreadValues(__spreadValues({
            count: matchingNodes.length,
            matchingNodes,
            searchedTypes: types,
            visitedNodes: visited,
            truncated
          }, reason ? { fallbackReason: reason } : {}), truncated ? { recommendedNextCalls: buildRecommendedNextCalls(root, "compact", 2) } : {})
        };
      }
      default:
        return null;
    }
  });
  const handleReadStyleRequest = (request) => __async(null, null, function* () {
    var _a;
    switch (request.type) {
      case "get_styles": {
        const [paintStyles, textStyles, effectStyles, gridStyles] = yield Promise.all([
          figma.getLocalPaintStylesAsync(),
          figma.getLocalTextStylesAsync(),
          figma.getLocalEffectStylesAsync(),
          figma.getLocalGridStylesAsync()
        ]);
        return {
          type: request.type,
          requestId: request.requestId,
          data: {
            paints: paintStyles.map((s) => ({
              id: s.id,
              name: s.name,
              paints: s.paints
            })),
            text: textStyles.map((s) => ({
              id: s.id,
              name: s.name,
              fontSize: s.fontSize,
              fontFamily: s.fontName ? s.fontName.family : void 0,
              fontStyle: s.fontName ? s.fontName.style : void 0,
              textDecoration: s.textDecoration !== "NONE" ? s.textDecoration : void 0,
              lineHeight: s.lineHeight,
              letterSpacing: s.letterSpacing
            })),
            effects: effectStyles.map((s) => ({
              id: s.id,
              name: s.name,
              effects: s.effects
            })),
            grids: gridStyles.map((s) => ({
              id: s.id,
              name: s.name,
              layoutGrids: s.layoutGrids
            }))
          }
        };
      }
      case "get_variable_defs": {
        const collections = yield figma.variables.getLocalVariableCollectionsAsync();
        const variableData = yield Promise.all(
          collections.map((collection) => __async(null, null, function* () {
            const variables = yield Promise.all(
              collection.variableIds.map(
                (id) => figma.variables.getVariableByIdAsync(id)
              )
            );
            return {
              id: collection.id,
              name: collection.name,
              modes: collection.modes.map((mode) => ({
                modeId: mode.modeId,
                name: mode.name
              })),
              variables: variables.filter((v) => v !== null).map((variable) => ({
                id: variable.id,
                name: variable.name,
                resolvedType: variable.resolvedType,
                valuesByMode: Object.fromEntries(
                  Object.entries(variable.valuesByMode).map(
                    ([modeId, value]) => [
                      modeId,
                      serializeVariableValue(value)
                    ]
                  )
                )
              }))
            };
          }))
        );
        return {
          type: request.type,
          requestId: request.requestId,
          data: { collections: variableData }
        };
      }
      case "get_local_components": {
        const pages = figma.root.children;
        const allComponents = [];
        const componentSetsMap = /* @__PURE__ */ new Map();
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          yield page.loadAsync();
          const pageNodes = page.findAllWithCriteria({
            types: ["COMPONENT", "COMPONENT_SET"]
          });
          for (const n of pageNodes) {
            if (n.type === "COMPONENT_SET") {
              componentSetsMap.set(n.id, {
                id: n.id,
                name: n.name,
                key: "key" in n ? n.key : null
              });
            } else {
              const parentIsSet = n.parent && n.parent.type === "COMPONENT_SET";
              allComponents.push({
                id: n.id,
                name: n.name,
                key: "key" in n ? n.key : null,
                componentSetId: parentIsSet ? n.parent.id : null,
                variantProperties: "variantProperties" in n ? n.variantProperties : null
              });
            }
          }
          figma.ui.postMessage({
            type: "progress_update",
            requestId: request.requestId,
            progress: Math.round((i + 1) / pages.length * 90) + 1,
            message: `Scanned ${page.name}: ${allComponents.length} components so far`
          });
          yield new Promise((r) => setTimeout(r, 0));
        }
        return {
          type: request.type,
          requestId: request.requestId,
          data: {
            count: allComponents.length,
            components: allComponents,
            componentSets: Array.from(componentSetsMap.values())
          }
        };
      }
      case "get_annotations": {
        const nodeId = request.params && request.params.nodeId;
        const nodeAnnotations = (n) => {
          const anns = n.annotations;
          return Array.isArray(anns) ? anns : null;
        };
        if (nodeId) {
          const node = yield figma.getNodeByIdAsync(nodeId);
          if (!node) throw new Error(`Node not found: ${nodeId}`);
          const mergedAnnotations = [];
          const collect = (n) => __async(null, null, function* () {
            const anns = nodeAnnotations(n);
            if (anns)
              for (const a of anns)
                mergedAnnotations.push({ nodeId: n.id, annotation: a });
            if ("children" in n)
              for (const child of n.children) yield collect(child);
          });
          yield collect(node);
          return {
            type: request.type,
            requestId: request.requestId,
            data: {
              nodeId: node.id,
              name: node.name,
              annotations: mergedAnnotations
            }
          };
        }
        const annotated = [];
        const processNode = (n) => __async(null, null, function* () {
          const anns = nodeAnnotations(n);
          if (anns && anns.length > 0)
            annotated.push({ nodeId: n.id, name: n.name, annotations: anns });
          if ("children" in n)
            for (const child of n.children) yield processNode(child);
        });
        yield processNode(figma.currentPage);
        return {
          type: request.type,
          requestId: request.requestId,
          data: { annotatedNodes: annotated }
        };
      }
      case "export_tokens": {
        const format = request.params && request.params.format || "json";
        const collections = yield figma.variables.getLocalVariableCollectionsAsync();
        const paintStyles = yield figma.getLocalPaintStylesAsync();
        if (format === "css") {
          const lines = [":root {"];
          for (const coll of collections) {
            const firstMode = coll.modes[0];
            if (!firstMode) continue;
            for (const varId of coll.variableIds) {
              const variable = yield figma.variables.getVariableByIdAsync(varId);
              if (!variable) continue;
              const val = variable.valuesByMode[firstMode.modeId];
              const cssName = "--" + variable.name.toLowerCase().replace(/[/\s]+/g, "-").replace(/[^a-z0-9-]/g, "");
              let cssValue = null;
              if (variable.resolvedType === "COLOR" && val && typeof val === "object" && "r" in val) {
                const c = val;
                const r = Math.round(c.r * 255);
                const g = Math.round(c.g * 255);
                const b = Math.round(c.b * 255);
                cssValue = c.a < 1 ? `rgba(${r}, ${g}, ${b}, ${c.a.toFixed(2)})` : `rgb(${r}, ${g}, ${b})`;
              } else if (variable.resolvedType === "FLOAT" || variable.resolvedType === "STRING" || variable.resolvedType === "BOOLEAN") {
                cssValue = String(val);
              }
              if (cssValue !== null) lines.push(`  ${cssName}: ${cssValue};`);
            }
          }
          for (const style of paintStyles) {
            if (style.paints.length === 1 && style.paints[0].type === "SOLID") {
              const paint = style.paints[0];
              const cssName = "--" + style.name.toLowerCase().replace(/[/\s]+/g, "-").replace(/[^a-z0-9-]/g, "");
              const r = Math.round(paint.color.r * 255);
              const g = Math.round(paint.color.g * 255);
              const b = Math.round(paint.color.b * 255);
              const a = (_a = paint.opacity) != null ? _a : 1;
              const cssValue = a < 1 ? `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})` : `rgb(${r}, ${g}, ${b})`;
              lines.push(`  ${cssName}: ${cssValue};`);
            }
          }
          lines.push("}");
          return { type: request.type, requestId: request.requestId, data: { css: lines.join("\n") } };
        }
        const tokens = {};
        for (const coll of collections) {
          const collTokens = {};
          for (const varId of coll.variableIds) {
            const variable = yield figma.variables.getVariableByIdAsync(varId);
            if (!variable) continue;
            const modeValues = {};
            for (const mode of coll.modes) {
              modeValues[mode.name] = serializeVariableValue(variable.valuesByMode[mode.modeId]);
            }
            const parts = variable.name.split("/");
            let obj = collTokens;
            for (let i = 0; i < parts.length - 1; i++) {
              if (!obj[parts[i]]) obj[parts[i]] = {};
              obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = { type: variable.resolvedType, value: modeValues };
          }
          tokens[coll.name] = collTokens;
        }
        const styleTokens = {};
        for (const style of paintStyles) {
          if (style.paints.length === 1 && style.paints[0].type === "SOLID") {
            const paint = style.paints[0];
            const r = Math.round(paint.color.r * 255).toString(16).padStart(2, "0");
            const g = Math.round(paint.color.g * 255).toString(16).padStart(2, "0");
            const b = Math.round(paint.color.b * 255).toString(16).padStart(2, "0");
            const parts = style.name.split("/");
            let obj = styleTokens;
            for (let i = 0; i < parts.length - 1; i++) {
              if (!obj[parts[i]]) obj[parts[i]] = {};
              obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = { type: "COLOR", value: `#${r}${g}${b}` };
          }
        }
        if (Object.keys(styleTokens).length > 0) {
          tokens["_styles"] = { paint: styleTokens };
        }
        return { type: request.type, requestId: request.requestId, data: { tokens } };
      }
      default:
        return null;
    }
  });
  const handleReadExportRequest = (request) => __async(null, null, function* () {
    var _a, _b, _c, _d, _e;
    switch (request.type) {
      case "get_screenshot": {
        const format = request.params && request.params.format ? request.params.format : "PNG";
        const scale = request.params && request.params.scale != null ? request.params.scale : 2;
        let targetNodes;
        if (request.nodeIds && request.nodeIds.length > 0) {
          const nodes = yield Promise.all(
            request.nodeIds.map((id) => figma.getNodeByIdAsync(id))
          );
          targetNodes = nodes.filter(
            (n) => n !== null && n.type !== "DOCUMENT" && n.type !== "PAGE"
          );
        } else {
          targetNodes = figma.currentPage.selection.slice();
        }
        if (targetNodes.length === 0)
          throw new Error(
            "No nodes to export. Select nodes or provide nodeIds."
          );
        const exports$1 = yield Promise.all(
          targetNodes.map((node) => __async(null, null, function* () {
            const settings = format === "SVG" ? { format: "SVG" } : format === "PDF" ? { format: "PDF" } : format === "JPG" ? {
              format: "JPG",
              constraint: { type: "SCALE", value: scale }
            } : {
              format: "PNG",
              constraint: { type: "SCALE", value: scale }
            };
            const bytes = yield node.exportAsync(settings);
            const base64 = figma.base64Encode(bytes);
            return {
              nodeId: node.id,
              nodeName: node.name,
              format,
              base64,
              width: node.width,
              height: node.height
            };
          }))
        );
        return {
          type: request.type,
          requestId: request.requestId,
          data: { exports: exports$1 }
        };
      }
      case "export_node_as_svg": {
        const nodeId = (_a = request.nodeIds) == null ? void 0 : _a[0];
        if (!nodeId) throw new Error("nodeId is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        if (typeof node.exportAsync !== "function")
          throw new Error(`Node ${nodeId} (type: ${node.type}) does not support export`);
        const bytes = yield node.exportAsync({ format: "SVG" });
        const svgContent = new TextDecoder("utf-8").decode(bytes);
        return {
          type: request.type,
          requestId: request.requestId,
          data: {
            svgContent,
            nodeId: node.id,
            nodeName: (_b = node.name) != null ? _b : "",
            width: (_c = node.width) != null ? _c : 0,
            height: (_d = node.height) != null ? _d : 0
          }
        };
      }
      case "export_frames_to_pdf": {
        const nodeIds = (_e = request.nodeIds) != null ? _e : [];
        if (nodeIds.length === 0) {
          throw new Error("nodeIds is required and must not be empty");
        }
        const frames = [];
        for (const id of nodeIds) {
          const node = yield figma.getNodeByIdAsync(id);
          if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
            throw new Error(`Node ${id} not found or is not exportable`);
          }
          const bytes = yield node.exportAsync({ format: "PDF" });
          const base64 = figma.base64Encode(bytes);
          frames.push({
            nodeId: node.id,
            nodeName: node.name,
            base64
          });
        }
        return {
          type: request.type,
          requestId: request.requestId,
          data: { frames }
        };
      }
      default:
        return null;
    }
  });
  const handleReadRequest = (request) => __async(null, null, function* () {
    var _a, _b;
    return (_b = (_a = yield handleReadDocumentRequest(request)) != null ? _a : yield handleReadStyleRequest(request)) != null ? _b : yield handleReadExportRequest(request);
  });
  const readRequestTypes = [
    "get_document",
    "get_pages",
    "get_metadata",
    "get_selection",
    "get_node",
    "get_nodes_info",
    "get_node_context",
    "get_design_context",
    "search_nodes",
    "scan_text_nodes",
    "scan_nodes_by_types",
    "get_reactions",
    "get_viewport",
    "get_fonts",
    "get_styles",
    "get_variable_defs",
    "get_local_components",
    "get_annotations",
    "export_tokens",
    "get_screenshot",
    "export_node_as_svg",
    "export_frames_to_pdf"
  ];
  const writeRequestTypes = [
    "create_frame",
    "create_rectangle",
    "create_ellipse",
    "create_text",
    "import_image",
    "import_svg",
    "create_section",
    "delete_nodes",
    "move_nodes",
    "resize_nodes",
    "rotate_nodes",
    "set_text",
    "set_text_properties",
    "set_fills",
    "set_strokes",
    "boolean_operation",
    "flatten_node",
    "set_auto_layout",
    "set_constraints",
    "set_corner_radius",
    "set_effects",
    "set_opacity",
    "set_visible",
    "set_blend_mode",
    "reorder_nodes",
    "reparent_nodes",
    "group_nodes",
    "ungroup_nodes",
    "lock_nodes",
    "unlock_nodes",
    "find_replace_text",
    "rename_node",
    "batch_rename_nodes",
    "clone_node",
    "create_component",
    "instantiate_component",
    "import_component_by_key",
    "detach_instance",
    "swap_component",
    "create_paint_style",
    "create_text_style",
    "create_effect_style",
    "create_grid_style",
    "apply_style_to_node",
    "update_paint_style",
    "delete_style",
    "create_variable_collection",
    "add_variable_mode",
    "create_variable",
    "set_variable_value",
    "bind_variable_to_node",
    "delete_variable",
    "set_reactions",
    "remove_reactions",
    "add_page",
    "rename_page",
    "delete_page",
    "navigate_to_page"
  ];
  const isReadRequestType = (value) => readRequestTypes.includes(value);
  const isWriteRequestType = (value) => writeRequestTypes.includes(value);
  const isPluginToolRequest = (value) => {
    if (!value || typeof value !== "object") return false;
    const candidate = value;
    return typeof candidate.type === "string" && typeof candidate.requestId === "string" && (isReadRequestType(candidate.type) || isWriteRequestType(candidate.type));
  };
  const hexToRgb = (hex) => {
    const clean = hex.replace("#", "");
    return {
      r: parseInt(clean.slice(0, 2), 16) / 255,
      g: parseInt(clean.slice(2, 4), 16) / 255,
      b: parseInt(clean.slice(4, 6), 16) / 255,
      a: clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1
    };
  };
  const makeSolidPaint = (colorInput, opacityOverride) => {
    const { r, g, b, a } = typeof colorInput === "string" ? hexToRgb(colorInput) : { r: colorInput.r, g: colorInput.g, b: colorInput.b, a: colorInput.a != null ? colorInput.a : 1 };
    const eff = opacityOverride != null ? opacityOverride : a;
    const paint = { type: "SOLID", color: { r, g, b } };
    if (eff !== 1) paint.opacity = eff;
    return paint;
  };
  const loadTextNodeFonts = (node) => __async(null, null, function* () {
    if (node.fontName !== figma.mixed) {
      yield figma.loadFontAsync(node.fontName);
      return;
    }
    const len = node.characters.length;
    const fonts = node.getRangeAllFontNames(0, Math.max(len, 1));
    yield Promise.all(fonts.map((f) => figma.loadFontAsync(f)));
  });
  const getParentNode = (parentId) => __async(null, null, function* () {
    if (!parentId) return figma.currentPage;
    const parent = yield figma.getNodeByIdAsync(parentId);
    if (!parent) throw new Error(`Parent node not found: ${parentId}`);
    if (!("appendChild" in parent)) throw new Error(`Node ${parentId} cannot have children`);
    return parent;
  });
  const applyAutoLayout = (frame, p) => {
    if (p.layoutMode != null) frame.layoutMode = p.layoutMode;
    if (p.paddingTop != null) frame.paddingTop = Number(p.paddingTop);
    if (p.paddingRight != null) frame.paddingRight = Number(p.paddingRight);
    if (p.paddingBottom != null) frame.paddingBottom = Number(p.paddingBottom);
    if (p.paddingLeft != null) frame.paddingLeft = Number(p.paddingLeft);
    if (p.itemSpacing != null) frame.itemSpacing = Number(p.itemSpacing);
    if (frame.layoutMode !== "NONE") {
      if (p.primaryAxisAlignItems) frame.primaryAxisAlignItems = p.primaryAxisAlignItems;
      if (p.counterAxisAlignItems) frame.counterAxisAlignItems = p.counterAxisAlignItems;
      if (p.primaryAxisSizingMode) frame.primaryAxisSizingMode = p.primaryAxisSizingMode;
      if (p.counterAxisSizingMode) frame.counterAxisSizingMode = p.counterAxisSizingMode;
      if (p.layoutWrap) frame.layoutWrap = p.layoutWrap;
      if (p.counterAxisSpacing != null && frame.layoutWrap === "WRAP") {
        frame.counterAxisSpacing = Number(p.counterAxisSpacing);
      }
    }
  };
  const base64ToBytes = (b64) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const lookup = {};
    for (let i = 0; i < chars.length; i++) lookup[chars[i]] = i;
    const padded = b64.replace(/[^A-Za-z0-9+/=]/g, "");
    const clean = padded.replace(/=/g, "");
    let outLen = Math.floor(padded.length * 3 / 4);
    if (padded.endsWith("==")) outLen -= 2;
    else if (padded.endsWith("=")) outLen -= 1;
    const bytes = new Uint8Array(outLen);
    let j = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const a = lookup[clean[i]] || 0;
      const bv = lookup[clean[i + 1]] || 0;
      const c = lookup[clean[i + 2]] || 0;
      const d = lookup[clean[i + 3]] || 0;
      bytes[j++] = a << 2 | bv >> 4;
      if (j < outLen) bytes[j++] = (bv & 15) << 4 | c >> 2;
      if (j < outLen) bytes[j++] = (c & 3) << 6 | d;
    }
    return bytes;
  };
  const handleWriteCreateRequest = (request) => __async(null, null, function* () {
    switch (request.type) {
      case "create_frame": {
        const p = request.params || {};
        const parent = yield getParentNode(p.parentId);
        const frame = figma.createFrame();
        frame.resize(p.width || 100, p.height || 100);
        frame.x = p.x != null ? p.x : 0;
        frame.y = p.y != null ? p.y : 0;
        if (p.name) frame.name = p.name;
        if (p.fillColor) frame.fills = [makeSolidPaint(p.fillColor)];
        applyAutoLayout(frame, p);
        parent.appendChild(frame);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: frame.id, name: frame.name, type: frame.type, bounds: getBounds(frame) }
        };
      }
      case "create_rectangle": {
        const p = request.params || {};
        const parent = yield getParentNode(p.parentId);
        const rect = figma.createRectangle();
        rect.resize(p.width || 100, p.height || 100);
        rect.x = p.x != null ? p.x : 0;
        rect.y = p.y != null ? p.y : 0;
        if (p.name) rect.name = p.name;
        if (p.fillColor) rect.fills = [makeSolidPaint(p.fillColor)];
        if (p.cornerRadius != null) rect.cornerRadius = p.cornerRadius;
        parent.appendChild(rect);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: rect.id, name: rect.name, type: rect.type, bounds: getBounds(rect) }
        };
      }
      case "create_ellipse": {
        const p = request.params || {};
        const parent = yield getParentNode(p.parentId);
        const ellipse = figma.createEllipse();
        ellipse.resize(p.width || 100, p.height || 100);
        ellipse.x = p.x != null ? p.x : 0;
        ellipse.y = p.y != null ? p.y : 0;
        if (p.name) ellipse.name = p.name;
        if (p.fillColor) ellipse.fills = [makeSolidPaint(p.fillColor)];
        parent.appendChild(ellipse);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: ellipse.id, name: ellipse.name, type: ellipse.type, bounds: getBounds(ellipse) }
        };
      }
      case "create_text": {
        const p = request.params || {};
        const parent = yield getParentNode(p.parentId);
        const fontFamily = p.fontFamily || "Inter";
        const fontStyle = p.fontStyle || "Regular";
        yield figma.loadFontAsync({ family: fontFamily, style: fontStyle });
        const textNode = figma.createText();
        textNode.fontName = { family: fontFamily, style: fontStyle };
        if (p.fontSize != null) textNode.fontSize = Number(p.fontSize);
        textNode.characters = p.text || "";
        textNode.x = p.x != null ? p.x : 0;
        textNode.y = p.y != null ? p.y : 0;
        if (p.name) textNode.name = p.name;
        if (p.fillColor) textNode.fills = [makeSolidPaint(p.fillColor)];
        parent.appendChild(textNode);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: textNode.id, name: textNode.name, type: textNode.type, bounds: getBounds(textNode) }
        };
      }
      case "import_svg": {
        const p = request.params || {};
        if (!p.svgContent) throw new Error("svgContent (SVG markup string) is required");
        const parent = yield getParentNode(p.parentId);
        const node = figma.createNodeFromSvg(p.svgContent);
        if (p.name) node.name = p.name;
        if (p.size != null) {
          const s = Number(p.size);
          node.resize(s, s);
        } else if (p.width != null && p.height != null) {
          node.resize(Number(p.width), Number(p.height));
        }
        if (p.x != null) node.x = Number(p.x);
        if (p.y != null) node.y = Number(p.y);
        parent.appendChild(node);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: node.id, name: node.name, type: node.type, width: node.width, height: node.height }
        };
      }
      case "import_image": {
        const p = request.params || {};
        if (!p.imageData) throw new Error("imageData (base64) is required");
        const parent = yield getParentNode(p.parentId);
        const bytes = base64ToBytes(p.imageData);
        const image = figma.createImage(bytes);
        const rect = figma.createRectangle();
        rect.resize(p.width || 200, p.height || 200);
        rect.x = p.x != null ? p.x : 0;
        rect.y = p.y != null ? p.y : 0;
        if (p.name) rect.name = p.name;
        rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: p.scaleMode || "FILL" }];
        parent.appendChild(rect);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: rect.id, name: rect.name, type: rect.type, bounds: getBounds(rect) }
        };
      }
      case "create_component": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        if (node.type !== "FRAME") throw new Error(`Node ${nodeId} is not a FRAME — only frames can be converted to components`);
        const parent = node.parent;
        const index = parent.children.indexOf(node);
        const component = figma.createComponent();
        component.name = p.name || node.name;
        component.resize(node.width, node.height);
        component.x = node.x;
        component.y = node.y;
        component.fills = node.fills;
        component.strokes = node.strokes;
        if (node.cornerRadius != null && node.cornerRadius !== figma.mixed) {
          component.cornerRadius = node.cornerRadius;
        }
        if (node.layoutMode && node.layoutMode !== "NONE") {
          component.layoutMode = node.layoutMode;
          component.paddingTop = node.paddingTop;
          component.paddingRight = node.paddingRight;
          component.paddingBottom = node.paddingBottom;
          component.paddingLeft = node.paddingLeft;
          component.itemSpacing = node.itemSpacing;
          component.primaryAxisAlignItems = node.primaryAxisAlignItems;
          component.counterAxisAlignItems = node.counterAxisAlignItems;
        }
        for (const child of [...node.children]) {
          component.appendChild(child);
        }
        parent.insertChild(index, component);
        node.remove();
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: component.id, name: component.name, type: component.type, bounds: getBounds(component) }
        };
      }
      case "create_section": {
        const p = request.params || {};
        const section = figma.createSection();
        if (p.name) section.name = p.name;
        if (p.x != null) section.x = p.x;
        if (p.y != null) section.y = p.y;
        if (p.width != null || p.height != null) {
          section.resizeWithoutConstraints(p.width || section.width, p.height || section.height);
        }
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: section.id, name: section.name, type: section.type, bounds: getBounds(section) }
        };
      }
      default:
        return null;
    }
  });
  const handleWriteModifyRequest = (request) => __async(null, null, function* () {
    switch (request.type) {
      case "set_text": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        if (node.type !== "TEXT") throw new Error(`Node ${nodeId} is not a TEXT node`);
        const fontName = typeof node.fontName === "symbol" ? { family: "Inter", style: "Regular" } : node.fontName;
        yield figma.loadFontAsync(fontName);
        node.characters = p.text;
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: node.id, name: node.name, characters: node.characters }
        };
      }
      case "set_text_properties": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        if (node.type !== "TEXT") throw new Error(`Node ${nodeId} is not a TEXT node`);
        const textNode = node;
        yield loadTextNodeFonts(textNode);
        if (p.fontFamily != null || p.fontStyle != null) {
          const current = textNode.fontName !== figma.mixed ? textNode.fontName : { family: "Inter", style: "Regular" };
          const family = p.fontFamily != null ? String(p.fontFamily) : current.family;
          const style = p.fontStyle != null ? String(p.fontStyle) : current.style;
          yield figma.loadFontAsync({ family, style });
          textNode.fontName = { family, style };
        }
        if (p.fontSize != null) textNode.fontSize = Number(p.fontSize);
        if (p.letterSpacing != null) {
          textNode.letterSpacing = { value: Number(p.letterSpacing), unit: p.letterSpacingUnit === "PERCENT" ? "PERCENT" : "PIXELS" };
        }
        if (p.lineHeight != null) {
          textNode.lineHeight = { value: Number(p.lineHeight), unit: p.lineHeightUnit === "PERCENT" ? "PERCENT" : "PIXELS" };
        } else if (p.lineHeightAuto === true) {
          textNode.lineHeight = { unit: "AUTO" };
        }
        if (p.paragraphSpacing != null) textNode.paragraphSpacing = Number(p.paragraphSpacing);
        if (p.textAlignHorizontal != null) textNode.textAlignHorizontal = p.textAlignHorizontal;
        if (p.textAlignVertical != null) textNode.textAlignVertical = p.textAlignVertical;
        if (p.textCase != null) textNode.textCase = p.textCase;
        if (p.textDecoration != null) textNode.textDecoration = p.textDecoration;
        if (p.textAutoResize != null) textNode.textAutoResize = p.textAutoResize;
        figma.commitUndo();
        const resolvedFont = textNode.fontName !== figma.mixed ? textNode.fontName : "mixed";
        return {
          type: request.type,
          requestId: request.requestId,
          data: {
            id: textNode.id,
            name: textNode.name,
            fontName: resolvedFont,
            fontSize: textNode.fontSize !== figma.mixed ? textNode.fontSize : "mixed",
            bounds: getBounds(textNode)
          }
        };
      }
      case "set_fills": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        if (!("fills" in node)) throw new Error(`Node ${nodeId} does not support fills`);
        const newFill = makeSolidPaint(p.color, p.opacity != null ? p.opacity : void 0);
        node.fills = p.mode === "append" ? [...node.fills, newFill] : [newFill];
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: node.id, name: node.name }
        };
      }
      case "set_strokes": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        if (!("strokes" in node)) throw new Error(`Node ${nodeId} does not support strokes`);
        const newStroke = makeSolidPaint(p.color);
        node.strokes = p.mode === "append" ? [...node.strokes, newStroke] : [newStroke];
        if (p.strokeWeight != null) node.strokeWeight = p.strokeWeight;
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: node.id, name: node.name }
        };
      }
      case "move_nodes": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          if (!("x" in n)) {
            results.push({ nodeId: nid, error: "Node does not support position" });
            continue;
          }
          if (p.x != null) n.x = p.x;
          if (p.y != null) n.y = p.y;
          results.push({ nodeId: nid, x: n.x, y: n.y });
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      case "resize_nodes": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          if (!("resize" in n)) {
            results.push({ nodeId: nid, error: "Node does not support resize" });
            continue;
          }
          const w = p.width != null ? p.width : n.width;
          const h = p.height != null ? p.height : n.height;
          n.resize(w, h);
          results.push({ nodeId: nid, width: n.width, height: n.height });
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      case "rename_node": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        node.name = p.name;
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: node.id, name: node.name }
        };
      }
      case "clone_node": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        const clone = node.clone();
        if (p.x != null) clone.x = p.x;
        if (p.y != null) clone.y = p.y;
        if (p.parentId) {
          const parent = yield getParentNode(p.parentId);
          parent.appendChild(clone);
        }
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: clone.id, name: clone.name, type: clone.type, bounds: getBounds(clone) }
        };
      }
      case "set_opacity": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          if (!("opacity" in n)) {
            results.push({ nodeId: nid, error: "Node does not support opacity" });
            continue;
          }
          n.opacity = p.opacity;
          results.push({ nodeId: nid, opacity: n.opacity });
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      case "set_corner_radius": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          if (!("cornerRadius" in n)) {
            results.push({ nodeId: nid, error: "Node does not support corner radius" });
            continue;
          }
          if (p.cornerRadius != null) n.cornerRadius = p.cornerRadius;
          if (p.topLeftRadius != null) n.topLeftRadius = p.topLeftRadius;
          if (p.topRightRadius != null) n.topRightRadius = p.topRightRadius;
          if (p.bottomLeftRadius != null) n.bottomLeftRadius = p.bottomLeftRadius;
          if (p.bottomRightRadius != null) n.bottomRightRadius = p.bottomRightRadius;
          results.push({ nodeId: nid, cornerRadius: n.cornerRadius === figma.mixed ? "mixed" : n.cornerRadius });
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      case "set_auto_layout": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        if (node.type !== "FRAME") throw new Error(`Node ${nodeId} is not a FRAME`);
        applyAutoLayout(node, p);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: node.id, name: node.name }
        };
      }
      case "set_visible": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          if (!("visible" in n)) {
            results.push({ nodeId: nid, error: "Node does not support visibility" });
            continue;
          }
          n.visible = p.visible;
          results.push({ nodeId: nid, visible: n.visible });
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      case "lock_nodes":
      case "unlock_nodes": {
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const locked = request.type === "lock_nodes";
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          if (!("locked" in n)) {
            results.push({ nodeId: nid, error: "Node does not support locking" });
            continue;
          }
          n.locked = locked;
          results.push({ nodeId: nid, locked: n.locked });
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      case "rotate_nodes": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          if (!("rotation" in n)) {
            results.push({ nodeId: nid, error: "Node does not support rotation" });
            continue;
          }
          n.rotation = p.rotation;
          results.push({ nodeId: nid, rotation: n.rotation });
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      case "reorder_nodes": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const validOrders = ["bringToFront", "sendToBack", "bringForward", "sendBackward"];
        if (!validOrders.includes(p.order)) {
          throw new Error(`order must be bringToFront, sendToBack, bringForward, or sendBackward`);
        }
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          const parent = n.parent;
          if (!parent || !("children" in parent)) {
            results.push({ nodeId: nid, error: "Node has no reorderable parent" });
            continue;
          }
          const siblings = parent.children;
          const currentIndex = siblings.indexOf(n);
          let newIndex;
          switch (p.order) {
            case "bringToFront":
              newIndex = siblings.length - 1;
              break;
            case "sendToBack":
              newIndex = 0;
              break;
            case "bringForward":
              newIndex = Math.min(currentIndex + 1, siblings.length - 1);
              break;
            case "sendBackward":
              newIndex = Math.max(currentIndex - 1, 0);
              break;
            default:
              newIndex = currentIndex;
          }
          parent.insertChild(newIndex, n);
          results.push({ nodeId: nid, index: newIndex });
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      case "set_blend_mode": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          if (!("blendMode" in n)) {
            results.push({ nodeId: nid, error: "Node does not support blend mode" });
            continue;
          }
          n.blendMode = p.blendMode;
          results.push({ nodeId: nid, blendMode: n.blendMode });
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      case "set_constraints": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          if (!("constraints" in n)) {
            results.push({ nodeId: nid, error: "Node does not support constraints" });
            continue;
          }
          const updated = __spreadValues({}, n.constraints);
          if (p.horizontal) updated.horizontal = p.horizontal;
          if (p.vertical) updated.vertical = p.vertical;
          n.constraints = updated;
          results.push({ nodeId: nid, constraints: n.constraints });
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      case "reparent_nodes": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        if (!p.parentId) throw new Error("parentId is required");
        const newParent = yield figma.getNodeByIdAsync(p.parentId);
        if (!newParent) throw new Error(`Parent not found: ${p.parentId}`);
        if (!("appendChild" in newParent)) throw new Error(`Node ${p.parentId} cannot contain children`);
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          try {
            newParent.appendChild(n);
            results.push({ nodeId: nid, newParentId: p.parentId });
          } catch (e) {
            results.push({ nodeId: nid, error: e.message });
          }
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      case "batch_rename_nodes": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          const oldName = n.name;
          let newName = oldName;
          if (p.find !== void 0 && p.replace !== void 0) {
            if (p.useRegex) {
              try {
                const regex = new RegExp(p.find, p.regexFlags || "g");
                newName = newName.replace(regex, p.replace);
              } catch (e) {
                results.push({ nodeId: nid, error: `Invalid regex: ${e.message}` });
                continue;
              }
            } else {
              newName = newName.split(p.find).join(p.replace);
            }
          }
          if (p.prefix) newName = p.prefix + newName;
          if (p.suffix) newName = newName + p.suffix;
          n.name = newName;
          results.push({ nodeId: nid, oldName, name: newName });
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      case "find_replace_text": {
        const p = request.params || {};
        if (!p.find) throw new Error("find is required");
        if (p.replace === void 0) throw new Error("replace is required");
        const rootNodeId = request.nodeIds && request.nodeIds[0];
        const root = rootNodeId ? yield figma.getNodeByIdAsync(rootNodeId) : figma.currentPage;
        if (!root) throw new Error(`Root node not found: ${rootNodeId}`);
        const textNodes = [];
        const collect = (node) => {
          if (node.type === "TEXT") textNodes.push(node);
          if ("children" in node) node.children.forEach(collect);
        };
        collect(root);
        const results = [];
        for (const tn of textNodes) {
          const originalText = tn.characters;
          let newText;
          if (p.useRegex) {
            try {
              const regex = new RegExp(p.find, p.regexFlags || "g");
              newText = originalText.replace(regex, p.replace);
            } catch (e) {
              results.push({ nodeId: tn.id, nodeName: tn.name, error: `Invalid regex: ${e.message}` });
              continue;
            }
          } else {
            newText = originalText.split(p.find).join(p.replace);
          }
          if (newText !== originalText) {
            const fontName = typeof tn.fontName === "symbol" ? { family: "Inter", style: "Regular" } : tn.fontName;
            yield figma.loadFontAsync(fontName);
            tn.characters = newText;
            results.push({ nodeId: tn.id, nodeName: tn.name, oldText: originalText, newText });
          }
        }
        figma.commitUndo();
        const successCount = results.filter((r) => !r.error).length;
        return { type: request.type, requestId: request.requestId, data: { replaced: successCount, results } };
      }
      default:
        return null;
    }
  });
  const resolveSceneNodes = (nodeIds) => __async(null, null, function* () {
    const nodes = [];
    for (const id of nodeIds) {
      const node = yield figma.getNodeByIdAsync(id);
      if (!node) throw new Error(`Node not found: ${id}`);
      if (!("parent" in node) || !node.parent) throw new Error(`Node ${id} is not placeable on the canvas`);
      nodes.push(node);
    }
    return nodes;
  });
  const handleWriteVectorRequest = (request) => __async(null, null, function* () {
    switch (request.type) {
      case "boolean_operation": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length < 2) throw new Error("boolean_operation requires at least 2 nodeIds");
        const operation = String(p.operation || "").toUpperCase();
        const nodes = yield resolveSceneNodes(nodeIds);
        const parent = nodes[0].parent;
        if (!parent) throw new Error("Selected nodes have no common parent");
        let result;
        switch (operation) {
          case "UNION":
            result = figma.union(nodes, parent);
            break;
          case "SUBTRACT":
            result = figma.subtract(nodes, parent);
            break;
          case "INTERSECT":
            result = figma.intersect(nodes, parent);
            break;
          case "EXCLUDE":
            result = figma.exclude(nodes, parent);
            break;
          default:
            throw new Error(`Unknown operation "${p.operation}". Use UNION, SUBTRACT, INTERSECT, or EXCLUDE.`);
        }
        if (p.name != null) result.name = String(p.name);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: result.id, name: result.name, type: result.type, operation, bounds: getBounds(result) }
        };
      }
      case "flatten_node": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("flatten_node requires at least 1 nodeId");
        const nodes = yield resolveSceneNodes(nodeIds);
        const parent = nodes[0].parent;
        if (!parent) throw new Error("Selected nodes have no common parent");
        const result = figma.flatten(nodes, parent);
        if (p.name != null) result.name = String(p.name);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: result.id, name: result.name, type: result.type, bounds: getBounds(result) }
        };
      }
      default:
        return null;
    }
  });
  const handleWriteStyleRequest = (request) => __async(null, null, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    switch (request.type) {
      case "create_paint_style": {
        const p = request.params || {};
        if (!p.name) throw new Error("name is required");
        if (!p.color) throw new Error("color is required");
        const existing = (yield figma.getLocalPaintStylesAsync()).find((s) => s.name === p.name);
        if (existing) {
          return { type: request.type, requestId: request.requestId, data: { id: existing.id, name: existing.name } };
        }
        const style = figma.createPaintStyle();
        style.name = p.name;
        style.paints = [makeSolidPaint(p.color)];
        if (p.description) style.description = p.description;
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: style.id, name: style.name }
        };
      }
      case "create_text_style": {
        const p = request.params || {};
        if (!p.name) throw new Error("name is required");
        const existing = (yield figma.getLocalTextStylesAsync()).find((s) => s.name === p.name);
        if (existing) {
          return { type: request.type, requestId: request.requestId, data: { id: existing.id, name: existing.name } };
        }
        const family = p.fontFamily || "Inter";
        const fontStyle = p.fontStyle || "Regular";
        yield figma.loadFontAsync({ family, style: fontStyle });
        const style = figma.createTextStyle();
        style.name = p.name;
        style.fontName = { family, style: fontStyle };
        if (p.fontSize != null) style.fontSize = Number(p.fontSize);
        if (p.description) style.description = p.description;
        if (p.textDecoration && p.textDecoration !== "NONE") {
          style.textDecoration = p.textDecoration;
        }
        if (p.lineHeightValue != null) {
          style.lineHeight = { value: Number(p.lineHeightValue), unit: p.lineHeightUnit || "PIXELS" };
        }
        if (p.letterSpacingValue != null) {
          style.letterSpacing = { value: Number(p.letterSpacingValue), unit: p.letterSpacingUnit || "PIXELS" };
        }
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: style.id, name: style.name }
        };
      }
      case "create_effect_style": {
        const p = request.params || {};
        if (!p.name) throw new Error("name is required");
        const existing = (yield figma.getLocalEffectStylesAsync()).find((s) => s.name === p.name);
        if (existing) {
          return { type: request.type, requestId: request.requestId, data: { id: existing.id, name: existing.name } };
        }
        const effectType = p.type || "DROP_SHADOW";
        let effect;
        if (effectType === "LAYER_BLUR") {
          effect = { type: "LAYER_BLUR", blurType: "NORMAL", radius: Number((_a = p.radius) != null ? _a : 4), visible: true };
        } else if (effectType === "BACKGROUND_BLUR") {
          effect = { type: "BACKGROUND_BLUR", blurType: "NORMAL", radius: Number((_b = p.radius) != null ? _b : 4), visible: true };
        } else {
          const { r, g, b, a } = hexToRgb(p.color || "#000000");
          const alpha = p.opacity != null ? Number(p.opacity) : a !== 1 ? a : 0.25;
          effect = {
            type: effectType,
            color: { r, g, b, a: alpha },
            offset: { x: Number((_c = p.offsetX) != null ? _c : 0), y: Number((_d = p.offsetY) != null ? _d : 4) },
            radius: Number((_e = p.radius) != null ? _e : 8),
            spread: Number((_f = p.spread) != null ? _f : 0),
            visible: true,
            blendMode: "NORMAL"
          };
        }
        const style = figma.createEffectStyle();
        style.name = p.name;
        style.effects = [effect];
        if (p.description) style.description = p.description;
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: style.id, name: style.name }
        };
      }
      case "create_grid_style": {
        const p = request.params || {};
        if (!p.name) throw new Error("name is required");
        const existing = (yield figma.getLocalGridStylesAsync()).find((s) => s.name === p.name);
        if (existing) {
          return { type: request.type, requestId: request.requestId, data: { id: existing.id, name: existing.name } };
        }
        const pattern = p.pattern || "GRID";
        let grid;
        if (pattern === "COLUMNS" || pattern === "ROWS") {
          grid = {
            pattern,
            count: Number((_g = p.count) != null ? _g : 12),
            gutterSize: Number((_h = p.gutterSize) != null ? _h : 16),
            offset: Number((_i = p.offset) != null ? _i : 0),
            alignment: p.alignment || "STRETCH",
            visible: true
          };
        } else {
          const { r, g, b, a } = hexToRgb(p.color || "#FF0000");
          grid = {
            pattern: "GRID",
            sectionSize: Number((_j = p.sectionSize) != null ? _j : 8),
            visible: true,
            color: { r, g, b, a: p.opacity != null ? Number(p.opacity) : a !== 1 ? a : 0.1 }
          };
        }
        const style = figma.createGridStyle();
        style.name = p.name;
        style.layoutGrids = [grid];
        if (p.description) style.description = p.description;
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: style.id, name: style.name }
        };
      }
      case "update_paint_style": {
        const p = request.params || {};
        if (!p.styleId) throw new Error("styleId is required");
        const style = yield figma.getStyleByIdAsync(p.styleId);
        if (!style) throw new Error(`Style not found: ${p.styleId}`);
        if (style.type !== "PAINT") throw new Error(`Style ${p.styleId} is not a paint style`);
        if (p.name) style.name = p.name;
        if (p.color) style.paints = [makeSolidPaint(p.color)];
        if (p.description != null) style.description = p.description;
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: style.id, name: style.name }
        };
      }
      case "delete_style": {
        const p = request.params || {};
        if (!p.styleId) throw new Error("styleId is required");
        const style = yield figma.getStyleByIdAsync(p.styleId);
        if (!style) throw new Error(`Style not found: ${p.styleId}`);
        style.remove();
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { styleId: p.styleId, deleted: true }
        };
      }
      case "apply_style_to_node": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        if (!p.styleId) throw new Error("styleId is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        const style = yield figma.getStyleByIdAsync(p.styleId);
        if (!style) throw new Error(`Style not found: ${p.styleId}`);
        const n = node;
        switch (style.type) {
          case "PAINT": {
            const target = p.target || "fill";
            if (target === "stroke") {
              if (!("strokeStyleId" in node)) throw new Error(`Node ${nodeId} does not support stroke styles`);
              yield n.setStrokeStyleIdAsync(p.styleId);
            } else {
              if (!("fillStyleId" in node)) throw new Error(`Node ${nodeId} does not support fill styles`);
              yield n.setFillStyleIdAsync(p.styleId);
            }
            break;
          }
          case "TEXT":
            if (!("textStyleId" in node)) throw new Error(`Node ${nodeId} does not support text styles`);
            yield n.setTextStyleIdAsync(p.styleId);
            break;
          case "EFFECT":
            if (!("effectStyleId" in node)) throw new Error(`Node ${nodeId} does not support effect styles`);
            yield n.setEffectStyleIdAsync(p.styleId);
            break;
          case "GRID":
            if (!("gridStyleId" in node)) throw new Error(`Node ${nodeId} does not support grid styles`);
            yield n.setGridStyleIdAsync(p.styleId);
            break;
          default:
            throw new Error(`Unknown style type: ${style.type}`);
        }
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: n.id, name: n.name, styleId: p.styleId, styleType: style.type }
        };
      }
      case "set_effects": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        if (!Array.isArray(p.effects)) throw new Error("effects array is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        if (!("effects" in node)) throw new Error(`Node ${nodeId} does not support effects`);
        const effects = p.effects.map((e) => {
          var _a2, _b2, _c2, _d2, _e2, _f2, _g2;
          switch (e.type) {
            case "DROP_SHADOW":
            case "INNER_SHADOW": {
              const { r, g, b } = hexToRgb(e.color || "#000000");
              return {
                type: e.type,
                color: { r, g, b, a: e.opacity != null ? Number(e.opacity) : 0.25 },
                offset: { x: Number((_a2 = e.offsetX) != null ? _a2 : 0), y: Number((_b2 = e.offsetY) != null ? _b2 : 4) },
                radius: Number((_c2 = e.radius) != null ? _c2 : 4),
                spread: Number((_d2 = e.spread) != null ? _d2 : 0),
                visible: (_e2 = e.visible) != null ? _e2 : true,
                blendMode: e.blendMode || "NORMAL"
              };
            }
            case "LAYER_BLUR":
            case "BACKGROUND_BLUR":
              return {
                type: e.type,
                radius: Number((_f2 = e.radius) != null ? _f2 : 4),
                visible: (_g2 = e.visible) != null ? _g2 : true
              };
            default:
              throw new Error(`Unknown effect type: ${e.type}. Must be DROP_SHADOW, INNER_SHADOW, LAYER_BLUR, or BACKGROUND_BLUR`);
          }
        });
        node.effects = effects;
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: node.id, name: node.name, effectCount: effects.length }
        };
      }
      case "bind_variable_to_node": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        if (!p.variableId) throw new Error("variableId is required");
        if (!p.field) throw new Error("field is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        const variable = yield figma.variables.getVariableByIdAsync(p.variableId);
        if (!variable) throw new Error(`Variable not found: ${p.variableId}`);
        if (p.field === "fillColor") {
          if (!("fills" in node)) throw new Error(`Node ${nodeId} does not support fills`);
          const fills = [...node.fills];
          const base = fills.length > 0 ? fills[0] : makeSolidPaint("#000000");
          const paint = figma.variables.setBoundVariableForPaint(base, "color", variable);
          node.fills = [paint];
        } else if (p.field === "strokeColor") {
          if (!("strokes" in node)) throw new Error(`Node ${nodeId} does not support strokes`);
          const strokes = [...node.strokes];
          const base = strokes.length > 0 ? strokes[0] : makeSolidPaint("#000000");
          const paint = figma.variables.setBoundVariableForPaint(base, "color", variable);
          node.strokes = [paint];
        } else {
          if (!(p.field in node)) throw new Error(`Node ${nodeId} does not have field: ${p.field}`);
          node.setBoundVariable(p.field, variable);
        }
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: node.id, name: node.name, variableId: p.variableId, field: p.field }
        };
      }
      default:
        return null;
    }
  });
  const parseVariableValue = (type, value) => {
    if (type === "COLOR") {
      if (typeof value === "string") {
        const { r, g, b, a } = hexToRgb(value);
        return { r, g, b, a };
      }
      return value;
    }
    if (type === "FLOAT") return typeof value === "number" ? value : parseFloat(String(value));
    if (type === "BOOLEAN") return value === true || value === "true";
    return String(value);
  };
  const handleWriteVariableRequest = (request) => __async(null, null, function* () {
    switch (request.type) {
      case "create_variable_collection": {
        const p = request.params || {};
        if (!p.name) throw new Error("name is required");
        const collection = figma.variables.createVariableCollection(p.name);
        if (p.initialModeName && collection.modes.length > 0) {
          collection.renameMode(collection.modes[0].modeId, p.initialModeName);
        }
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: {
            id: collection.id,
            name: collection.name,
            modes: collection.modes.map((m) => ({ modeId: m.modeId, name: m.name }))
          }
        };
      }
      case "add_variable_mode": {
        const p = request.params || {};
        if (!p.collectionId) throw new Error("collectionId is required");
        if (!p.modeName) throw new Error("modeName is required");
        const collection = yield figma.variables.getVariableCollectionByIdAsync(p.collectionId);
        if (!collection) throw new Error(`Collection not found: ${p.collectionId}`);
        const modeId = collection.addMode(p.modeName);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { collectionId: p.collectionId, modeId, modeName: p.modeName }
        };
      }
      case "create_variable": {
        const p = request.params || {};
        if (!p.name) throw new Error("name is required");
        if (!p.collectionId) throw new Error("collectionId is required");
        const validTypes = ["COLOR", "FLOAT", "STRING", "BOOLEAN"];
        if (!p.type || !validTypes.includes(p.type)) {
          throw new Error("type is required: COLOR, FLOAT, STRING, or BOOLEAN");
        }
        const collection = yield figma.variables.getVariableCollectionByIdAsync(p.collectionId);
        if (!collection) throw new Error(`Collection not found: ${p.collectionId}`);
        const variable = figma.variables.createVariable(p.name, collection, p.type);
        if (p.value != null && collection.modes.length > 0) {
          const modeId = collection.modes[0].modeId;
          variable.setValueForMode(modeId, parseVariableValue(p.type, p.value));
        }
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: {
            id: variable.id,
            name: variable.name,
            resolvedType: variable.resolvedType,
            collectionId: p.collectionId
          }
        };
      }
      case "set_variable_value": {
        const p = request.params || {};
        if (!p.variableId) throw new Error("variableId is required");
        if (!p.modeId) throw new Error("modeId is required");
        if (p.value == null) throw new Error("value is required");
        const variable = yield figma.variables.getVariableByIdAsync(p.variableId);
        if (!variable) throw new Error(`Variable not found: ${p.variableId}`);
        variable.setValueForMode(p.modeId, parseVariableValue(variable.resolvedType, p.value));
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { variableId: variable.id, name: variable.name, modeId: p.modeId }
        };
      }
      case "delete_variable": {
        const p = request.params || {};
        if (p.variableId) {
          const variable = yield figma.variables.getVariableByIdAsync(p.variableId);
          if (!variable) throw new Error(`Variable not found: ${p.variableId}`);
          variable.remove();
          figma.commitUndo();
          return {
            type: request.type,
            requestId: request.requestId,
            data: { variableId: p.variableId, deleted: true }
          };
        } else if (p.collectionId) {
          const collection = yield figma.variables.getVariableCollectionByIdAsync(p.collectionId);
          if (!collection) throw new Error(`Collection not found: ${p.collectionId}`);
          collection.remove();
          figma.commitUndo();
          return {
            type: request.type,
            requestId: request.requestId,
            data: { collectionId: p.collectionId, deleted: true }
          };
        } else {
          throw new Error("variableId or collectionId is required");
        }
      }
      default:
        return null;
    }
  });
  const handleWriteComponentRequest = (request) => __async(null, null, function* () {
    var _a, _b;
    switch (request.type) {
      case "instantiate_component": {
        const p = request.params || {};
        const parentId = typeof p.parentId === "string" ? p.parentId : void 0;
        const parent = yield getParentNode(parentId);
        const resolveVariantComponent = () => __async(null, null, function* () {
          if (typeof p.componentId === "string" && p.componentId) {
            const component2 = yield figma.getNodeByIdAsync(p.componentId);
            if (!component2) throw new Error(`Component not found: ${p.componentId}`);
            if (component2.type !== "COMPONENT") throw new Error(`Node ${p.componentId} is not a COMPONENT`);
            return component2;
          }
          if (typeof p.componentSetId !== "string" || !p.componentSetId) {
            throw new Error("componentId or componentSetId is required");
          }
          const componentSet = yield figma.getNodeByIdAsync(p.componentSetId);
          if (!componentSet) throw new Error(`Component set not found: ${p.componentSetId}`);
          if (componentSet.type !== "COMPONENT_SET") {
            throw new Error(`Node ${p.componentSetId} is not a COMPONENT_SET`);
          }
          const requestedVariants = typeof p.variantProperties === "object" && p.variantProperties ? p.variantProperties : {};
          const matchingChild = componentSet.children.find((child) => {
            if (child.type !== "COMPONENT") return false;
            const variantProps = child.variantProperties || {};
            return Object.entries(requestedVariants).every(([key, value]) => variantProps[key] === value);
          });
          const fallback = componentSet.defaultVariant || componentSet.children.find((child) => child.type === "COMPONENT");
          if (!matchingChild && !fallback) {
            throw new Error(`Component set ${p.componentSetId} does not contain a concrete COMPONENT variant`);
          }
          return matchingChild || fallback;
        });
        const component = yield resolveVariantComponent();
        const instance = component.createInstance();
        if (p.x != null) instance.x = Number(p.x);
        if (p.y != null) instance.y = Number(p.y);
        parent.appendChild(instance);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: {
            id: instance.id,
            name: instance.name,
            type: instance.type,
            componentId: component.id,
            componentName: component.name,
            componentSetId: component.parent && component.parent.type === "COMPONENT_SET" ? component.parent.id : null,
            variantProperties: component.variantProperties || null
          }
        };
      }
      case "import_component_by_key": {
        const p = request.params || {};
        const key = typeof p.key === "string" ? p.key : null;
        if (!key) throw new Error("key is required");
        const parentId = typeof p.parentId === "string" ? p.parentId : void 0;
        const parent = yield getParentNode(parentId);
        let component;
        try {
          component = yield figma.importComponentByKeyAsync(key);
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err);
          throw new Error(
            `Cannot import component by key "${key}": ${raw}. REASON: importComponentByKeyAsync only works when the design system file is published as a Figma Team Library and enabled in this file (Resources > Libraries). WORKAROUND: (1) In the DS file, publish it as a team library (main menu > Libraries). (2) In this file, enable that library (Resources panel > Libraries). (3) Alternatively, use clone_node with the component ID and sessionId of the DS session to copy it within that file first.`
          );
        }
        const instance = component.createInstance();
        if (p.x != null) instance.x = Number(p.x);
        if (p.y != null) instance.y = Number(p.y);
        parent.appendChild(instance);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: {
            id: instance.id,
            name: instance.name,
            type: instance.type,
            componentKey: key,
            componentId: component.id,
            componentName: component.name,
            componentSetId: ((_a = component.parent) == null ? void 0 : _a.type) === "COMPONENT_SET" ? component.parent.id : null,
            variantProperties: (_b = component.variantProperties) != null ? _b : null
          }
        };
      }
      case "swap_component": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        if (!p.componentId) throw new Error("componentId is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        if (node.type !== "INSTANCE") throw new Error(`Node ${nodeId} is not a component INSTANCE`);
        const component = yield figma.getNodeByIdAsync(p.componentId);
        if (!component) throw new Error(`Component not found: ${p.componentId}`);
        if (component.type !== "COMPONENT") throw new Error(`Node ${p.componentId} is not a COMPONENT`);
        node.mainComponent = component;
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: node.id, name: node.name, componentId: component.id, componentName: component.name }
        };
      }
      case "detach_instance": {
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          if (n.type !== "INSTANCE") {
            results.push({ nodeId: nid, error: "Node is not an INSTANCE" });
            continue;
          }
          const frame = n.detachInstance();
          results.push({ nodeId: nid, newId: frame.id, name: frame.name });
        }
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { results }
        };
      }
      case "delete_nodes": {
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          n.remove();
          results.push({ nodeId: nid, deleted: true });
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      case "navigate_to_page": {
        const p = request.params || {};
        let page;
        if (p.pageId) {
          const found = yield figma.getNodeByIdAsync(p.pageId);
          if (!found) throw new Error(`Page not found: ${p.pageId}`);
          if (found.type !== "PAGE") throw new Error(`Node ${p.pageId} is not a PAGE`);
          page = found;
        } else if (p.pageName) {
          page = figma.root.children.find((pg) => pg.name === p.pageName);
          if (!page) throw new Error(`Page not found with name: ${p.pageName}`);
        } else {
          throw new Error("pageId or pageName is required");
        }
        yield figma.setCurrentPageAsync(page);
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: page.id, name: page.name }
        };
      }
      case "group_nodes": {
        const p = request.params || {};
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const nodes = yield Promise.all(nodeIds.map((id) => figma.getNodeByIdAsync(id)));
        const validNodes = nodes.filter((n) => n !== null && n.type !== "DOCUMENT" && n.type !== "PAGE");
        if (validNodes.length === 0) throw new Error("No valid scene nodes found");
        const parent = validNodes[0].parent;
        if (!parent) throw new Error("Nodes must have a parent");
        const group = figma.group(validNodes, parent);
        if (p.name) group.name = p.name;
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: group.id, name: group.name, type: group.type }
        };
      }
      case "ungroup_nodes": {
        const nodeIds = request.nodeIds || [];
        if (nodeIds.length === 0) throw new Error("nodeIds is required");
        const results = [];
        for (const nid of nodeIds) {
          const n = yield figma.getNodeByIdAsync(nid);
          if (!n) {
            results.push({ nodeId: nid, error: "Node not found" });
            continue;
          }
          if (n.type !== "GROUP") {
            results.push({ nodeId: nid, error: "Node is not a GROUP" });
            continue;
          }
          const group = n;
          const parent = group.parent;
          const index = parent.children.indexOf(group);
          const childIds = [];
          for (const child of [...group.children]) {
            parent.insertChild(index, child);
            childIds.push(child.id);
          }
          group.remove();
          results.push({ nodeId: nid, childIds });
        }
        figma.commitUndo();
        return { type: request.type, requestId: request.requestId, data: { results } };
      }
      default:
        return null;
    }
  });
  function buildReaction(r) {
    var _a, _b;
    const actions = (_a = r.actions) != null ? _a : r.action != null ? [r.action] : [];
    return { trigger: (_b = r.trigger) != null ? _b : null, actions };
  }
  function parseArray(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try {
        return JSON.parse(v);
      } catch (e) {
        return [];
      }
    }
    return [];
  }
  function setReactions(node, reactions) {
    return __async(this, null, function* () {
      if (typeof node.setReactionsAsync === "function") {
        yield node.setReactionsAsync(reactions);
        return;
      }
      try {
        node.reactions = reactions;
      } catch (e) {
        throw new Error(`Failed to set reactions: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }
  const handleWritePrototypeRequest = (request) => __async(null, null, function* () {
    switch (request.type) {
      case "set_reactions": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        if (!("reactions" in node)) throw new Error(`Node ${nodeId} does not support reactions`);
        const incoming = parseArray(p.reactions).map(buildReaction);
        const current = node.reactions;
        const final = p.mode === "append" ? [...current, ...incoming] : incoming;
        yield setReactions(node, final);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: node.id, name: node.name, reactionCount: final.length }
        };
      }
      case "remove_reactions": {
        const p = request.params || {};
        const nodeId = request.nodeIds && request.nodeIds[0];
        if (!nodeId) throw new Error("nodeId is required");
        const node = yield figma.getNodeByIdAsync(nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        if (!("reactions" in node)) throw new Error(`Node ${nodeId} does not support reactions`);
        const current = node.reactions;
        let updated;
        if (p.indices == null) {
          updated = [];
        } else {
          const indices = parseArray(p.indices);
          if (indices.length === 0) {
            updated = [];
          } else {
            const toRemove = new Set(indices);
            updated = current.filter((_, i) => !toRemove.has(i));
          }
        }
        yield setReactions(node, updated);
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: {
            id: node.id,
            name: node.name,
            removed: current.length - updated.length,
            reactionCount: updated.length
          }
        };
      }
      default:
        return null;
    }
  });
  const handleWritePageRequest = (request) => __async(null, null, function* () {
    switch (request.type) {
      case "add_page": {
        const p = request.params || {};
        const page = figma.createPage();
        if (p.name) page.name = p.name;
        if (p.index != null) {
          figma.root.insertChild(Number(p.index), page);
        }
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: {
            id: page.id,
            name: page.name,
            index: figma.root.children.indexOf(page)
          }
        };
      }
      case "delete_page": {
        const p = request.params || {};
        let page;
        if (p.pageId) {
          const found = yield figma.getNodeByIdAsync(p.pageId);
          if (!found) throw new Error(`Page not found: ${p.pageId}`);
          if (found.type !== "PAGE") throw new Error(`Node ${p.pageId} is not a PAGE`);
          page = found;
        } else if (p.pageName) {
          page = figma.root.children.find((pg) => pg.name === p.pageName);
          if (!page) throw new Error(`Page not found with name: ${p.pageName}`);
        } else {
          throw new Error("pageId or pageName is required");
        }
        if (figma.root.children.length <= 1) {
          throw new Error("Cannot delete the only page in the document");
        }
        const deletedId = page.id;
        const deletedName = page.name;
        page.remove();
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: deletedId, name: deletedName, deleted: true }
        };
      }
      case "rename_page": {
        const p = request.params || {};
        let page;
        if (p.pageId) {
          const found = yield figma.getNodeByIdAsync(p.pageId);
          if (!found) throw new Error(`Page not found: ${p.pageId}`);
          if (found.type !== "PAGE") throw new Error(`Node ${p.pageId} is not a PAGE`);
          page = found;
        } else if (p.pageName) {
          page = figma.root.children.find((pg) => pg.name === p.pageName);
          if (!page) throw new Error(`Page not found with name: ${p.pageName}`);
        } else {
          throw new Error("pageId or pageName is required");
        }
        if (!p.newName) throw new Error("newName is required");
        const oldName = page.name;
        page.name = p.newName;
        figma.commitUndo();
        return {
          type: request.type,
          requestId: request.requestId,
          data: { id: page.id, oldName, name: page.name }
        };
      }
      default:
        return null;
    }
  });
  const handleWriteRequest = (request) => __async(null, null, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    return (_g = (_f = (_e = (_d = (_c = (_b = (_a = yield handleWriteCreateRequest(request)) != null ? _a : yield handleWriteModifyRequest(request)) != null ? _b : yield handleWriteVectorRequest(request)) != null ? _c : yield handleWriteStyleRequest(request)) != null ? _d : yield handleWriteVariableRequest(request)) != null ? _e : yield handleWriteComponentRequest(request)) != null ? _f : yield handleWritePrototypeRequest(request)) != null ? _g : yield handleWritePageRequest(request);
  });
  const requestHandlers = [handleReadRequest, handleWriteRequest];
  const debugLog = (scope, message, extra) => {
    const prefix = `[za-talk-to-figma:${scope}] ${message}`;
    if (extra) {
      console.log(prefix, extra);
      return;
    }
    console.log(prefix);
  };
  const postToUI = (message) => {
    figma.ui.postMessage(message);
  };
  const sessionNonce = Math.random().toString(36).slice(2, 10);
  const sanitizeSessionSegment = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "untitled";
  const stableSessionId = (() => {
    const rootId = figma.root.id;
    const rootKey = rootId && rootId !== "0:0" ? rootId.replace(/[^a-zA-Z0-9:_-]/g, "-") : "";
    const fileSlug = sanitizeSessionSegment(figma.root.name);
    const pageSlug = sanitizeSessionSegment(figma.currentPage.name);
    const base = rootKey ? `${fileSlug}-${rootKey}` : `${fileSlug}-${pageSlug}`;
    return `figma:${base}:${sessionNonce}`;
  })();
  const getSessionId = () => stableSessionId;
  const sendStatus = () => {
    const sel = figma.currentPage.selection;
    const message = {
      type: "plugin-status",
      payload: {
        sessionId: getSessionId(),
        fileName: figma.root.name,
        pageName: figma.currentPage.name,
        selectionCount: sel.length,
        selection: sel.map((n) => ({ id: n.id, name: n.name, type: n.type }))
      }
    };
    postToUI(message);
  };
  const sendRequestEvent = (stage, payload) => {
    postToUI({
      type: "request_event",
      stage,
      payload
    });
  };
  const dispatchRequest = (request) => __async(null, null, function* () {
    for (const handler of requestHandlers) {
      const result = yield handler(request);
      if (result) {
        return result;
      }
    }
    return {
      type: request.type,
      requestId: request.requestId,
      error: `Unknown request type: ${request.type}`
    };
  });
  const handleRequest = (request) => __async(null, null, function* () {
    const startedAt = Date.now();
    debugLog("request", "start", {
      type: request.type,
      requestId: request.requestId,
      nodeIds: Array.isArray(request.nodeIds) ? request.nodeIds.length : 0,
      paramKeys: request.params ? Object.keys(request.params) : []
    });
    sendRequestEvent("start", {
      type: request.type,
      requestId: request.requestId,
      nodeIds: Array.isArray(request.nodeIds) ? request.nodeIds.length : 0
    });
    try {
      const result = yield dispatchRequest(request);
      const durationMs = Date.now() - startedAt;
      if (result.error) {
        debugLog("request", "error", {
          type: request.type,
          requestId: request.requestId,
          durationMs,
          error: result.error
        });
        sendRequestEvent("error", {
          type: request.type,
          requestId: request.requestId,
          durationMs,
          error: result.error
        });
        return result;
      }
      debugLog("request", "success", {
        type: request.type,
        requestId: request.requestId,
        durationMs
      });
      sendRequestEvent("success", {
        type: request.type,
        requestId: request.requestId,
        durationMs
      });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startedAt;
      debugLog("request", "error", {
        type: request.type,
        requestId: request.requestId,
        durationMs,
        error: errorMessage
      });
      sendRequestEvent("error", {
        type: request.type,
        requestId: request.requestId,
        durationMs,
        error: errorMessage
      });
      return {
        type: request.type,
        requestId: request.requestId,
        error: errorMessage
      };
    }
  });
  figma.showUI(__html__, { width: 440, height: 720 });
  sendStatus();
  figma.on("selectionchange", () => {
    sendStatus();
  });
  figma.on("currentpagechange", () => {
    sendStatus();
  });
  figma.ui.onmessage = (message) => __async(null, null, function* () {
    var _a, _b;
    if (message.type === "ui-ready") {
      sendStatus();
      return;
    }
    if (message.type === "get_ws_config") {
      const config = yield figma.clientStorage.getAsync("ws_config");
      postToUI({
        type: "ws_config",
        host: (_a = config == null ? void 0 : config.host) != null ? _a : "127.0.0.1",
        port: (_b = config == null ? void 0 : config.port) != null ? _b : "1802"
      });
      return;
    }
    if (message.type === "save_ws_config") {
      yield figma.clientStorage.setAsync("ws_config", {
        host: message.host,
        port: message.port
      });
      return;
    }
    if (message.type === "open_external") {
      if (!message.url) return;
      try {
        figma.openExternal(message.url);
        debugLog("bridge", "open-external", { url: message.url });
      } catch (error) {
        debugLog("bridge", "open-external failed", {
          url: message.url,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      return;
    }
    if (message.type === "server-request") {
      if (!isPluginToolRequest(message.payload)) {
        debugLog("bridge", "ignored malformed server-request");
        return;
      }
      debugLog("bridge", "server-request received", {
        type: message.payload.type,
        requestId: message.payload.requestId
      });
      const response = yield handleRequest(message.payload);
      try {
        response.sessionId = getSessionId();
        response.clientId = message.payload.clientId;
        postToUI(response);
        debugLog("bridge", "response posted", {
          type: response.type,
          requestId: response.requestId,
          hasError: !!response.error
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        debugLog("bridge", "response post failed", {
          type: response.type,
          requestId: response.requestId,
          error: errorMessage
        });
        postToUI({
          type: response.type,
          requestId: response.requestId,
          error: errorMessage
        });
      }
    }
  });
})();
