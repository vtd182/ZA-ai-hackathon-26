import type { PluginToolRequest, PluginToolResponse } from "./runtime/protocol";

const metadataKey = "za-pm-lifecycle";

type JsonRecord = Record<string, any>;

const postProgress = (requestId: string, progress: number, message: string) => {
  figma.ui?.postMessage({
    type: "progress_update",
    requestId,
    progress,
    message,
  });
};

const yieldToFigma = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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

const findArtifactRoot = async (
  idempotencyKey: string,
): Promise<{ page: PageNode; root: BaseNode } | null> => {
  const pages = [
    figma.currentPage,
    ...figma.root.children.filter((page) => page.id !== figma.currentPage.id),
  ];
  for (const page of pages) {
    if (page.id !== figma.currentPage.id) {
      try {
        await page.loadAsync();
      } catch {
        continue;
      }
    }
    const root = page.children.find((node) => {
      const metadata = readMetadata(node);
      return metadata?.kind === "artifact_root" && metadata.idempotencyKey === idempotencyKey;
    });
    if (root) return { page, root };
  }
  return null;
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

const containingPageId = (node: BaseNode): string | null => {
  let current: BaseNode | null = node;
  while (current && current.type !== "DOCUMENT") {
    if (current.type === "PAGE") return current.id;
    current = current.parent;
  }
  return null;
};

const getLoadedNodeById = (nodeId: string): BaseNode | null => {
  for (const page of figma.root.children) {
    if (page.id === nodeId) return page;
    if ("findOne" in page) {
      const local = page.findOne((node) => node.id === nodeId);
      if (local) return local;
    }
  }
  return null;
};

const getNodeByIdLocalFirst = async (nodeId: string): Promise<BaseNode | null> => {
  try {
    const indexed = await figma.getNodeByIdAsync(nodeId);
    if (indexed) return indexed;
  } catch {
    // Test doubles and partially loaded pages may not support indexed lookup.
  }
  return getLoadedNodeById(nodeId);
};

const requireSourcePage = async (targetPageId: unknown): Promise<PageNode> => {
  if (typeof targetPageId !== "string" || !targetPageId) throw new Error("targetPageId is required");
  const page = await getNodeByIdLocalFirst(targetPageId);
  if (!page || page.type !== "PAGE") {
    throw new Error(`TARGET_NOT_ALLOWED: source page ${targetPageId} is unavailable`);
  }
  if (page.id !== figma.currentPage.id) await page.loadAsync();
  return page;
};

const createBoundInstance = async (
  slot: JsonRecord,
  targetPage: PageNode,
): Promise<InstanceNode> => {
  const binding = slot.componentBinding as JsonRecord | null | undefined;
  if (binding?.kind === "same_file_instance") {
    if (binding.pageId !== targetPage.id || typeof binding.nodeId !== "string") {
      throw new Error(`COMPONENT_SOURCE_NOT_ALLOWED: ${String(slot.slotKey)}`);
    }
    const source = await getNodeByIdLocalFirst(binding.nodeId);
    if (!source || source.type !== "INSTANCE" || containingPageId(source) !== targetPage.id) {
      throw new Error(`COMPONENT_UNAVAILABLE: same-file instance ${binding.nodeId}`);
    }
    return source.clone();
  }
  const key = binding?.kind === "component_key" && typeof binding.key === "string"
    ? binding.key
    : slot.componentKey;
  if (typeof key !== "string" || !key) {
    throw new Error(`COMPONENT_UNAVAILABLE: missing binding for ${String(slot.slotKey)}`);
  }
  const component = await localComponentByKey(key);
  return component.createInstance();
};

const editableTextNodes = (node: SceneNode): TextNode[] => {
  if (node.type === "TEXT") return [node];
  if ("findAllWithCriteria" in node) return node.findAllWithCriteria({ types: ["TEXT"] });
  return [];
};

const applySlotContent = async (
  node: SceneNode,
  semanticRole: string,
  content: JsonRecord | undefined,
): Promise<boolean> => {
  const text = typeof content?.text === "string" ? content.text.trim() : "";
  if (!text) return false;
  const candidates = editableTextNodes(node);
  const ranked = [...candidates].sort((left, right) => {
    const score = (item: TextNode) => {
      const name = item.name.toLowerCase();
      if (semanticRole === "app-header" && (name.includes("title") || name.includes("header"))) return 4;
      if (semanticRole.includes("button") && (name.includes("label") || name.includes("text"))) return 3;
      if (semanticRole.includes("input") && (name.includes("placeholder") || name.includes("text"))) return 3;
      if ((semanticRole === "list-item"
        || semanticRole === "menu-card"
        || semanticRole === "order-summary"
        || semanticRole === "payment-method")
        && name.includes("title")) return 4;
      if ((semanticRole.includes("message") || semanticRole === "pickup-code")
        && (name.includes("title") || name.includes("message") || name.includes("text"))) return 3;
      return item.visible ? 1 : 0;
    };
    return score(right) - score(left);
  });
  for (const target of ranked) {
    try {
      const fontName = target.fontName;
      if (!fontName || typeof fontName !== "object" || !("family" in fontName) || !("style" in fontName)) continue;
      await figma.loadFontAsync(fontName);
      target.characters = text;
      return true;
    } catch {
      // Some copied component sets expose broken overrides. Keep the visual instance intact.
    }
  }
  return false;
};

const stretchSlot = (node: SceneNode, semanticRole: string) => {
  if (!("layoutAlign" in node)) return;
  if (semanticRole === "app-header"
    || semanticRole.includes("button")
    || semanticRole.includes("input")
    || semanticRole === "list-item"
    || semanticRole === "menu-card"
    || semanticRole === "order-summary"
    || semanticRole.includes("message")) {
    node.layoutAlign = "STRETCH";
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
  style = "Regular",
): Promise<TextNode> => {
  try {
    await figma.loadFontAsync({ family: "Inter", style });
  } catch {
    style = "Regular";
    await figma.loadFontAsync({ family: "Inter", style });
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
};

type DesignPalette = {
  canvas: SolidPaint;
  surface: SolidPaint;
  primary: SolidPaint;
  primarySoft: SolidPaint;
  success: SolidPaint;
  successSoft: SolidPaint;
  warningSoft: SolidPaint;
  accentSoft: SolidPaint;
  text: SolidPaint;
  muted: SolidPaint;
  border: SolidPaint;
};

const paletteFor = (name: unknown): DesignPalette => {
  const base = {
    canvas: solid(245, 247, 249),
    surface: solid(255, 255, 255),
    text: solid(24, 34, 41),
    muted: solid(93, 108, 116),
    border: solid(218, 225, 229),
    warningSoft: solid(255, 247, 224),
  };
  if (name === "trust-green") {
    return {
      ...base,
      primary: solid(0, 133, 98),
      primarySoft: solid(229, 247, 241),
      success: solid(0, 133, 98),
      successSoft: solid(226, 248, 239),
      accentSoft: solid(232, 242, 255),
    };
  }
  if (name === "signal-violet") {
    return {
      ...base,
      primary: solid(106, 70, 184),
      primarySoft: solid(242, 237, 252),
      success: solid(0, 133, 98),
      successSoft: solid(226, 248, 239),
      accentSoft: solid(237, 242, 255),
    };
  }
  if (name === "warm-coral") {
    return {
      ...base,
      primary: solid(223, 91, 65),
      primarySoft: solid(255, 238, 233),
      success: solid(0, 133, 98),
      successSoft: solid(226, 248, 239),
      accentSoft: solid(255, 245, 218),
    };
  }
  return {
    ...base,
    primary: solid(0, 104, 225),
    primarySoft: solid(232, 242, 255),
    success: solid(0, 133, 98),
    successSoft: solid(226, 248, 239),
    accentSoft: solid(239, 235, 255),
  };
};

const createStack = (
  parent: ChildrenMixin,
  name: string,
  width: number,
  fill: SolidPaint,
  padding: number,
  gap: number,
  radius = 0,
): FrameNode => {
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

// Soft elevation gives cards real depth instead of a flat wireframe look. Level 2 is a
// stronger lift for focal/CTA surfaces; level 1 is a quiet resting shadow for content cards.
const elevate = (node: FrameNode, level: 1 | 2 = 1): void => {
  node.effects = [{
    type: "DROP_SHADOW",
    color: { r: 0.09, g: 0.13, b: 0.16, a: level === 2 ? 0.16 : 0.07 },
    offset: { x: 0, y: level === 2 ? 8 : 3 },
    radius: level === 2 ? 24 : 12,
    spread: level === 2 ? -2 : -1,
    visible: true,
    blendMode: "NORMAL",
  }] as Effect[];
};

const toneFill = (tone: unknown, palette: DesignPalette): SolidPaint => {
  if (tone === "success") return palette.successSoft;
  if (tone === "warning") return palette.warningSoft;
  if (tone === "accent") return palette.accentSoft;
  if (tone === "brand") return palette.primarySoft;
  return palette.surface;
};

const appendPresentationSection = async (
  parent: ChildrenMixin,
  section: JsonRecord,
  palette: DesignPalette,
): Promise<FrameNode> => {
  const kind = String(section.kind ?? "info");
  const prominent = kind === "status" || kind === "confirmation" || kind === "progress";
  const card = createStack(
    parent,
    `Section · ${String(section.key)}`,
    358,
    toneFill(section.tone, palette),
    prominent ? 18 : 16,
    prominent ? 10 : 8,
    kind === "info" ? 8 : 14,
  );
  card.strokes = kind === "info" ? [] : [palette.border];
  card.strokeWeight = kind === "info" ? 0 : 1;
  // Content cards float above the surface; focal cards lift more. Info blocks stay flat.
  if (kind !== "info") elevate(card, prominent ? 2 : 1);
  writeMetadata(card, {
    kind: "presentation_section",
    sectionKey: String(section.key),
    sectionKind: kind,
  });
  await appendText(card, String(section.title ?? ""), prominent ? 23 : 17, palette.text, prominent ? "Bold" : "Semi Bold");
  if (typeof section.body === "string" && section.body.trim()) {
    await appendText(card, section.body, 13, palette.muted);
  }
  const items = Array.isArray(section.items) ? section.items as JsonRecord[] : [];

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
      await appendText(metric, String(item.label ?? ""), 10, palette.muted, "Medium");
      await appendText(metric, String(item.value ?? ""), 15, palette.text, "Medium");
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
    const label = kind === "timeline"
      ? `${index === 0 ? "●" : "○"}  ${String(item.label ?? "")}`
      : kind === "choice_list"
        ? `${index === 0 ? "●" : "○"}  ${String(item.label ?? "")}`
        : String(item.label ?? "");
    const labelNode = await appendText(row, label, 12, kind === "timeline" ? palette.primary : palette.muted);
    labelNode.layoutAlign = "INHERIT";
    labelNode.textAutoResize = "WIDTH_AND_HEIGHT";
    const value = await appendText(row, String(item.value ?? ""), 12, palette.text, "Medium");
    value.layoutAlign = "INHERIT";
    value.textAutoResize = "WIDTH_AND_HEIGHT";
  }
  return card;
};

const appendDesignBrief = async (
  root: ChildrenMixin,
  direction: JsonRecord,
  screens: JsonRecord[],
  palette: DesignPalette,
): Promise<FrameNode> => {
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
  await appendText(brief, "DESIGN DIRECTION", 11, palette.primary, "Medium");
  await appendText(brief, String(direction.conceptName ?? "Product concept"), 30, palette.text, "Medium");
  await appendText(brief, String(direction.productPromise ?? ""), 14, palette.muted);
  writeMetadata(brief, {
    kind: "design_brief",
    conceptName: String(direction.conceptName ?? ""),
  });
  const meta = createStack(brief, "Design attributes", 312, palette.primarySoft, 14, 8, 12);
  await appendText(meta, `${String(direction.tone ?? "focused").toUpperCase()}  ·  ${String(direction.density ?? "comfortable").toUpperCase()}`, 11, palette.primary, "Medium");
  for (const principle of Array.isArray(direction.principles) ? direction.principles as JsonRecord[] : []) {
    const principleCard = createStack(brief, `Principle · ${String(principle.title)}`, 312, palette.canvas, 14, 6, 10);
    await appendText(principleCard, String(principle.title ?? ""), 14, palette.text, "Medium");
    await appendText(principleCard, String(principle.detail ?? ""), 11, palette.muted);
  }
  await appendText(brief, `${screens.length} PRODUCT SCREENS`, 11, palette.primary, "Medium");
  await appendText(brief, screens.map((screen, index) => `${index + 1}. ${String(screen.name)}`).join("\n"), 12, palette.text);
  return brief;
};

const styleScreen = (frame: FrameNode, palette: DesignPalette) => {
  frame.fills = [palette.canvas];
  frame.strokes = [solid(210, 220, 225)];
  frame.strokeWeight = 1;
  frame.cornerRadius = 28;
  frame.clipsContent = true;
};

const navigationCopy = (direction: JsonRecord, presentation: JsonRecord): string => {
  const active = String(presentation.navigationLabel ?? "Hiện tại");
  switch (String(direction.palette ?? "")) {
    case "trust-green":
      return `${active}      Lịch backup      Nhật ký`;
    case "warm-coral":
      return `${active}      Đơn nhóm      Cá nhân`;
    default:
      return `${active}      Hoạt động      Cá nhân`;
  }
};

const EASING_MAP: Record<string, string> = {
  linear: "LINEAR", ease_in: "EASE_IN", ease_out: "EASE_OUT", ease_in_out: "EASE_IN_AND_OUT",
};
const DIRECTION_MAP: Record<string, string> = {
  left: "LEFT", right: "RIGHT", top: "TOP", bottom: "BOTTOM",
};

const buildTransition = (transition: unknown): JsonRecord | null => {
  const record = (transition && typeof transition === "object") ? transition as JsonRecord : {};
  const type = String(record.type ?? "smart_animate");
  if (type === "instant") return null;
  const duration = (typeof record.durationMs === "number" ? record.durationMs : 240) / 1000;
  const easing = { type: EASING_MAP[String(record.easing ?? "ease_out")] ?? "EASE_OUT" };
  const direction = DIRECTION_MAP[String(record.direction ?? "left")] ?? "LEFT";
  if (type === "dissolve") return { type: "DISSOLVE", duration, easing };
  if (type === "move_in") return { type: "MOVE_IN", direction, matchLayers: false, duration, easing };
  if (type === "slide_in") return { type: "SLIDE_IN", direction, matchLayers: false, duration, easing };
  if (type === "push") return { type: "PUSH", direction, matchLayers: false, duration, easing };
  return { type: "SMART_ANIMATE", duration, easing };
};

const buildTrigger = (edge: JsonRecord): JsonRecord => {
  const trigger = String(edge.trigger ?? "on_tap");
  if (trigger === "on_hover") return { type: "ON_HOVER" };
  if (trigger === "after_delay") {
    return { type: "AFTER_TIMEOUT", timeout: (typeof edge.delayMs === "number" ? edge.delayMs : 1500) / 1000 };
  }
  return { type: "ON_CLICK" };
};

const setNavigationReactions = async (
  node: SceneNode,
  destinations: Array<{ edge: JsonRecord; frame: FrameNode }>,
): Promise<void> => {
  const reactions = destinations.map(({ edge, frame }) => {
    const action = String(edge.action ?? "navigate");
    const navigation = action === "open_overlay" ? "OVERLAY" : action === "scroll_to" ? "SCROLL_TO" : "NAVIGATE";
    // An overlay destination needs overlay presentation settings to open as a sheet.
    if (navigation === "OVERLAY" && "overlayPositionType" in frame) {
      const overlayFrame = frame as FrameNode & {
        overlayPositionType: string;
        overlayBackground: unknown;
        overlayBackgroundInteraction: string;
      };
      overlayFrame.overlayPositionType = "BOTTOM_CENTER";
      overlayFrame.overlayBackground = { type: "SOLID_COLOR", color: { r: 0, g: 0, b: 0, a: 0.28 } };
      overlayFrame.overlayBackgroundInteraction = "CLOSE_ON_CLICK_OUTSIDE";
    }
    const transition = buildTransition(edge.transition);
    return {
      trigger: buildTrigger(edge),
      actions: [{
        type: "NODE",
        destinationId: frame.id,
        navigation,
        ...(transition ? { transition } : {}),
        ...(navigation === "NAVIGATE" ? { resetScrollPosition: true } : {}),
      }],
    };
  }) as Reaction[];
  const prototypeNode = node as SceneNode & Partial<ReactionMixin>;
  if (typeof prototypeNode.setReactionsAsync === "function") {
    await prototypeNode.setReactionsAsync(reactions);
  } else if ("reactions" in prototypeNode) {
    (prototypeNode as SceneNode & { reactions: readonly Reaction[] }).reactions = reactions;
  } else {
    throw new Error(`PROTOTYPE_UNAVAILABLE: ${node.id} does not support reactions`);
  }
  writeMetadata(node, {
    ...readMetadata(node),
    prototypeEdges: destinations.map(({ edge }) => edge),
  });
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

const paintFromHex = (value: unknown, fallback?: SolidPaint): SolidPaint | null => {
  if (typeof value !== "string") return fallback ?? null;
  const match = value.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return fallback ?? null;
  return solid(
    Number.parseInt(match[1], 16),
    Number.parseInt(match[2], 16),
    Number.parseInt(match[3], 16),
  );
};

const creativeFontStyle = (value: unknown): string => {
  if (value === "medium") return "Medium";
  if (value === "semibold") return "Semi Bold";
  if (value === "bold") return "Bold";
  return "Regular";
};

const applyCreativeFrameStyle = (node: FrameNode, element: JsonRecord) => {
  node.resize(Number(element.width), Number(element.height));
  const layout = String(element.layout ?? "none");
  node.layoutMode = layout === "vertical" ? "VERTICAL" : layout === "horizontal" ? "HORIZONTAL" : "NONE";
  node.primaryAxisSizingMode = "FIXED";
  node.counterAxisSizingMode = "FIXED";
  node.itemSpacing = Number(element.gap ?? 0);
  node.paddingTop = Number(element.paddingTop ?? 0);
  node.paddingRight = Number(element.paddingRight ?? 0);
  node.paddingBottom = Number(element.paddingBottom ?? 0);
  node.paddingLeft = Number(element.paddingLeft ?? 0);
  node.cornerRadius = Number(element.radius ?? 0);
  node.opacity = Number(element.opacity ?? 1);
  node.clipsContent = true;
  const fill = paintFromHex(element.fill);
  node.fills = fill ? [fill] : [];
  const stroke = paintFromHex(element.stroke);
  node.strokes = stroke ? [stroke] : [];
  node.strokeWeight = stroke ? Number(element.strokeWidth ?? 1) : 0;
};

const placeCreativeNode = (
  node: SceneNode,
  element: JsonRecord,
  parent: ChildrenMixin,
) => {
  parent.appendChild(node);
  if ("layoutMode" in parent && parent.layoutMode === "NONE") {
    node.x = Number(element.x ?? 0);
    node.y = Number(element.y ?? 0);
  }
  if ("layoutGrow" in node) node.layoutGrow = Number(element.layoutGrow ?? 0);
};

const createCreativePrimitive = async (
  element: JsonRecord,
): Promise<SceneNode> => {
  const kind = String(element.kind);
  if (kind === "text") {
    let style = creativeFontStyle(element.fontWeight);
    try {
      await figma.loadFontAsync({ family: "Inter", style });
    } catch {
      style = "Regular";
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    }
    const node = figma.createText();
    node.name = String(element.name);
    node.fontName = { family: "Inter", style };
    node.fontSize = Number(element.fontSize ?? 14);
    node.characters = String(element.text ?? "");
    node.textAlignHorizontal = element.textAlign === "center" ? "CENTER" : element.textAlign === "right" ? "RIGHT" : "LEFT";
    node.textAutoResize = "NONE";
    node.resize(Number(element.width), Number(element.height));
    node.opacity = Number(element.opacity ?? 1);
    const fill = paintFromHex(element.fill, solid(24, 34, 41));
    node.fills = fill ? [fill] : [];
    return node;
  }
  if (kind === "ellipse") {
    const node = figma.createEllipse();
    node.name = String(element.name);
    node.resize(Number(element.width), Number(element.height));
    node.opacity = Number(element.opacity ?? 1);
    const fill = paintFromHex(element.fill);
    node.fills = fill ? [fill] : [];
    const stroke = paintFromHex(element.stroke);
    node.strokes = stroke ? [stroke] : [];
    node.strokeWeight = stroke ? Number(element.strokeWidth ?? 1) : 0;
    return node;
  }
  const node = figma.createRectangle();
  node.name = String(element.name);
  node.resize(Number(element.width), Number(element.height));
  node.cornerRadius = kind === "divider" ? 0 : Number(element.radius ?? 0);
  node.opacity = Number(element.opacity ?? 1);
  const fill = paintFromHex(element.fill, kind === "divider" ? solid(218, 225, 229) : undefined);
  node.fills = fill ? [fill] : [];
  const stroke = paintFromHex(element.stroke);
  node.strokes = stroke ? [stroke] : [];
  node.strokeWeight = stroke ? Number(element.strokeWidth ?? 1) : 0;
  return node;
};

const renderCreativeBlueprint = async (input: {
  root: SectionNode;
  sourcePage: PageNode;
  source: JsonRecord;
  metadata: JsonRecord;
  planHash: string;
  resolvedSlots: JsonRecord[];
  requestId: string;
}): Promise<{ width: number; height: number; edges: JsonRecord[] }> => {
  const blueprint = input.source.creativeBlueprint as JsonRecord;
  const creativeScreens = Array.isArray(blueprint.screens) ? blueprint.screens as JsonRecord[] : [];
  const recipeById = new Map((input.source.screens as JsonRecord[]).map((screen) => [String(screen.screenId), screen]));
  const screenFrames = new Map<string, FrameNode>();
  const elementNodes = new Map<string, SceneNode>();
  const direction = input.source.designDirection as JsonRecord | undefined ?? {};
  const palette = paletteFor(direction.palette);
  await appendDesignBrief(input.root, {
    ...direction,
    conceptName: blueprint.conceptName,
    productPromise: blueprint.productPromise,
    principles: Array.isArray(blueprint.principles)
      ? blueprint.principles.map((principle: unknown) => ({ title: String(principle), detail: "" }))
      : [],
  }, creativeScreens, palette);

  let cursorX = 440;
  let maxHeight = 0;
  const totalElements = Math.max(1, creativeScreens.reduce((total, screen) => {
    const elements = Array.isArray(screen.elements) ? screen.elements as JsonRecord[] : [];
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
    frame.fills = [paintFromHex(creativeScreen.background, palette.canvas)!];
    frame.strokes = [palette.border];
    frame.strokeWeight = 1;
    frame.cornerRadius = 28;
    frame.clipsContent = true;
    input.root.appendChild(frame);
    screenFrames.set(screenId, frame);
    cursorX += Number(creativeScreen.width) + 56;
    maxHeight = Math.max(maxHeight, Number(creativeScreen.height));
    writeMetadata(frame, {
      ...input.metadata,
      kind: "screen",
      screenId,
      archetype: recipe.presentation?.archetype ?? "browse",
      requirementIds: creativeScreen.requirementIds,
      planHash: input.planHash,
      creative: true,
      presentationNote: creativeScreen.presentationNote,
    });

    const elements = Array.isArray(creativeScreen.elements) ? creativeScreen.elements as JsonRecord[] : [];
    const rootAlias = elements.find((element) =>
      element.kind === "frame"
      && element.parentId == null
      && Number(element.width) === Number(creativeScreen.width)
      && Number(element.height) === Number(creativeScreen.height),
    );
    if (rootAlias) {
      applyCreativeFrameStyle(frame, rootAlias);
      frame.name = `${screenId} · ${String(creativeScreen.name)}`;
      writeMetadata(frame, {
        ...readMetadata(frame),
        creativeElementId: rootAlias.id,
        creativeElementKind: rootAlias.kind,
      });
      elementNodes.set(String(rootAlias.id), frame);
      completedElements += 1;
    }
    for (const element of elements) {
      if (rootAlias && element.id === rootAlias.id) continue;
      const parent = element.parentId
        ? elementNodes.get(String(element.parentId))
        : frame;
      if (!parent || !("appendChild" in parent)) {
        throw new Error(`CREATIVE_PARENT_MISSING: ${String(element.id)} -> ${String(element.parentId)}`);
      }
      let node: SceneNode;
      if (element.kind === "frame") {
        const created = figma.createFrame();
        created.name = String(element.name);
        applyCreativeFrameStyle(created, element);
        node = created;
      } else if (element.kind === "component") {
        const elementProgress = 18 + Math.round((completedElements / totalElements) * 66);
        postProgress(input.requestId, elementProgress, `Binding ZDS control: ${String(element.name)}`);
        const slot = input.resolvedSlots.find((candidate) =>
          candidate.screenId === screenId && candidate.slotKey === element.id,
        );
        if (!slot || slot.resolution !== "component") {
          throw new Error(`STRICT_PLAN_VIOLATION: unresolved creative component ${String(element.id)}`);
        }
        node = await createBoundInstance(slot, input.sourcePage);
        node.name = `${String(element.id)} · ${String(element.name)}`;
        await applySlotContent(node, String(slot.semanticRole ?? ""), { text: element.componentText });
        try {
          node.resize(Number(element.width), Number(element.height));
        } catch {
          // Preserve a component's intrinsic constraints when the source instance cannot be resized.
        }
        writeMetadata(node, {
          ...input.metadata,
          kind: "slot",
          screenId,
          requirementIds: creativeScreen.requirementIds,
          slotKey: element.id,
          componentKey: slot.componentKey ?? null,
          componentBinding: slot.componentBinding ?? null,
          semanticRole: slot.semanticRole ?? null,
          primitiveFallback: false,
          planHash: input.planHash,
        });
      } else {
        node = await createCreativePrimitive(element);
      }
      if ("opacity" in node) node.opacity = Number(element.opacity ?? 1);
      placeCreativeNode(node, element, parent as ChildrenMixin);
      writeMetadata(node, {
        ...readMetadata(node),
        creativeElementId: element.id,
        creativeElementKind: element.kind,
      });
      elementNodes.set(String(element.id), node);
      completedElements += 1;
      const elementProgress = 18 + Math.round((completedElements / totalElements) * 66);
      postProgress(input.requestId, elementProgress, `Composed ${completedElements}/${totalElements}: ${String(element.name)}`);
      await yieldToFigma();
    }
    const progress = 18 + Math.round(((screenIndex + 1) / creativeScreens.length) * 66);
    postProgress(input.requestId, progress, `Composed ${screenIndex + 1}/${creativeScreens.length}: ${String(creativeScreen.name)}`);
    await yieldToFigma();
  }

  const edges = Array.isArray(blueprint.prototypeEdges) ? blueprint.prototypeEdges as JsonRecord[] : [];
  postProgress(input.requestId, 88, "Connecting creative prototype interactions");
  for (const edge of edges) {
    const sourceNode = elementNodes.get(String(edge.fromElementId));
    const destination = screenFrames.get(String(edge.toScreenId));
    if (!sourceNode || !destination) throw new Error(`CREATIVE_EDGE_INVALID: ${String(edge.key)}`);
    await setNavigationReactions(sourceNode, [{ edge: {
      key: edge.key,
      fromScreenId: edge.fromScreenId,
      toScreenId: edge.toScreenId,
      trigger: edge.trigger,
      action: edge.action,
      ...(edge.delayMs !== undefined ? { delayMs: edge.delayMs } : {}),
      ...(edge.transition ? { transition: edge.transition } : {}),
    }, frame: destination }]);
  }
  return { width: Math.max(900, cursorX + 24), height: Math.max(1_020, maxHeight + 180), edges };
};

const focusArtifact = (node: SceneNode) => {
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
};

const artifactPageName = (metadata: JsonRecord): string => {
  if (typeof metadata.artifactPageName === "string" && metadata.artifactPageName.trim()) {
    return metadata.artifactPageName.trim().slice(0, 80);
  }
  const spec = String(metadata.specId ?? "Product").trim() || "Product";
  return `PM · ${spec.slice(0, 48)} · v${String(metadata.specVersion ?? "1")}`;
};

const artifactPageStem = (name: string): string => name
  .replace(/\s*·\s*v[^·]+\s*$/i, "")
  .trim()
  .toLocaleLowerCase();

const isPageLimitError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /starter plan/i.test(message)
    && /(?:3 pages|unlimited pages|page limit)/i.test(message);
};

const managedArtifactPageAtCapacity = async (
  metadata: JsonRecord,
  sourcePageId: string,
): Promise<PageNode | null> => {
  if (
    metadata.pageStrategy !== "create_or_recover_incomplete"
    && metadata.pageStrategy !== "create_or_reuse_managed"
  ) return null;
  const expectedStem = artifactPageStem(artifactPageName(metadata));
  if (!expectedStem.startsWith("pm · ")) return null;
  const candidates: PageNode[] = [];
  for (const page of figma.root.children) {
    if (page.id === sourcePageId || artifactPageStem(page.name) !== expectedStem) continue;
    if (page.id !== figma.currentPage.id) {
      try {
        await page.loadAsync();
      } catch {
        continue;
      }
    }
    const managedRoots = page.children.filter((node) => {
      const stored = readMetadata(node);
      return stored?.namespace === "za.pm-lifecycle/v1" && stored.kind === "artifact_root";
    });
    // Never repurpose a Page containing loose or user-authored nodes.
    if (managedRoots.length === 0 || managedRoots.length !== page.children.length) continue;
    candidates.push(page);
  }
  return candidates.length === 1 ? candidates[0] : null;
};

const nextArtifactRootX = (page: PageNode): number => page.children.reduce((right, node) => {
  if (!("x" in node) || !("width" in node)) return right;
  return Math.max(right, Number(node.x) + Number(node.width) + 160);
}, 0);

const containsLifecycleScreen = (node: BaseNode): boolean => {
  if (readMetadata(node)?.kind === "screen") return true;
  if (!("children" in node)) return false;
  return node.children.some((child) => containsLifecycleScreen(child));
};

const renderedLifecycleScreenIds = (root: BaseNode): string[] => {
  if (!("children" in root)) return [];
  return root.children.flatMap((node) => {
    const metadata = readMetadata(node);
    return metadata?.kind === "screen" && typeof metadata.screenId === "string"
      ? [metadata.screenId]
      : [];
  });
};

const hasExpectedLifecycleScreens = (root: BaseNode, screens: JsonRecord[]): boolean => {
  const expected = screens.map((screen) => String(screen.screenId)).sort();
  const rendered = renderedLifecycleScreenIds(root).sort();
  return expected.length === rendered.length
    && expected.every((screenId, index) => rendered[index] === screenId);
};

const recoverableArtifactPage = async (
  metadata: JsonRecord,
): Promise<{ page: PageNode; root: BaseNode } | null> => {
  if (
    metadata.pageStrategy !== "create_or_recover_incomplete"
    && metadata.pageStrategy !== "create_or_reuse_managed"
  ) return null;
  const expectedName = artifactPageName(metadata);
  for (const page of figma.root.children) {
    if (page.name !== expectedName) continue;
    if (page.id !== figma.currentPage.id) {
      try {
        await page.loadAsync();
      } catch {
        continue;
      }
    }
    const roots = page.children.filter((node) => {
      const stored = readMetadata(node);
      return stored?.namespace === "za.pm-lifecycle/v1"
        && stored.kind === "artifact_root"
        && stored.specId === metadata.specId
        && stored.specVersion === metadata.specVersion;
    });
    if (roots.length !== 1) continue;
    const rootMetadata = readMetadata(roots[0]);
    const isInterrupted = rootMetadata?.applyStatus === "in_progress";
    if (isInterrupted || !containsLifecycleScreen(roots[0])) return { page, root: roots[0] };
  }
  return null;
};

const applyArtifact = async (params: JsonRecord, requestId: string): Promise<JsonRecord> => {
  const resolvedPlan = params.preflightPlan as JsonRecord | undefined;
  const source = resolvedPlan?.source as JsonRecord | undefined;
  const planHash = typeof params.planHash === "string" ? params.planHash : "";
  const metadata = source?.metadata as JsonRecord | undefined;
  const screens = Array.isArray(source?.screens) ? source.screens as JsonRecord[] : [];
  const resolvedSlots = Array.isArray(resolvedPlan?.resolvedSlots) ? resolvedPlan.resolvedSlots as JsonRecord[] : [];
  if (!resolvedPlan || !source || !metadata || screens.length === 0 || !planHash) {
    throw new Error("preflightPlan, planHash, metadata and screens are required");
  }
  const sourcePage = await requireSourcePage(params.targetPageId);
  const idempotencyKey = String(metadata.idempotencyKey ?? "");
  if (!idempotencyKey) throw new Error("lifecycle idempotencyKey is required");

  postProgress(requestId, 3, "Checking existing lifecycle artifact");
  const existing = await findArtifactRoot(idempotencyKey);
  let staleExistingPage: PageNode | null = null;
  if (existing) {
    const existingMetadata = readMetadata(existing.root)!;
    if (hasExpectedLifecycleScreens(existing.root, screens)) {
      if (existingMetadata.planHash !== planHash) {
        throw new Error(`IDEMPOTENCY_CONFLICT: ${idempotencyKey} already exists with another plan hash`);
      }
      if (existing.page.id === figma.currentPage.id) focusArtifact(existing.root as SceneNode);
      postProgress(requestId, 100, "Existing lifecycle artifact is ready");
      return {
        schemaVersion: 1,
        rootNodeIds: [existing.root.id],
        artifactPageId: existing.page.id,
        artifactPageName: existing.page.name,
        idempotent: true,
      };
    }
    postProgress(requestId, 5, "Interrupted lifecycle artifact found; rebuilding it");
    if (existing.page.id !== sourcePage.id) staleExistingPage = existing.page;
    existing.root.remove();
  }

  postProgress(requestId, 8, "Preparing a dedicated Figma page");
  const recoverable = staleExistingPage ? null : await recoverableArtifactPage(metadata);
  let outputPage = staleExistingPage ?? recoverable?.page ?? null;
  let reusedAtPageCapacity = false;
  if (!outputPage) {
    try {
      outputPage = figma.createPage();
    } catch (error) {
      if (!isPageLimitError(error)) throw error;
      outputPage = await managedArtifactPageAtCapacity(metadata, sourcePage.id);
      if (!outputPage) {
        throw new Error(
          `FIGMA_PAGE_LIMIT: ${error instanceof Error ? error.message : String(error)}. `
          + "No same-product agent-managed Page can be reused safely.",
        );
      }
      reusedAtPageCapacity = true;
      postProgress(requestId, 9, `Figma Page limit reached; preserving prior versions on ${outputPage.name}`);
    }
  }
  const reusedOutputPage = Boolean(staleExistingPage || recoverable || reusedAtPageCapacity);
  if (recoverable) recoverable.root.remove();
  const previousOutputPageName = outputPage.name;
  const expectedOutputPageName = artifactPageName(metadata);
  const root = figma.createSection();
  root.name = `PM Lifecycle · ${String(metadata.specId ?? "Artifact")} · v${String(metadata.specVersion ?? "")}`;
  root.x = reusedAtPageCapacity ? nextArtifactRootX(outputPage) : 0;
  root.y = 0;
  outputPage.appendChild(root);
  writeMetadata(root, {
    ...metadata,
    kind: "artifact_root",
    planHash,
    targetHash: source.target?.targetHash,
    designConceptName: source.designDirection?.conceptName,
    sourcePageId: sourcePage.id,
    artifactPageId: outputPage.id,
    artifactPageName: expectedOutputPageName,
    applyStatus: "in_progress",
    expectedScreenIds: screens.map((screen) => String(screen.screenId)),
    expectedScreenCount: screens.length,
    reusedManagedPageAtCapacity: reusedAtPageCapacity,
  });

  try {
    const direction = source.designDirection as JsonRecord | undefined ?? {};
    const palette = paletteFor(direction.palette);
    const screenFrames = new Map<string, FrameNode>();
    const primaryActionNodes = new Map<string, SceneNode>();
    if (source.creativeBlueprint) {
      postProgress(requestId, 12, "Creative blueprint validated; composing product screens");
      const rendered = await renderCreativeBlueprint({
        root,
        sourcePage,
        source,
        metadata,
        planHash,
        resolvedSlots,
        requestId,
      });
      root.resizeWithoutConstraints(rendered.width, rendered.height);
      if (!hasExpectedLifecycleScreens(root, screens)) {
        throw new Error("ARTIFACT_INCOMPLETE: creative renderer did not produce every expected screen");
      }
      writeMetadata(root, {
        ...readMetadata(root),
        prototypeEdges: rendered.edges,
        creative: true,
        applyStatus: "complete",
        renderedScreenCount: renderedLifecycleScreenIds(root).length,
      });
      outputPage.name = expectedOutputPageName;
      figma.commitUndo();
      postProgress(requestId, 100, "Creative Figma artifact created");
      return {
        schemaVersion: 1,
        rootNodeIds: [root.id],
        artifactPageId: outputPage.id,
        artifactPageName: outputPage.name,
        idempotent: false,
      };
    }
    await appendDesignBrief(root, direction, screens, palette);
    postProgress(requestId, 15, "Design direction prepared");
    for (const [index, screen] of screens.entries()) {
      const presentation = screen.presentation as JsonRecord | undefined ?? {};
      const sections = Array.isArray(presentation.sections) ? presentation.sections as JsonRecord[] : [];
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
      writeMetadata(frame, {
        ...metadata,
        kind: "screen",
        screenId: screen.screenId,
        archetype: presentation.archetype,
        sectionKeys: sections.map((section) => String(section.key)),
        requirementIds: screen.requirementIds,
        planHash,
      });
      const screenSlots = resolvedSlots.filter((slot) => slot.screenId === screen.screenId);
      const appendResolvedSlot = async (slot: JsonRecord, parent: ChildrenMixin): Promise<SceneNode> => {
        let node: SceneNode;
        if (slot.resolution === "component" && typeof slot.componentKey === "string") {
          node = await createBoundInstance(slot, sourcePage);
        } else if (source.mode === "free" && slot.resolution === "primitive_fallback") {
          node = await createFallbackSlot(slot);
        } else {
          throw new Error(`STRICT_PLAN_VIOLATION: unresolved slot ${String(slot.slotKey)}`);
        }
        const recipeSlot = Array.isArray(screen.slots)
          ? screen.slots.find((candidate: JsonRecord) => candidate.key === slot.slotKey)
          : undefined;
        const semanticRole = typeof slot.semanticRole === "string" ? slot.semanticRole : "";
        await applySlotContent(node, semanticRole, recipeSlot?.content);
        stretchSlot(node, semanticRole);
        node.name = `${String(slot.slotKey)} · ${node.name}`;
        parent.appendChild(node);
        writeMetadata(node, {
          ...metadata,
          kind: "slot",
          screenId: screen.screenId,
          requirementIds: screen.requirementIds,
          slotKey: slot.slotKey,
          componentKey: slot.componentKey ?? null,
          componentBinding: slot.componentBinding ?? null,
          semanticRole: slot.semanticRole ?? null,
          primitiveFallback: slot.resolution === "primitive_fallback",
          planHash,
        });
        return node;
      };

      const headerSlots = screenSlots.filter((slot) => slot.semanticRole === "app-header");
      if (headerSlots.length > 0) {
        for (const slot of headerSlots) await appendResolvedSlot(slot, frame);
      } else {
        const customHeader = createStack(frame, "Product header", 390, palette.surface, 16, 4);
        await appendText(customHeader, String(screen.name ?? screen.screenId), 16, palette.text, "Medium");
      }

      const content = createStack(frame, "Product content", 390, palette.canvas, 16, 14);
      content.layoutAlign = "STRETCH";
      content.layoutGrow = 1;
      content.primaryAxisSizingMode = "FIXED";
      content.clipsContent = true;
      content.overflowDirection = "VERTICAL";
      const hero = createStack(content, "Screen hierarchy", 358, palette.canvas, 0, 8);
      const eyebrow = await appendText(hero, String(presentation.eyebrow ?? "PRODUCT FLOW"), 11, palette.primary, "Medium");
      eyebrow.name = "Eyebrow";
      const headline = await appendText(hero, String(presentation.headline ?? screen.name), 26, palette.text, "Medium");
      headline.name = "Product headline";
      const supporting = await appendText(hero, String(presentation.supportingText ?? screen.purpose ?? ""), 13, palette.muted);
      supporting.name = "Supporting copy";
      for (const section of sections) await appendPresentationSection(content, section, palette);

      const controlSlots = screenSlots.filter((slot) => {
        const role = String(slot.semanticRole ?? "");
        return role !== "app-header" && !role.includes("button");
      });
      if (controlSlots.length > 0) {
        const controls = createStack(content, "Design System controls", 358, palette.surface, 12, 10, 14);
        controls.strokes = [palette.border];
        controls.strokeWeight = 1;
        for (const slot of controlSlots) await appendResolvedSlot(slot, controls);
      }

      const actionSlots = screenSlots.filter((slot) => String(slot.semanticRole ?? "").includes("button"));
      if (actionSlots.length > 0) {
        const actions = createStack(frame, "Sticky actions", 390, palette.surface, 16, 10);
        actions.layoutAlign = "STRETCH";
        for (const [actionIndex, slot] of actionSlots.entries()) {
          const actionNode = await appendResolvedSlot(slot, actions);
          if (actionIndex === 0) primaryActionNodes.set(String(screen.screenId), actionNode);
        }
      }
      const navigation = createStack(frame, "Bottom navigation", 390, palette.surface, 10, 2);
      navigation.strokes = [palette.border];
      navigation.strokeTopWeight = 1;
      await appendText(navigation, navigationCopy(direction, presentation), 11, palette.muted, "Medium");
      const progress = 15 + Math.round(((index + 1) / screens.length) * 70);
      postProgress(requestId, progress, `Rendered ${index + 1}/${screens.length}: ${String(screen.name)}`);
      await yieldToFigma();
    }
    postProgress(requestId, 90, "Connecting prototype interactions");
    for (const screen of screens) {
      const fromScreenId = String(screen.screenId);
      const sourceNode = primaryActionNodes.get(fromScreenId) ?? screenFrames.get(fromScreenId);
      const destinations = (Array.isArray(screen.prototypeEdges) ? screen.prototypeEdges as JsonRecord[] : [])
        .flatMap((edge) => {
          const frame = screenFrames.get(String(edge.toScreenId));
          return frame ? [{ edge, frame }] : [];
        });
      if (sourceNode && destinations.length > 0) await setNavigationReactions(sourceNode, destinations);
    }
    root.resizeWithoutConstraints(Math.max(900, 460 + screens.length * 430), 1_020);
    if (!hasExpectedLifecycleScreens(root, screens)) {
      throw new Error("ARTIFACT_INCOMPLETE: renderer did not produce every expected screen");
    }
    writeMetadata(root, {
      ...readMetadata(root),
      prototypeEdges: flattenEdges(screens),
      applyStatus: "complete",
      renderedScreenCount: renderedLifecycleScreenIds(root).length,
    });
    outputPage.name = expectedOutputPageName;
    figma.commitUndo();
    postProgress(requestId, 100, "Lifecycle artifact created");
    return {
      schemaVersion: 1,
      rootNodeIds: [root.id],
      artifactPageId: outputPage.id,
      artifactPageName: outputPage.name,
      idempotent: false,
    };
  } catch (error) {
    root.remove();
    if (!reusedOutputPage) outputPage.remove();
    else if (reusedAtPageCapacity) outputPage.name = previousOutputPageName;
    throw error;
  }
};

const readArtifact = async (idempotencyKey: string, rootNodeId?: string): Promise<JsonRecord> => {
  let location: { page: PageNode; root: BaseNode } | null = null;
  if (rootNodeId) {
    const root = await getNodeByIdLocalFirst(rootNodeId);
    const pageId = root ? containingPageId(root) : null;
    const page = pageId ? await getNodeByIdLocalFirst(pageId) : null;
    const metadata = root ? readMetadata(root) : null;
    if (
      root
      && page?.type === "PAGE"
      && metadata?.kind === "artifact_root"
      && metadata.idempotencyKey === idempotencyKey
    ) {
      location = { page, root };
    }
  }
  if (!location) location = await findArtifactRoot(idempotencyKey);
  if (!location) throw new Error(`ARTIFACT_NOT_FOUND: ${idempotencyKey}`);
  const { page, root } = location;
  const rootMetadata = readMetadata(root)!;
  const descendants = (node: BaseNode): BaseNode[] => {
    if (!("children" in node)) return [];
    return node.children.flatMap((child) => [child, ...descendants(child)]);
  };
  const screens = "children" in root ? root.children.flatMap((node) => {
    const metadata = readMetadata(node);
    if (metadata?.kind !== "screen") return [];
    const childSlots = descendants(node).flatMap((child) => {
      const slot = readMetadata(child);
      return slot?.kind === "slot" ? [{
        slotKey: String(slot.slotKey),
        componentKey: typeof slot.componentKey === "string" ? slot.componentKey : null,
        componentBinding: slot.componentBinding && typeof slot.componentBinding === "object"
          ? slot.componentBinding
          : null,
        semanticRole: typeof slot.semanticRole === "string" ? slot.semanticRole : null,
        primitiveFallback: Boolean(slot.primitiveFallback),
        instanceBacked: child.type === "INSTANCE",
      }] : [];
    });
    const sectionKeys = descendants(node).flatMap((child) => {
      const section = readMetadata(child);
      return section?.kind === "presentation_section" && typeof section.sectionKey === "string"
        ? [section.sectionKey]
        : [];
    });
    const creativeNodes = [node, ...descendants(node)].filter((child) => {
      const childMetadata = readMetadata(child);
      return typeof childMetadata?.creativeElementId === "string";
    });
    return [{
      nodeId: node.id,
      screenId: String(metadata.screenId),
      name: node.name,
      archetype: String(metadata.archetype ?? ""),
      sectionKeys,
      componentKey: null,
      semanticRole: null,
      creativeMetrics: creativeNodes.length > 0 ? {
        elementCount: creativeNodes.length,
        instanceCount: creativeNodes.filter((child) => child.type === "INSTANCE").length,
        primitiveCount: creativeNodes.filter((child) => child.type !== "INSTANCE" && child.type !== "TEXT").length,
        textCount: creativeNodes.filter((child) => child.type === "TEXT").length,
      } : undefined,
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
  const expectedScreenIds = Array.isArray(rootMetadata.expectedScreenIds)
    ? rootMetadata.expectedScreenIds.map(String).sort()
    : [];
  const renderedScreenIds = screens.map((screen) => screen.screenId).sort();
  const screenSetMatches = expectedScreenIds.length === renderedScreenIds.length
    && expectedScreenIds.every((screenId, index) => renderedScreenIds[index] === screenId);
  if (rootMetadata.applyStatus === "in_progress" || (expectedScreenIds.length > 0 && !screenSetMatches)) {
    throw new Error(
      `ARTIFACT_INCOMPLETE: expected ${expectedScreenIds.length || rootMetadata.expectedScreenCount || "all"} screens, found ${screens.length}`,
    );
  }
  const screenIdByNodeId = new Map(screens.map((screen) => [screen.nodeId, screen.screenId]));
  const prototypeEdges = "children" in root ? root.children.flatMap((screenNode) =>
    [screenNode, ...descendants(screenNode)].flatMap((node) => {
      const metadata = readMetadata(node);
      const edges = Array.isArray(metadata?.prototypeEdges) ? metadata.prototypeEdges as JsonRecord[] : [];
      const reactions = "reactions" in node && Array.isArray(node.reactions) ? node.reactions : [];
      return edges.filter((edge) => reactions.some((reaction) =>
        reaction.actions.some((action: Action) =>
          action.type === "NODE"
          && action.destinationId != null
          && screenIdByNodeId.get(action.destinationId) === edge.toScreenId,
        ),
      ));
    })) : [];
  const renderedDesignBrief = "children" in root
    ? root.children.find((node) => readMetadata(node)?.kind === "design_brief")
    : undefined;
  const renderedDesignBriefMetadata = renderedDesignBrief ? readMetadata(renderedDesignBrief) : null;
  return {
    schemaVersion: 1,
    targetHash: String(rootMetadata.targetHash ?? ""),
    planHash: String(rootMetadata.planHash),
    idempotencyKey,
    rootNodeIds: [root.id],
    artifactPageId: page.id,
    artifactPageName: page.name,
    applyStatus: String(rootMetadata.applyStatus ?? "legacy"),
    designConceptName: String(renderedDesignBriefMetadata?.conceptName ?? ""),
    screens,
    prototypeEdges,
    readAt: new Date().toISOString(),
  };
};

export const handleLifecycleArtifactRequest = async (
  request: PluginToolRequest,
): Promise<PluginToolResponse | null> => {
  const params = request.params ?? {};
  switch (request.type) {
    case "apply_lifecycle_artifact_plan":
      return { type: request.type, requestId: request.requestId, data: await applyArtifact(params, request.requestId) };
    case "read_lifecycle_artifact": {
      await requireSourcePage(params.targetPageId);
      const idempotencyKey = typeof params.idempotencyKey === "string" ? params.idempotencyKey : "";
      if (!idempotencyKey) throw new Error("idempotencyKey is required");
      const rootNodeId = typeof params.rootNodeId === "string" ? params.rootNodeId : undefined;
      return { type: request.type, requestId: request.requestId, data: await readArtifact(idempotencyKey, rootNodeId) };
    }
    default:
      return null;
  }
};
