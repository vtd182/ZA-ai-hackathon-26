import { beforeEach, describe, expect, it } from "bun:test";
import { handleCraftPatchRequest } from "./craft-patch";

let nodes: Record<string, any>;
let sequence = 10;

const makeContainer = (id: string, type = "FRAME") => ({
  id,
  name: id,
  type,
  visible: true,
  opacity: 1,
  parent: null as any,
  children: [] as any[],
  appendChild(child: any) {
    child.parent = this;
    this.children.push(child);
    nodes[child.id] = child;
  },
});

const createdNode = (type: string) => ({
  ...makeContainer(`1:${sequence++}`, type),
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  fills: [],
  strokes: [],
  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  },
});

describe("apply_craft_patch", () => {
  let root: any;

  beforeEach(() => {
    sequence = 10;
    root = makeContainer("1:1", "SECTION");
    nodes = { [root.id]: root };
    (globalThis as any).figma = {
      currentPage: root,
      getNodeByIdAsync: async (id: string) => nodes[id] ?? null,
      createFrame: () => createdNode("FRAME"),
      createText: () => ({
        ...createdNode("TEXT"),
        characters: "",
        fontName: { family: "Inter", style: "Regular" },
        fontSize: 14,
      }),
      loadFontAsync: async () => {},
      commitUndo: () => {},
      mixed: Symbol("mixed"),
    };
  });

  it("resolves aliases and applies dependent operations in one request", async () => {
    const result = await handleCraftPatchRequest({
      type: "apply_craft_patch",
      requestId: "patch-1",
      nodeIds: [],
      params: {
        rootNodeId: root.id,
        operations: [
          {
            id: "screen",
            type: "create_frame",
            params: { parentId: root.id, name: "Login", width: 390, height: 844 },
          },
          {
            id: "title",
            type: "create_text",
            params: { parentId: "$screen", text: "Đăng nhập an toàn", x: 24, y: 80 },
          },
          {
            id: "title-copy",
            type: "set_text",
            nodeIds: ["$title"],
            params: { text: "Đăng nhập cùng Zalo" },
          },
        ],
      },
    } as any);

    const aliases = (result?.data as any).aliases;
    expect((result?.data as any).rootNodeId).toBe(root.id);
    expect((result?.data as any).applied).toBe(3);
    expect(typeof aliases.screen).toBe("string");
    expect(typeof aliases.title).toBe("string");
    expect({
      aliases,
      rootChildren: root.children.map((node: any) => ({ id: node.id, children: node.children?.map((child: any) => child.id) })),
    }).toEqual({
      aliases: {
        screen: aliases.screen,
        title: aliases.title,
        "title-copy": aliases.title,
      },
      rootChildren: [{ id: aliases.screen, children: [aliases.title] }],
    });
    const screen = root.children.find((node: any) => node.id === aliases.screen);
    const title = screen.children.find((node: any) => node.id === aliases.title);
    expect(title.characters).toBe("Đăng nhập cùng Zalo");
    expect(title.parent.id).toBe(aliases.screen);
  });

  it("rejects writes that escape the approved root", async () => {
    const outside = makeContainer("9:9");
    nodes[outside.id] = outside;
    await expect(handleCraftPatchRequest({
      type: "apply_craft_patch",
      requestId: "patch-2",
      nodeIds: [],
      params: {
        rootNodeId: root.id,
        operations: [{
          id: "bad",
          type: "create_frame",
          params: { parentId: outside.id },
        }],
      },
    } as any)).rejects.toThrow(/outside approved craft root/);
  });
});
