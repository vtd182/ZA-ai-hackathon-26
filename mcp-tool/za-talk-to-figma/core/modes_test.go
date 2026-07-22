package core

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveMode(t *testing.T) {
	cfg := ServerConfig{
		DefaultMode:             ModeFree,
		AllowPromptModeOverride: true,
		GeneratedRoot:           "generated",
	}

	got, err := resolveMode(cfg, ModeGenZinstant, ModeGenCustom, ModeGenZinstant)
	if err != nil {
		t.Fatalf("resolveMode explicit: %v", err)
	}
	if got.Mode != ModeGenZinstant || got.Source != "request.mode" {
		t.Fatalf("unexpected explicit mode resolution: %+v", got)
	}

	got, err = resolveMode(cfg, "", ModeGenCustom, ModeGenZinstant)
	if err != nil {
		t.Fatalf("resolveMode prompt: %v", err)
	}
	if got.Mode != ModeGenCustom || got.Source != "request.promptMode" {
		t.Fatalf("unexpected prompt mode resolution: %+v", got)
	}

	cfg.AllowPromptModeOverride = false
	got, err = resolveMode(cfg, "", ModeGenCustom, ModeGenZinstant)
	if err != nil {
		t.Fatalf("resolveMode config default: %v", err)
	}
	if got.Mode != ModeFree || got.Source != "config.defaultMode" {
		t.Fatalf("unexpected config default resolution: %+v", got)
	}
}

func TestLoadServerConfig_DefaultsWhenMissing(t *testing.T) {
	dir := t.TempDir()
	cfg, err := loadServerConfig(dir)
	if err != nil {
		t.Fatalf("loadServerConfig: %v", err)
	}
	if cfg.DefaultMode != ModeFree {
		t.Fatalf("DefaultMode = %q, want %q", cfg.DefaultMode, ModeFree)
	}
	if cfg.GeneratedRoot != "generated" {
		t.Fatalf("GeneratedRoot = %q, want generated", cfg.GeneratedRoot)
	}
}

func TestLoadServerConfig_FromFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "za-talk-to-figma.json")
	if err := os.WriteFile(path, []byte("{\n  \"defaultMode\": \"gen.zinstant\",\n  \"allowPromptModeOverride\": true,\n  \"generatedRoot\": \"custom-generated\"\n}\n"), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := loadServerConfig(dir)
	if err != nil {
		t.Fatalf("loadServerConfig: %v", err)
	}
	if cfg.DefaultMode != ModeGenZinstant {
		t.Fatalf("DefaultMode = %q, want %q", cfg.DefaultMode, ModeGenZinstant)
	}
	if !cfg.AllowPromptModeOverride {
		t.Fatal("AllowPromptModeOverride = false, want true")
	}
	if cfg.GeneratedRoot != "custom-generated" {
		t.Fatalf("GeneratedRoot = %q, want custom-generated", cfg.GeneratedRoot)
	}
}
