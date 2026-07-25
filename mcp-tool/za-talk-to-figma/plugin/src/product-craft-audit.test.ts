import { beforeEach, describe, expect, it } from "bun:test";
import { handleProductCraftAuditRequest } from "./product-craft-audit";

const request = (params: Record<string, unknown>) => ({
  type: "audit_product_craft",
  requestId: "audit-1",
  params,
  nodeIds: [],
});

const bounds = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe("product craft audit", () => {
  let root: any;
  let screen: any;

  beforeEach(() => {
    root = {
      id: "1:1",
      name: "Artifact",
      type: "SECTION",
      visible: true,
      opacity: 1,
      children: [],
    };
    screen = {
      id: "1:2",
      name: "Login",
      type: "FRAME",
      visible: true,
      opacity: 1,
      width: 390,
      height: 844,
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
      absoluteBoundingBox: bounds(0, 0, 390, 844),
      parent: root,
      children: [],
    };
    root.children = [screen];
    (globalThis as any).figma = {
      getNodeByIdAsync: async (id: string) => id === root.id ? root : null,
    };
  });

  it("passes a clean product screen with ZDS and a real prototype link", async () => {
    const title = {
      id: "1:3",
      name: "Title",
      type: "TEXT",
      characters: "Đăng nhập bằng Zalo",
      visible: true,
      opacity: 1,
      fills: [{ type: "SOLID", color: { r: 0.06, g: 0.09, b: 0.16 } }],
      fontSize: 24,
      absoluteBoundingBox: bounds(24, 80, 260, 40),
      parent: screen,
    };
    const button = {
      id: "1:4",
      name: "[ZDS] Button",
      type: "INSTANCE",
      visible: true,
      opacity: 1,
      parent: screen,
      children: [],
      reactions: [{
        trigger: { type: "ON_CLICK" },
        actions: [{ type: "NODE", destinationId: "1:9" }],
      }],
    };
    const logoBackground = {
      id: "1:5",
      name: "Logo background",
      type: "RECTANGLE",
      visible: true,
      opacity: 1,
      fills: [{ type: "SOLID", color: { r: 0, g: 0.42, b: 0.96 } }],
      absoluteBoundingBox: bounds(24, 140, 48, 48),
      parent: screen,
    };
    const logoText = {
      id: "1:6",
      name: "Logo text",
      type: "TEXT",
      characters: "ZP",
      visible: true,
      opacity: 1,
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
      fontSize: 20,
      absoluteBoundingBox: bounds(34, 152, 28, 24),
      parent: screen,
    };
    screen.children = [title, logoBackground, logoText, button];

    const result = await handleProductCraftAuditRequest(request({
      rootNodeId: root.id,
      expectedScreenCount: 1,
      expectedPrototypeLinks: 1,
      forbiddenTerms: ["payment"],
    }) as any);

    expect(result?.data).toMatchObject({
      passed: true,
      metrics: {
        screenCount: 1,
        zdsInstanceCount: 1,
        prototypeLinkCount: 1,
      },
      issues: [],
    });
  });

  it("blocks visible component defaults, forbidden copy and clipped text", async () => {
    const stale = {
      id: "1:3",
      name: "Default",
      type: "TEXT",
      characters: "Có 3 level button cơ bản: Primary, Secondary, Tertiary",
      visible: true,
      opacity: 1,
      absoluteBoundingBox: bounds(360, 80, 220, 40),
      parent: screen,
    };
    const forbidden = {
      id: "1:4",
      name: "Old scope",
      type: "TEXT",
      characters: "Thanh toán bằng ví",
      visible: true,
      opacity: 0.2,
      absoluteBoundingBox: bounds(24, 140, 200, 40),
      parent: screen,
    };
    const button = {
      id: "1:5",
      name: "[ZDS] Button",
      type: "INSTANCE",
      visible: true,
      opacity: 1,
      parent: screen,
      children: [],
      reactions: [],
    };
    const lowContrast = {
      id: "1:6",
      name: "Consent label",
      type: "TEXT",
      characters: "Tôi đồng ý chia sẻ hồ sơ",
      visible: true,
      opacity: 1,
      fills: [{ type: "SOLID", color: { r: 0.88, g: 0.9, b: 0.92 } }],
      fontSize: 14,
      absoluteBoundingBox: bounds(24, 210, 220, 40),
      parent: screen,
    };
    const clippingCard = {
      id: "1:7",
      name: "Clipping card",
      type: "FRAME",
      visible: true,
      opacity: 1,
      width: 120,
      height: 60,
      absoluteBoundingBox: bounds(20, 260, 120, 60),
      parent: screen,
      children: [],
    };
    const clippedInCard = {
      id: "1:8",
      name: "Clipped card title",
      type: "TEXT",
      characters: "Nội dung bị cắt trong card",
      visible: true,
      opacity: 1,
      x: 20,
      y: 10,
      width: 120,
      height: 24,
      absoluteBoundingBox: bounds(40, 270, 120, 24),
      parent: clippingCard,
    };
    clippingCard.children = [clippedInCard];
    screen.children = [stale, forbidden, lowContrast, clippingCard, button];

    const result = await handleProductCraftAuditRequest(request({
      rootNodeId: root.id,
      expectedScreenCount: 1,
      expectedPrototypeLinks: 1,
      forbiddenTerms: ["thanh toán"],
    }) as any);

    expect(result?.data.passed).toBe(false);
    expect(result?.data.metrics).toMatchObject({
      staleCopyCount: 1,
      forbiddenCopyCount: 1,
      clippedTextCount: 2,
      lowVisibilityTextCount: 2,
    });
    expect(result?.data.issues.map((issue: any) => issue.code)).toEqual(expect.arrayContaining([
      "STALE_COMPONENT_COPY",
      "FORBIDDEN_PRODUCT_COPY",
      "LOW_VISIBILITY_TEXT",
      "LOW_TEXT_CONTRAST",
      "TEXT_OUTSIDE_SCREEN",
      "TEXT_OUTSIDE_PARENT",
      "PROTOTYPE_LINKS_MISSING",
    ]));
  });
});
