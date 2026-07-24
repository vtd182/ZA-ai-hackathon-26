package core

import (
	"encoding/json"
	"testing"
)

func lifecyclePreflightFixture() (lifecycleArtifactPlan, lifecycleManifest, lifecycleTarget) {
	target := lifecycleTarget{SchemaVersion: 1, TargetHash: "allowed-hash", SessionID: "figma:test", FileName: "Sandbox", PageID: "1:2", PageName: "Demo", AllowedAt: "2026-07-22T00:00:00.000Z"}
	manifest := lifecycleManifest{
		Fingerprint: "fixture-v1",
		Components: []lifecycleManifestComponent{
			{Key: "fixture/app-header", SemanticRole: "app-header"},
			{Key: "fixture/menu-card", SemanticRole: "menu-card"},
		},
		Tokens:             lifecycleManifestTokens{Color: []lifecycleManifestToken{{Name: "color/brand/primary"}}},
		ForbiddenRawStyles: true,
	}
	plan := lifecycleArtifactPlan{
		SchemaVersion:       1,
		Kind:                "figma_design_system_plan",
		Mode:                "strict",
		Target:              target,
		ManifestFingerprint: manifest.Fingerprint,
		RequiredTokens:      []string{"color/brand/primary"},
		DesignDirection: lifecycleDesignDirection{
			ConceptName: "Focused utility", ProductPromise: "Choose lunch quickly",
			Tone: "focused", Density: "comfortable", Palette: "zalo-blue",
			Principles: []lifecycleDesignPrinciple{
				{Title: "One task", Detail: "Keep one clear action."},
				{Title: "System led", Detail: "Use guarded components."},
			},
		},
		Metadata: map[string]interface{}{
			"namespace": "za.pm-lifecycle/v1", "runId": "RUN-TEST", "threadId": "THREAD-TEST",
			"actionId": "ACTION-TEST", "specId": "SPEC-TEST", "specVersion": float64(1),
			"idempotencyKey": "figma:RUN-TEST:v1",
		},
		Screens: []lifecycleScreenRecipe{{
			SchemaVersion: 1, ScreenID: "SCREEN-MENU", Name: "Menu", Purpose: "Choose a meal",
			RequirementIDs: []string{"REQ-ORDER"}, Layout: "vertical",
			Presentation: lifecycleScreenPresentation{
				Archetype: "browse", Eyebrow: "STEP 1", Headline: "Choose lunch",
				SupportingText: "Find a meal for today", NavigationLabel: "Menu",
				Sections: []lifecycleContentSection{{
					Key: "meal-list", Kind: "choice_list", Title: "Available meals",
					Body: "Ready for lunch", Tone: "brand", Items: []lifecycleContentItem{},
				}},
			},
			Slots: []lifecycleSlot{
				{Key: "header", Label: "Header", Required: true, RequiredRoles: []string{"app-header"}, PreferredRoles: []string{}, VariantProperties: map[string]string{}, Content: map[string]string{}, Children: []lifecycleSlot{}},
				{Key: "menu", Label: "Menu", Required: true, RequiredRoles: []string{"menu-card"}, PreferredRoles: []string{}, VariantProperties: map[string]string{}, Content: map[string]string{}, Children: []lifecycleSlot{}},
			},
			PrototypeEdges: []lifecycleEdge{},
		}},
	}
	return plan, manifest, target
}

func TestValidateApprovedLifecyclePreflightAndAuditReadBack(t *testing.T) {
	plan, manifest, target := lifecyclePreflightFixture()
	preflight, err := planLifecycleDesignSystemScreens(plan, manifest, target)
	if err != nil {
		t.Fatalf("preflight failed: %v", err)
	}
	if err := validateApprovedLifecyclePreflight(preflight, preflight.PlanHash, preflight.PlanHash); err != nil {
		t.Fatalf("expected approved plan to validate: %v", err)
	}
	if err := validateApprovedLifecyclePreflight(preflight, preflight.PlanHash, "changed"); err == nil {
		t.Fatal("expected approval hash mismatch")
	}

	componentHeader, roleHeader := "fixture/app-header", "app-header"
	componentMenu, roleMenu := "fixture/menu-card", "menu-card"
	headerBinding := lifecycleComponentBinding{Kind: "component_key", Key: componentHeader}
	menuBinding := lifecycleComponentBinding{Kind: "component_key", Key: componentMenu}
	snapshot := lifecycleArtifactSnapshot{
		SchemaVersion: 1, TargetHash: target.TargetHash, PlanHash: preflight.PlanHash,
		IdempotencyKey: "figma:RUN-TEST:v1", RootNodeIDs: []string{"10:1"},
		ArtifactPageID: "9:1", ArtifactPageName: "PM · SPEC-TEST · v1",
		DesignConceptName: "Focused utility",
		Screens: []lifecycleSnapshotScreen{{
			NodeID: "11:1", ScreenID: "SCREEN-MENU", Name: "Menu",
			Archetype: "browse", SectionKeys: []string{"meal-list"},
			Metadata: map[string]interface{}{
				"namespace": "za.pm-lifecycle/v1", "runId": "RUN-TEST", "actionId": "ACTION-TEST",
				"screenId": "SCREEN-MENU", "requirementIds": []interface{}{"REQ-ORDER"},
			},
			ChildSlots: []lifecycleSnapshotSlot{
				{SlotKey: "header", ComponentKey: &componentHeader, ComponentBinding: &headerBinding, SemanticRole: &roleHeader, InstanceBacked: true},
				{SlotKey: "menu", ComponentKey: &componentMenu, ComponentBinding: &menuBinding, SemanticRole: &roleMenu, InstanceBacked: true},
			},
		}},
		PrototypeEdges: []lifecycleEdge{}, ReadAt: "2026-07-22T00:00:00.000Z",
	}
	audit := auditLifecycleArtifact(preflight.Plan, preflight.PlanHash, snapshot)
	if !audit.Verified || len(audit.Issues) != 0 {
		t.Fatalf("expected verified read-back: %+v", audit)
	}

	delete(snapshot.Screens[0].Metadata, "requirementIds")
	audit = auditLifecycleArtifact(preflight.Plan, preflight.PlanHash, snapshot)
	if audit.Verified {
		t.Fatal("missing requirement metadata must fail postflight verification")
	}
}

func TestPlanLifecycleDesignSystemScreensStrictSuccess(t *testing.T) {
	plan, manifest, target := lifecyclePreflightFixture()
	first, err := planLifecycleDesignSystemScreens(plan, manifest, target)
	if err != nil {
		t.Fatalf("preflight failed: %v", err)
	}
	second, err := planLifecycleDesignSystemScreens(plan, manifest, target)
	if err != nil {
		t.Fatalf("second preflight failed: %v", err)
	}
	if !first.Allowed || first.PlanHash == "" || first.PlanHash != second.PlanHash {
		t.Fatalf("expected deterministic allowed plan, got %+v", first)
	}
	if len(first.Plan.ResolvedSlots) != 2 || first.Plan.EstimatedOperations != 5 {
		t.Fatalf("unexpected resolved plan: %+v", first.Plan)
	}
}

func TestLifecyclePreflightUsesCrossRuntimeCanonicalHash(t *testing.T) {
	plan, manifest, target := lifecyclePreflightFixture()
	preflight, err := planLifecycleDesignSystemScreens(plan, manifest, target)
	if err != nil {
		t.Fatalf("preflight failed: %v", err)
	}
	const expected = "acdf0fedc25ea7bd707c223cf917add95641b441894480f941ea09cc4e27b0d1"
	if preflight.PlanHash != expected {
		t.Fatalf("canonical plan hash changed: %s", preflight.PlanHash)
	}
}

func TestCreativeElementCountContributesToEstimatedOperations(t *testing.T) {
	raw := json.RawMessage(`{"screens":[{"elements":[{"id":"a"},{"id":"b"}]},{"elements":[{"id":"c"}]}]}`)
	if got := creativeElementCount(raw); got != 3 {
		t.Fatalf("creativeElementCount() = %d, want 3", got)
	}
	if got := creativeElementCount(json.RawMessage(`{`)); got != 0 {
		t.Fatalf("invalid creativeElementCount() = %d, want 0", got)
	}
}

func TestPlanLifecycleDesignSystemScreensRejectsCrossPageInstanceBinding(t *testing.T) {
	plan, manifest, target := lifecyclePreflightFixture()
	manifest.Components[0].Binding = &lifecycleComponentBinding{
		Kind:   "same_file_instance",
		NodeID: "411:20533",
		PageID: "9:9",
	}

	result, err := planLifecycleDesignSystemScreens(plan, manifest, target)
	if err != nil {
		t.Fatalf("preflight failed: %v", err)
	}
	if result.Allowed {
		t.Fatal("cross-page same-file binding must be blocked")
	}
	for _, issue := range result.Issues {
		if issue.Code == "INVALID_COMPONENT_BINDING" {
			return
		}
	}
	t.Fatalf("expected INVALID_COMPONENT_BINDING in %+v", result.Issues)
}

func TestPlanLifecycleDesignSystemScreensBlocksBeforeRuntimeWrites(t *testing.T) {
	plan, manifest, target := lifecyclePreflightFixture()
	manifest.Components = manifest.Components[:1]
	manifest.Tokens.Color = nil
	target.PageID = "9:9"

	result, err := planLifecycleDesignSystemScreens(plan, manifest, target)
	if err != nil {
		t.Fatalf("preflight failed: %v", err)
	}
	if result.Allowed {
		t.Fatal("expected strict preflight to block")
	}
	wanted := map[string]bool{"TARGET_NOT_ALLOWED": false, "MISSING_COMPONENT_ROLE": false, "MISSING_TOKEN": false}
	for _, issue := range result.Issues {
		if _, ok := wanted[issue.Code]; ok {
			wanted[issue.Code] = true
		}
	}
	for code, found := range wanted {
		if !found {
			t.Fatalf("expected issue %s in %+v", code, result.Issues)
		}
	}
	// The planner has no Runtime parameter. Invalid plans therefore cannot dispatch
	// any plugin command before the full strict decision is known.
}
