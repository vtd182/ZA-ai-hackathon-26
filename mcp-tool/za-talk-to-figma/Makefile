.PHONY: test test-go test-ts typecheck-ts coverage coverage-go coverage-go-html coverage-ts build build-go build-ts reload-mcp build-and-reload dev-watch release

RELEASE_DIR ?= ../za-talk-to-figma-release

build: build-go build-ts

build-go:
	go build -o bin/za-talk-to-figma ./cmd/za-talk-to-figma

build-ts: typecheck-ts
	cd plugin && bun run build

typecheck-ts:
	cd plugin && bunx tsc --noEmit -p tsconfig.json

test: test-go test-ts

test-go:
	go test ./...

test-ts:
	cd plugin && bun test

coverage: coverage-go coverage-ts

coverage-go:
	go test -coverprofile=bin/coverage.out ./... && go tool cover -func=bin/coverage.out

coverage-ts:
	cd plugin && bun test --coverage

reload-mcp:
	./scripts/reload-mcp.sh

build-and-reload: build-go
	./scripts/reload-mcp.sh

dev-watch:
	node ./scripts/dev-watch.mjs

release: build
	cp bin/za-talk-to-figma $(RELEASE_DIR)/za-talk-to-figma
	cp plugin/dist/code.js $(RELEASE_DIR)/plugin/dist/code.js
	cp plugin/dist/index.html $(RELEASE_DIR)/plugin/dist/index.html
	@echo "Released to $(RELEASE_DIR)"
