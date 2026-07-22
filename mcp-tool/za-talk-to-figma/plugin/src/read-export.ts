import type { PluginToolRequest, PluginToolResponse } from "./protocol";

export const handleReadExportRequest = async (
  request: PluginToolRequest,
): Promise<PluginToolResponse | null> => {
  switch (request.type) {
    case "get_screenshot": {
      const format =
        request.params && request.params.format
          ? request.params.format
          : "PNG";
      const scale =
        request.params && request.params.scale != null
          ? request.params.scale
          : 2;
      let targetNodes: any[];
      if (request.nodeIds && request.nodeIds.length > 0) {
        const nodes = await Promise.all(
          request.nodeIds.map((id: string) => figma.getNodeByIdAsync(id)),
        );
        targetNodes = nodes.filter(
          (n) => n !== null && n.type !== "DOCUMENT" && n.type !== "PAGE",
        );
      } else {
        targetNodes = figma.currentPage.selection.slice();
      }
      if (targetNodes.length === 0)
        throw new Error(
          "No nodes to export. Select nodes or provide nodeIds.",
        );
      const exports = await Promise.all(
        targetNodes.map(async (node: any) => {
          const settings: any =
            format === "SVG"
              ? { format: "SVG" }
              : format === "PDF"
                ? { format: "PDF" }
                : format === "JPG"
                  ? {
                      format: "JPG",
                      constraint: { type: "SCALE", value: scale },
                    }
                  : {
                      format: "PNG",
                      constraint: { type: "SCALE", value: scale },
                    };
          const bytes = await node.exportAsync(settings);
          const base64 = figma.base64Encode(bytes);
          return {
            nodeId: node.id,
            nodeName: node.name,
            format,
            base64,
            width: node.width,
            height: node.height,
          };
        }),
      );
      return {
        type: request.type,
        requestId: request.requestId,
        data: { exports },
      };
    }

    case "export_node_as_svg": {
      const nodeId = request.nodeIds?.[0];
      if (!nodeId) throw new Error("nodeId is required");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error(`Node not found: ${nodeId}`);
      if (typeof (node as any).exportAsync !== "function")
        throw new Error(`Node ${nodeId} (type: ${node.type}) does not support export`);
      const bytes = await (node as any).exportAsync({ format: "SVG" });
      // Decode Uint8Array → UTF-8 SVG string so the caller can pass it to import_svg directly.
      const svgContent = new TextDecoder("utf-8").decode(bytes);
      return {
        type: request.type,
        requestId: request.requestId,
        data: {
          svgContent,
          nodeId: node.id,
          nodeName: (node as any).name ?? "",
          width: (node as any).width ?? 0,
          height: (node as any).height ?? 0,
        },
      };
    }

    case "export_frames_to_pdf": {
      const nodeIds: string[] = request.nodeIds ?? [];
      if (nodeIds.length === 0) {
        throw new Error("nodeIds is required and must not be empty");
      }
      const frames: any[] = [];
      for (const id of nodeIds) {
        const node = await figma.getNodeByIdAsync(id);
        if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
          throw new Error(`Node ${id} not found or is not exportable`);
        }
        const bytes = await (node as any).exportAsync({ format: "PDF" });
        const base64 = figma.base64Encode(bytes);
        frames.push({
          nodeId: node.id,
          nodeName: node.name,
          base64,
        });
      }
      return {
        type: request.type,
        requestId: request.requestId,
        data: { frames },
      };
    }

    default:
      return null;
  }
};
