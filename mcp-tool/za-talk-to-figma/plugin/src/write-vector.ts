import { getBounds } from "./serializers";

import type { PluginToolRequest, PluginToolResponse } from "./runtime/protocol";

// resolveSceneNodes loads each id and asserts it is a SceneNode that lives on
// the canvas (has a parent). Throws on the first invalid id.
const resolveSceneNodes = async (nodeIds: string[]): Promise<SceneNode[]> => {
  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = await figma.getNodeByIdAsync(id);
    if (!node) throw new Error(`Node not found: ${id}`);
    if (!("parent" in node) || !node.parent) throw new Error(`Node ${id} is not placeable on the canvas`);
    nodes.push(node as SceneNode);
  }
  return nodes;
};

export const handleWriteVectorRequest = async (
  request: PluginToolRequest,
): Promise<PluginToolResponse | null> => {
  switch (request.type) {
    case "boolean_operation": {
      const p = request.params || {};
      const nodeIds = request.nodeIds || [];
      if (nodeIds.length < 2) throw new Error("boolean_operation requires at least 2 nodeIds");
      const operation = String(p.operation || "").toUpperCase();

      const nodes = await resolveSceneNodes(nodeIds);
      const parent = nodes[0].parent as (BaseNode & ChildrenMixin) | null;
      if (!parent) throw new Error("Selected nodes have no common parent");

      let result: BooleanOperationNode;
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
        data: { id: result.id, name: result.name, type: result.type, operation, bounds: getBounds(result) },
      };
    }

    case "flatten_node": {
      const p = request.params || {};
      const nodeIds = request.nodeIds || [];
      if (nodeIds.length === 0) throw new Error("flatten_node requires at least 1 nodeId");

      const nodes = await resolveSceneNodes(nodeIds);
      const parent = nodes[0].parent as (BaseNode & ChildrenMixin) | null;
      if (!parent) throw new Error("Selected nodes have no common parent");

      const result = figma.flatten(nodes, parent);
      if (p.name != null) result.name = String(p.name);

      figma.commitUndo();
      return {
        type: request.type,
        requestId: request.requestId,
        data: { id: result.id, name: result.name, type: result.type, bounds: getBounds(result) },
      };
    }

    default:
      return null;
  }
};
