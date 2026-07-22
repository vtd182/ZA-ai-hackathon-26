import { describe, it, expect, beforeEach } from "bun:test";
import { handleWriteVectorRequest } from "./write-vector";

let mockNodes: Record<string, any>;
let commitUndoCalled: boolean;
let lastOp: { kind: string; nodes: any[]; parent: any } | null;

const makeRequest = (type: string, nodeIds?: string[], params?: any) => ({
  type,
  requestId: "req-test-1",
  nodeIds: nodeIds ?? [],
  params: params ?? {},
});

const makeResult = (kind: string) => ({ id: `result:${kind}`, name: kind, type: "BOOLEAN_OPERATION", x: 0, y: 0, width: 10, height: 10 });

beforeEach(() => {
  commitUndoCalled = false;
  lastOp = null;
  mockNodes = {};
  const record = (kind: string) => (nodes: any[], parent: any) => {
    lastOp = { kind, nodes, parent };
    return makeResult(kind);
  };
  (globalThis as any).figma = {
    getNodeByIdAsync: async (id: string) => mockNodes[id] ?? null,
    commitUndo: () => { commitUndoCalled = true; },
    union: record("UNION"),
    subtract: record("SUBTRACT"),
    intersect: record("INTERSECT"),
    exclude: record("EXCLUDE"),
    flatten: (nodes: any[], parent: any) => { lastOp = { kind: "FLATTEN", nodes, parent }; return { ...makeResult("FLATTEN"), type: "VECTOR" }; },
  };
});

describe("boolean_operation", () => {
  const parent = { id: "parent:1" };

  beforeEach(() => {
    mockNodes["1:1"] = { id: "1:1", name: "A", parent };
    mockNodes["2:2"] = { id: "2:2", name: "B", parent };
  });

  it("performs a UNION across two nodes", async () => {
    const res = await handleWriteVectorRequest(makeRequest("boolean_operation", ["1:1", "2:2"], { operation: "UNION" }));
    expect(lastOp?.kind).toBe("UNION");
    expect(lastOp?.nodes).toHaveLength(2);
    expect(res?.data.operation).toBe("UNION");
    expect(commitUndoCalled).toBe(true);
  });

  it("accepts lowercase operation names", async () => {
    await handleWriteVectorRequest(makeRequest("boolean_operation", ["1:1", "2:2"], { operation: "subtract" }));
    expect(lastOp?.kind).toBe("SUBTRACT");
  });

  it("applies an optional name", async () => {
    const res = await handleWriteVectorRequest(makeRequest("boolean_operation", ["1:1", "2:2"], { operation: "INTERSECT", name: "Icon" }));
    expect(res?.data.name).toBe("Icon");
  });

  it("rejects fewer than 2 nodes", async () => {
    await expect(handleWriteVectorRequest(makeRequest("boolean_operation", ["1:1"], { operation: "UNION" }))).rejects.toThrow(/at least 2/);
  });

  it("rejects an unknown operation", async () => {
    await expect(handleWriteVectorRequest(makeRequest("boolean_operation", ["1:1", "2:2"], { operation: "MERGE" }))).rejects.toThrow(/Unknown operation/);
  });

  it("rejects a missing node", async () => {
    await expect(handleWriteVectorRequest(makeRequest("boolean_operation", ["1:1", "9:9"], { operation: "UNION" }))).rejects.toThrow(/not found/);
  });
});

describe("flatten_node", () => {
  it("flattens nodes into a vector", async () => {
    mockNodes["1:1"] = { id: "1:1", name: "Shape", parent: { id: "p" } };
    const res = await handleWriteVectorRequest(makeRequest("flatten_node", ["1:1"], {}));
    expect(lastOp?.kind).toBe("FLATTEN");
    expect(res?.data.type).toBe("VECTOR");
    expect(commitUndoCalled).toBe(true);
  });

  it("rejects empty nodeIds", async () => {
    await expect(handleWriteVectorRequest(makeRequest("flatten_node", [], {}))).rejects.toThrow(/at least 1/);
  });
});

describe("handleWriteVectorRequest", () => {
  it("returns null for unrelated request types", async () => {
    const res = await handleWriteVectorRequest(makeRequest("set_opacity", ["1:1"], {}));
    expect(res).toBeNull();
  });
});
