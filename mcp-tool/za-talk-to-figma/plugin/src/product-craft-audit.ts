import type { PluginToolRequest, PluginToolResponse } from "./runtime/protocol";

type AuditIssue = {
  code: string;
  severity: "error" | "warning";
  nodeId: string;
  message: string;
};

type Bounds = { x: number; y: number; width: number; height: number };
type Rgb = { r: number; g: number; b: number };

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
  "có 3 level button cơ bản",
];

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");

const isVisible = (node: any, root: any): boolean => {
  let current: any = node;
  while (current) {
    if ("visible" in current && current.visible === false) return false;
    if (current === root) break;
    current = current.parent;
  }
  return true;
};

const effectiveOpacity = (node: any, root: any): number => {
  let current: any = node;
  let opacity = 1;
  while (current) {
    if ("opacity" in current && typeof current.opacity === "number") opacity *= current.opacity;
    if (current === root) break;
    current = current.parent;
  }
  return opacity;
};

const solidPaint = (value: unknown): { color: Rgb; opacity: number } | null => {
  if (!Array.isArray(value)) return null;
  const paint = value.find((candidate: any) => (
    candidate?.type === "SOLID"
    && candidate.visible !== false
    && candidate.color
  )) as any;
  if (!paint) return null;
  const { r, g, b } = paint.color;
  if (![r, g, b].every((channel) => typeof channel === "number" && Number.isFinite(channel))) return null;
  return {
    color: { r, g, b },
    opacity: typeof paint.opacity === "number" ? paint.opacity : 1,
  };
};

const blend = (foreground: Rgb, background: Rgb, opacity: number): Rgb => ({
  r: foreground.r * opacity + background.r * (1 - opacity),
  g: foreground.g * opacity + background.g * (1 - opacity),
  b: foreground.b * opacity + background.b * (1 - opacity),
});

const luminance = (color: Rgb): number => {
  const channel = (value: number): number => (
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
};

const contrastRatio = (first: Rgb, second: Rgb): number => {
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
};

const coveringSiblingBackground = (node: any): Rgb | null => {
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
    if (
      siblingBounds
      && paint
      && centerX >= siblingBounds.x
      && centerX <= siblingBounds.x + siblingBounds.width
      && centerY >= siblingBounds.y
      && centerY <= siblingBounds.y + siblingBounds.height
    ) {
      return blend(paint.color, { r: 1, g: 1, b: 1 }, paint.opacity);
    }
  }
  return null;
};

const nearestBackground = (node: any, root: any): Rgb => {
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

const boundsOf = (node: any): Bounds | null => {
  const bounds = node.absoluteBoundingBox;
  if (!bounds) return null;
  const values = [bounds.x, bounds.y, bounds.width, bounds.height];
  return values.every((value) => typeof value === "number" && Number.isFinite(value))
    ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
    : null;
};

const inside = (child: Bounds, parent: Bounds, tolerance = 1): boolean => (
  child.x >= parent.x - tolerance
  && child.y >= parent.y - tolerance
  && child.x + child.width <= parent.x + parent.width + tolerance
  && child.y + child.height <= parent.y + parent.height + tolerance
);

const insideImmediateParent = (node: any, tolerance = 1): boolean => {
  const parent = node.parent;
  const values = [node.x, node.y, node.width, node.height, parent?.width, parent?.height];
  if (
    !parent
    || !["FRAME", "COMPONENT", "INSTANCE", "GROUP"].includes(parent.type)
    || !values.every((value) => typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  return node.x >= -tolerance
    && node.y >= -tolerance
    && node.x + node.width <= parent.width + tolerance
    && node.y + node.height <= parent.height + tolerance;
};

const intersectionArea = (first: Bounds, second: Bounds): number => {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
};

const overlapRatio = (first: Bounds, second: Bounds): number => {
  const overlap = intersectionArea(first, second);
  if (overlap <= 0) return 0;
  const smaller = Math.min(first.width * first.height, second.width * second.height);
  return smaller > 0 ? overlap / smaller : 0;
};

const isProbablyInteractiveInstance = (node: any): boolean => {
  const name = normalize(String(node.name || ""));
  const reactions = Array.isArray(node.reactions) ? node.reactions : [];
  return reactions.length > 0
    || /button|input|field|checkbox|radio|switch|tab|list|item|picker|select|otp|cta|search|chip|cell/.test(name);
};

const isDecorativeInstance = (node: any): boolean => {
  const name = normalize(String(node.name || ""));
  return /icon|avatar|badge|dot|divider|logo|illustration|image|thumbnail/.test(name);
};

const nearestScreen = (node: any, screens: any[]): any | null => {
  let current = node.parent;
  while (current) {
    if (screens.includes(current)) return current;
    current = current.parent;
  }
  return null;
};

const hasInstanceAncestor = (node: any, root: any): boolean => {
  let current = node.parent;
  while (current && current !== root) {
    if (current.type === "INSTANCE") return true;
    current = current.parent;
  }
  return false;
};

const directMobileScreens = (root: any): any[] => {
  const children = "children" in root ? root.children : [];
  const direct = children.filter((node: any) => (
    node.type === "FRAME"
    && node.width >= 320
    && node.width <= 480
    && node.height >= 600
    && node.height <= 1000
  ));
  if (direct.length > 0) return direct;
  if (!("findAll" in root)) return [];
  return root.findAll((node: any) => (
    node.type === "FRAME"
    && node.width >= 320
    && node.width <= 480
    && node.height >= 600
    && node.height <= 1000
    && !hasInstanceAncestor(node, root)
  ));
};

export const handleProductCraftAuditRequest = async (
  request: PluginToolRequest,
): Promise<PluginToolResponse | null> => {
  if (request.type !== "audit_product_craft") return null;
  const params = request.params || {};
  const rootNodeId = String(params.rootNodeId || "");
  if (!rootNodeId) throw new Error("rootNodeId is required");
  const root = await figma.getNodeByIdAsync(rootNodeId) as any;
  if (!root || root.type === "DOCUMENT") throw new Error(`Node not found: ${rootNodeId}`);

  const expectedScreenCount = Number(params.expectedScreenCount || 0);
  const expectedPrototypeLinks = Number(params.expectedPrototypeLinks || 0);
  const forbiddenTerms = (Array.isArray(params.forbiddenTerms) ? params.forbiddenTerms : [])
    .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
    .map(normalize);
  const placeholderTerms = [
    ...DEFAULT_PLACEHOLDERS,
    ...(Array.isArray(params.placeholderTerms) ? params.placeholderTerms : []),
  ]
    .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
    .map(normalize);

  const screens = directMobileScreens(root);
  const issues: AuditIssue[] = [];
  let visitedNodes = 0;
  let textCount = 0;
  let visibleTextCount = 0;
  let zdsInstanceCount = 0;
  let prototypeLinkCount = 0;
  const placeholderNodeIds = new Set<string>();
  const forbiddenNodeIds = new Set<string>();
  const clippedNodeIds = new Set<string>();
  const lowVisibilityNodeIds = new Set<string>();
  const componentDriftNodeIds = new Set<string>();
  const componentOverlapPairs = new Set<string>();
  const undersizedTouchTargetNodeIds = new Set<string>();
  const visibleTopLevelInstances: Array<{ node: any; screen: any; bounds: Bounds }> = [];

  const visit = (node: any): void => {
    visitedNodes += 1;
    const visible = isVisible(node, root);
    const topLevelInstance = node.type === "INSTANCE" && !hasInstanceAncestor(node, root);
    if (topLevelInstance) {
      zdsInstanceCount += 1;
      if (visible) {
        const screen = nearestScreen(node, screens);
        const nodeBounds = boundsOf(node);
        const screenBounds = screen ? boundsOf(screen) : null;
        if (!screen || !nodeBounds || !screenBounds) {
          componentDriftNodeIds.add(node.id);
          issues.push({
            code: "ZDS_INSTANCE_WITHOUT_SCREEN",
            severity: "error",
            nodeId: node.id,
            message: `ZDS instance ${node.name} is not contained in a mobile screen frame.`,
          });
        } else {
          visibleTopLevelInstances.push({ node, screen, bounds: nodeBounds });
          if (!inside(nodeBounds, screenBounds, 2)) {
            componentDriftNodeIds.add(node.id);
            issues.push({
              code: "ZDS_INSTANCE_OUTSIDE_SCREEN",
              severity: "error",
              nodeId: node.id,
              message: `ZDS instance ${node.name} extends outside ${screen.name}.`,
            });
          } else if (!insideImmediateParent(node, 2)) {
            componentDriftNodeIds.add(node.id);
            issues.push({
              code: "ZDS_INSTANCE_OUTSIDE_PARENT",
              severity: "error",
              nodeId: node.id,
              message: `ZDS instance ${node.name} extends outside its immediate container ${node.parent.name}.`,
            });
          }
          if (isProbablyInteractiveInstance(node) && !isDecorativeInstance(node) && (nodeBounds.width < 32 || nodeBounds.height < 32)) {
            undersizedTouchTargetNodeIds.add(node.id);
            issues.push({
              code: "TOUCH_TARGET_TOO_SMALL",
              severity: "error",
              nodeId: node.id,
              message: `Interactive ZDS instance ${node.name} is ${Math.round(nodeBounds.width)}x${Math.round(nodeBounds.height)}; expected at least 32x32.`,
            });
          }
        }
      }
    }
    if (visible && "reactions" in node && Array.isArray(node.reactions)) {
      for (const reaction of node.reactions) {
        const actions = Array.isArray(reaction?.actions) ? reaction.actions : [];
        prototypeLinkCount += actions.filter((action: any) => action?.type === "NODE" && action.destinationId).length;
      }
    }
    if (node.type === "TEXT") {
      textCount += 1;
      if (visible) {
        visibleTextCount += 1;
        const content = normalize(String(node.characters || ""));
        if (content) {
          const placeholder = placeholderTerms.find((term) => (
            content === term || (term.length >= 12 && content.includes(term))
          ));
          if (placeholder) {
            placeholderNodeIds.add(node.id);
            issues.push({
              code: "STALE_COMPONENT_COPY",
              severity: "error",
              nodeId: node.id,
              message: `Visible text still contains placeholder/default copy: "${String(node.characters).slice(0, 96)}".`,
            });
          }
          const forbidden = forbiddenTerms.find((term) => content.includes(term));
          if (forbidden) {
            forbiddenNodeIds.add(node.id);
            issues.push({
              code: "FORBIDDEN_PRODUCT_COPY",
              severity: "error",
              nodeId: node.id,
              message: `Visible text mentions forbidden ProductSpec content: "${forbidden}".`,
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
            message: `Visible text effective opacity is ${opacity.toFixed(2)}.`,
          });
        }
        const foregroundPaint = solidPaint(node.fills);
        const directScreenText = screens.includes(node.parent);
        const paintedImmediateParent = solidPaint(node.parent?.fills) !== null;
        if (foregroundPaint && (hasInstanceAncestor(node, root) || directScreenText || paintedImmediateParent)) {
          const background = nearestBackground(node, root);
          const foreground = blend(
            foregroundPaint.color,
            background,
            foregroundPaint.opacity * Math.min(1, opacity),
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
              message: `Visible text contrast is ${ratio.toFixed(2)}:1; expected at least ${requiredRatio}:1.`,
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
            message: `Text "${String(node.characters || "").slice(0, 72)}" extends outside ${screen.name}.`,
          });
        } else if (!insideImmediateParent(node)) {
          clippedNodeIds.add(node.id);
          issues.push({
            code: "TEXT_OUTSIDE_PARENT",
            severity: "error",
            nodeId: node.id,
            message: `Text "${String(node.characters || "").slice(0, 72)}" extends outside its immediate container ${node.parent.name}.`,
          });
        }
      }
    }
    if ("children" in node) {
      for (const child of node.children) visit(child);
    }
  };
  visit(root);

  for (let firstIndex = 0; firstIndex < visibleTopLevelInstances.length; firstIndex += 1) {
    const first = visibleTopLevelInstances[firstIndex];
    if (isDecorativeInstance(first.node)) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < visibleTopLevelInstances.length; secondIndex += 1) {
      const second = visibleTopLevelInstances[secondIndex];
      if (first.screen !== second.screen || isDecorativeInstance(second.node)) continue;
      const ratio = overlapRatio(first.bounds, second.bounds);
      if (ratio < 0.2 || intersectionArea(first.bounds, second.bounds) < 96) continue;
      const pair = [first.node.id, second.node.id].sort().join("::");
      if (componentOverlapPairs.has(pair)) continue;
      componentOverlapPairs.add(pair);
      issues.push({
        code: "ZDS_INSTANCE_OVERLAP",
        severity: "error",
        nodeId: first.node.id,
        message: `ZDS instances ${first.node.name} and ${second.node.name} overlap on ${first.screen.name}.`,
      });
    }
  }

  if (expectedScreenCount > 0 && screens.length !== expectedScreenCount) {
    issues.push({
      code: "SCREEN_COUNT_MISMATCH",
      severity: "error",
      nodeId: root.id,
      message: `Found ${screens.length}/${expectedScreenCount} mobile screens.`,
    });
  }
  if (prototypeLinkCount < expectedPrototypeLinks) {
    issues.push({
      code: "PROTOTYPE_LINKS_MISSING",
      severity: "error",
      nodeId: root.id,
      message: `Found ${prototypeLinkCount}/${expectedPrototypeLinks} prototype links.`,
    });
  }
  if (zdsInstanceCount === 0) {
    issues.push({
      code: "NO_ZDS_INSTANCES",
      severity: "error",
      nodeId: root.id,
      message: "No top-level ZDS component instances were found in the artifact.",
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
        componentDriftCount: componentDriftNodeIds.size,
        componentOverlapCount: componentOverlapPairs.size,
        undersizedTouchTargetCount: undersizedTouchTargetNodeIds.size,
        visitedNodes,
      },
      issues,
    },
  };
};
