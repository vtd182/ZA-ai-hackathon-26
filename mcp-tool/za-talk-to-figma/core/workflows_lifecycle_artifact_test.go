package core

import "testing"

func lifecyclePreflightFixture() (lifecycleArtifactPlan, lifecycleManifest, lifecycleTarget) {
	target := lifecycleTarget{TargetHash: "allowed-hash", SessionID: "figma:test", PageID: "1:2"}
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
		Metadata:            map[string]interface{}{"runId": "RUN-TEST"},
		Screens: []lifecycleScreenRecipe{{
			ScreenID: "SCREEN-MENU",
			Slots: []lifecycleSlot{
				{Key: "header", Required: true, RequiredRoles: []string{"app-header"}},
				{Key: "menu", Required: true, RequiredRoles: []string{"menu-card"}},
			},
		}},
	}
	return plan, manifest, target
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
	if len(first.Plan.ResolvedSlots) != 2 || first.Plan.EstimatedOperations != 3 {
		t.Fatalf("unexpected resolved plan: %+v", first.Plan)
	}
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
