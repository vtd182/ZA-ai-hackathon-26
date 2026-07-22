export const readRequestTypes = [
  "get_document",
  "get_pages",
  "get_metadata",
  "get_selection",
  "get_node",
  "get_nodes_info",
  "get_node_context",
  "get_design_context",
  "search_nodes",
  "scan_text_nodes",
  "scan_nodes_by_types",
  "get_reactions",
  "get_viewport",
  "get_fonts",
  "get_styles",
  "get_variable_defs",
  "get_local_components",
  "get_annotations",
  "export_tokens",
  "get_screenshot",
  "export_node_as_svg",
  "export_frames_to_pdf",
] as const;

export const writeRequestTypes = [
  "create_frame",
  "create_rectangle",
  "create_ellipse",
  "create_text",
  "import_image",
  "import_svg",
  "create_section",
  "delete_nodes",
  "move_nodes",
  "resize_nodes",
  "rotate_nodes",
  "set_text",
  "set_text_properties",
  "set_fills",
  "set_strokes",
  "boolean_operation",
  "flatten_node",
  "set_auto_layout",
  "set_constraints",
  "set_corner_radius",
  "set_effects",
  "set_opacity",
  "set_visible",
  "set_blend_mode",
  "reorder_nodes",
  "reparent_nodes",
  "group_nodes",
  "ungroup_nodes",
  "lock_nodes",
  "unlock_nodes",
  "find_replace_text",
  "rename_node",
  "batch_rename_nodes",
  "clone_node",
  "create_component",
  "instantiate_component",
  "import_component_by_key",
  "detach_instance",
  "swap_component",
  "create_paint_style",
  "create_text_style",
  "create_effect_style",
  "create_grid_style",
  "apply_style_to_node",
  "update_paint_style",
  "delete_style",
  "create_variable_collection",
  "add_variable_mode",
  "create_variable",
  "set_variable_value",
  "bind_variable_to_node",
  "delete_variable",
  "set_reactions",
  "remove_reactions",
  "add_page",
  "rename_page",
  "delete_page",
  "navigate_to_page",
] as const;

export type ReadRequestType = (typeof readRequestTypes)[number];
export type WriteRequestType = (typeof writeRequestTypes)[number];
export type PluginRequestType = ReadRequestType | WriteRequestType;

// Wire params arrive as arbitrary JSON from an MCP client (an LLM), so individual
// values are intentionally `any`: they are validated/coerced at use sites. Strict
// null-checks and the rest of strict mode still apply to all plugin logic — the
// real safety win for a plugin with write access to live Figma files.
export type PluginToolParams = Record<string, any>;

export type PluginToolRequest = {
  type: PluginRequestType;
  requestId: string;
  sessionId?: string;
  clientId?: string;
  nodeIds?: string[];
  params?: PluginToolParams;
};

export type PluginToolResponse = {
  type: string;
  requestId: string;
  sessionId?: string;
  clientId?: string;
  data?: unknown;
  error?: string;
};

export type PluginProgressEvent = {
  type: "progress_update";
  requestId: string;
  progress: number;
  message: string;
};

export type SelectionNode = {
  id: string;
  name: string;
  type: string;
};

export type PluginStatusMessage = {
  type: "plugin-status";
  payload: {
    sessionId: string;
    fileName: string;
    pageName: string;
    selectionCount: number;
    selection: SelectionNode[];
  };
};

export type PluginExecutionReportMessage = {
  type: "execution_report";
  sessionId?: string;
  requestId: string;
  data: {
    capability: string;
    kind: string;
    profile: string;
    durationMs: number;
    attempts: Array<{
      capability: string;
      profile: string;
      durationMs: number;
      outcome: string;
      error?: string;
    }>;
    fallbackUsed: boolean;
    fallbackPath?: string[];
    resultClass: "complete" | "partial" | "fallback" | "failed";
    supportsProgress: boolean;
  };
};

export type PluginRequestLifecycleMessage = {
  type: "request_event";
  stage: "start" | "success" | "error";
  payload: Record<string, unknown>;
};

export type PluginWSConfigMessage = {
  type: "ws_config";
  host: string;
  port: string;
};

export type PluginToUIMessage =
  | PluginStatusMessage
  | PluginRequestLifecycleMessage
  | PluginWSConfigMessage
  | PluginProgressEvent
  | PluginExecutionReportMessage
  | PluginToolResponse;

export type UIToPluginMessage =
  | { type: "ui-ready" }
  | { type: "get_ws_config" }
  | { type: "save_ws_config"; host: string; port: string }
  | { type: "open_external"; url: string }
  | { type: "server-request"; payload: PluginToolRequest };

export const isReadRequestType = (value: string): value is ReadRequestType =>
  (readRequestTypes as readonly string[]).includes(value);

export const isWriteRequestType = (value: string): value is WriteRequestType =>
  (writeRequestTypes as readonly string[]).includes(value);

export const isPluginToolRequest = (value: unknown): value is PluginToolRequest => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.type === "string" &&
    typeof candidate.requestId === "string" &&
    (isReadRequestType(candidate.type) || isWriteRequestType(candidate.type))
  );
};
