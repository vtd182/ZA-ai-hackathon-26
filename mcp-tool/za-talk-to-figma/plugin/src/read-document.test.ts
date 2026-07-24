import { beforeEach, describe, expect, it } from "bun:test";
import { handleReadDocumentRequest } from "./read-document";

const request = (type: any, params: any = {}, nodeIds: string[] = []) => ({
  type,
  requestId: "req-read",
  params,
  nodeIds,
});

describe("design-system instance discovery", () => {
  let page: any;
  let button: any;

  beforeEach(() => {
    const primaryLabel = { id: "text:1", name: "Primary", type: "TEXT", characters: "Primary" };
    const parent: any = {
      id: "frame:1",
      name: "Input Field - MP",
      type: "FRAME",
      parent: null,
      children: [],
    };
    button = {
      id: "411:20533",
      name: "[ZDS] Button / Solid",
      type: "INSTANCE",
      parent,
      visible: true,
      opacity: 1,
      children: [],
      x: 0,
      y: 0,
      width: 120,
      height: 48,
      getMainComponentAsync: async () => ({
        id: "component:button",
        name: "[ZDS] Button / Solid",
        key: "button-key",
      }),
    };
    primaryLabel.parent = parent;
    parent.children = [primaryLabel, button];
    page = {
      id: "0:1",
      name: "Page 1",
      type: "PAGE",
      parent: { id: "document:1", name: "Document", type: "DOCUMENT", parent: null },
      selection: [],
      findAllWithCriteria: () => [
        button,
        {
          id: "411:20597",
          name: "Signal",
          type: "INSTANCE",
          parent,
          getMainComponentAsync: async () => null,
        },
      ],
    };
    parent.parent = page;
    (globalThis as any).figma = {
      currentPage: page,
      getNodeByIdAsync: async (id: string) => id === page.id ? page : id === button.id ? button : null,
      ui: { postMessage: () => {} },
    };
  });

  it("finds copied ZDS instances without a deep DFS and keeps nearby variant labels", async () => {
    const result = await handleReadDocumentRequest(request("discover_design_system_instances", {
      nodeId: "0:1",
      maxInstances: 20,
    }) as any);

    expect(result?.data).toMatchObject({
      count: 1,
      instances: [{
        id: "411:20533",
        name: "[ZDS] Button / Solid",
        pageId: "0:1",
        mainComponentKey: "button-key",
        contextLabels: ["Primary"],
      }],
    });
  });

  it("keeps compact reads usable when copied component properties throw", async () => {
    Object.defineProperty(button, "componentProperties", {
      get() {
        throw new Error("Component set for node has existing errors");
      },
    });

    const result = await handleReadDocumentRequest(request(
      "get_node_context",
      { detail: "compact", depth: 1, compactInstances: true },
      [button.id],
    ) as any);

    expect(result?.data).toMatchObject({
      id: "411:20533",
      mainComponentKey: "button-key",
      componentPropertiesError: "Component set for node has existing errors",
    });
  });
});
