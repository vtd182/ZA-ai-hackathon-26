import { beforeEach, describe, expect, it } from "bun:test";
import { handleLifecycleArtifactRequest } from "./lifecycle-artifact";

let page: any;
let documentRoot: any;
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
    reactions: [],
  });
  node.appendChild = (child: any) => {
    child.parent = node;
    node.children.push(child);
  };
  node.resize = (width: number, height: number) => { node.width = width; node.height = height; };
  node.resizeWithoutConstraints = (width: number, height: number) => { node.width = width; node.height = height; };
  node.setReactionsAsync = async (reactions: any[]) => { node.reactions = reactions; };
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
    designDirection: {
      conceptName: "Quiet confidence",
      productPromise: "Keep important data safe without unnecessary interruption.",
      tone: "calm",
      density: "comfortable",
      palette: "trust-green",
      principles: [
        { title: "Safety at a glance", detail: "Show status immediately." },
        { title: "Reversible control", detail: "Keep every action understandable." },
      ],
    },
    metadata: {
      namespace: "za.pm-lifecycle/v1",
      runId: "RUN-1",
      threadId: "THREAD-1",
      actionId: "ACTION-1",
      specId: "SPEC-1",
      specVersion: 1,
      idempotencyKey: "figma:RUN-1:v1",
      artifactPageName: "PM · Remind backup · v1",
      targetHash: "target-hash",
    },
    screens: [{
      screenId: "SCREEN-MENU",
      name: "Menu",
      requirementIds: ["REQ-ORDER"],
      presentation: {
        archetype: "dashboard",
        eyebrow: "SYSTEM STATUS",
        headline: "Your data is safe",
        supportingText: "Latest backup and upcoming schedule.",
        navigationLabel: "Overview",
        sections: [{
          key: "backup-health",
          kind: "status",
          title: "Safe",
          body: "Last backup yesterday",
          tone: "success",
          items: [{ label: "Protected", value: "12.4 GB" }],
        }],
      },
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
  page.name = "Zalo Mini App Framework 2.0";
  page.selection = [];
  page.loadAsync = async () => {};
  const component: any = metadataNode({
    id: "component:menu",
    key: "component/menu",
    name: "Menu Card",
    type: "COMPONENT",
    createInstance: () => metadataNode({ id: `instance:${nextId++}`, name: "Menu Card", type: "INSTANCE", parent: null }),
  });
  page.findAllWithCriteria = () => [component];
  documentRoot = { children: [page] };
  (globalThis as any).figma = {
    currentPage: page,
    root: documentRoot,
    createPage: () => {
      const output = containerNode("PAGE");
      output.name = "Page";
      output.selection = [];
      output.loadAsync = async () => {};
      output.findAllWithCriteria = () => [];
      output.remove = () => {
        const index = documentRoot.children.indexOf(output);
        if (index >= 0) documentRoot.children.splice(index, 1);
      };
      documentRoot.children.push(output);
      return output;
    },
    createSection: () => containerNode("SECTION"),
    createFrame: () => containerNode("FRAME"),
    createText: () => {
      const text: any = metadataNode({ id: `text:${nextId++}`, name: "Text", type: "TEXT", parent: null });
      text.resize = (width: number, height: number) => { text.width = width; text.height = height; };
      return text;
    },
    createRectangle: () => {
      const rectangle: any = metadataNode({ id: `rectangle:${nextId++}`, name: "Rectangle", type: "RECTANGLE", parent: null });
      rectangle.resize = (width: number, height: number) => { rectangle.width = width; rectangle.height = height; };
      return rectangle;
    },
    createEllipse: () => {
      const ellipse: any = metadataNode({ id: `ellipse:${nextId++}`, name: "Ellipse", type: "ELLIPSE", parent: null });
      ellipse.resize = (width: number, height: number) => { ellipse.width = width; ellipse.height = height; };
      return ellipse;
    },
    loadFontAsync: async () => {},
    viewport: { scrollAndZoomIntoView: () => {} },
    importComponentByKeyAsync: async () => { throw new Error("not published"); },
    getNodeByIdAsync: async (id: string) => {
      const visit = (node: any): any => {
        if (node.id === id) return node;
        for (const child of node.children ?? []) {
          const found = visit(child);
          if (found) return found;
        }
        return null;
      };
      for (const candidate of documentRoot.children) {
        const found = visit(candidate);
        if (found) return found;
      }
      return null;
    },
    commitUndo: () => { commitCount += 1; },
  };
});

describe("lifecycle artifact plugin handlers", () => {
  it("applies once, stores metadata and reads back independently", async () => {
    const params = { preflightPlan: preflight(), planHash: "a".repeat(64), targetPageId: "0:1" };
    const applied = await handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", params) as any);
    const retried = await handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", params) as any);
    const read = await handleLifecycleArtifactRequest(request("read_lifecycle_artifact", {
      targetPageId: "0:1", idempotencyKey: "figma:RUN-1:v1", rootNodeId: applied?.data.rootNodeIds[0],
    }) as any);

    expect(applied?.data.idempotent).toBe(false);
    expect(retried?.data.idempotent).toBe(true);
    expect(page.children).toHaveLength(0);
    expect(documentRoot.children).toHaveLength(2);
    expect(applied?.data).toMatchObject({
      artifactPageName: "PM · Remind backup · v1",
      artifactPageId: documentRoot.children[1].id,
    });
    expect(read?.data).toMatchObject({
      designConceptName: "Quiet confidence",
    });
    expect(read?.data.screens[0]).toMatchObject({
      archetype: "dashboard",
      sectionKeys: ["backup-health"],
    });
    expect(read?.data.screens[0].metadata.requirementIds).toEqual(["REQ-ORDER"]);
    expect(read?.data.screens[0].childSlots[0]).toMatchObject({ componentKey: "component/menu", semanticRole: "menu-card" });
    expect(commitCount).toBe(1);

    const outputRoot = documentRoot.children[1].children[0];
    const visit = (node: any): any[] => [node, ...(node.children ?? []).flatMap(visit)];
    const renderedNodes = visit(outputRoot);
    renderedNodes.find((node) => node.getPluginData?.("za-pm-lifecycle").includes("presentation_section"))?.remove();
    renderedNodes.find((node) => node.getPluginData?.("za-pm-lifecycle").includes("design_brief"))?.remove();
    const tampered = await handleLifecycleArtifactRequest(request("read_lifecycle_artifact", {
      targetPageId: "0:1", idempotencyKey: "figma:RUN-1:v1",
    }) as any);
    expect(tampered?.data.designConceptName).toBe("");
    expect(tampered?.data.screens[0].sectionKeys).toEqual([]);
  });

  it("can draw a free-creative artifact directly on the selected target page", async () => {
    page.name = "Free sketch";
    const prepared = preflight();
    prepared.source.mode = "free";
    prepared.source.metadata.pageStrategy = "use_target_page";
    prepared.source.metadata.artifactPageName = "Should not rename";
    prepared.resolvedSlots = [{
      screenId: "SCREEN-MENU",
      slotKey: "menu",
      componentKey: null,
      componentBinding: null,
      semanticRole: null,
      resolution: "primitive_fallback",
    }];

    const applied = await handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: prepared,
      planHash: "c".repeat(64),
      targetPageId: "0:1",
    }) as any);

    expect(documentRoot.children).toHaveLength(1);
    expect(applied?.data.artifactPageId).toBe("0:1");
    expect(applied?.data.artifactPageName).toBe("Free sketch");
    expect(page.name).toBe("Free sketch");
    expect(page.children).toHaveLength(1);
    expect(JSON.parse(page.children[0].getPluginData("za-pm-lifecycle"))).toMatchObject({
      pageStrategy: "use_target_page",
      artifactPageId: "0:1",
      artifactPageName: "Free sketch",
      applyStatus: "complete",
    });
  });

  it("recovers only an incomplete agent-owned artifact page", async () => {
    const stalePage = (globalThis as any).figma.createPage();
    stalePage.name = "PM · Remind backup · v1";
    const staleRoot = containerNode("SECTION");
    staleRoot.setPluginData("za-pm-lifecycle", JSON.stringify({
      namespace: "za.pm-lifecycle/v1",
      kind: "artifact_root",
      specId: "SPEC-1",
      specVersion: 1,
      idempotencyKey: "figma:stale",
      planHash: "b".repeat(64),
      applyStatus: "in_progress",
    }));
    stalePage.appendChild(staleRoot);
    const interruptedScreen = containerNode("FRAME");
    interruptedScreen.setPluginData("za-pm-lifecycle", JSON.stringify({
      namespace: "za.pm-lifecycle/v1",
      kind: "screen",
      screenId: "SCREEN-MENU",
    }));
    staleRoot.appendChild(interruptedScreen);
    const prepared = preflight();
    prepared.source.metadata.pageStrategy = "create_or_reuse_managed";
    prepared.source.metadata.idempotencyKey = "figma:RUN-1:creative-new";

    const applied = await handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: prepared,
      planHash: "c".repeat(64),
      targetPageId: "0:1",
    }) as any);

    expect(documentRoot.children).toHaveLength(2);
    expect(applied?.data.artifactPageId).toBe(stalePage.id);
    expect(stalePage.children).toHaveLength(1);
    expect(stalePage.children[0]).not.toBe(staleRoot);
  });

  it("preserves prior versions on the same managed product Page at the Figma Starter limit", async () => {
    const managedPage = (globalThis as any).figma.createPage();
    managedPage.name = "PM · Remind backup · v2";
    const priorRoot = containerNode("SECTION");
    priorRoot.x = 0;
    priorRoot.resizeWithoutConstraints(1_200, 1_020);
    priorRoot.setPluginData("za-pm-lifecycle", JSON.stringify({
      namespace: "za.pm-lifecycle/v1",
      kind: "artifact_root",
      specId: "SPEC-OLD",
      specVersion: 2,
      idempotencyKey: "figma:old:v2",
      planHash: "b".repeat(64),
      applyStatus: "complete",
    }));
    const priorScreen = containerNode("FRAME");
    priorScreen.setPluginData("za-pm-lifecycle", JSON.stringify({
      namespace: "za.pm-lifecycle/v1",
      kind: "screen",
      screenId: "SCREEN-OLD",
    }));
    priorRoot.appendChild(priorScreen);
    managedPage.appendChild(priorRoot);
    const unrelatedPage = (globalThis as any).figma.createPage();
    unrelatedPage.name = "EXP · Login craft";
    (globalThis as any).figma.createPage = () => {
      throw new Error("In CreatePage: The Starter Plan Only Comes With 3 Pages. Upgrade To Professional For Unlimited Pages");
    };
    const prepared = preflight();
    prepared.source.metadata.pageStrategy = "create_or_reuse_managed";

    const applied = await handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: prepared,
      planHash: "c".repeat(64),
      targetPageId: "0:1",
    }) as any);

    expect(documentRoot.children).toHaveLength(3);
    expect(applied?.data.artifactPageId).toBe(managedPage.id);
    expect(managedPage.name).toBe("PM · Remind backup · v1");
    expect(managedPage.children).toHaveLength(2);
    expect(managedPage.children[0]).toBe(priorRoot);
    expect(managedPage.children[1].x).toBeGreaterThan(priorRoot.x + priorRoot.width);
    expect(JSON.parse(managedPage.children[1].getPluginData("za-pm-lifecycle"))).toMatchObject({
      reusedManagedPageAtCapacity: true,
      applyStatus: "complete",
    });
  });

  it("refuses to reuse a managed Page containing user-authored nodes at the Page limit", async () => {
    const mixedPage = (globalThis as any).figma.createPage();
    mixedPage.name = "PM · Remind backup · v2";
    const managedRoot = containerNode("SECTION");
    managedRoot.setPluginData("za-pm-lifecycle", JSON.stringify({
      namespace: "za.pm-lifecycle/v1",
      kind: "artifact_root",
      specId: "SPEC-OLD",
      specVersion: 2,
      idempotencyKey: "figma:old:v2",
      applyStatus: "complete",
    }));
    mixedPage.appendChild(managedRoot);
    mixedPage.appendChild(containerNode("FRAME"));
    const unrelatedPage = (globalThis as any).figma.createPage();
    unrelatedPage.name = "EXP · Login craft";
    (globalThis as any).figma.createPage = () => {
      throw new Error("In CreatePage: The Starter Plan Only Comes With 3 Pages. Upgrade To Professional For Unlimited Pages");
    };
    const prepared = preflight();
    prepared.source.metadata.pageStrategy = "create_or_recover_incomplete";

    await expect(handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: prepared,
      planHash: "c".repeat(64),
      targetPageId: "0:1",
    }) as any)).rejects.toThrow("FIGMA_PAGE_LIMIT");

    expect(mixedPage.children).toHaveLength(2);
    expect(mixedPage.name).toBe("PM · Remind backup · v2");
  });

  it("rejects an interrupted artifact read and rebuilds the same page on retry", async () => {
    const interruptedPage = (globalThis as any).figma.createPage();
    interruptedPage.name = "PM · Remind backup · v1";
    const interruptedRoot = containerNode("SECTION");
    interruptedRoot.setPluginData("za-pm-lifecycle", JSON.stringify({
      namespace: "za.pm-lifecycle/v1",
      kind: "artifact_root",
      specId: "SPEC-1",
      specVersion: 1,
      idempotencyKey: "figma:RUN-1:v1",
      planHash: "old-plan",
      applyStatus: "in_progress",
      expectedScreenIds: ["SCREEN-MENU", "SCREEN-DETAIL"],
      expectedScreenCount: 2,
    }));
    interruptedPage.appendChild(interruptedRoot);
    const partialScreen = containerNode("FRAME");
    partialScreen.setPluginData("za-pm-lifecycle", JSON.stringify({
      namespace: "za.pm-lifecycle/v1",
      kind: "screen",
      screenId: "SCREEN-MENU",
    }));
    interruptedRoot.appendChild(partialScreen);

    await expect(handleLifecycleArtifactRequest(request("read_lifecycle_artifact", {
      targetPageId: "0:1",
      idempotencyKey: "figma:RUN-1:v1",
      rootNodeId: interruptedRoot.id,
    }) as any)).rejects.toThrow("ARTIFACT_INCOMPLETE");

    const retryPlan = preflight();
    retryPlan.source.screens.push({
      ...structuredClone(retryPlan.source.screens[0]),
      screenId: "SCREEN-DETAIL",
      name: "Detail",
    });
    retryPlan.resolvedSlots.push({
      ...structuredClone(retryPlan.resolvedSlots[0]),
      screenId: "SCREEN-DETAIL",
      slotKey: "detail",
    });
    const applied = await handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: retryPlan,
      planHash: "new-plan",
      targetPageId: "0:1",
    }) as any);
    const read = await handleLifecycleArtifactRequest(request("read_lifecycle_artifact", {
      targetPageId: "0:1",
      idempotencyKey: "figma:RUN-1:v1",
      rootNodeId: applied?.data.rootNodeIds[0],
    }) as any);

    expect(applied?.data.idempotent).toBe(false);
    expect(applied?.data.artifactPageId).toBe(interruptedPage.id);
    expect(documentRoot.children).toHaveLength(2);
    expect(read?.data.applyStatus).toBe("complete");
    expect(read?.data.screens.map((screen: any) => screen.screenId).sort()).toEqual([
      "SCREEN-DETAIL",
      "SCREEN-MENU",
    ]);
  });

  it("rejects a mismatched page with zero writes", async () => {
    await expect(handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: preflight(), planHash: "a".repeat(64), targetPageId: "9:9",
    }) as any)).rejects.toThrow("TARGET_NOT_ALLOWED");
    expect(page.children).toHaveLength(0);
    expect(documentRoot.children).toHaveLength(1);
  });

  it("uses the allowlisted ZDS source while the user views an output page", async () => {
    const viewedPage = (globalThis as any).figma.createPage();
    viewedPage.name = "PM · Previous output · v1";
    (globalThis as any).figma.currentPage = viewedPage;

    const applied = await handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: preflight(), planHash: "a".repeat(64), targetPageId: "0:1",
    }) as any);

    expect(applied?.data.idempotent).toBe(false);
    expect(page.children).toHaveLength(0);
    expect(documentRoot.children).toHaveLength(3);
  });

  it("clones an allowlisted same-file ZDS instance and proves instance-backed read-back", async () => {
    const source: any = metadataNode({
      id: "411:20533",
      name: "[ZDS] Button / Solid",
      type: "INSTANCE",
      parent: null,
      children: [],
      findAllWithCriteria: () => [],
    });
    source.clone = () => metadataNode({
      id: `instance:${nextId++}`,
      name: source.name,
      type: "INSTANCE",
      parent: null,
      children: [],
      findAllWithCriteria: () => [],
    });
    page.appendChild(source);
    const instancePreflight = preflight();
    instancePreflight.resolvedSlots[0].componentKey = "same-file:0:1:411:20533:primary-button";
    (instancePreflight.resolvedSlots[0] as any).componentBinding = {
      kind: "same_file_instance",
      nodeId: "411:20533",
      pageId: "0:1",
    };

    const applied = await handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: instancePreflight,
      planHash: "b".repeat(64),
      targetPageId: "0:1",
    }) as any);
    const read = await handleLifecycleArtifactRequest(request("read_lifecycle_artifact", {
      targetPageId: "0:1",
      idempotencyKey: "figma:RUN-1:v1",
      rootNodeId: applied?.data.rootNodeIds[0],
    }) as any);

    expect(read?.data.screens[0].childSlots[0]).toMatchObject({
      componentBinding: { kind: "same_file_instance", nodeId: "411:20533", pageId: "0:1" },
      instanceBacked: true,
      primitiveFallback: false,
    });
    expect(page.children).toHaveLength(1);
    expect(documentRoot.children).toHaveLength(2);
  });

  it("creates real prototype reactions and derives edges from rendered nodes", async () => {
    const flowPreflight = preflight();
    flowPreflight.source.screens[0].prototypeEdges = [{
      key: "edge:SCREEN-MENU:SCREEN-DETAIL",
      fromScreenId: "SCREEN-MENU",
      toScreenId: "SCREEN-DETAIL",
      trigger: "on_tap",
      action: "navigate",
    }];
    flowPreflight.source.screens.push({
      ...structuredClone(flowPreflight.source.screens[0]),
      screenId: "SCREEN-DETAIL",
      name: "Detail",
      prototypeEdges: [],
    });
    flowPreflight.resolvedSlots.push({
      ...structuredClone(flowPreflight.resolvedSlots[0]),
      screenId: "SCREEN-DETAIL",
      slotKey: "detail",
    });

    const applied = await handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: flowPreflight,
      planHash: "c".repeat(64),
      targetPageId: "0:1",
    }) as any);
    const read = await handleLifecycleArtifactRequest(request("read_lifecycle_artifact", {
      targetPageId: "0:1",
      idempotencyKey: "figma:RUN-1:v1",
      rootNodeId: applied?.data.rootNodeIds[0],
    }) as any);

    expect(read?.data.prototypeEdges).toEqual(flowPreflight.source.screens[0].prototypeEdges);
    const artifactRoot = documentRoot.children[1].children[0];
    const sourceFrame = artifactRoot.children.find((node: any) =>
      node.getPluginData("za-pm-lifecycle").includes('"screenId":"SCREEN-MENU"'),
    );
    expect(sourceFrame.reactions[0].actions[0]).toMatchObject({
      type: "NODE",
      navigation: "NAVIGATE",
    });
    sourceFrame.reactions = [];
    const tampered = await handleLifecycleArtifactRequest(request("read_lifecycle_artifact", {
      targetPageId: "0:1", idempotencyKey: "figma:RUN-1:v1",
    }) as any);
    expect(tampered?.data.prototypeEdges).toEqual([]);
  });

  it("maps rich prototype effects (trigger, action, transition) to real Figma reactions", async () => {
    const flowPreflight = preflight();
    flowPreflight.source.screens[0].prototypeEdges = [{
      key: "edge:SCREEN-MENU:SCREEN-DETAIL",
      fromScreenId: "SCREEN-MENU",
      toScreenId: "SCREEN-DETAIL",
      trigger: "after_delay",
      action: "open_overlay",
      delayMs: 800,
      transition: { type: "push", direction: "left", durationMs: 300, easing: "ease_in_out" },
    }];
    flowPreflight.source.screens.push({
      ...structuredClone(flowPreflight.source.screens[0]),
      screenId: "SCREEN-DETAIL",
      name: "Detail",
      prototypeEdges: [],
    });
    flowPreflight.resolvedSlots.push({
      ...structuredClone(flowPreflight.resolvedSlots[0]),
      screenId: "SCREEN-DETAIL",
      slotKey: "detail",
    });

    const applied = await handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: flowPreflight,
      planHash: "d".repeat(64),
      targetPageId: "0:1",
    }) as any);
    expect(applied?.error).toBeFalsy();
    const artifactRoot = documentRoot.children[1].children[0];
    const sourceFrame = artifactRoot.children.find((node: any) =>
      node.getPluginData("za-pm-lifecycle").includes('"screenId":"SCREEN-MENU"'),
    );
    const reaction = sourceFrame.reactions[0];
    expect(reaction.trigger).toMatchObject({ type: "AFTER_TIMEOUT", timeout: 0.8 });
    expect(reaction.actions[0]).toMatchObject({
      type: "NODE",
      navigation: "OVERLAY",
      transition: { type: "PUSH", direction: "LEFT" },
    });
  });

  it("rolls back the artifact root when a strict component is unavailable", async () => {
    page.findAllWithCriteria = () => [];
    await expect(handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: preflight(), planHash: "a".repeat(64), targetPageId: "0:1",
    }) as any)).rejects.toThrow("COMPONENT_UNAVAILABLE");
    expect(page.children).toHaveLength(0);
    expect(documentRoot.children).toHaveLength(1);
    expect(commitCount).toBe(0);
  });

  it("renders a creative blueprint with free primitives and ZDS-backed controls", async () => {
    const creative = preflight();
    creative.source.creativeBlueprint = {
      schemaVersion: 1,
      conceptName: "Lunch without the queue",
      productPromise: "Order quickly and collect with confidence.",
      visualNarrative: "A product-specific menu moment.",
      principles: ["Clear food hierarchy", "Confident action"],
      screens: [{
        screenId: "SCREEN-MENU",
        name: "Menu",
        purpose: "Choose lunch",
        requirementIds: ["REQ-ORDER"],
        width: 390,
        height: 844,
        background: "#F7F9FC",
        presentationNote: "Menu-first composition",
        elements: [
          {
            id: "root-menu", kind: "frame", parentId: null, name: "Menu composition", x: 0, y: 0,
            width: 390, height: 844, layout: "vertical", gap: 16,
            paddingTop: 24, paddingRight: 20, paddingBottom: 24, paddingLeft: 20,
            fill: "#F7F9FC", stroke: null, strokeWidth: 0, radius: 0, opacity: 1,
            text: null, fontSize: null, fontWeight: null, textAlign: null,
            componentRole: null, componentText: null, layoutGrow: 0,
          },
          {
            id: "menu-visual", kind: "rectangle", parentId: "root-menu", name: "Featured meal visual", x: null, y: null,
            width: 350, height: 220, layout: "none", gap: 0,
            paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
            fill: "#EAF3FF", stroke: null, strokeWidth: 0, radius: 20, opacity: 1,
            text: null, fontSize: null, fontWeight: null, textAlign: null,
            componentRole: null, componentText: null, layoutGrow: 0,
          },
          {
            id: "menu-title", kind: "text", parentId: "root-menu", name: "Menu headline", x: null, y: null,
            width: 350, height: 64, layout: "none", gap: 0,
            paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
            fill: "#101828", stroke: null, strokeWidth: 0, radius: 0, opacity: 1,
            text: "Bữa trưa ngon, không cần xếp hàng", fontSize: 28, fontWeight: "bold", textAlign: "left",
            componentRole: null, componentText: null, layoutGrow: 0,
          },
          {
            id: "menu", kind: "component", parentId: "root-menu", name: "ZDS menu card", x: null, y: null,
            width: 350, height: 72, layout: "none", gap: 0,
            paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
            fill: null, stroke: null, strokeWidth: 0, radius: 0, opacity: 1,
            text: null, fontSize: null, fontWeight: null, textAlign: null,
            componentRole: "menu-card", componentText: "Cơm gà nướng · còn 12 suất", layoutGrow: 0,
          },
        ],
      }],
      prototypeEdges: [],
    };

    const applied = await handleLifecycleArtifactRequest(request("apply_lifecycle_artifact_plan", {
      preflightPlan: creative,
      planHash: "d".repeat(64),
      targetPageId: "0:1",
    }) as any);
    const read = await handleLifecycleArtifactRequest(request("read_lifecycle_artifact", {
      targetPageId: "0:1",
      idempotencyKey: "figma:RUN-1:v1",
      rootNodeId: applied?.data.rootNodeIds[0],
    }) as any);

    expect(read?.data.designConceptName).toBe("Lunch without the queue");
    expect(read?.data.screens[0].childSlots[0]).toMatchObject({
      slotKey: "menu",
      semanticRole: "menu-card",
      instanceBacked: true,
    });
    expect(read?.data.screens[0].creativeMetrics).toEqual({
      elementCount: 4,
      instanceCount: 1,
      primitiveCount: 2,
      textCount: 1,
    });
    const artifactRoot = documentRoot.children[1].children[0];
    const screen = artifactRoot.children.find((node: any) => node.getPluginData?.("za-pm-lifecycle").includes('"kind":"screen"'));
    expect(screen.children.some((node: any) => node.type === "RECTANGLE")).toBe(true);
    expect(screen.children.some((node: any) => node.type === "TEXT")).toBe(true);
  });
});
