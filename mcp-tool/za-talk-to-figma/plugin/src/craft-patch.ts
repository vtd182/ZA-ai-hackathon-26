import type { PluginToolRequest, PluginToolResponse, PluginToolParams } from "./runtime/protocol";
import { handleWriteCreateRequest } from "./write-create";
import { handleWriteModifyRequest } from "./write-modify";
import { handleWriteVectorRequest } from "./write-vector";
import { handleWriteStyleRequest } from "./write-styles";
import { handleWriteComponentRequest } from "./write-components";
import { handleWritePrototypeRequest } from "./write-prototype";

const SUPPORTED_OPERATIONS = new Set([
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
  "set_reactions",
]);

const CREATE_OPERATIONS = new Set([
  "create_frame",
  "create_rectangle",
  "create_ellipse",
  "create_text",
  "import_svg",
]);

const handlers = [
  handleWriteCreateRequest,
  handleWriteModifyRequest,
  handleWriteVectorRequest,
  handleWriteStyleRequest,
  handleWriteComponentRequest,
  handleWritePrototypeRequest,
];

const resolveAliases = (value: unknown, aliases: Map<string, string>): unknown => {
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

const isInside = (node: any, root: any): boolean => {
  let current = node;
  while (current) {
    if (current.id === root.id) return true;
    current = current.parent;
  }
  return false;
};

const assertInside = async (nodeId: string, root: any, label: string): Promise<void> => {
  const node = await figma.getNodeByIdAsync(nodeId) as any;
  if (!node || !isInside(node, root)) throw new Error(`${label} ${nodeId} is outside approved craft root ${root.id}`);
};

const createdNodeId = (response: PluginToolResponse): string | null => {
  const data = response.data as Record<string, unknown> | undefined;
  return typeof data?.id === "string" ? data.id : null;
};

export const handleCraftPatchRequest = async (
  request: PluginToolRequest,
): Promise<PluginToolResponse | null> => {
  if (request.type !== "apply_craft_patch") return null;
  const params = request.params || {};
  const rootNodeId = String(params.rootNodeId || "");
  const root = await figma.getNodeByIdAsync(rootNodeId) as any;
  if (!root || root.type === "DOCUMENT") throw new Error(`Craft root not found: ${rootNodeId}`);
  const operations = Array.isArray(params.operations) ? params.operations : [];
  if (operations.length === 0 || operations.length > 80) {
    throw new Error("operations must contain 1-80 craft operations");
  }

  const aliases = new Map<string, string>();
  const results: Array<Record<string, unknown>> = [];
  for (let index = 0; index < operations.length; index += 1) {
    const raw = operations[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`operations[${index}] must be an object`);
    const operation = raw as Record<string, unknown>;
    const type = String(operation.type || "");
    const alias = String(operation.id || "");
    if (!SUPPORTED_OPERATIONS.has(type)) throw new Error(`operations[${index}] uses unsupported type: ${type}`);
    if (!alias || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(alias)) {
      throw new Error(`operations[${index}].id must be a stable alias`);
    }
    if (aliases.has(alias)) throw new Error(`Duplicate craft patch alias: ${alias}`);

    const resolvedNodeIds = resolveAliases(
      Array.isArray(operation.nodeIds) ? operation.nodeIds : [],
      aliases,
    ) as string[];
    const resolvedParams = resolveAliases(
      operation.params && typeof operation.params === "object" ? operation.params : {},
      aliases,
    ) as PluginToolParams;

    if (CREATE_OPERATIONS.has(type)) {
      resolvedParams.parentId = resolvedParams.parentId || root.id;
      await assertInside(String(resolvedParams.parentId), root, "Parent");
    } else if (type === "clone_node") {
      resolvedParams.parentId = resolvedParams.parentId || root.id;
      await assertInside(String(resolvedParams.parentId), root, "Clone parent");
      if (resolvedNodeIds.length !== 1) throw new Error(`operations[${index}] clone_node requires one source nodeId`);
    } else {
      for (const nodeId of resolvedNodeIds) await assertInside(nodeId, root, "Target");
      if (type === "reparent_nodes") {
        await assertInside(String(resolvedParams.parentId || ""), root, "Reparent destination");
      }
      if (type === "set_reactions") {
        const reactions = Array.isArray(resolvedParams.reactions) ? resolvedParams.reactions : [];
        for (const reaction of reactions) {
          const actions = Array.isArray(reaction?.actions) ? reaction.actions : [];
          for (const action of actions) {
            if (action?.type === "NODE" && action.destinationId) {
              await assertInside(String(action.destinationId), root, "Prototype destination");
            }
          }
        }
      }
    }

    const childRequest = {
      type,
      requestId: `${request.requestId}:${index}`,
      nodeIds: resolvedNodeIds,
      params: resolvedParams,
    } as PluginToolRequest;
    let response: PluginToolResponse | null = null;
    for (const handler of handlers) {
      response = await handler(childRequest);
      if (response) break;
    }
    if (!response) throw new Error(`No handler for craft operation ${type}`);
    if (response.error) throw new Error(`operations[${index}] ${type} failed: ${response.error}`);
    const nodeId = createdNodeId(response) ?? resolvedNodeIds[0] ?? null;
    if (nodeId) aliases.set(alias, nodeId);
    results.push({ index, id: alias, type, nodeId, data: response.data ?? null });
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      rootNodeId: root.id,
      applied: results.length,
      aliases: Object.fromEntries(aliases),
      results,
    },
  };
};
