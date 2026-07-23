package core

import "testing"

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
		Metadata: map[string]interface{}{
			"namespace": "za.pm-lifecycle/v1", "runId": "RUN-TEST", "threadId": "THREAD-TEST",
			"actionId": "ACTION-TEST", "specId": "SPEC-TEST", "specVersion": float64(1),
			"idempotencyKey": "figma:RUN-TEST:v1",
		},
		Screens: []lifecycleScreenRecipe{{
			SchemaVersion: 1, ScreenID: "SCREEN-MENU", Name: "Menu", Purpose: "Choose a meal",
			RequirementIDs: []string{"REQ-ORDER"}, Layout: "vertical",
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
	snapshot := lifecycleArtifactSnapshot{
		SchemaVersion: 1, TargetHash: target.TargetHash, PlanHash: preflight.PlanHash,
		IdempotencyKey: "figma:RUN-TEST:v1", RootNodeIDs: []string{"10:1"},
		Screens: []lifecycleSnapshotScreen{{
			NodeID: "11:1", ScreenID: "SCREEN-MENU", Name: "Menu",
			Metadata: map[string]interface{}{
				"namespace": "za.pm-lifecycle/v1", "runId": "RUN-TEST", "actionId": "ACTION-TEST",
				"screenId": "SCREEN-MENU", "requirementIds": []interface{}{"REQ-ORDER"},
			},
			ChildSlots: []lifecycleSnapshotSlot{
				{SlotKey: "header", ComponentKey: &componentHeader, SemanticRole: &roleHeader},
				{SlotKey: "menu", ComponentKey: &componentMenu, SemanticRole: &roleMenu},
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
	if len(first.Plan.ResolvedSlots) != 2 || first.Plan.EstimatedOperations != 3 {
		t.Fatalf("unexpected resolved plan: %+v", first.Plan)
	}
}

func TestLifecyclePreflightUsesCrossRuntimeCanonicalHash(t *testing.T) {
	plan, manifest, target := lifecyclePreflightFixture()
	preflight, err := planLifecycleDesignSystemScreens(plan, manifest, target)
	if err != nil {
		t.Fatalf("preflight failed: %v", err)
	}
	const expected = "2bd759c906081e21a6c24d7be8ac475306452d969c516e284cda321596fa4b61"
	if preflight.PlanHash != expected {
		t.Fatalf("canonical plan hash changed: %s", preflight.PlanHash)
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
