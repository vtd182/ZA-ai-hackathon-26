package core

import (
	"testing"
	"time"
)

func TestLifecycleArtifactTimeoutPolicy(t *testing.T) {
	if got := requestPolicyFor("apply_lifecycle_artifact_plan").timeout; got != 30*time.Minute {
		t.Fatalf("apply timeout = %s, want 30m", got)
	}
	if got := requestPolicyFor("read_lifecycle_artifact").timeout; got != 3*time.Minute {
		t.Fatalf("read timeout = %s, want 3m", got)
	}
	if got := NewCapabilityRegistry().Resolve("apply_lifecycle_artifact_plan"); got.DefaultTimeout != 30*time.Minute || !got.SupportsProgress {
		t.Fatalf("unexpected apply capability: %+v", got)
	}
}
