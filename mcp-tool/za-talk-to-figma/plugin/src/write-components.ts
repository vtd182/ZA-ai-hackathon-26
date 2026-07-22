import type { PluginToolRequest, PluginToolResponse } from "./protocol";
import { getParentNode } from "./write-helpers";

export const handleWriteComponentRequest = async (
  request: PluginToolRequest,
): Promise<PluginToolResponse | null> => {
  switch (request.type) {
    case "instantiate_component": {
      const p = request.params || {};
      const parentId = typeof p.parentId === "string" ? p.parentId : undefined;
      const parent = await getParentNode(parentId);

      const resolveVariantComponent = async (): Promise<ComponentNode> => {
        if (typeof p.componentId === "string" && p.componentId) {
          const component = await figma.getNodeByIdAsync(p.componentId);
          if (!component) throw new Error(`Component not found: ${p.componentId}`);
          if (component.type !== "COMPONENT") throw new Error(`Node ${p.componentId} is not a COMPONENT`);
          return component;
        }

        if (typeof p.componentSetId !== "string" || !p.componentSetId) {
          throw new Error("componentId or componentSetId is required");
        }

        const componentSet = await figma.getNodeByIdAsync(p.componentSetId);
        if (!componentSet) throw new Error(`Component set not found: ${p.componentSetId}`);
        if (componentSet.type !== "COMPONENT_SET") {
          throw new Error(`Node ${p.componentSetId} is not a COMPONENT_SET`);
        }

        const requestedVariants = typeof p.variantProperties === "object" && p.variantProperties
          ? p.variantProperties as Record<string, unknown>
          : {};

        const matchingChild = componentSet.children.find((child) => {
          if (child.type !== "COMPONENT") return false;
          const variantProps = child.variantProperties || {};
          return Object.entries(requestedVariants).every(([key, value]) => variantProps[key] === value);
        });

        const fallback = componentSet.defaultVariant || componentSet.children.find((child) => child.type === "COMPONENT");
        if (!matchingChild && !fallback) {
          throw new Error(`Component set ${p.componentSetId} does not contain a concrete COMPONENT variant`);
        }
        return (matchingChild || fallback) as ComponentNode;
      };

      const component = await resolveVariantComponent();
      const instance = component.createInstance();
      if (p.x != null) instance.x = Number(p.x);
      if (p.y != null) instance.y = Number(p.y);
      (parent as any).appendChild(instance);
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
          variantProperties: component.variantProperties || null,
        },
      };
    }

    case "import_component_by_key": {
      const p = request.params || {};
      const key = typeof p.key === "string" ? p.key : null;
      if (!key) throw new Error("key is required");
      const parentId = typeof p.parentId === "string" ? p.parentId : undefined;
      const parent = await getParentNode(parentId);
      // importComponentByKeyAsync works cross-file ONLY when the source file has been
      // published as a Figma Team Library and this file has it enabled.
      // If the DS file is merely open in another tab (not published), this will throw.
      let component: ComponentNode;
      try {
        component = await figma.importComponentByKeyAsync(key);
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Cannot import component by key "${key}": ${raw}. ` +
          `REASON: importComponentByKeyAsync only works when the design system file is published as a Figma Team Library ` +
          `and enabled in this file (Resources > Libraries). ` +
          `WORKAROUND: (1) In the DS file, publish it as a team library (main menu > Libraries). ` +
          `(2) In this file, enable that library (Resources panel > Libraries). ` +
          `(3) Alternatively, use clone_node with the component ID and sessionId of the DS session to copy it within that file first.`
        );
      }
      const instance = component.createInstance();
      if (p.x != null) instance.x = Number(p.x);
      if (p.y != null) instance.y = Number(p.y);
      (parent as any).appendChild(instance);
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
          componentSetId: component.parent?.type === "COMPONENT_SET" ? component.parent.id : null,
          variantProperties: component.variantProperties ?? null,
        },
      };
    }

    case "swap_component": {
      const p = request.params || {};
      const nodeId = request.nodeIds && request.nodeIds[0];
      if (!nodeId) throw new Error("nodeId is required");
      if (!p.componentId) throw new Error("componentId is required");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error(`Node not found: ${nodeId}`);
      if (node.type !== "INSTANCE") throw new Error(`Node ${nodeId} is not a component INSTANCE`);
      const component = await figma.getNodeByIdAsync(p.componentId);
      if (!component) throw new Error(`Component not found: ${p.componentId}`);
      if (component.type !== "COMPONENT") throw new Error(`Node ${p.componentId} is not a COMPONENT`);
      node.mainComponent = component;
      figma.commitUndo();
      return {
        type: request.type,
        requestId: request.requestId,
        data: { id: node.id, name: node.name, componentId: component.id, componentName: component.name },
      };
    }

    case "detach_instance": {
      const nodeIds = request.nodeIds || [];
      if (nodeIds.length === 0) throw new Error("nodeIds is required");
      const results: any[] = [];
      for (const nid of nodeIds) {
        const n = await figma.getNodeByIdAsync(nid);
        if (!n) { results.push({ nodeId: nid, error: "Node not found" }); continue; }
        if (n.type !== "INSTANCE") { results.push({ nodeId: nid, error: "Node is not an INSTANCE" }); continue; }
        const frame = n.detachInstance();
        results.push({ nodeId: nid, newId: frame.id, name: frame.name });
      }
      figma.commitUndo();
      return {
        type: request.type,
        requestId: request.requestId,
        data: { results },
      };
    }

    case "delete_nodes": {
      const nodeIds = request.nodeIds || [];
      if (nodeIds.length === 0) throw new Error("nodeIds is required");
      const results: any[] = [];
      for (const nid of nodeIds) {
        const n = await figma.getNodeByIdAsync(nid);
        if (!n) { results.push({ nodeId: nid, error: "Node not found" }); continue; }
        n.remove();
        results.push({ nodeId: nid, deleted: true });
      }
      figma.commitUndo();
      return { type: request.type, requestId: request.requestId, data: { results } };
    }

    case "navigate_to_page": {
      const p = request.params || {};
      let page: PageNode | undefined;
      if (p.pageId) {
        const found = await figma.getNodeByIdAsync(p.pageId);
        if (!found) throw new Error(`Page not found: ${p.pageId}`);
        if (found.type !== "PAGE") throw new Error(`Node ${p.pageId} is not a PAGE`);
        page = found as PageNode;
      } else if (p.pageName) {
        page = figma.root.children.find(pg => pg.name === p.pageName) as PageNode | undefined;
        if (!page) throw new Error(`Page not found with name: ${p.pageName}`);
      } else {
        throw new Error("pageId or pageName is required");
      }
      await figma.setCurrentPageAsync(page);
      return {
        type: request.type,
        requestId: request.requestId,
        data: { id: page.id, name: page.name },
      };
    }

    case "group_nodes": {
      const p = request.params || {};
      const nodeIds = request.nodeIds || [];
      if (nodeIds.length === 0) throw new Error("nodeIds is required");
      const nodes = await Promise.all(nodeIds.map((id: string) => figma.getNodeByIdAsync(id)));
      const validNodes = nodes.filter((n): n is SceneNode => n !== null && n.type !== "DOCUMENT" && n.type !== "PAGE");
      if (validNodes.length === 0) throw new Error("No valid scene nodes found");
      const parent = validNodes[0].parent;
      if (!parent) throw new Error("Nodes must have a parent");
      const group = figma.group(validNodes, parent as any);
      if (p.name) group.name = p.name;
      figma.commitUndo();
      return {
        type: request.type,
        requestId: request.requestId,
        data: { id: group.id, name: group.name, type: group.type },
      };
    }

    case "ungroup_nodes": {
      const nodeIds = request.nodeIds || [];
      if (nodeIds.length === 0) throw new Error("nodeIds is required");
      const results: any[] = [];
      for (const nid of nodeIds) {
        const n = await figma.getNodeByIdAsync(nid);
        if (!n) { results.push({ nodeId: nid, error: "Node not found" }); continue; }
        if (n.type !== "GROUP") { results.push({ nodeId: nid, error: "Node is not a GROUP" }); continue; }
        const group = n as GroupNode;
        const parent = group.parent as any;
        const index = parent.children.indexOf(group);
        const childIds: string[] = [];
        for (const child of [...group.children]) {
          parent.insertChild(index, child as SceneNode);
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
};
