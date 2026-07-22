package core

import "za-talk-to-figma/core/logging"

// recoverPanic recovers from a panic in the current goroutine, logging it with
// a full stack trace at error level instead of letting it crash the process.
// It calls recover() directly, so it must be used as a deferred call itself:
//
//	defer recoverPanic("bridge.readLoop")
func recoverPanic(name string) {
	if r := recover(); r != nil {
		logging.LogPanic(name, r)
	}
}

// safeGo runs fn in a new goroutine guarded by recoverPanic. Prefer this over a
// bare `go fn()` for any goroutine whose panic should be contained, not fatal.
func safeGo(name string, fn func()) { logging.Go(name, fn) }

// safeRun executes fn synchronously, recovering from any panic. Use inside a
// loop so a single bad iteration is contained and the loop keeps running.
func safeRun(name string, fn func()) {
	defer recoverPanic(name)
	fn()
}
