package core

import "testing"

func TestInferDesignSystemRoles(t *testing.T) {
	roles := inferDesignSystemRoles("Input/Phone/Primary", map[string]interface{}{"State": "Primary"})
	assertHasRole := func(role string) {
		t.Helper()
		for _, candidate := range roles {
			if candidate == role {
				return
			}
		}
		t.Fatalf("expected role %q in %v", role, roles)
	}
	assertHasRole("input")
	assertHasRole("phone")
	assertHasRole("primary")
}

func TestSelectBestDesignComponent(t *testing.T) {
	bundle := dsContextBundle{
		RelevantComponents: []dsLocalComponent{
			{ID: "1:1", Name: "Input/Default"},
			{ID: "1:2", Name: "Input/Phone"},
		},
		HintByComponentID: map[string][]string{
			"1:1": {"input"},
			"1:2": {"input", "phone"},
		},
	}
	match := selectBestDesignComponent(bundle, dsRecipeSlot{
		Key:            "phone",
		RequiredRoles:  []string{"input"},
		PreferredRoles: []string{"phone"},
	})
	if match == nil {
		t.Fatal("expected a matching component")
	}
	if match.Component.ID != "1:2" {
		t.Fatalf("expected phone-specific component, got %s", match.Component.ID)
	}
}

func TestSummarizeDesignSystemAdoption(t *testing.T) {
	root := zGenNode{
		ID:   "1:1",
		Type: "FRAME",
		Children: []zGenNode{
			{ID: "2:1", Type: "INSTANCE"},
			{ID: "2:2", Type: "TEXT", Styles: map[string]interface{}{"text": "S:1"}},
			{ID: "2:3", Type: "RECTANGLE"},
		},
	}
	summary := summarizeDesignSystemAdoption(root)
	if summary.InstanceBasedCount != 1 {
		t.Fatalf("expected 1 instance-based node, got %d", summary.InstanceBasedCount)
	}
	if summary.StyleBoundCount != 1 {
		t.Fatalf("expected 1 style-bound node, got %d", summary.StyleBoundCount)
	}
	if summary.PrimitiveFallbackCount != 1 {
		t.Fatalf("expected 1 primitive fallback node, got %d", summary.PrimitiveFallbackCount)
	}
}
