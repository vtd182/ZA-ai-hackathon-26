package core

import (
	"sync"
	"testing"
)

// TestSafeGoContainsPanic verifies a panic in a safeGo goroutine is recovered
// rather than crashing the test process, and that the goroutine still completes
// its deferred work.
func TestSafeGoContainsPanic(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)
	ran := false
	safeGo("test.panicker", func() {
		defer wg.Done()
		defer func() { ran = true }()
		panic("boom")
	})
	wg.Wait()
	if !ran {
		t.Fatal("deferred cleanup did not run after panic")
	}
	// Reaching here at all proves the panic did not propagate and crash the process.
}

// TestSafeRunContainsPanicAndContinues verifies safeRun contains a panic so a
// surrounding loop can keep iterating.
func TestSafeRunContainsPanicAndContinues(t *testing.T) {
	iterations := 0
	for i := 0; i < 3; i++ {
		safeRun("test.loop", func() {
			iterations++
			if iterations == 2 {
				panic("bad iteration")
			}
		})
	}
	if iterations != 3 {
		t.Fatalf("expected all 3 iterations to run despite a panic, got %d", iterations)
	}
}

// TestRecoverPanicNoPanic confirms recoverPanic is a no-op when nothing panicked.
func TestRecoverPanicNoPanic(t *testing.T) {
	func() {
		defer recoverPanic("test.clean")
	}()
}
