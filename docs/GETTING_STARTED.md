# Getting started

## Prerequisites

- macOS with Figma Desktop;
- Node.js 22+ with Corepack/pnpm;
- Go 1.24+ and Bun 1.3+ for the local Figma bridge build;
- Codex CLI only when using the Codex provider. Mock Offline works without login or API keys.

No Figma REST token is required. Jira and Zdoc remain labeled local mocks.

## First-time setup

From the repository root:

```bash
./run.sh setup
./run.sh
```

`setup` installs workspace dependencies when needed, rebuilds the native SQLite module, builds the local Go runtime and creates the Figma plugin bundle.

## Import the Figma plugin

1. In PM Lifecycle Agent, click **Figma** in the top toolbar.
2. Confirm **Runtime local** and **Plugin build** are ready.
3. Click **Open manifest**.
4. In Figma Desktop, choose **Plugins → Development → Import plugin from manifest…**.
5. Select the revealed `manifest.json`.
6. Run **ZA Talk To Figma** from Figma's Development plugins.

The setup dialog polls the local runtime and changes to **Ready for preflight** when the plugin session connects. Keep the plugin open while using the integration.

## Troubleshooting

- **Runtime missing:** run `./run.sh setup` again and check that Go and Bun are on `PATH`.
- **Waiting for plugin:** run the imported plugin in the same Figma Desktop window containing the sandbox file.
- **Port 1802 occupied:** open **Runtime console** from the setup dialog. The runtime can share an existing healthy leader on that port.
- **White Electron window:** run `./run.sh build` then `./run.sh smoke`; the smoke result must report `passed: true`.

Do not use production files or internal/customer data for the hackathon demo. The first connected file will not be written until a target page is explicitly allowlisted and a plan is approved.

