import { beforeEach, describe, expect, it } from "bun:test";
import { handleLifecycleArtifactRequest } from "./lifecycle-artifact";

let page: any;
let nextId: number;
let commitCount: number;

const metadataNode = (base: any) => {
  const data = new Map<string, string>();
  return {
    ...base,
    setPluginData(key: string, value: string) { data.set(key, value); },
    getPluginData(key: string) { return data.get(key) ?? ""; },
    remove() {
      const index = this.parent?.children.indexOf(this) ?? -1;
      if (index >= 0) this.parent.children.splice(index, 1);
    },
  };
};

const containerNode = (type: string) => {
  const node: any = metadataNode({
    id: `${type.toLowerCase()}:${nextId++}`,
    name: type,
    type,
    children: [],
    parent: null,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  node.appendChild = (child: any) => {
    child.parent = node;
    node.children.push(child);
  };
  node.resize = () => {};
  node.resizeWithoutConstraints = () => {};
  return node;
};

const request = (type: string, params: any) => ({ type, requestId: "req-1", nodeIds: [], params });

const preflight = () => ({
  schemaVersion: 1,
  source: {
    schemaVersion: 1,
    kind: "figma_design_system_plan",
    mode: "strict",
    target: { targetHash: "target-hash", pageId: "0:1" },
    metadata: {
      namespace: "za.pm-lifecycle/v1",
      runId: "RUN-1",
      threadId: "THREAD-1",
      actionId: "ACTION-1",
      specId: "SPEC-1",
      specVersion: 1,
      idempotencyKey: "figma:RUN-1:v1",
      targetHash: "target-hash",
    },
    screens: [{
      screenId: "SCREEN-MENU",
      name: "Menu",
      requirementIds: ["REQ-ORDER"],
      prototypeEdges: [],
    }],
  },
  resolvedSlots: [{
    screenId: "SCREEN-MENU",
    slotKey: "menu",
    componentKey: "component/menu",
    semanticRole: "menu-card",
    resolution: "component",
  }],
});

beforeEach(() => {
  nextId = 1;
  commitCount = 0;
  page = containerNode("PAGE");
  page.id = "0:1";
  page.selection = [];
  const component: any = metadataNode({
    id: "component:menu",
    key: "component/menu",
    name: "Menu Card",
    type: "COMPONENT",
    createInstance: () => metadataNode({ id: `instance:${nextId++}`, name: "Menu Card", type: "INSTANCE", parent: null }),
  });
  (globalThis as any).figma = {
    currentPage: page,
    root: {
      children: [{
        loadAsync: async () => {},
        findAllWithCriteria: () => [component],
      }],
    },
    createSection: () => containerNode("SECTION"),
    createFrame: () => containerNode("FRAME"),
    createText: () => metadataNode({ id: `text:${nextId++}`, name: "Text", type: "TEXT", parent: null }),
    loadFontAsync: async () => {},
    viewport: { scrollAndZoomIntoView: () => {} },
    importComponentByKeyAsync: async () => { throw new Error("not published"); },
    commitUndo: () => { commitCount += 1; },
  };
});

describe("lifecycle artifact plugin handlers", () => {
  it("applies once, stores metadata and reads back independently", async () => {
    const params = { preflightPlan: preflight(), planHash: "a".repeat(64), targetPageId: "0:1" };
    const applied = await handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", params) as any);
    const retried = await handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", params) as any);
    const read = await handleLifecycleArtifactRequest(request("read_lifecycle_artifact", {
      targetPageId: "0:1", idempotencyKey: "figma:RUN-1:v1",
    }) as any);

    expect(applied?.data.idempotent).toBe(false);
    expect(retried?.data.idempotent).toBe(true);
    expect(page.children).toHaveLength(1);
    expect(read?.data.screens[0].metadata.requirementIds).toEqual(["REQ-ORDER"]);
    expect(read?.data.screens[0].childSlots[0]).toMatchObject({ componentKey: "component/menu", semanticRole: "menu-card" });
    expect(commitCount).toBe(1);
  });

  it("rejects a mismatched page with zero writes", async () => {
    await expect(handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: preflight(), planHash: "a".repeat(64), targetPageId: "9:9",
    }) as any)).rejects.toThrow("TARGET_NOT_ALLOWED");
    expect(page.children).toHaveLength(0);
  });

  it("rolls back the artifact root when a strict component is unavailable", async () => {
    (globalThis as any).figma.root.children[0].findAllWithCriteria = () => [];
    await expect(handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: preflight(), planHash: "a".repeat(64), targetPageId: "0:1",
    }) as any)).rejects.toThrow("COMPONENT_UNAVAILABLE");
    expect(page.children).toHaveLength(0);
    expect(commitCount).toBe(0);
  });
});
