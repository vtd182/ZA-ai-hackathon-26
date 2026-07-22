package core

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

const (
	ModeFree        = "free"
	ModeZAGuard     = "za_guard"
	ModeGenZinstant = "gen.zinstant"
	ModeGenCustom   = "gen.custom"
)

type ServerConfig struct {
	DefaultMode             string `json:"defaultMode"`
	AllowPromptModeOverride bool   `json:"allowPromptModeOverride"`
	GeneratedRoot           string `json:"generatedRoot"`
}

type ResolvedMode struct {
	Mode   string `json:"mode"`
	Source string `json:"source"`
}

func defaultServerConfig() ServerConfig {
	return ServerConfig{
		DefaultMode:             ModeFree,
		AllowPromptModeOverride: false,
		GeneratedRoot:           "generated",
	}
}

func loadServerConfig(workDir string) (ServerConfig, error) {
	cfg := defaultServerConfig()
	configPath := filepath.Join(workDir, "za-talk-to-figma.json")

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return cfg, err
	}

	var loaded ServerConfig
	if err := json.Unmarshal(data, &loaded); err != nil {
		return cfg, fmt.Errorf("parse za-talk-to-figma.json: %w", err)
	}

	if loaded.DefaultMode != "" {
		cfg.DefaultMode = loaded.DefaultMode
	}
	cfg.AllowPromptModeOverride = loaded.AllowPromptModeOverride
	if loaded.GeneratedRoot != "" {
		cfg.GeneratedRoot = loaded.GeneratedRoot
	}

	if !validMode(cfg.DefaultMode) {
		return cfg, fmt.Errorf("invalid defaultMode in za-talk-to-figma.json: %s", cfg.DefaultMode)
	}
	return cfg, nil
}

func resolveMode(cfg ServerConfig, explicitMode string, promptMode string, fallbackMode string) (ResolvedMode, error) {
	switch {
	case explicitMode != "":
		if !validMode(explicitMode) {
			return ResolvedMode{}, fmt.Errorf("invalid mode: %s", explicitMode)
		}
		return ResolvedMode{Mode: explicitMode, Source: "request.mode"}, nil
	case promptMode != "" && cfg.AllowPromptModeOverride:
		if !validMode(promptMode) {
			return ResolvedMode{}, fmt.Errorf("invalid promptMode: %s", promptMode)
		}
		return ResolvedMode{Mode: promptMode, Source: "request.promptMode"}, nil
	case cfg.DefaultMode != "":
		if !validMode(cfg.DefaultMode) {
			return ResolvedMode{}, fmt.Errorf("invalid configured defaultMode: %s", cfg.DefaultMode)
		}
		return ResolvedMode{Mode: cfg.DefaultMode, Source: "config.defaultMode"}, nil
	default:
		if !validMode(fallbackMode) {
			return ResolvedMode{}, fmt.Errorf("invalid fallback mode: %s", fallbackMode)
		}
		return ResolvedMode{Mode: fallbackMode, Source: "tool.default"}, nil
	}
}

func validMode(mode string) bool {
	switch mode {
	case ModeFree, ModeZAGuard, ModeGenZinstant, ModeGenCustom:
		return true
	default:
		return false
	}
}
