// Package logging provides structured, leveled logging for the runtime.
//
// All logs are written to STDERR. This is mandatory: the MCP server speaks its
// JSON-RPC protocol over STDOUT, so anything written there would corrupt the
// transport. Never log to stdout.
//
// Configuration is environment-driven so operators can tune verbosity in
// production without code changes:
//
//	ZA_LOG_LEVEL   debug | info | warn | error   (default: info)
//	ZA_LOG_FORMAT  text | json                    (default: text)
//
// Use JSON in production for ingestion by log pipelines; text is the friendlier
// default for local development. Set the level to warn or error in production to
// silence the per-request trace spam that lives at debug/info.
package logging

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"runtime/debug"
	"strings"
	"sync"
)

var (
	base     *slog.Logger
	initOnce sync.Once
)

// LevelFromEnv resolves the configured log level, defaulting to info.
func LevelFromEnv() slog.Level {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("ZA_LOG_LEVEL"))) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func setup() {
	opts := &slog.HandlerOptions{Level: LevelFromEnv()}
	var handler slog.Handler
	switch strings.ToLower(strings.TrimSpace(os.Getenv("ZA_LOG_FORMAT"))) {
	case "json":
		handler = slog.NewJSONHandler(os.Stderr, opts)
	default:
		handler = slog.NewTextHandler(os.Stderr, opts)
	}
	base = slog.New(handler)
}

// Base returns the process-wide root logger, initialized once from the
// environment.
func Base() *slog.Logger {
	initOnce.Do(setup)
	return base
}

// Logger is a module-scoped structured logger. It exposes leveled structured
// methods (Debug/Info/Warn/Error) for new and hot-path code, plus a Printf
// shim (logging at info) so existing call sites keep working during migration.
type Logger struct {
	l *slog.Logger
}

// Module returns a logger tagged with module=<name> on every record.
func Module(name string) *Logger {
	return &Logger{l: Base().With("module", name)}
}

// With returns a child logger that includes the given key/value attributes on
// every subsequent record.
func (lg *Logger) With(args ...any) *Logger {
	return &Logger{l: lg.l.With(args...)}
}

func (lg *Logger) Debug(msg string, args ...any) { lg.l.Debug(msg, args...) }
func (lg *Logger) Info(msg string, args ...any)  { lg.l.Info(msg, args...) }
func (lg *Logger) Warn(msg string, args ...any)  { lg.l.Warn(msg, args...) }
func (lg *Logger) Error(msg string, args ...any) { lg.l.Error(msg, args...) }

// Printf is a backward-compatible shim that logs the formatted message at info
// level. Prefer the leveled structured methods above for new code.
func (lg *Logger) Printf(format string, args ...any) {
	lg.l.Info(fmt.Sprintf(format, args...))
}

// Fatalf logs the formatted message at error level and exits the process with
// status 1. Use only from main() for unrecoverable startup failures.
func (lg *Logger) Fatalf(format string, args ...any) {
	lg.l.Error(fmt.Sprintf(format, args...))
	os.Exit(1)
}

// Enabled reports whether the given level would currently be logged. Use to
// guard expensive attribute computation on hot paths.
func (lg *Logger) Enabled(level slog.Level) bool {
	return lg.l.Enabled(context.Background(), level)
}

var recoveryLog = Module("recovery")

// LogPanic logs a recovered panic value with a full stack trace at error level.
// Call this from a deferred function that has ALREADY called recover() itself —
// recover() only works when invoked directly by the deferred function, so it
// cannot be hidden inside this helper.
func LogPanic(name string, r any) {
	recoveryLog.Error("recovered from panic",
		"goroutine", name,
		"panic", fmt.Sprint(r),
		"stack", string(debug.Stack()),
	)
}

// Recover recovers from a panic in the current goroutine, logging it with a
// full stack trace instead of letting it crash the process. It calls recover()
// directly, so it MUST be used as a deferred call itself, not wrapped:
//
//	defer logging.Recover("name")
//
// In Go an unrecovered panic in ANY goroutine terminates the whole program, so
// every detached goroutine in a long-lived runtime must guard against it.
func Recover(name string) {
	if r := recover(); r != nil {
		LogPanic(name, r)
	}
}

// Go runs fn in a new goroutine guarded by Recover. Prefer this over a bare
// `go fn()` for any goroutine whose panic should be contained, not fatal.
func Go(name string, fn func()) {
	go func() {
		defer Recover(name)
		fn()
	}()
}
