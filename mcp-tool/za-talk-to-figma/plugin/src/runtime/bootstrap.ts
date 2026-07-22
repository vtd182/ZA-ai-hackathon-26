// Plugin core — typed runtime bootstrap, lifecycle events, and request dispatch.

import { handleReadRequest } from "./read-dispatch";
import {
  isPluginToolRequest,
  type PluginStatusMessage,
  type PluginToUIMessage,
  type PluginToolRequest,
  type PluginToolResponse,
  type PluginRequestLifecycleMessage,
  type UIToPluginMessage,
} from "./protocol";
import { handleWriteRequest } from "./write-dispatch";

type PluginRequestHandler = (
  request: PluginToolRequest,
) => Promise<PluginToolResponse | null>;

const requestHandlers: PluginRequestHandler[] = [handleReadRequest, handleWriteRequest];

const debugLog = (scope: string, message: string, extra?: Record<string, unknown>) => {
  const prefix = `[za-talk-to-figma:${scope}] ${message}`;
  if (extra) {
    console.log(prefix, extra);
    return;
  }
  console.log(prefix);
};

const postToUI = (message: PluginToUIMessage) => {
  figma.ui.postMessage(message);
};

const sessionNonce = Math.random().toString(36).slice(2, 10);
const sanitizeSessionSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "untitled";

const stableSessionId = (() => {
  const rootId = (figma.root as unknown as { id?: string }).id;
  const rootKey = rootId && rootId !== "0:0" ? rootId.replace(/[^a-zA-Z0-9:_-]/g, "-") : "";
  const fileSlug = sanitizeSessionSegment(figma.root.name);
  const pageSlug = sanitizeSessionSegment(figma.currentPage.name);
  const base = rootKey ? `${fileSlug}-${rootKey}` : `${fileSlug}-${pageSlug}`;
  return `figma:${base}:${sessionNonce}`;
})();

const getSessionId = () => stableSessionId;

const sendStatus = () => {
  const sel = figma.currentPage.selection;
  const message: PluginStatusMessage = {
    type: "plugin-status",
    payload: {
      sessionId: getSessionId(),
      fileName: figma.root.name,
      pageName: figma.currentPage.name,
      selectionCount: sel.length,
      selection: sel.map((n) => ({ id: n.id, name: n.name, type: n.type })),
    },
  };
  postToUI(message);
};

const sendRequestEvent = (
  stage: PluginRequestLifecycleMessage["stage"],
  payload: Record<string, unknown>,
) => {
  postToUI({
    type: "request_event",
    stage,
    payload,
  });
};

const dispatchRequest = async (request: PluginToolRequest): Promise<PluginToolResponse> => {
  for (const handler of requestHandlers) {
    const result = await handler(request);
    if (result) {
      return result;
    }
  }
  return {
    type: request.type,
    requestId: request.requestId,
    error: `Unknown request type: ${request.type}`,
  };
};

const handleRequest = async (request: PluginToolRequest): Promise<PluginToolResponse> => {
  const startedAt = Date.now();
  debugLog("request", "start", {
    type: request.type,
    requestId: request.requestId,
    nodeIds: Array.isArray(request.nodeIds) ? request.nodeIds.length : 0,
    paramKeys: request.params ? Object.keys(request.params) : [],
  });
  sendRequestEvent("start", {
    type: request.type,
    requestId: request.requestId,
    nodeIds: Array.isArray(request.nodeIds) ? request.nodeIds.length : 0,
  });

  try {
    const result = await dispatchRequest(request);
    const durationMs = Date.now() - startedAt;
    if (result.error) {
      debugLog("request", "error", {
        type: request.type,
        requestId: request.requestId,
        durationMs,
        error: result.error,
      });
      sendRequestEvent("error", {
        type: request.type,
        requestId: request.requestId,
        durationMs,
        error: result.error,
      });
      return result;
    }

    debugLog("request", "success", {
      type: request.type,
      requestId: request.requestId,
      durationMs,
    });
    sendRequestEvent("success", {
      type: request.type,
      requestId: request.requestId,
      durationMs,
    });
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startedAt;
    debugLog("request", "error", {
      type: request.type,
      requestId: request.requestId,
      durationMs,
      error: errorMessage,
    });
    sendRequestEvent("error", {
      type: request.type,
      requestId: request.requestId,
      durationMs,
      error: errorMessage,
    });
    return {
      type: request.type,
      requestId: request.requestId,
      error: errorMessage,
    };
  }
};

figma.showUI(__html__, { width: 440, height: 720 });
sendStatus();

figma.on("selectionchange", () => {
  sendStatus();
});

figma.on("currentpagechange", () => {
  sendStatus();
});

figma.ui.onmessage = async (message: UIToPluginMessage) => {
  if (message.type === "ui-ready") {
    sendStatus();
    return;
  }
  if (message.type === "get_ws_config") {
    const config = await figma.clientStorage.getAsync("ws_config");
    postToUI({
      type: "ws_config",
      host: config?.host ?? "127.0.0.1",
      port: config?.port ?? "1802",
    });
    return;
  }
  if (message.type === "save_ws_config") {
    await figma.clientStorage.setAsync("ws_config", {
      host: message.host,
      port: message.port,
    });
    return;
  }
  if (message.type === "open_external") {
    if (!message.url) return;
    try {
      figma.openExternal(message.url);
      debugLog("bridge", "open-external", { url: message.url });
    } catch (error) {
      debugLog("bridge", "open-external failed", {
        url: message.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }
  if (message.type === "server-request") {
    if (!isPluginToolRequest(message.payload)) {
      debugLog("bridge", "ignored malformed server-request");
      return;
    }
    debugLog("bridge", "server-request received", {
      type: message.payload.type,
      requestId: message.payload.requestId,
    });
    const response = await handleRequest(message.payload);
    try {
      response.sessionId = getSessionId();
      response.clientId = message.payload.clientId;
      postToUI(response);
      debugLog("bridge", "response posted", {
        type: response.type,
        requestId: response.requestId,
        hasError: !!response.error,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      debugLog("bridge", "response post failed", {
        type: response.type,
        requestId: response.requestId,
        error: errorMessage,
      });
      postToUI({
        type: response.type,
        requestId: response.requestId,
        error: errorMessage,
      });
    }
  }
};
