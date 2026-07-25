var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __pow = Math.pow;
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
  const postProgress$1 = (requestId, progress, message) => {
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
  const getNodeByIdLocalFirst$1 = (nodeId) => __async(null, null, function* () {
    if (figma.currentPage.id === nodeId) return figma.currentPage;
    if ("findOne" in figma.currentPage) {
      const local = figma.currentPage.findOne((node) => node.id === nodeId);
      if (local) return local;
    }
    return figma.getNodeByIdAsync(nodeId);
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
    postProgress$1(opts.requestId, progress, message);
    yield yieldToUI();
  });
  const buildNodeSummary = (node, detail) => __async(null, null, function* () {
    var _a, _b, _c;
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
      try {
        const mainComponent = yield node.getMainComponentAsync();
        summary.mainComponentId = (_a = mainComponent == null ? void 0 : mainComponent.id) != null ? _a : null;
        summary.mainComponentName = (_b = mainComponent == null ? void 0 : mainComponent.name) != null ? _b : null;
        summary.mainComponentKey = (_c = mainComponent == null ? void 0 : mainComponent.key) != null ? _c : null;
      } catch (error) {
        summary.mainComponentError = error instanceof Error ? error.message : String(error);
      }
      try {
        if (node.componentProperties) {
          const componentProperties = {};
          for (const [key, property] of Object.entries(node.componentProperties)) {
            componentProperties[key] = property.value;
          }
          if (Object.keys(componentProperties).length > 0) {
            summary.componentProperties = componentProperties;
          }
        }
      } catch (error) {
        summary.componentPropertiesError = error instanceof Error ? error.message : String(error);
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
  const isDesignSystemInstanceCandidate = (node) => {
    const name = node.name.toLowerCase();
    return name.includes("[zds]") || name === "mp-header" || name === "calendar" || name === "single-picker";
  };
  const componentPropertyValues = (node) => {
    var _a;
    try {
      return Object.fromEntries(
        Object.entries((_a = node.componentProperties) != null ? _a : {}).map(([name, property]) => {
          var _a2;
          return [
            name,
            String((_a2 = property.value) != null ? _a2 : "")
          ];
        })
      );
    } catch (e) {
      return {};
    }
  };
  const catalogVariantSignature = (properties) => Object.entries(properties).filter(([name]) => /(dark|level|state|size|icon|type)/i.test(name)).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}=${value}`).join("|").toLowerCase();
  const nearbyContextLabels = (node) => {
    const labels = [];
    const parent = node.parent;
    if (parent && "children" in parent) {
      const siblings = parent.children;
      const index = siblings.indexOf(node);
      for (let cursor = Math.max(0, index - 3); cursor < Math.min(siblings.length, index + 2); cursor++) {
        const sibling = siblings[cursor];
        if ((sibling == null ? void 0 : sibling.type) === "TEXT" && sibling.characters.trim()) labels.push(sibling.characters.trim());
      }
    }
    return [...new Set(labels)].slice(0, 6);
  };
  const ancestorNames = (node) => {
    const names = [];
    let current = node.parent;
    while (current && current.type !== "DOCUMENT" && names.length < 5) {
      if ("name" in current && current.name) names.push(current.name);
      current = current.parent;
    }
    return names;
  };
  const handleReadDocumentRequest = (request) => __async(null, null, function* () {
    var _a, _b, _c;
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
        const node = yield getNodeByIdLocalFirst$1(nodeId);
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
        const nodes = yield Promise.all(request.nodeIds.map((id) => getNodeByIdLocalFirst$1(id)));
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
            postProgress$1(request.requestId, 20, `Scanning fonts… (${visited} nodes)`);
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
        const root = scopeNodeId ? yield getNodeByIdLocalFirst$1(scopeNodeId) : figma.currentPage;
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
            postProgress$1(request.requestId, 25, `Searching nodes… (${visited} visited)`);
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
        const node = yield getNodeByIdLocalFirst$1(nodeId);
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
        const root = yield getNodeByIdLocalFirst$1(nodeId);
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
            postProgress$1(request.requestId, 15, `Scanning text nodes… (${visited} visited)`);
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
        const root = yield getNodeByIdLocalFirst$1(nodeId);
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
            postProgress$1(request.requestId, 15, `Scanning nodes… (${visited} visited)`);
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
      case "discover_design_system_instances": {
        const params = request.params || {};
        const nodeId = typeof params.nodeId === "string" && params.nodeId ? params.nodeId : figma.currentPage.id;
        const root = yield getNodeByIdLocalFirst$1(nodeId);
        if (!root || root.type === "DOCUMENT" || !("findAllWithCriteria" in root)) {
          throw new Error(`Node does not support instance discovery: ${nodeId}`);
        }
        const maxInstances = toPositiveInt(params.maxInstances, 600);
        const allInstances = root.findAllWithCriteria({ types: ["INSTANCE"] });
        const matchingInstances = allInstances.filter(isDesignSystemInstanceCandidate);
        const candidates = [];
        const seenSignatures = /* @__PURE__ */ new Set();
        for (const node of matchingInstances) {
          const contextLabels = nearbyContextLabels(node);
          const componentProperties = componentPropertyValues(node);
          const signature = [
            node.name.toLowerCase(),
            catalogVariantSignature(componentProperties),
            contextLabels.join("|").toLowerCase()
          ].join("|");
          if (seenSignatures.has(signature)) continue;
          seenSignatures.add(signature);
          candidates.push({ node, contextLabels, componentProperties });
          if (candidates.length >= maxInstances) break;
        }
        const instances = [];
        for (const candidate of candidates) {
          const { node, contextLabels, componentProperties } = candidate;
          let mainComponentId = null;
          let mainComponentName = null;
          let mainComponentKey = null;
          let mainComponentError;
          try {
            const main = yield node.getMainComponentAsync();
            mainComponentId = (_a = main == null ? void 0 : main.id) != null ? _a : null;
            mainComponentName = (_b = main == null ? void 0 : main.name) != null ? _b : null;
            mainComponentKey = (_c = main == null ? void 0 : main.key) != null ? _c : null;
          } catch (error) {
            mainComponentError = error instanceof Error ? error.message : String(error);
          }
          instances.push(__spreadValues({
            id: node.id,
            name: node.name,
            type: node.type,
            pageId: figma.currentPage.id,
            mainComponentId,
            mainComponentName,
            mainComponentKey,
            componentProperties,
            contextLabels,
            ancestorNames: ancestorNames(node)
          }, mainComponentError ? { mainComponentError } : {}));
        }
        return {
          type: request.type,
          requestId: request.requestId,
          data: {
            count: instances.length,
            instances,
            candidateCount: matchingInstances.length,
            truncated: candidates.length >= maxInstances && candidates.length < matchingInstances.length
          }
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
  const metadataKey = "za-pm-lifecycle";
  const postProgress = (requestId, progress, message) => {
    var _a;
    (_a = figma.ui) == null ? void 0 : _a.postMessage({
      type: "progress_update",
      requestId,
      progress,
      message
    });
  };
  const yieldToFigma = () => new Promise((resolve) => setTimeout(resolve, 0));
  const readMetadata = (node) => {
    const raw = node.getPluginData(metadataKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (e) {
      return null;
    }
  };
  const writeMetadata = (node, metadata) => {
    node.setPluginData(metadataKey, JSON.stringify(metadata));
  };
  const findArtifactRoot = (idempotencyKey) => __async(null, null, function* () {
    const pages = [
      figma.currentPage,
      ...figma.root.children.filter((page) => page.id !== figma.currentPage.id)
    ];
    for (const page of pages) {
      if (page.id !== figma.currentPage.id) {
        try {
          yield page.loadAsync();
        } catch (e) {
          continue;
        }
      }
      const root = page.children.find((node) => {
        const metadata = readMetadata(node);
        return (metadata == null ? void 0 : metadata.kind) === "artifact_root" && metadata.idempotencyKey === idempotencyKey;
      });
      if (root) return { page, root };
    }
    return null;
  });
  const localComponentByKey = (key) => __async(null, null, function* () {
    for (const page of figma.root.children) {
      yield page.loadAsync();
      const local = page.findAllWithCriteria({ types: ["COMPONENT"] }).find((component) => component.key === key);
      if ((local == null ? void 0 : local.type) === "COMPONENT") return local;
    }
    try {
      return yield figma.importComponentByKeyAsync(key);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`COMPONENT_UNAVAILABLE: ${key}: ${detail}`);
    }
  });
  const containingPageId = (node) => {
    let current = node;
    while (current && current.type !== "DOCUMENT") {
      if (current.type === "PAGE") return current.id;
      current = current.parent;
    }
    return null;
  };
  const getLoadedNodeById = (nodeId) => {
    for (const page of figma.root.children) {
      if (page.id === nodeId) return page;
      if ("findOne" in page) {
        const local = page.findOne((node) => node.id === nodeId);
        if (local) return local;
      }
    }
    return null;
  };
  const getNodeByIdLocalFirst = (nodeId) => __async(null, null, function* () {
    try {
      const indexed = yield figma.getNodeByIdAsync(nodeId);
      if (indexed) return indexed;
    } catch (e) {
    }
    return getLoadedNodeById(nodeId);
  });
  const requireSourcePage = (targetPageId) => __async(null, null, function* () {
    if (typeof targetPageId !== "string" || !targetPageId) throw new Error("targetPageId is required");
    const page = yield getNodeByIdLocalFirst(targetPageId);
    if (!page || page.type !== "PAGE") {
      throw new Error(`TARGET_NOT_ALLOWED: source page ${targetPageId} is unavailable`);
    }
    if (page.id !== figma.currentPage.id) yield page.loadAsync();
    return page;
  });
  const createBoundInstance = (slot, targetPage) => __async(null, null, function* () {
    const binding = slot.componentBinding;
    if ((binding == null ? void 0 : binding.kind) === "same_file_instance") {
      if (binding.pageId !== targetPage.id || typeof binding.nodeId !== "string") {
        throw new Error(`COMPONENT_SOURCE_NOT_ALLOWED: ${String(slot.slotKey)}`);
      }
      const source = yield getNodeByIdLocalFirst(binding.nodeId);
      if (!source || source.type !== "INSTANCE" || containingPageId(source) !== targetPage.id) {
        throw new Error(`COMPONENT_UNAVAILABLE: same-file instance ${binding.nodeId}`);
      }
      return source.clone();
    }
    const key = (binding == null ? void 0 : binding.kind) === "component_key" && typeof binding.key === "string" ? binding.key : slot.componentKey;
    if (typeof key !== "string" || !key) {
      throw new Error(`COMPONENT_UNAVAILABLE: missing binding for ${String(slot.slotKey)}`);
    }
    const component = yield localComponentByKey(key);
    return component.createInstance();
  });
  const editableTextNodes = (node) => {
    if (node.type === "TEXT") return [node];
    if ("findAllWithCriteria" in node) return node.findAllWithCriteria({ types: ["TEXT"] });
    return [];
  };
  const applySlotContent = (node, semanticRole, content) => __async(null, null, function* () {
    const text = typeof (content == null ? void 0 : content.text) === "string" ? content.text.trim() : "";
    if (!text) return false;
    const candidates = editableTextNodes(node);
    const ranked = [...candidates].sort((left, right) => {
      const score = (item) => {
        const name = item.name.toLowerCase();
        if (semanticRole === "app-header" && (name.includes("title") || name.includes("header"))) return 4;
        if (semanticRole.includes("button") && (name.includes("label") || name.includes("text"))) return 3;
        if (semanticRole.includes("input") && (name.includes("placeholder") || name.includes("text"))) return 3;
        if ((semanticRole === "list-item" || semanticRole === "menu-card" || semanticRole === "order-summary" || semanticRole === "payment-method") && name.includes("title")) return 4;
        if ((semanticRole.includes("message") || semanticRole === "pickup-code") && (name.includes("title") || name.includes("message") || name.includes("text"))) return 3;
        return item.visible ? 1 : 0;
      };
      return score(right) - score(left);
    });
    for (const target of ranked) {
      try {
        const fontName = target.fontName;
        if (!fontName || typeof fontName !== "object" || !("family" in fontName) || !("style" in fontName)) continue;
        yield figma.loadFontAsync(fontName);
        target.characters = text;
        return true;
      } catch (e) {
      }
    }
    return false;
  });
  const stretchSlot = (node, semanticRole) => {
    if (!("layoutAlign" in node)) return;
    if (semanticRole === "app-header" || semanticRole.includes("button") || semanticRole.includes("input") || semanticRole === "list-item" || semanticRole === "menu-card" || semanticRole === "order-summary" || semanticRole.includes("message")) {
      node.layoutAlign = "STRETCH";
    }
  };
  const flattenEdges = (screens) => screens.flatMap((screen) => Array.isArray(screen.prototypeEdges) ? screen.prototypeEdges : []);
  const solid = (r, g, b) => ({
    type: "SOLID",
    color: { r: r / 255, g: g / 255, b: b / 255 }
  });
  const readableLabel = (slotKey) => String(slotKey != null ? slotKey : "Component").replace(/^\d+-/, "").split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  const appendText = (parent, characters, fontSize, color, style = "Regular") => __async(null, null, function* () {
    try {
      yield figma.loadFontAsync({ family: "Inter", style });
    } catch (e) {
      style = "Regular";
      yield figma.loadFontAsync({ family: "Inter", style });
    }
    const text = figma.createText();
    text.fontName = { family: "Inter", style };
    text.fontSize = fontSize;
    text.characters = characters;
    text.fills = [color];
    if ("layoutAlign" in text) text.layoutAlign = "STRETCH";
    text.textAutoResize = "HEIGHT";
    parent.appendChild(text);
    return text;
  });
  const paletteFor = (name) => {
    const base = {
      canvas: solid(245, 247, 249),
      surface: solid(255, 255, 255),
      text: solid(24, 34, 41),
      muted: solid(93, 108, 116),
      border: solid(218, 225, 229),
      warningSoft: solid(255, 247, 224)
    };
    if (name === "trust-green") {
      return __spreadProps(__spreadValues({}, base), {
        primary: solid(0, 133, 98),
        primarySoft: solid(229, 247, 241),
        success: solid(0, 133, 98),
        successSoft: solid(226, 248, 239),
        accentSoft: solid(232, 242, 255)
      });
    }
    if (name === "signal-violet") {
      return __spreadProps(__spreadValues({}, base), {
        primary: solid(106, 70, 184),
        primarySoft: solid(242, 237, 252),
        success: solid(0, 133, 98),
        successSoft: solid(226, 248, 239),
        accentSoft: solid(237, 242, 255)
      });
    }
    if (name === "warm-coral") {
      return __spreadProps(__spreadValues({}, base), {
        primary: solid(223, 91, 65),
        primarySoft: solid(255, 238, 233),
        success: solid(0, 133, 98),
        successSoft: solid(226, 248, 239),
        accentSoft: solid(255, 245, 218)
      });
    }
    return __spreadProps(__spreadValues({}, base), {
      primary: solid(0, 104, 225),
      primarySoft: solid(232, 242, 255),
      success: solid(0, 133, 98),
      successSoft: solid(226, 248, 239),
      accentSoft: solid(239, 235, 255)
    });
  };
  const createStack = (parent, name, width, fill, padding, gap, radius = 0) => {
    const frame = figma.createFrame();
    frame.name = name;
    frame.resize(width, 100);
    frame.layoutMode = "VERTICAL";
    frame.primaryAxisSizingMode = "AUTO";
    frame.counterAxisSizingMode = "FIXED";
    frame.itemSpacing = gap;
    frame.paddingTop = padding;
    frame.paddingRight = padding;
    frame.paddingBottom = padding;
    frame.paddingLeft = padding;
    frame.fills = [fill];
    frame.cornerRadius = radius;
    frame.clipsContent = false;
    parent.appendChild(frame);
    return frame;
  };
  const toneFill = (tone, palette) => {
    if (tone === "success") return palette.successSoft;
    if (tone === "warning") return palette.warningSoft;
    if (tone === "accent") return palette.accentSoft;
    if (tone === "brand") return palette.primarySoft;
    return palette.surface;
  };
  const appendPresentationSection = (parent, section, palette) => __async(null, null, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const kind = String((_a = section.kind) != null ? _a : "info");
    const prominent = kind === "status" || kind === "confirmation" || kind === "progress";
    const card = createStack(
      parent,
      `Section · ${String(section.key)}`,
      358,
      toneFill(section.tone, palette),
      prominent ? 18 : 16,
      prominent ? 10 : 8,
      kind === "info" ? 8 : 14
    );
    card.strokes = kind === "info" ? [] : [palette.border];
    card.strokeWeight = kind === "info" ? 0 : 1;
    writeMetadata(card, {
      kind: "presentation_section",
      sectionKey: String(section.key),
      sectionKind: kind
    });
    yield appendText(card, String((_b = section.title) != null ? _b : ""), prominent ? 20 : 15, palette.text, "Medium");
    if (typeof section.body === "string" && section.body.trim()) {
      yield appendText(card, section.body, 12, palette.muted);
    }
    const items = Array.isArray(section.items) ? section.items : [];
    if (kind === "progress") {
      const track = figma.createFrame();
      track.name = "Progress track";
      track.resize(322, 8);
      track.fills = [palette.surface];
      track.cornerRadius = 4;
      card.appendChild(track);
      const fill = figma.createFrame();
      fill.name = "Progress · 72%";
      fill.resize(232, 8);
      fill.fills = [palette.primary];
      fill.cornerRadius = 4;
      track.appendChild(fill);
    }
    if (kind === "metric_grid" || kind === "confirmation") {
      const grid = figma.createFrame();
      grid.name = "Metric grid";
      grid.resize(322, 64);
      grid.layoutMode = "HORIZONTAL";
      grid.primaryAxisSizingMode = "FIXED";
      grid.counterAxisSizingMode = "AUTO";
      grid.itemSpacing = 12;
      grid.fills = [];
      card.appendChild(grid);
      for (const item of items) {
        const metric = createStack(grid, `Metric · ${String(item.label)}`, 155, toneFill(section.tone, palette), 4, 3);
        yield appendText(metric, String((_c = item.label) != null ? _c : ""), 10, palette.muted, "Medium");
        yield appendText(metric, String((_d = item.value) != null ? _d : ""), 15, palette.text, "Medium");
      }
      return card;
    }
    for (const [index, item] of items.entries()) {
      const row = figma.createFrame();
      row.name = `${kind === "timeline" ? "Timeline" : kind === "choice_list" ? "Choice" : "Data"} row · ${String(item.label)}`;
      row.resize(326, kind === "choice_list" ? 42 : 28);
      row.layoutMode = "HORIZONTAL";
      row.primaryAxisSizingMode = "FIXED";
      row.counterAxisSizingMode = "AUTO";
      row.primaryAxisAlignItems = "SPACE_BETWEEN";
      row.counterAxisAlignItems = "CENTER";
      row.paddingTop = kind === "choice_list" ? 8 : 2;
      row.paddingBottom = kind === "choice_list" ? 8 : 2;
      row.paddingLeft = kind === "choice_list" ? 10 : 0;
      row.paddingRight = kind === "choice_list" ? 10 : 0;
      row.cornerRadius = 8;
      row.fills = kind === "choice_list" ? [palette.surface] : [];
      card.appendChild(row);
      const label = kind === "timeline" ? `${index === 0 ? "●" : "○"}  ${String((_e = item.label) != null ? _e : "")}` : kind === "choice_list" ? `${index === 0 ? "●" : "○"}  ${String((_f = item.label) != null ? _f : "")}` : String((_g = item.label) != null ? _g : "");
      const labelNode = yield appendText(row, label, 12, kind === "timeline" ? palette.primary : palette.muted);
      labelNode.layoutAlign = "INHERIT";
      labelNode.textAutoResize = "WIDTH_AND_HEIGHT";
      const value = yield appendText(row, String((_h = item.value) != null ? _h : ""), 12, palette.text, "Medium");
      value.layoutAlign = "INHERIT";
      value.textAutoResize = "WIDTH_AND_HEIGHT";
    }
    return card;
  });
  const appendDesignBrief = (root, direction, screens, palette) => __async(null, null, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    const brief = createStack(root, "Design direction", 360, palette.surface, 24, 18, 20);
    brief.x = 0;
    brief.y = 80;
    brief.strokes = [palette.border];
    brief.strokeWeight = 1;
    const accent = figma.createFrame();
    accent.name = "Concept accent";
    accent.resize(48, 5);
    accent.cornerRadius = 3;
    accent.fills = [palette.primary];
    brief.appendChild(accent);
    yield appendText(brief, "DESIGN DIRECTION", 11, palette.primary, "Medium");
    yield appendText(brief, String((_a = direction.conceptName) != null ? _a : "Product concept"), 30, palette.text, "Medium");
    yield appendText(brief, String((_b = direction.productPromise) != null ? _b : ""), 14, palette.muted);
    writeMetadata(brief, {
      kind: "design_brief",
      conceptName: String((_c = direction.conceptName) != null ? _c : "")
    });
    const meta = createStack(brief, "Design attributes", 312, palette.primarySoft, 14, 8, 12);
    yield appendText(meta, `${String((_d = direction.tone) != null ? _d : "focused").toUpperCase()}  ·  ${String((_e = direction.density) != null ? _e : "comfortable").toUpperCase()}`, 11, palette.primary, "Medium");
    for (const principle of Array.isArray(direction.principles) ? direction.principles : []) {
      const principleCard = createStack(brief, `Principle · ${String(principle.title)}`, 312, palette.canvas, 14, 6, 10);
      yield appendText(principleCard, String((_f = principle.title) != null ? _f : ""), 14, palette.text, "Medium");
      yield appendText(principleCard, String((_g = principle.detail) != null ? _g : ""), 11, palette.muted);
    }
    yield appendText(brief, `${screens.length} PRODUCT SCREENS`, 11, palette.primary, "Medium");
    yield appendText(brief, screens.map((screen, index) => `${index + 1}. ${String(screen.name)}`).join("\n"), 12, palette.text);
    return brief;
  });
  const styleScreen = (frame, palette) => {
    frame.fills = [palette.canvas];
    frame.strokes = [solid(210, 220, 225)];
    frame.strokeWeight = 1;
    frame.cornerRadius = 28;
    frame.clipsContent = true;
  };
  const navigationCopy = (direction, presentation) => {
    var _a, _b;
    const active = String((_a = presentation.navigationLabel) != null ? _a : "Hiện tại");
    switch (String((_b = direction.palette) != null ? _b : "")) {
      case "trust-green":
        return `${active}      Lịch backup      Nhật ký`;
      case "warm-coral":
        return `${active}      Đơn nhóm      Cá nhân`;
      default:
        return `${active}      Hoạt động      Cá nhân`;
    }
  };
  const setNavigationReactions = (node, destinations) => __async(null, null, function* () {
    const reactions = destinations.map(({ frame }) => ({
      trigger: { type: "ON_CLICK" },
      actions: [{
        type: "NODE",
        destinationId: frame.id,
        navigation: "NAVIGATE",
        transition: { type: "SMART_ANIMATE", duration: 0.24, easing: { type: "EASE_OUT" } },
        resetScrollPosition: true
      }]
    }));
    const prototypeNode = node;
    if (typeof prototypeNode.setReactionsAsync === "function") {
      yield prototypeNode.setReactionsAsync(reactions);
    } else if ("reactions" in prototypeNode) {
      prototypeNode.reactions = reactions;
    } else {
      throw new Error(`PROTOTYPE_UNAVAILABLE: ${node.id} does not support reactions`);
    }
    writeMetadata(node, __spreadProps(__spreadValues({}, readMetadata(node)), {
      prototypeEdges: destinations.map(({ edge }) => edge)
    }));
  });
  const createFallbackSlot = (slot) => __async(null, null, function* () {
    var _a;
    const fallback = figma.createFrame();
    const key = String((_a = slot.slotKey) != null ? _a : "");
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
    fallback.fills = [isPrimary ? solid(0, 104, 225) : isStatus ? solid(230, 248, 240) : isHeader ? solid(232, 242, 255) : solid(248, 250, 251)];
    yield appendText(
      fallback,
      readableLabel(key),
      isPrimary ? 14 : 13,
      isPrimary ? solid(255, 255, 255) : isStatus ? solid(18, 112, 78) : solid(35, 49, 56)
    );
    return fallback;
  });
  const paintFromHex = (value, fallback) => {
    if (typeof value !== "string") return fallback != null ? fallback : null;
    const match = value.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!match) return fallback != null ? fallback : null;
    return solid(
      Number.parseInt(match[1], 16),
      Number.parseInt(match[2], 16),
      Number.parseInt(match[3], 16)
    );
  };
  const creativeFontStyle = (value) => {
    if (value === "medium") return "Medium";
    if (value === "semibold") return "Semi Bold";
    if (value === "bold") return "Bold";
    return "Regular";
  };
  const applyCreativeFrameStyle = (node, element) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    node.resize(Number(element.width), Number(element.height));
    const layout = String((_a = element.layout) != null ? _a : "none");
    node.layoutMode = layout === "vertical" ? "VERTICAL" : layout === "horizontal" ? "HORIZONTAL" : "NONE";
    node.primaryAxisSizingMode = "FIXED";
    node.counterAxisSizingMode = "FIXED";
    node.itemSpacing = Number((_b = element.gap) != null ? _b : 0);
    node.paddingTop = Number((_c = element.paddingTop) != null ? _c : 0);
    node.paddingRight = Number((_d = element.paddingRight) != null ? _d : 0);
    node.paddingBottom = Number((_e = element.paddingBottom) != null ? _e : 0);
    node.paddingLeft = Number((_f = element.paddingLeft) != null ? _f : 0);
    node.cornerRadius = Number((_g = element.radius) != null ? _g : 0);
    node.opacity = Number((_h = element.opacity) != null ? _h : 1);
    node.clipsContent = true;
    const fill = paintFromHex(element.fill);
    node.fills = fill ? [fill] : [];
    const stroke = paintFromHex(element.stroke);
    node.strokes = stroke ? [stroke] : [];
    node.strokeWeight = stroke ? Number((_i = element.strokeWidth) != null ? _i : 1) : 0;
  };
  const placeCreativeNode = (node, element, parent) => {
    var _a, _b, _c;
    parent.appendChild(node);
    if ("layoutMode" in parent && parent.layoutMode === "NONE") {
      node.x = Number((_a = element.x) != null ? _a : 0);
      node.y = Number((_b = element.y) != null ? _b : 0);
    }
    if ("layoutGrow" in node) node.layoutGrow = Number((_c = element.layoutGrow) != null ? _c : 0);
  };
  const createCreativePrimitive = (element) => __async(null, null, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const kind = String(element.kind);
    if (kind === "text") {
      let style = creativeFontStyle(element.fontWeight);
      try {
        yield figma.loadFontAsync({ family: "Inter", style });
      } catch (e) {
        style = "Regular";
        yield figma.loadFontAsync({ family: "Inter", style: "Regular" });
      }
      const node2 = figma.createText();
      node2.name = String(element.name);
      node2.fontName = { family: "Inter", style };
      node2.fontSize = Number((_a = element.fontSize) != null ? _a : 14);
      node2.characters = String((_b = element.text) != null ? _b : "");
      node2.textAlignHorizontal = element.textAlign === "center" ? "CENTER" : element.textAlign === "right" ? "RIGHT" : "LEFT";
      node2.textAutoResize = "NONE";
      node2.resize(Number(element.width), Number(element.height));
      node2.opacity = Number((_c = element.opacity) != null ? _c : 1);
      const fill2 = paintFromHex(element.fill, solid(24, 34, 41));
      node2.fills = fill2 ? [fill2] : [];
      return node2;
    }
    if (kind === "ellipse") {
      const node2 = figma.createEllipse();
      node2.name = String(element.name);
      node2.resize(Number(element.width), Number(element.height));
      node2.opacity = Number((_d = element.opacity) != null ? _d : 1);
      const fill2 = paintFromHex(element.fill);
      node2.fills = fill2 ? [fill2] : [];
      const stroke2 = paintFromHex(element.stroke);
      node2.strokes = stroke2 ? [stroke2] : [];
      node2.strokeWeight = stroke2 ? Number((_e = element.strokeWidth) != null ? _e : 1) : 0;
      return node2;
    }
    const node = figma.createRectangle();
    node.name = String(element.name);
    node.resize(Number(element.width), Number(element.height));
    node.cornerRadius = kind === "divider" ? 0 : Number((_f = element.radius) != null ? _f : 0);
    node.opacity = Number((_g = element.opacity) != null ? _g : 1);
    const fill = paintFromHex(element.fill, kind === "divider" ? solid(218, 225, 229) : void 0);
    node.fills = fill ? [fill] : [];
    const stroke = paintFromHex(element.stroke);
    node.strokes = stroke ? [stroke] : [];
    node.strokeWeight = stroke ? Number((_h = element.strokeWidth) != null ? _h : 1) : 0;
    return node;
  });
  const renderCreativeBlueprint = (input) => __async(null, null, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const blueprint = input.source.creativeBlueprint;
    const creativeScreens = Array.isArray(blueprint.screens) ? blueprint.screens : [];
    const recipeById = new Map(input.source.screens.map((screen) => [String(screen.screenId), screen]));
    const screenFrames = /* @__PURE__ */ new Map();
    const elementNodes = /* @__PURE__ */ new Map();
    const direction = (_a = input.source.designDirection) != null ? _a : {};
    const palette = paletteFor(direction.palette);
    yield appendDesignBrief(input.root, __spreadProps(__spreadValues({}, direction), {
      conceptName: blueprint.conceptName,
      productPromise: blueprint.productPromise,
      principles: Array.isArray(blueprint.principles) ? blueprint.principles.map((principle) => ({ title: String(principle), detail: "" })) : []
    }), creativeScreens, palette);
    let cursorX = 440;
    let maxHeight = 0;
    const totalElements = Math.max(1, creativeScreens.reduce((total, screen) => {
      const elements = Array.isArray(screen.elements) ? screen.elements : [];
      return total + elements.length;
    }, 0));
    let completedElements = 0;
    for (const [screenIndex, creativeScreen] of creativeScreens.entries()) {
      const screenId = String(creativeScreen.screenId);
      const recipe = recipeById.get(screenId);
      if (!recipe) throw new Error(`CREATIVE_SCREEN_UNKNOWN: ${screenId}`);
      const frame = figma.createFrame();
      frame.name = `${screenId} · ${String(creativeScreen.name)}`;
      frame.resize(Number(creativeScreen.width), Number(creativeScreen.height));
      frame.x = cursorX;
      frame.y = 80;
      frame.layoutMode = "NONE";
      frame.fills = [paintFromHex(creativeScreen.background, palette.canvas)];
      frame.strokes = [palette.border];
      frame.strokeWeight = 1;
      frame.cornerRadius = 28;
      frame.clipsContent = true;
      input.root.appendChild(frame);
      screenFrames.set(screenId, frame);
      cursorX += Number(creativeScreen.width) + 56;
      maxHeight = Math.max(maxHeight, Number(creativeScreen.height));
      writeMetadata(frame, __spreadProps(__spreadValues({}, input.metadata), {
        kind: "screen",
        screenId,
        archetype: (_c = (_b = recipe.presentation) == null ? void 0 : _b.archetype) != null ? _c : "browse",
        requirementIds: creativeScreen.requirementIds,
        planHash: input.planHash,
        creative: true,
        presentationNote: creativeScreen.presentationNote
      }));
      const elements = Array.isArray(creativeScreen.elements) ? creativeScreen.elements : [];
      const rootAlias = elements.find(
        (element) => element.kind === "frame" && element.parentId == null && Number(element.width) === Number(creativeScreen.width) && Number(element.height) === Number(creativeScreen.height)
      );
      if (rootAlias) {
        applyCreativeFrameStyle(frame, rootAlias);
        frame.name = `${screenId} · ${String(creativeScreen.name)}`;
        writeMetadata(frame, __spreadProps(__spreadValues({}, readMetadata(frame)), {
          creativeElementId: rootAlias.id,
          creativeElementKind: rootAlias.kind
        }));
        elementNodes.set(String(rootAlias.id), frame);
        completedElements += 1;
      }
      for (const element of elements) {
        if (rootAlias && element.id === rootAlias.id) continue;
        const parent = element.parentId ? elementNodes.get(String(element.parentId)) : frame;
        if (!parent || !("appendChild" in parent)) {
          throw new Error(`CREATIVE_PARENT_MISSING: ${String(element.id)} -> ${String(element.parentId)}`);
        }
        let node;
        if (element.kind === "frame") {
          const created = figma.createFrame();
          created.name = String(element.name);
          applyCreativeFrameStyle(created, element);
          node = created;
        } else if (element.kind === "component") {
          const elementProgress2 = 18 + Math.round(completedElements / totalElements * 66);
          postProgress(input.requestId, elementProgress2, `Binding ZDS control: ${String(element.name)}`);
          const slot = input.resolvedSlots.find(
            (candidate) => candidate.screenId === screenId && candidate.slotKey === element.id
          );
          if (!slot || slot.resolution !== "component") {
            throw new Error(`STRICT_PLAN_VIOLATION: unresolved creative component ${String(element.id)}`);
          }
          node = yield createBoundInstance(slot, input.sourcePage);
          node.name = `${String(element.id)} · ${String(element.name)}`;
          yield applySlotContent(node, String((_d = slot.semanticRole) != null ? _d : ""), { text: element.componentText });
          try {
            node.resize(Number(element.width), Number(element.height));
          } catch (e) {
          }
          writeMetadata(node, __spreadProps(__spreadValues({}, input.metadata), {
            kind: "slot",
            screenId,
            requirementIds: creativeScreen.requirementIds,
            slotKey: element.id,
            componentKey: (_e = slot.componentKey) != null ? _e : null,
            componentBinding: (_f = slot.componentBinding) != null ? _f : null,
            semanticRole: (_g = slot.semanticRole) != null ? _g : null,
            primitiveFallback: false,
            planHash: input.planHash
          }));
        } else {
          node = yield createCreativePrimitive(element);
        }
        if ("opacity" in node) node.opacity = Number((_h = element.opacity) != null ? _h : 1);
        placeCreativeNode(node, element, parent);
        writeMetadata(node, __spreadProps(__spreadValues({}, readMetadata(node)), {
          creativeElementId: element.id,
          creativeElementKind: element.kind
        }));
        elementNodes.set(String(element.id), node);
        completedElements += 1;
        const elementProgress = 18 + Math.round(completedElements / totalElements * 66);
        postProgress(input.requestId, elementProgress, `Composed ${completedElements}/${totalElements}: ${String(element.name)}`);
        yield yieldToFigma();
      }
      const progress = 18 + Math.round((screenIndex + 1) / creativeScreens.length * 66);
      postProgress(input.requestId, progress, `Composed ${screenIndex + 1}/${creativeScreens.length}: ${String(creativeScreen.name)}`);
      yield yieldToFigma();
    }
    const edges = Array.isArray(blueprint.prototypeEdges) ? blueprint.prototypeEdges : [];
    postProgress(input.requestId, 88, "Connecting creative prototype interactions");
    for (const edge of edges) {
      const sourceNode = elementNodes.get(String(edge.fromElementId));
      const destination = screenFrames.get(String(edge.toScreenId));
      if (!sourceNode || !destination) throw new Error(`CREATIVE_EDGE_INVALID: ${String(edge.key)}`);
      yield setNavigationReactions(sourceNode, [{ edge: {
        key: edge.key,
        fromScreenId: edge.fromScreenId,
        toScreenId: edge.toScreenId,
        trigger: edge.trigger,
        action: edge.action
      }, frame: destination }]);
    }
    return { width: Math.max(900, cursorX + 24), height: Math.max(1020, maxHeight + 180), edges };
  });
  const focusArtifact = (node) => {
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
  };
  const artifactPageName = (metadata) => {
    var _a, _b;
    if (typeof metadata.artifactPageName === "string" && metadata.artifactPageName.trim()) {
      return metadata.artifactPageName.trim().slice(0, 80);
    }
    const spec = String((_a = metadata.specId) != null ? _a : "Product").trim() || "Product";
    return `PM · ${spec.slice(0, 48)} · v${String((_b = metadata.specVersion) != null ? _b : "1")}`;
  };
  const containsLifecycleScreen = (node) => {
    var _a;
    if (((_a = readMetadata(node)) == null ? void 0 : _a.kind) === "screen") return true;
    if (!("children" in node)) return false;
    return node.children.some((child) => containsLifecycleScreen(child));
  };
  const renderedLifecycleScreenIds = (root) => {
    if (!("children" in root)) return [];
    return root.children.flatMap((node) => {
      const metadata = readMetadata(node);
      return (metadata == null ? void 0 : metadata.kind) === "screen" && typeof metadata.screenId === "string" ? [metadata.screenId] : [];
    });
  };
  const hasExpectedLifecycleScreens = (root, screens) => {
    const expected = screens.map((screen) => String(screen.screenId)).sort();
    const rendered = renderedLifecycleScreenIds(root).sort();
    return expected.length === rendered.length && expected.every((screenId, index) => rendered[index] === screenId);
  };
  const recoverableArtifactPage = (metadata) => __async(null, null, function* () {
    if (metadata.pageStrategy !== "create_or_recover_incomplete") return null;
    const expectedName = artifactPageName(metadata);
    for (const page of figma.root.children) {
      if (page.name !== expectedName) continue;
      if (page.id !== figma.currentPage.id) {
        try {
          yield page.loadAsync();
        } catch (e) {
          continue;
        }
      }
      const roots = page.children.filter((node) => {
        const stored = readMetadata(node);
        return (stored == null ? void 0 : stored.namespace) === "za.pm-lifecycle/v1" && stored.kind === "artifact_root" && stored.specId === metadata.specId && stored.specVersion === metadata.specVersion;
      });
      if (roots.length !== 1) continue;
      const rootMetadata = readMetadata(roots[0]);
      const isInterrupted = (rootMetadata == null ? void 0 : rootMetadata.applyStatus) === "in_progress";
      if (isInterrupted || !containsLifecycleScreen(roots[0])) return { page, root: roots[0] };
    }
    return null;
  });
  const applyArtifact = (params, requestId) => __async(null, null, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
    const resolvedPlan = params.preflightPlan;
    const source = resolvedPlan == null ? void 0 : resolvedPlan.source;
    const planHash = typeof params.planHash === "string" ? params.planHash : "";
    const metadata = source == null ? void 0 : source.metadata;
    const screens = Array.isArray(source == null ? void 0 : source.screens) ? source.screens : [];
    const resolvedSlots = Array.isArray(resolvedPlan == null ? void 0 : resolvedPlan.resolvedSlots) ? resolvedPlan.resolvedSlots : [];
    if (!resolvedPlan || !source || !metadata || screens.length === 0 || !planHash) {
      throw new Error("preflightPlan, planHash, metadata and screens are required");
    }
    const sourcePage = yield requireSourcePage(params.targetPageId);
    const idempotencyKey = String((_a = metadata.idempotencyKey) != null ? _a : "");
    if (!idempotencyKey) throw new Error("lifecycle idempotencyKey is required");
    postProgress(requestId, 3, "Checking existing lifecycle artifact");
    const existing = yield findArtifactRoot(idempotencyKey);
    let staleExistingPage = null;
    if (existing) {
      const existingMetadata = readMetadata(existing.root);
      if (hasExpectedLifecycleScreens(existing.root, screens)) {
        if (existingMetadata.planHash !== planHash) {
          throw new Error(`IDEMPOTENCY_CONFLICT: ${idempotencyKey} already exists with another plan hash`);
        }
        if (existing.page.id === figma.currentPage.id) focusArtifact(existing.root);
        postProgress(requestId, 100, "Existing lifecycle artifact is ready");
        return {
          schemaVersion: 1,
          rootNodeIds: [existing.root.id],
          artifactPageId: existing.page.id,
          artifactPageName: existing.page.name,
          idempotent: true
        };
      }
      postProgress(requestId, 5, "Interrupted lifecycle artifact found; rebuilding it");
      if (existing.page.id !== sourcePage.id) staleExistingPage = existing.page;
      existing.root.remove();
    }
    postProgress(requestId, 8, "Preparing a dedicated Figma page");
    const recoverable = staleExistingPage ? null : yield recoverableArtifactPage(metadata);
    const outputPage = (_b = staleExistingPage != null ? staleExistingPage : recoverable == null ? void 0 : recoverable.page) != null ? _b : figma.createPage();
    const reusedOutputPage = Boolean(staleExistingPage || recoverable);
    if (recoverable) recoverable.root.remove();
    outputPage.name = artifactPageName(metadata);
    const root = figma.createSection();
    root.name = `PM Lifecycle · ${String((_c = metadata.specId) != null ? _c : "Artifact")} · v${String((_d = metadata.specVersion) != null ? _d : "")}`;
    root.x = 0;
    root.y = 0;
    outputPage.appendChild(root);
    writeMetadata(root, __spreadProps(__spreadValues({}, metadata), {
      kind: "artifact_root",
      planHash,
      targetHash: (_e = source.target) == null ? void 0 : _e.targetHash,
      designConceptName: (_f = source.designDirection) == null ? void 0 : _f.conceptName,
      sourcePageId: sourcePage.id,
      artifactPageId: outputPage.id,
      artifactPageName: outputPage.name,
      applyStatus: "in_progress",
      expectedScreenIds: screens.map((screen) => String(screen.screenId)),
      expectedScreenCount: screens.length
    }));
    try {
      const direction = (_g = source.designDirection) != null ? _g : {};
      const palette = paletteFor(direction.palette);
      const screenFrames = /* @__PURE__ */ new Map();
      const primaryActionNodes = /* @__PURE__ */ new Map();
      if (source.creativeBlueprint) {
        postProgress(requestId, 12, "Creative blueprint validated; composing product screens");
        const rendered = yield renderCreativeBlueprint({
          root,
          sourcePage,
          source,
          metadata,
          planHash,
          resolvedSlots,
          requestId
        });
        root.resizeWithoutConstraints(rendered.width, rendered.height);
        if (!hasExpectedLifecycleScreens(root, screens)) {
          throw new Error("ARTIFACT_INCOMPLETE: creative renderer did not produce every expected screen");
        }
        writeMetadata(root, __spreadProps(__spreadValues({}, readMetadata(root)), {
          prototypeEdges: rendered.edges,
          creative: true,
          applyStatus: "complete",
          renderedScreenCount: renderedLifecycleScreenIds(root).length
        }));
        figma.commitUndo();
        postProgress(requestId, 100, "Creative Figma artifact created");
        return {
          schemaVersion: 1,
          rootNodeIds: [root.id],
          artifactPageId: outputPage.id,
          artifactPageName: outputPage.name,
          idempotent: false
        };
      }
      yield appendDesignBrief(root, direction, screens, palette);
      postProgress(requestId, 15, "Design direction prepared");
      for (const [index, screen] of screens.entries()) {
        const presentation = (_h = screen.presentation) != null ? _h : {};
        const sections = Array.isArray(presentation.sections) ? presentation.sections : [];
        const frame = figma.createFrame();
        frame.name = `${String(screen.screenId)} · ${String(screen.name)}`;
        frame.resize(390, 844);
        frame.x = 440 + index * 430;
        frame.y = 80;
        frame.layoutMode = "VERTICAL";
        frame.primaryAxisSizingMode = "FIXED";
        frame.counterAxisSizingMode = "FIXED";
        frame.itemSpacing = 0;
        frame.paddingTop = 0;
        frame.paddingRight = 0;
        frame.paddingBottom = 0;
        frame.paddingLeft = 0;
        styleScreen(frame, palette);
        root.appendChild(frame);
        screenFrames.set(String(screen.screenId), frame);
        writeMetadata(frame, __spreadProps(__spreadValues({}, metadata), {
          kind: "screen",
          screenId: screen.screenId,
          archetype: presentation.archetype,
          sectionKeys: sections.map((section) => String(section.key)),
          requirementIds: screen.requirementIds,
          planHash
        }));
        const screenSlots = resolvedSlots.filter((slot) => slot.screenId === screen.screenId);
        const appendResolvedSlot = (slot, parent) => __async(null, null, function* () {
          var _a2, _b2, _c2;
          let node;
          if (slot.resolution === "component" && typeof slot.componentKey === "string") {
            node = yield createBoundInstance(slot, sourcePage);
          } else if (source.mode === "free" && slot.resolution === "primitive_fallback") {
            node = yield createFallbackSlot(slot);
          } else {
            throw new Error(`STRICT_PLAN_VIOLATION: unresolved slot ${String(slot.slotKey)}`);
          }
          const recipeSlot = Array.isArray(screen.slots) ? screen.slots.find((candidate) => candidate.key === slot.slotKey) : void 0;
          const semanticRole = typeof slot.semanticRole === "string" ? slot.semanticRole : "";
          yield applySlotContent(node, semanticRole, recipeSlot == null ? void 0 : recipeSlot.content);
          stretchSlot(node, semanticRole);
          node.name = `${String(slot.slotKey)} · ${node.name}`;
          parent.appendChild(node);
          writeMetadata(node, __spreadProps(__spreadValues({}, metadata), {
            kind: "slot",
            screenId: screen.screenId,
            requirementIds: screen.requirementIds,
            slotKey: slot.slotKey,
            componentKey: (_a2 = slot.componentKey) != null ? _a2 : null,
            componentBinding: (_b2 = slot.componentBinding) != null ? _b2 : null,
            semanticRole: (_c2 = slot.semanticRole) != null ? _c2 : null,
            primitiveFallback: slot.resolution === "primitive_fallback",
            planHash
          }));
          return node;
        });
        const headerSlots = screenSlots.filter((slot) => slot.semanticRole === "app-header");
        if (headerSlots.length > 0) {
          for (const slot of headerSlots) yield appendResolvedSlot(slot, frame);
        } else {
          const customHeader = createStack(frame, "Product header", 390, palette.surface, 16, 4);
          yield appendText(customHeader, String((_i = screen.name) != null ? _i : screen.screenId), 16, palette.text, "Medium");
        }
        const content = createStack(frame, "Product content", 390, palette.canvas, 16, 14);
        content.layoutAlign = "STRETCH";
        content.layoutGrow = 1;
        content.primaryAxisSizingMode = "FIXED";
        content.clipsContent = true;
        content.overflowDirection = "VERTICAL";
        const hero = createStack(content, "Screen hierarchy", 358, palette.canvas, 0, 8);
        const eyebrow = yield appendText(hero, String((_j = presentation.eyebrow) != null ? _j : "PRODUCT FLOW"), 11, palette.primary, "Medium");
        eyebrow.name = "Eyebrow";
        const headline = yield appendText(hero, String((_k = presentation.headline) != null ? _k : screen.name), 26, palette.text, "Medium");
        headline.name = "Product headline";
        const supporting = yield appendText(hero, String((_m = (_l = presentation.supportingText) != null ? _l : screen.purpose) != null ? _m : ""), 13, palette.muted);
        supporting.name = "Supporting copy";
        for (const section of sections) yield appendPresentationSection(content, section, palette);
        const controlSlots = screenSlots.filter((slot) => {
          var _a2;
          const role = String((_a2 = slot.semanticRole) != null ? _a2 : "");
          return role !== "app-header" && !role.includes("button");
        });
        if (controlSlots.length > 0) {
          const controls = createStack(content, "Design System controls", 358, palette.surface, 12, 10, 14);
          controls.strokes = [palette.border];
          controls.strokeWeight = 1;
          for (const slot of controlSlots) yield appendResolvedSlot(slot, controls);
        }
        const actionSlots = screenSlots.filter((slot) => {
          var _a2;
          return String((_a2 = slot.semanticRole) != null ? _a2 : "").includes("button");
        });
        if (actionSlots.length > 0) {
          const actions = createStack(frame, "Sticky actions", 390, palette.surface, 16, 10);
          actions.layoutAlign = "STRETCH";
          for (const [actionIndex, slot] of actionSlots.entries()) {
            const actionNode = yield appendResolvedSlot(slot, actions);
            if (actionIndex === 0) primaryActionNodes.set(String(screen.screenId), actionNode);
          }
        }
        const navigation = createStack(frame, "Bottom navigation", 390, palette.surface, 10, 2);
        navigation.strokes = [palette.border];
        navigation.strokeTopWeight = 1;
        yield appendText(navigation, navigationCopy(direction, presentation), 11, palette.muted, "Medium");
        const progress = 15 + Math.round((index + 1) / screens.length * 70);
        postProgress(requestId, progress, `Rendered ${index + 1}/${screens.length}: ${String(screen.name)}`);
        yield yieldToFigma();
      }
      postProgress(requestId, 90, "Connecting prototype interactions");
      for (const screen of screens) {
        const fromScreenId = String(screen.screenId);
        const sourceNode = (_n = primaryActionNodes.get(fromScreenId)) != null ? _n : screenFrames.get(fromScreenId);
        const destinations = (Array.isArray(screen.prototypeEdges) ? screen.prototypeEdges : []).flatMap((edge) => {
          const frame = screenFrames.get(String(edge.toScreenId));
          return frame ? [{ edge, frame }] : [];
        });
        if (sourceNode && destinations.length > 0) yield setNavigationReactions(sourceNode, destinations);
      }
      root.resizeWithoutConstraints(Math.max(900, 460 + screens.length * 430), 1020);
      if (!hasExpectedLifecycleScreens(root, screens)) {
        throw new Error("ARTIFACT_INCOMPLETE: renderer did not produce every expected screen");
      }
      writeMetadata(root, __spreadProps(__spreadValues({}, readMetadata(root)), {
        prototypeEdges: flattenEdges(screens),
        applyStatus: "complete",
        renderedScreenCount: renderedLifecycleScreenIds(root).length
      }));
      figma.commitUndo();
      postProgress(requestId, 100, "Lifecycle artifact created");
      return {
        schemaVersion: 1,
        rootNodeIds: [root.id],
        artifactPageId: outputPage.id,
        artifactPageName: outputPage.name,
        idempotent: false
      };
    } catch (error) {
      root.remove();
      if (!reusedOutputPage) outputPage.remove();
      throw error;
    }
  });
  const readArtifact = (idempotencyKey, rootNodeId) => __async(null, null, function* () {
    var _a, _b, _c;
    let location = null;
    if (rootNodeId) {
      const root2 = yield getNodeByIdLocalFirst(rootNodeId);
      const pageId = root2 ? containingPageId(root2) : null;
      const page2 = pageId ? yield getNodeByIdLocalFirst(pageId) : null;
      const metadata = root2 ? readMetadata(root2) : null;
      if (root2 && (page2 == null ? void 0 : page2.type) === "PAGE" && (metadata == null ? void 0 : metadata.kind) === "artifact_root" && metadata.idempotencyKey === idempotencyKey) {
        location = { page: page2, root: root2 };
      }
    }
    if (!location) location = yield findArtifactRoot(idempotencyKey);
    if (!location) throw new Error(`ARTIFACT_NOT_FOUND: ${idempotencyKey}`);
    const { page, root } = location;
    const rootMetadata = readMetadata(root);
    const descendants = (node) => {
      if (!("children" in node)) return [];
      return node.children.flatMap((child) => [child, ...descendants(child)]);
    };
    const screens = "children" in root ? root.children.flatMap((node) => {
      var _a2;
      const metadata = readMetadata(node);
      if ((metadata == null ? void 0 : metadata.kind) !== "screen") return [];
      const childSlots = descendants(node).flatMap((child) => {
        const slot = readMetadata(child);
        return (slot == null ? void 0 : slot.kind) === "slot" ? [{
          slotKey: String(slot.slotKey),
          componentKey: typeof slot.componentKey === "string" ? slot.componentKey : null,
          componentBinding: slot.componentBinding && typeof slot.componentBinding === "object" ? slot.componentBinding : null,
          semanticRole: typeof slot.semanticRole === "string" ? slot.semanticRole : null,
          primitiveFallback: Boolean(slot.primitiveFallback),
          instanceBacked: child.type === "INSTANCE"
        }] : [];
      });
      const sectionKeys = descendants(node).flatMap((child) => {
        const section = readMetadata(child);
        return (section == null ? void 0 : section.kind) === "presentation_section" && typeof section.sectionKey === "string" ? [section.sectionKey] : [];
      });
      const creativeNodes = [node, ...descendants(node)].filter((child) => {
        const childMetadata = readMetadata(child);
        return typeof (childMetadata == null ? void 0 : childMetadata.creativeElementId) === "string";
      });
      return [{
        nodeId: node.id,
        screenId: String(metadata.screenId),
        name: node.name,
        archetype: String((_a2 = metadata.archetype) != null ? _a2 : ""),
        sectionKeys,
        componentKey: null,
        semanticRole: null,
        creativeMetrics: creativeNodes.length > 0 ? {
          elementCount: creativeNodes.length,
          instanceCount: creativeNodes.filter((child) => child.type === "INSTANCE").length,
          primitiveCount: creativeNodes.filter((child) => child.type !== "INSTANCE" && child.type !== "TEXT").length,
          textCount: creativeNodes.filter((child) => child.type === "TEXT").length
        } : void 0,
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
          planHash: metadata.planHash
        },
        childSlots
      }];
    }) : [];
    const expectedScreenIds = Array.isArray(rootMetadata.expectedScreenIds) ? rootMetadata.expectedScreenIds.map(String).sort() : [];
    const renderedScreenIds = screens.map((screen) => screen.screenId).sort();
    const screenSetMatches = expectedScreenIds.length === renderedScreenIds.length && expectedScreenIds.every((screenId, index) => renderedScreenIds[index] === screenId);
    if (rootMetadata.applyStatus === "in_progress" || expectedScreenIds.length > 0 && !screenSetMatches) {
      throw new Error(
        `ARTIFACT_INCOMPLETE: expected ${expectedScreenIds.length || rootMetadata.expectedScreenCount || "all"} screens, found ${screens.length}`
      );
    }
    const screenIdByNodeId = new Map(screens.map((screen) => [screen.nodeId, screen.screenId]));
    const prototypeEdges = "children" in root ? root.children.flatMap((screenNode) => [screenNode, ...descendants(screenNode)].flatMap((node) => {
      const metadata = readMetadata(node);
      const edges = Array.isArray(metadata == null ? void 0 : metadata.prototypeEdges) ? metadata.prototypeEdges : [];
      const reactions = "reactions" in node && Array.isArray(node.reactions) ? node.reactions : [];
      return edges.filter((edge) => reactions.some(
        (reaction) => reaction.actions.some(
          (action) => action.type === "NODE" && action.destinationId != null && screenIdByNodeId.get(action.destinationId) === edge.toScreenId
        )
      ));
    })) : [];
    const renderedDesignBrief = "children" in root ? root.children.find((node) => {
      var _a2;
      return ((_a2 = readMetadata(node)) == null ? void 0 : _a2.kind) === "design_brief";
    }) : void 0;
    const renderedDesignBriefMetadata = renderedDesignBrief ? readMetadata(renderedDesignBrief) : null;
    return {
      schemaVersion: 1,
      targetHash: String((_a = rootMetadata.targetHash) != null ? _a : ""),
      planHash: String(rootMetadata.planHash),
      idempotencyKey,
      rootNodeIds: [root.id],
      artifactPageId: page.id,
      artifactPageName: page.name,
      applyStatus: String((_b = rootMetadata.applyStatus) != null ? _b : "legacy"),
      designConceptName: String((_c = renderedDesignBriefMetadata == null ? void 0 : renderedDesignBriefMetadata.conceptName) != null ? _c : ""),
      screens,
      prototypeEdges,
      readAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  });
  const handleLifecycleArtifactRequest = (request) => __async(null, null, function* () {
    var _a;
    const params = (_a = request.params) != null ? _a : {};
    switch (request.type) {
      case "apply_lifecycle_artifact_plan":
        return { type: request.type, requestId: request.requestId, data: yield applyArtifact(params, request.requestId) };
      case "read_lifecycle_artifact": {
        yield requireSourcePage(params.targetPageId);
        const idempotencyKey = typeof params.idempotencyKey === "string" ? params.idempotencyKey : "";
        if (!idempotencyKey) throw new Error("idempotencyKey is required");
        const rootNodeId = typeof params.rootNodeId === "string" ? params.rootNodeId : void 0;
        return { type: request.type, requestId: request.requestId, data: yield readArtifact(idempotencyKey, rootNodeId) };
      }
      default:
        return null;
    }
  });
  const DEFAULT_PLACEHOLDERS = [
    "button",
    "long text button",
    "helper text",
    "weak",
    "slot",
    "lorem ipsum",
    "product moment",
    "product detail",
    "thông tin chính",
    "lựa chọn của người dùng",
    "trạng thái hiện tại",
    "có 3 level button cơ bản"
  ];
  const normalize = (value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
  const isVisible = (node, root) => {
    let current = node;
    while (current) {
      if ("visible" in current && current.visible === false) return false;
      if (current === root) break;
      current = current.parent;
    }
    return true;
  };
  const effectiveOpacity = (node, root) => {
    let current = node;
    let opacity = 1;
    while (current) {
      if ("opacity" in current && typeof current.opacity === "number") opacity *= current.opacity;
      if (current === root) break;
      current = current.parent;
    }
    return opacity;
  };
  const solidPaint = (value) => {
    if (!Array.isArray(value)) return null;
    const paint = value.find((candidate) => (candidate == null ? void 0 : candidate.type) === "SOLID" && candidate.visible !== false && candidate.color);
    if (!paint) return null;
    const { r, g, b } = paint.color;
    if (![r, g, b].every((channel) => typeof channel === "number" && Number.isFinite(channel))) return null;
    return {
      color: { r, g, b },
      opacity: typeof paint.opacity === "number" ? paint.opacity : 1
    };
  };
  const blend = (foreground, background, opacity) => ({
    r: foreground.r * opacity + background.r * (1 - opacity),
    g: foreground.g * opacity + background.g * (1 - opacity),
    b: foreground.b * opacity + background.b * (1 - opacity)
  });
  const luminance = (color) => {
    const channel = (value) => value <= 0.03928 ? value / 12.92 : __pow((value + 0.055) / 1.055, 2.4);
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
  };
  const contrastRatio = (first, second) => {
    const light = Math.max(luminance(first), luminance(second));
    const dark = Math.min(luminance(first), luminance(second));
    return (light + 0.05) / (dark + 0.05);
  };
  const coveringSiblingBackground = (node) => {
    const parent = node.parent;
    const nodeBounds = boundsOf(node);
    if (!parent || !nodeBounds || !Array.isArray(parent.children)) return null;
    const nodeIndex = parent.children.indexOf(node);
    const centerX = nodeBounds.x + nodeBounds.width / 2;
    const centerY = nodeBounds.y + nodeBounds.height / 2;
    for (let index = nodeIndex - 1; index >= 0; index -= 1) {
      const sibling = parent.children[index];
      if (!sibling || sibling.visible === false) continue;
      const siblingBounds = boundsOf(sibling);
      const paint = solidPaint(sibling.fills);
      if (siblingBounds && paint && centerX >= siblingBounds.x && centerX <= siblingBounds.x + siblingBounds.width && centerY >= siblingBounds.y && centerY <= siblingBounds.y + siblingBounds.height) {
        return blend(paint.color, { r: 1, g: 1, b: 1 }, paint.opacity);
      }
    }
    return null;
  };
  const nearestBackground = (node, root) => {
    const siblingBackground = coveringSiblingBackground(node);
    if (siblingBackground) return siblingBackground;
    let current = node.parent;
    while (current) {
      const paint = solidPaint(current.fills);
      if (paint) return blend(paint.color, { r: 1, g: 1, b: 1 }, paint.opacity);
      if (current === root) break;
      current = current.parent;
    }
    return { r: 1, g: 1, b: 1 };
  };
  const boundsOf = (node) => {
    const bounds = node.absoluteBoundingBox;
    if (!bounds) return null;
    const values = [bounds.x, bounds.y, bounds.width, bounds.height];
    return values.every((value) => typeof value === "number" && Number.isFinite(value)) ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null;
  };
  const inside = (child, parent, tolerance = 1) => child.x >= parent.x - tolerance && child.y >= parent.y - tolerance && child.x + child.width <= parent.x + parent.width + tolerance && child.y + child.height <= parent.y + parent.height + tolerance;
  const insideImmediateParent = (node, tolerance = 1) => {
    const parent = node.parent;
    const values = [node.x, node.y, node.width, node.height, parent == null ? void 0 : parent.width, parent == null ? void 0 : parent.height];
    if (!parent || !["FRAME", "COMPONENT", "INSTANCE", "GROUP"].includes(parent.type) || !values.every((value) => typeof value === "number" && Number.isFinite(value))) {
      return true;
    }
    return node.x >= -tolerance && node.y >= -tolerance && node.x + node.width <= parent.width + tolerance && node.y + node.height <= parent.height + tolerance;
  };
  const nearestScreen = (node, screens) => {
    let current = node.parent;
    while (current) {
      if (screens.includes(current)) return current;
      current = current.parent;
    }
    return null;
  };
  const hasInstanceAncestor = (node, root) => {
    let current = node.parent;
    while (current && current !== root) {
      if (current.type === "INSTANCE") return true;
      current = current.parent;
    }
    return false;
  };
  const directMobileScreens = (root) => {
    const children = "children" in root ? root.children : [];
    const direct = children.filter((node) => node.type === "FRAME" && node.width >= 320 && node.width <= 480 && node.height >= 600 && node.height <= 1e3);
    if (direct.length > 0) return direct;
    if (!("findAll" in root)) return [];
    return root.findAll((node) => node.type === "FRAME" && node.width >= 320 && node.width <= 480 && node.height >= 600 && node.height <= 1e3 && !hasInstanceAncestor(node, root));
  };
  const handleProductCraftAuditRequest = (request) => __async(null, null, function* () {
    if (request.type !== "audit_product_craft") return null;
    const params = request.params || {};
    const rootNodeId = String(params.rootNodeId || "");
    if (!rootNodeId) throw new Error("rootNodeId is required");
    const root = yield figma.getNodeByIdAsync(rootNodeId);
    if (!root || root.type === "DOCUMENT") throw new Error(`Node not found: ${rootNodeId}`);
    const expectedScreenCount = Number(params.expectedScreenCount || 0);
    const expectedPrototypeLinks = Number(params.expectedPrototypeLinks || 0);
    const forbiddenTerms = (Array.isArray(params.forbiddenTerms) ? params.forbiddenTerms : []).filter((item) => typeof item === "string" && item.trim().length > 0).map(normalize);
    const placeholderTerms = [
      ...DEFAULT_PLACEHOLDERS,
      ...Array.isArray(params.placeholderTerms) ? params.placeholderTerms : []
    ].filter((item) => typeof item === "string" && item.trim().length > 0).map(normalize);
    const screens = directMobileScreens(root);
    const issues = [];
    let visitedNodes = 0;
    let textCount = 0;
    let visibleTextCount = 0;
    let zdsInstanceCount = 0;
    let prototypeLinkCount = 0;
    const placeholderNodeIds = /* @__PURE__ */ new Set();
    const forbiddenNodeIds = /* @__PURE__ */ new Set();
    const clippedNodeIds = /* @__PURE__ */ new Set();
    const lowVisibilityNodeIds = /* @__PURE__ */ new Set();
    const visit = (node) => {
      var _a;
      visitedNodes += 1;
      const visible = isVisible(node, root);
      if (node.type === "INSTANCE" && !hasInstanceAncestor(node, root)) zdsInstanceCount += 1;
      if (visible && "reactions" in node && Array.isArray(node.reactions)) {
        for (const reaction of node.reactions) {
          const actions = Array.isArray(reaction == null ? void 0 : reaction.actions) ? reaction.actions : [];
          prototypeLinkCount += actions.filter((action) => (action == null ? void 0 : action.type) === "NODE" && action.destinationId).length;
        }
      }
      if (node.type === "TEXT") {
        textCount += 1;
        if (visible) {
          visibleTextCount += 1;
          const content = normalize(String(node.characters || ""));
          if (content) {
            const placeholder = placeholderTerms.find((term) => content === term || term.length >= 12 && content.includes(term));
            if (placeholder) {
              placeholderNodeIds.add(node.id);
              issues.push({
                code: "STALE_COMPONENT_COPY",
                severity: "error",
                nodeId: node.id,
                message: `Visible text still contains placeholder/default copy: "${String(node.characters).slice(0, 96)}".`
              });
            }
            const forbidden = forbiddenTerms.find((term) => content.includes(term));
            if (forbidden) {
              forbiddenNodeIds.add(node.id);
              issues.push({
                code: "FORBIDDEN_PRODUCT_COPY",
                severity: "error",
                nodeId: node.id,
                message: `Visible text mentions forbidden ProductSpec content: "${forbidden}".`
              });
            }
          }
          const opacity = effectiveOpacity(node, root);
          if (opacity < 0.45) {
            lowVisibilityNodeIds.add(node.id);
            issues.push({
              code: "LOW_VISIBILITY_TEXT",
              severity: "error",
              nodeId: node.id,
              message: `Visible text effective opacity is ${opacity.toFixed(2)}.`
            });
          }
          const foregroundPaint = solidPaint(node.fills);
          const directScreenText = screens.includes(node.parent);
          const paintedImmediateParent = solidPaint((_a = node.parent) == null ? void 0 : _a.fills) !== null;
          if (foregroundPaint && (hasInstanceAncestor(node, root) || directScreenText || paintedImmediateParent)) {
            const background = nearestBackground(node, root);
            const foreground = blend(
              foregroundPaint.color,
              background,
              foregroundPaint.opacity * Math.min(1, opacity)
            );
            const ratio = contrastRatio(foreground, background);
            const fontSize = typeof node.fontSize === "number" ? node.fontSize : 14;
            const requiredRatio = fontSize >= 18 ? 3 : 4.5;
            if (ratio < requiredRatio && !lowVisibilityNodeIds.has(node.id)) {
              lowVisibilityNodeIds.add(node.id);
              issues.push({
                code: "LOW_TEXT_CONTRAST",
                severity: "error",
                nodeId: node.id,
                message: `Visible text contrast is ${ratio.toFixed(2)}:1; expected at least ${requiredRatio}:1.`
              });
            }
          }
          const screen = nearestScreen(node, screens);
          const nodeBounds = boundsOf(node);
          const screenBounds = screen ? boundsOf(screen) : null;
          if (nodeBounds && screenBounds && !inside(nodeBounds, screenBounds)) {
            clippedNodeIds.add(node.id);
            issues.push({
              code: "TEXT_OUTSIDE_SCREEN",
              severity: "error",
              nodeId: node.id,
              message: `Text "${String(node.characters || "").slice(0, 72)}" extends outside ${screen.name}.`
            });
          } else if (!insideImmediateParent(node)) {
            clippedNodeIds.add(node.id);
            issues.push({
              code: "TEXT_OUTSIDE_PARENT",
              severity: "error",
              nodeId: node.id,
              message: `Text "${String(node.characters || "").slice(0, 72)}" extends outside its immediate container ${node.parent.name}.`
            });
          }
        }
      }
      if ("children" in node) {
        for (const child of node.children) visit(child);
      }
    };
    visit(root);
    if (expectedScreenCount > 0 && screens.length !== expectedScreenCount) {
      issues.push({
        code: "SCREEN_COUNT_MISMATCH",
        severity: "error",
        nodeId: root.id,
        message: `Found ${screens.length}/${expectedScreenCount} mobile screens.`
      });
    }
    if (prototypeLinkCount < expectedPrototypeLinks) {
      issues.push({
        code: "PROTOTYPE_LINKS_MISSING",
        severity: "error",
        nodeId: root.id,
        message: `Found ${prototypeLinkCount}/${expectedPrototypeLinks} prototype links.`
      });
    }
    if (zdsInstanceCount === 0) {
      issues.push({
        code: "NO_ZDS_INSTANCES",
        severity: "error",
        nodeId: root.id,
        message: "No top-level ZDS component instances were found in the artifact."
      });
    }
    return {
      type: request.type,
      requestId: request.requestId,
      data: {
        schemaVersion: 1,
        rootNodeId: root.id,
        passed: issues.every((issue) => issue.severity !== "error"),
        metrics: {
          screenCount: screens.length,
          textCount,
          visibleTextCount,
          zdsInstanceCount,
          prototypeLinkCount,
          staleCopyCount: placeholderNodeIds.size,
          forbiddenCopyCount: forbiddenNodeIds.size,
          clippedTextCount: clippedNodeIds.size,
          lowVisibilityTextCount: lowVisibilityNodeIds.size,
          visitedNodes
        },
        issues
      }
    };
  });
  const handleReadRequest = (request) => __async(null, null, function* () {
    var _a, _b, _c, _d;
    return (_d = (_c = (_b = (_a = yield handleReadDocumentRequest(request)) != null ? _a : yield handleReadStyleRequest(request)) != null ? _b : yield handleReadExportRequest(request)) != null ? _c : yield handleLifecycleArtifactRequest(request)) != null ? _d : yield handleProductCraftAuditRequest(request);
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
    "discover_design_system_instances",
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
    "export_frames_to_pdf",
    "read_lifecycle_artifact",
    "audit_product_craft"
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
    "navigate_to_page",
    "apply_lifecycle_artifact_plan",
    "apply_craft_patch"
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
  const SUPPORTED_OPERATIONS = /* @__PURE__ */ new Set([
    "create_frame",
    "create_rectangle",
    "create_ellipse",
    "create_text",
    "import_svg",
    "clone_node",
    "move_nodes",
    "resize_nodes",
    "set_text",
    "set_text_properties",
    "set_fills",
    "set_strokes",
    "set_corner_radius",
    "set_effects",
    "set_opacity",
    "set_visible",
    "set_auto_layout",
    "set_constraints",
    "reparent_nodes",
    "reorder_nodes",
    "set_reactions"
  ]);
  const CREATE_OPERATIONS = /* @__PURE__ */ new Set([
    "create_frame",
    "create_rectangle",
    "create_ellipse",
    "create_text",
    "import_svg"
  ]);
  const handlers = [
    handleWriteCreateRequest,
    handleWriteModifyRequest,
    handleWriteVectorRequest,
    handleWriteStyleRequest,
    handleWriteComponentRequest,
    handleWritePrototypeRequest
  ];
  const resolveAliases = (value, aliases) => {
    if (typeof value === "string" && value.startsWith("$")) {
      const resolved = aliases.get(value.slice(1));
      if (!resolved) throw new Error(`Unknown craft patch alias: ${value}`);
      return resolved;
    }
    if (Array.isArray(value)) return value.map((item) => resolveAliases(item, aliases));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveAliases(item, aliases)]));
    }
    return value;
  };
  const isInside = (node, root) => {
    let current = node;
    while (current) {
      if (current.id === root.id) return true;
      current = current.parent;
    }
    return false;
  };
  const assertInside = (nodeId, root, label) => __async(null, null, function* () {
    const node = yield figma.getNodeByIdAsync(nodeId);
    if (!node || !isInside(node, root)) throw new Error(`${label} ${nodeId} is outside approved craft root ${root.id}`);
  });
  const createdNodeId = (response) => {
    const data = response.data;
    return typeof (data == null ? void 0 : data.id) === "string" ? data.id : null;
  };
  const handleCraftPatchRequest = (request) => __async(null, null, function* () {
    var _a, _b, _c;
    if (request.type !== "apply_craft_patch") return null;
    const params = request.params || {};
    const rootNodeId = String(params.rootNodeId || "");
    const root = yield figma.getNodeByIdAsync(rootNodeId);
    if (!root || root.type === "DOCUMENT") throw new Error(`Craft root not found: ${rootNodeId}`);
    const operations = Array.isArray(params.operations) ? params.operations : [];
    if (operations.length === 0 || operations.length > 80) {
      throw new Error("operations must contain 1-80 craft operations");
    }
    const aliases = /* @__PURE__ */ new Map();
    const results = [];
    for (let index = 0; index < operations.length; index += 1) {
      const raw = operations[index];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`operations[${index}] must be an object`);
      const operation = raw;
      const type = String(operation.type || "");
      const alias = String(operation.id || "");
      if (!SUPPORTED_OPERATIONS.has(type)) throw new Error(`operations[${index}] uses unsupported type: ${type}`);
      if (!alias || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(alias)) {
        throw new Error(`operations[${index}].id must be a stable alias`);
      }
      if (aliases.has(alias)) throw new Error(`Duplicate craft patch alias: ${alias}`);
      const resolvedNodeIds = resolveAliases(
        Array.isArray(operation.nodeIds) ? operation.nodeIds : [],
        aliases
      );
      const resolvedParams = resolveAliases(
        operation.params && typeof operation.params === "object" ? operation.params : {},
        aliases
      );
      if (CREATE_OPERATIONS.has(type)) {
        resolvedParams.parentId = resolvedParams.parentId || root.id;
        yield assertInside(String(resolvedParams.parentId), root, "Parent");
      } else if (type === "clone_node") {
        resolvedParams.parentId = resolvedParams.parentId || root.id;
        yield assertInside(String(resolvedParams.parentId), root, "Clone parent");
        if (resolvedNodeIds.length !== 1) throw new Error(`operations[${index}] clone_node requires one source nodeId`);
      } else {
        for (const nodeId2 of resolvedNodeIds) yield assertInside(nodeId2, root, "Target");
        if (type === "reparent_nodes") {
          yield assertInside(String(resolvedParams.parentId || ""), root, "Reparent destination");
        }
        if (type === "set_reactions") {
          const reactions = Array.isArray(resolvedParams.reactions) ? resolvedParams.reactions : [];
          for (const reaction of reactions) {
            const actions = Array.isArray(reaction == null ? void 0 : reaction.actions) ? reaction.actions : [];
            for (const action of actions) {
              if ((action == null ? void 0 : action.type) === "NODE" && action.destinationId) {
                yield assertInside(String(action.destinationId), root, "Prototype destination");
              }
            }
          }
        }
      }
      const childRequest = {
        type,
        requestId: `${request.requestId}:${index}`,
        nodeIds: resolvedNodeIds,
        params: resolvedParams
      };
      let response = null;
      for (const handler of handlers) {
        response = yield handler(childRequest);
        if (response) break;
      }
      if (!response) throw new Error(`No handler for craft operation ${type}`);
      if (response.error) throw new Error(`operations[${index}] ${type} failed: ${response.error}`);
      const nodeId = (_b = (_a = createdNodeId(response)) != null ? _a : resolvedNodeIds[0]) != null ? _b : null;
      if (nodeId) aliases.set(alias, nodeId);
      results.push({ index, id: alias, type, nodeId, data: (_c = response.data) != null ? _c : null });
    }
    return {
      type: request.type,
      requestId: request.requestId,
      data: {
        rootNodeId: root.id,
        applied: results.length,
        aliases: Object.fromEntries(aliases),
        results
      }
    };
  });
  const handleWriteRequest = (request) => __async(null, null, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    return (_i = (_h = (_g = (_f = (_e = (_d = (_c = (_b = (_a = yield handleWriteCreateRequest(request)) != null ? _a : yield handleWriteModifyRequest(request)) != null ? _b : yield handleWriteVectorRequest(request)) != null ? _c : yield handleWriteStyleRequest(request)) != null ? _d : yield handleWriteVariableRequest(request)) != null ? _e : yield handleWriteComponentRequest(request)) != null ? _f : yield handleWritePrototypeRequest(request)) != null ? _g : yield handleWritePageRequest(request)) != null ? _h : yield handleLifecycleArtifactRequest(request)) != null ? _i : yield handleCraftPatchRequest(request);
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
