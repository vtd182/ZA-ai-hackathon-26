package core

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildZinstantFiles(t *testing.T) {
	root := &zEmitNode{
		ID:        "1:1",
		Name:      "Hero Screen",
		Type:      "FRAME",
		Tag:       "div",
		ClassName: "hero-screen",
		Width:     320,
		Height:    640,
		Direction: "column",
		Children: []*zEmitNode{
			{
				ID:        "1:2",
				Name:      "Title",
				Type:      "TEXT",
				Tag:       "p",
				ClassName: "hero-screen-title",
				TextKey:   "title",
				TextValue: "Welcome",
				TextColor: "#111111",
			},
		},
	}

	files := buildZinstantFiles("hero-screen", root, map[string]string{"title": "Welcome"}, "Hero Screen")
	required := []string{
		"package.json",
		"tsconfig.json",
		"zinstantconfig.json",
		"config/bundle.json",
		"zhtml/index.zhtml",
		"src/index.ts",
		"za-talk-to-figma.manifest.json",
	}
	for _, name := range required {
		if _, ok := files[name]; !ok {
			t.Fatalf("missing generated file %q", name)
		}
	}
	if strings.Contains(files["zinstantconfig.json"], "jsonMappingFile") {
		t.Fatal("zinstantconfig.json must use bundleDataFile, not jsonMappingFile")
	}
	if !strings.Contains(files["zinstantconfig.json"], "bundleDataFile") {
		t.Fatal("zinstantconfig.json missing bundleDataFile key")
	}
	if !strings.Contains(files["zhtml/index.zhtml"], "{{title}}") {
		t.Fatalf("zhtml missing text binding: %s", files["zhtml/index.zhtml"])
	}
	if !strings.Contains(files["src/index.ts"], "document.ready") {
		t.Fatalf("src/index.ts missing document.ready scaffold")
	}
}

func TestWriteGeneratedFiles(t *testing.T) {
	dir := t.TempDir()
	files := map[string]string{
		"config/bundle.json": "{\"title\":\"Hello\"}\n",
		"src/index.ts":       "document.ready(() => {});\n",
	}

	if err := writeGeneratedFiles(dir, files); err != nil {
		t.Fatalf("writeGeneratedFiles first write: %v", err)
	}
	for rel := range files {
		fullPath := filepath.Join(dir, rel)
		if _, err := os.Stat(fullPath); err != nil {
			t.Fatalf("expected file %s: %v", fullPath, err)
		}
	}
	// Second write should succeed (overwrite allowed)
	if err := writeGeneratedFiles(dir, files); err != nil {
		t.Fatalf("writeGeneratedFiles second write (overwrite): %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "config/bundle.json"))
	if err != nil {
		t.Fatalf("read after overwrite: %v", err)
	}
	if string(data) != "{\"title\":\"Hello\"}\n" {
		t.Fatalf("overwrite content mismatch: %q", string(data))
	}
}

func TestBuildEmitNode_TextBindingAndDirection(t *testing.T) {
	root := zGenNode{
		ID:   "1:1",
		Name: "Card",
		Type: "FRAME",
		Bounds: &zGenBounds{
			X: 0, Y: 0, Width: 240, Height: 120,
		},
		Children: []zGenNode{
			{
				ID:         "1:2",
				Name:       "Label",
				Type:       "TEXT",
				Characters: "Hello",
				Bounds: &zGenBounds{
					X: 10, Y: 10, Width: 80, Height: 20,
				},
				Styles: map[string]interface{}{"fills": []interface{}{"#111111"}},
			},
			{
				ID:         "1:3",
				Name:       "Value",
				Type:       "TEXT",
				Characters: "World",
				Bounds: &zGenBounds{
					X: 10, Y: 40, Width: 80, Height: 20,
				},
				Styles: map[string]interface{}{"fills": []interface{}{"#222222"}},
			},
		},
	}

	tree, bindings, _ := buildZEmitTree(root)
	if tree.Direction != "column" {
		t.Fatalf("Direction = %q, want column", tree.Direction)
	}
	if len(bindings) != 2 {
		t.Fatalf("len(bindings) = %d, want 2", len(bindings))
	}
	if tree.Children[0].TextKey == "" || tree.Children[1].TextKey == "" {
		t.Fatal("expected text binding keys on text children")
	}
}
