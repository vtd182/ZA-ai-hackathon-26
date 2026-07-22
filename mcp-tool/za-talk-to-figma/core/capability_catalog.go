package core

import "time"

type CapabilityKind string

const (
	CapabilityKindRead     CapabilityKind = "read"
	CapabilityKindWrite    CapabilityKind = "write"
	CapabilityKindExport   CapabilityKind = "export"
	CapabilityKindGenerate CapabilityKind = "generate"
	CapabilityKindSmart    CapabilityKind = "smart"
)

type ExecutionProfile string

const (
	ExecutionProfileFast       ExecutionProfile = "fast"
	ExecutionProfileHeavyRead  ExecutionProfile = "heavy_read"
	ExecutionProfileWrite      ExecutionProfile = "write"
	ExecutionProfileExport     ExecutionProfile = "export"
	ExecutionProfileGeneration ExecutionProfile = "generation"
	ExecutionProfileSmart      ExecutionProfile = "smart"
)

type Capability struct {
	Name               string
	Kind               CapabilityKind
	Profile            ExecutionProfile
	DefaultTimeout     time.Duration
	SupportsProgress   bool
	SupportsFallback   bool
	FallbackCapability string
	ResultShapeClass   string
	SupportsTruncation bool
	Notes              string
}

type CapabilityRegistry struct {
	capabilities map[string]Capability
}

func NewCapabilityRegistry() *CapabilityRegistry {
	r := &CapabilityRegistry{capabilities: map[string]Capability{}}

	fastReads := []string{
		"get_pages", "get_metadata", "get_selection", "get_viewport", "get_reactions",
	}
	heavyReads := []string{
		"get_document", "get_node", "get_nodes_info", "get_node_context", "get_design_context",
		"search_nodes", "scan_text_nodes", "scan_nodes_by_types", "get_fonts",
		"get_styles", "get_variable_defs", "get_local_components",
	}
	writeOps := []string{
		"create_frame", "create_rectangle", "create_ellipse", "create_text",
		"create_section", "delete_nodes", "move_nodes", "resize_nodes", "rotate_nodes",
		"set_fills", "set_strokes", "set_text", "set_text_properties", "set_auto_layout", "set_constraints",
		"boolean_operation", "flatten_node",
		"set_corner_radius", "set_effects", "set_opacity", "set_visible", "set_blend_mode",
		"reorder_nodes", "reparent_nodes", "group_nodes", "ungroup_nodes", "lock_nodes",
		"unlock_nodes", "find_replace_text", "rename_node", "batch_rename_nodes",
		"create_component", "instantiate_component", "import_component_by_key", "import_svg", "create_icon_placeholder",
		"detach_instance", "swap_component", "create_paint_style",
		"create_text_style", "create_effect_style", "create_grid_style", "apply_style_to_node",
		"update_paint_style", "delete_style", "create_variable_collection", "add_variable_mode",
		"create_variable", "set_variable_value", "bind_variable_to_node", "delete_variable",
		"set_reactions", "remove_reactions", "add_page", "rename_page", "delete_page",
		"navigate_to_page",
	}
	exportOps := []string{
		"get_screenshot", "export_node_as_svg", "save_screenshots", "export_frames_to_pdf", "export_tokens",
	}
	generateOps := []string{
		"generate_zinstant",
	}
	smartOps := []string{
		"inspect_selection_safely", "review_canvas_layout", "cleanup_board_layout", "prepare_export_bundle",
		"safe_page_inventory", "extract_component_candidates", "normalize_review_board",
		"get_runtime_sessions", "set_runtime_session",
		"capture_design_system_context", "apply_design_system_screen", "audit_design_system_adoption",
		"scan_icon_components",
	}

	for _, name := range fastReads {
		r.Register(Capability{
			Name:             name,
			Kind:             CapabilityKindRead,
			Profile:          ExecutionProfileFast,
			DefaultTimeout:   30 * time.Second,
			SupportsProgress: false,
			ResultShapeClass: "complete",
		})
	}
	for _, name := range heavyReads {
		fallback := ""
		switch name {
		case "get_node":
			fallback = "get_node_context"
		case "get_document":
			fallback = "get_design_context"
		}
		r.Register(Capability{
			Name:               name,
			Kind:               CapabilityKindRead,
			Profile:            ExecutionProfileHeavyRead,
			DefaultTimeout:     45 * time.Second,
			SupportsProgress:   true,
			SupportsFallback:   fallback != "",
			FallbackCapability: fallback,
			ResultShapeClass:   "partial",
			SupportsTruncation: true,
		})
	}
	for _, name := range writeOps {
		r.Register(Capability{
			Name:             name,
			Kind:             CapabilityKindWrite,
			Profile:          ExecutionProfileWrite,
			DefaultTimeout:   30 * time.Second,
			SupportsProgress: false,
			ResultShapeClass: "complete",
		})
	}
	for _, name := range exportOps {
		r.Register(Capability{
			Name:             name,
			Kind:             CapabilityKindExport,
			Profile:          ExecutionProfileExport,
			DefaultTimeout:   45 * time.Second,
			SupportsProgress: true,
			ResultShapeClass: "artifact",
		})
	}
	for _, name := range generateOps {
		r.Register(Capability{
			Name:             name,
			Kind:             CapabilityKindGenerate,
			Profile:          ExecutionProfileGeneration,
			DefaultTimeout:   60 * time.Second,
			SupportsProgress: true,
			ResultShapeClass: "artifact",
		})
	}
	for _, name := range smartOps {
		r.Register(Capability{
			Name:               name,
			Kind:               CapabilityKindSmart,
			Profile:            ExecutionProfileSmart,
			DefaultTimeout:     60 * time.Second,
			SupportsProgress:   true,
			ResultShapeClass:   "structured",
			SupportsTruncation: true,
		})
	}

	return r
}

func (r *CapabilityRegistry) Register(cap Capability) {
	r.capabilities[cap.Name] = cap
}

func (r *CapabilityRegistry) Resolve(name string) Capability {
	if cap, ok := r.capabilities[name]; ok {
		return cap
	}
	return Capability{
		Name:             name,
		Kind:             CapabilityKindRead,
		Profile:          ExecutionProfileFast,
		DefaultTimeout:   30 * time.Second,
		ResultShapeClass: "complete",
	}
}
