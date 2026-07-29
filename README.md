<div align="center">

# DualMind

**Biến một ý tưởng sản phẩm thô thành thiết kế Zalo Mini App chuẩn‑ship — có agent dẫn dắt bằng lựa chọn, canvas tự phản biện, và Figma craft thật.**

Ứng dụng desktop **local‑first** (Electron + React) cho toàn bộ vòng đời PM:
`Idea → Discovery → Decision → Delivery → Change Impact`.

</div>

---

## Mục lục

- [DualMind là gì](#dualmind-là-gì)
- [Tính năng chính](#tính-năng-chính)
- [Kiến trúc tổng quan](#kiến-trúc-tổng-quan)
- [Yêu cầu môi trường](#yêu-cầu-môi-trường)
- [Cài nhanh cho BGK](#cài-nhanh-cho-bgk)
- [Cài đặt & chạy (dev)](#cài-đặt--chạy-dev)
- [Cấu hình Provider (LLM)](#cấu-hình-provider-llm)
- [Kết nối Figma (tùy chọn)](#kết-nối-figma-tùy-chọn)
- [Canvas & cộng tác với AI ngoài](#canvas--cộng-tác-với-ai-ngoài)
- [Đóng gói (.dmg / .exe)](#đóng-gói-dmg--exe)
- [Release & versioning](#release--versioning)
- [Mô hình bảo mật](#mô-hình-bảo-mật)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Kiểm thử](#kiểm-thử)
- [Ghi chú license](#ghi-chú-license)

---

## DualMind là gì

DualMind là workspace PM chạy hoàn toàn **trên máy** (dữ liệu lưu SQLite local). Bạn mô tả một ý tưởng, agent dẫn bạn qua **Discovery → Decision → Delivery** bằng các bước có **lựa chọn bấm được** (không phải chatbot hỏi mở), dựng **user‑flow trên canvas** và **tự phản biện** tính đầy đủ của flow, rồi sinh **gói kickoff**: thiết kế **Figma chuẩn ZDS + prototype**, **backlog Jira**, **tài liệu Confluence**, và **PRD Markdown** — mọi thao tác ghi ra ngoài đều **qua duyệt + hash bất biến**.

Tên gọi = **Z** (Zalo) + **inspector** (soi/kiểm) — biểu tượng là chiếc kính lúp.

---

## Tính năng chính

### 1. Agent dẫn dắt bằng lựa chọn (không phải chatbot)
- Mô tả ý tưởng → agent trao đổi tự nhiên, **không tự ý** nhảy vào flow.
- Nút **“Bắt đầu Discovery”** kích hoạt guided flow: **3 clarification có lựa chọn sẵn** → **phương án MVP** (có “Đề xuất”) → vào Delivery.
- Máy trạng thái vòng đời có kiểm soát: `IDEA_INTAKE → DISCOVERY → DECISION → DELIVERY → CHANGE_IMPACT`.

### 2. Canvas semantic + tự phản biện flow
- Canvas dựng trên **tldraw 5** (self‑host asset, không gọi CDN).
- Node semantic: `note / process / decision / screen`; layout tự động bằng **dagre**.
- **Logical flow linter**: coi flow là đồ thị có hướng và tự gắn cờ **ngõ cụt, thiếu nhánh quyết định, nhánh không nhãn, vòng lặp không lối thoát, thiếu điểm kết thúc** — hiện ngay trong read‑back và badge canvas.
- **Free‑form primitives** (rect/ellipse/text/line/arrow, chart…) để phác nhanh; chỉ node semantic mới “promote” vào ProductSpec.

### 3. Figma craft chuẩn‑ship (tùy chọn, agentic)
- Nối một **ZDS reference file** → capture **component + icon** thật (vd 33 component, 240 icon `zi_zds_ic_*`).
- **Agentic craft worker** (qua Codex CLI) dựng thiết kế thật: component ZDS, icon thật, bố cục có gu, **prototype điều hướng bấm được**, tự QA (screenshot → refine → audit).
- **`/figma refine`**: sửa **tại chỗ** bản hiện tại. **`/figma regenerate`**: tạo bản mới, giữ bản cũ.
- **Không có Figma vẫn chạy**: nếu chưa kết nối / Figma lỗi, tự **hạ xuống mock** — gói kickoff vẫn ra **Jira + Confluence + PRD**.

### 4. Gói kickoff đa artifact
- **Figma** (thật hoặc mock) · **Jira backlog** (mock) · **Confluence/Zdoc** (mock) · **PRD Markdown** (export local).
- Nút **“Mở PRD.md / Mở backlog / Mở tài liệu Confluence”** để xem output.

### 5. ProductSpec là single source of truth
- Canvas → **Promote** → mỗi node semantic thành 1 requirement + 1 screen → Figma/Jira/Confluence sinh **từ chính ProductSpec đó**.
- **Change Impact**: sửa/loại scope hiển thị preview tác động trước khi áp dụng.

### 6. Đa provider LLM
- `Mock · Offline` (deterministic, không mạng) · `Codex · Local` · **OpenAI** · **Gemini** · **Claude** · **AgentRouter** (gateway OpenAI‑compatible tới 30+ model).

---

## Kiến trúc tổng quan

Monorepo **pnpm** + **TypeScript strict**:

| Package | Vai trò |
|---|---|
| `apps/desktop` | Electron app (main / preload / renderer React) |
| `packages/domain` | Zod schema + types (ProductSpec, plans, canvas, provider…) |
| `packages/agent-core` | Máy trạng thái vòng đời, approval, impact, execution |
| `packages/reasoning` | Provider LLM (Mock/Codex/OpenAI/Gemini/Anthropic/**AgentRouter**) + prompt |
| `packages/canvas` | Layout dagre + **flow linter** + canvas program |
| `packages/connectors` | Figma pipeline (capture ZDS, plan, apply), mock Jira/Zdoc, PRD markdown |
| `packages/persistence` | SQLite (threads, messages, provider profiles, lifecycle, outbox) |
| `mcp-tool/za-talk-to-figma` | Runtime **Go** (MCP) + **plugin Figma** cho craft |
| `skills/` | Skill packs (Figma craft) + **pm-lifecycle-canvas** (bridge cho AI ngoài) |

---

## Yêu cầu môi trường

| Bắt buộc | Ghi chú |
|---|---|
| **Node.js 24** + **pnpm 11** | Corepack tự bật pnpm |
| macOS (Apple Silicon) hoặc Windows | Bản build hiện có: macOS arm64 |

| Tùy chọn (theo tính năng) | Dùng cho |
|---|---|
| **Go 1.26+** | Build lại runtime `za-talk-to-figma` (Figma MCP) |
| **Figma desktop** + plugin `ZA Talk To Figma` | Kết nối Figma thật |
| **Codex CLI** (đã đăng nhập) | Agentic Figma craft worker |
| API key: OpenAI / Gemini / Anthropic / AgentRouter | Provider tương ứng |

---

## Cài nhanh cho BGK

BGK có thể cài từ GitHub Release mà không cần clone repo:

1. Mở `https://github.com/vtd182/ZA-ai-hackathon-26/releases`.
2. Tải `DualMind-<version>-arm64.dmg` cho macOS Apple Silicon hoặc `DualMind-Setup-<version>.exe` cho Windows.
3. Tải thêm `za-talk-to-figma-plugin.zip` nếu muốn kết nối Figma thật.
4. Làm theo [docs/JUDGE_INSTALL_GUIDE.md](docs/JUDGE_INSTALL_GUIDE.md) để bypass Gatekeeper/SmartScreen khi cần và import plugin Figma.

`latest.yml` và `*.blockmap` là metadata auto-update, không phải file cài thủ công.

---

## Cài đặt & chạy (dev)

Cách nhanh nhất (script tự lo pnpm/Corepack, cài deps, rebuild `better-sqlite3` đúng Electron ABI):

```bash
./run.sh setup     # lần đầu trên máy mới
./run.sh           # chạy dev (electron-vite)
```

Hoặc dùng pnpm trực tiếp:

```bash
pnpm install
pnpm --filter @pm-agent/desktop dev
```

Các lệnh kiểm tra:

```bash
pnpm typecheck        # hoặc ./run.sh typecheck
pnpm test             # hoặc ./run.sh test   (vitest)
pnpm build            # build tất cả package
./run.sh smoke        # smoke test luồng
```

> Xem thêm [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) để import plugin Figma.

---

## Cấu hình Provider (LLM)

Mở **Settings** trong app → chọn provider → nhập API key (mã hóa bằng Electron **`safeStorage`**). Hoặc dùng biến môi trường.

| Provider | Env key | Ghi chú |
|---|---|---|
| Mock · Offline | — | Chạy ngay, deterministic |
| Codex · Local | — | Dùng phiên `codex` CLI hiện có |
| OpenAI | `OPENAI_API_KEY` | Responses API |
| Gemini | `GEMINI_API_KEY` | |
| Claude | `ANTHROPIC_API_KEY` | |
| **AgentRouter** | `AGENTROUTER_API_KEY` | Gateway OpenAI‑compatible → GPT‑5/Claude/DeepSeek… |

**AgentRouter** — thêm sẵn, cách dùng:
1. Lấy API key tại **https://agentrouter.org/console/token**.
2. Chọn provider **AgentRouter** trong app → dán key (hoặc set `AGENTROUTER_API_KEY`).
3. **Đặt đúng model** trong ô cấu hình model của profile (mặc định `claude-opus-4-8`) — đảm bảo model nằm trong gói của API key (nếu không sẽ bị `content-blocked`).

> Model ID sửa được cho từng provider. Nếu model được route không hỗ trợ `json_schema strict`, đổi sang model hỗ trợ (GPT‑5 / Claude thường OK).

---

## Kết nối Figma (tùy chọn)

Runtime Go (Figma MCP) + plugin đã **đóng gói sẵn trong app** và **tự khởi động** ở `127.0.0.1:1802`. Bạn chỉ cần import plugin vào **Figma Desktop** một lần. Yêu cầu: **Figma Desktop** (import plugin dev không chạy trên trình duyệt).

### A. Nếu bạn cài từ bản release (.dmg / .exe)

1. Mở app → panel **Figma**. Bước 1 “Runtime local” tự chạy (nếu chưa, bấm **Khởi động**).
2. Bước 2 “Plugin build” → bấm **“Mở manifest”**. App mở Finder/Explorer ngay tại `manifest.json` đóng gói:
   - macOS: `DualMind.app/Contents/Resources/figma-runtime/plugin/manifest.json`
   - Windows: `resources/figma-runtime/plugin/manifest.json` (trong thư mục cài đặt)
3. Trong **Figma Desktop**: `Plugins → Development → Import plugin from manifest…` → chọn đúng `manifest.json` ở bước 2.
4. Chạy plugin **ZA Talk To Figma** → panel app chuyển **“Figma đã kết nối”**.

> macOS chưa ký: nếu runtime không chạy, gỡ quarantine `xattr -dr com.apple.quarantine /Applications/DualMind.app` rồi mở lại.

### B. Nếu bạn chạy từ source (dev)

1. Mở **Figma Desktop** → `Plugins → Development → Import plugin from manifest…` → chọn `mcp-tool/za-talk-to-figma/plugin/manifest.json`.
2. Chạy plugin **ZA Talk To Figma** (kết nối runtime local `127.0.0.1:1802`).

### Xác nhận nguồn (cả A và B)

- **Có ZDS**: mở **Page chứa component ZDS** (không phải Page output `DualMind · …`) → **“Dùng Page đang mở”** → panel hiện **“Live Design System · N components · M icons”**, craft **bám ZDS**.
- **Không có ZDS**: bấm **“Không dùng ZDS”** → chế độ **free-creative**, agent tự thiết kế và vẽ thẳng lên page target/page mới.

> Đổi file/page trong Figma thì phải **allowlist lại** (guardrail chống ghi nhầm).
>
> Không kết nối Figma **vẫn dùng được**: gói kickoff tự hạ Figma xuống mock, vẫn ra Jira + Confluence + PRD.

---

## Canvas & cộng tác với AI ngoài

Bất kỳ AI nào (Claude Code, Codex…) đọc/vẽ được canvas hiện tại qua **Canvas Bridge** (loopback + bearer token, tự sinh mỗi lần chạy).

Skill **global** đã cài tại `~/.claude/skills/pm-lifecycle-canvas/` (app tự cài kiểu tldraw). Ví dụ:

```bash
# App phải đang mở (bridge descriptor ở ~/.pm-lifecycle-agent/canvas-bridge.json)
sh "$HOME/.claude/skills/pm-lifecycle-canvas/pm-canvas.sh" GET  /api/threads
sh "$HOME/.claude/skills/pm-lifecycle-canvas/pm-canvas.sh" GET  /api/threads/THREAD_ID/canvas
sh "$HOME/.claude/skills/pm-lifecycle-canvas/pm-canvas.sh" POST /api/threads/THREAD_ID/programs '{"program":{...}}'
sh "$HOME/.claude/skills/pm-lifecycle-canvas/pm-canvas.sh" POST /api/threads/THREAD_ID/scripts  '{"script":"canvas.node(...)"}'
```

Quy tắc vẽ flow (đầy đủ + dễ nhìn) ở [`skills/pm-lifecycle-canvas/references/flow-craft.md`](skills/pm-lifecycle-canvas/references/flow-craft.md) — dùng chung cho cả agent lẫn AI ngoài. Bridge chỉ vẽ canvas trình bày; **không** đụng ProductSpec; JS chạy **sandbox** (không network/fs/Node).

---

## Đóng gói (.dmg / .exe)

Build cho **hệ điều hành hiện tại** (electron‑builder tự nhận OS):

```bash
./run.sh dist
```

- macOS → `apps/desktop/release/DualMind-<version>-arm64.dmg`
- Windows → `apps/desktop/release/DualMind-Setup-<version>.exe`
- Standalone Figma plugin bundle → `za-talk-to-figma-plugin.zip` in CI
- Standalone Figma runtime bundle → `za-talk-to-figma-runtime-<os>-<arch>.zip` in CI

**Cài trên macOS:** mở `.dmg` → kéo **DualMind** vào Applications. App **chưa ký** → lần đầu **chuột phải → Open** (Gatekeeper).

Đóng gói gồm: app bundle + native `better-sqlite3` (asar‑unpack) + `resources/skill-packs` + `resources/figma-runtime` (binary Go + plugin minimal: `manifest.json`, `dist/code.js`, `dist/index.html`, đúng theo OS). Icon lấy từ `build/icon.icns` (mac) / `build/icon.png` → `.ico` (win).

> Ký/notarize để phân phối rộng cần **Apple Developer ID** — bổ sung `mac.identity` + notarize khi có cert.

---

## Release & versioning

CI tự build **macOS + Windows** và tạo **GitHub Release** khi bạn push một **tag version**.

**Quy trình cập nhật:**

```bash
# 1) Bump version trong apps/desktop/package.json  (vd 0.1.0 -> 0.1.1)
# 2) Commit
git commit -am "release: v0.1.1"
# 3) Tag khớp version rồi push tag
git tag v0.1.1
git push origin v0.1.1
```

Workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) sẽ:
1. Build **plugin Figma** bundle một lần trên Ubuntu vì `manifest.json` + `dist/*` là platform-independent.
2. Build runtime **Go** cho từng OS (`za-talk-to-figma` / `.exe`) vì binary native khác nhau giữa macOS và Windows.
3. Chuẩn bị packaged resources gồm skill packs + Figma runtime/plugin minimal.
4. Chạy `electron-vite build` + `electron-builder --publish never` trên **macos-latest** và **windows-latest** để tạo installer local trong job.
5. Gom tất cả artifact vào một job publish duy nhất và tạo **GitHub Release** của tag, đính kèm `.dmg` (macOS) + `Setup .exe` (Windows) + `blockmap`/`latest*.yml` + `za-talk-to-figma-plugin.zip` + `za-talk-to-figma-runtime-<os>-<arch>.zip`.

> Bản `release/` là build artifact (đã gitignore) — không commit; luôn build lại qua tag hoặc `run dist`.

---

## Mô hình bảo mật

- **Local‑first**: threads, messages, provider profiles, lifecycle, canvas snapshot lưu SQLite trong Electron user‑data. API key mã hóa qua `safeStorage`.
- **Duyệt + hash bất biến**: mọi write ra ngoài (Figma/Jira/Confluence) phải được **approve**, payload gắn **hash bất biến**; execution độc lập per‑target (một target lỗi không kéo sập target khác).
- **Renderer khóa CSP** (không `unsafe-eval`), font/asset **self‑host** (không CDN lúc chạy).
- **Canvas Bridge**: chỉ loopback + bearer token ephemeral; script JS chạy sandbox (`node:vm`, không network/fs/Node/Electron).
- **Dữ liệu sandbox tổng hợp** — không dùng PII/production; Jira/Confluence là mock.

---

## Cấu trúc dự án

```
apps/desktop/            Electron app (main, preload, renderer)
  build/                 icon.icns / icon.png / icon.svg (nguồn icon)
packages/                domain, agent-core, reasoning, canvas, connectors, persistence, shared
fixtures/                synthetic ZDS + meal-ordering ProductSpec
mcp-tool/za-talk-to-figma/  Go MCP runtime + plugin Figma
skills/                  pm-lifecycle-canvas (bridge) + pm-lifecycle-figma-* (craft)
docs/                    JUDGE_INSTALL_GUIDE, GETTING_STARTED, SKILL_PACKAGING
.github/workflows/       release.yml (tag → build mac+win → GitHub Release)
```

---

## Kiểm thử

```bash
pnpm test                 # vitest (toàn workspace)
pnpm typecheck            # tsc strict tất cả package
# plugin Figma (bun):
cd mcp-tool/za-talk-to-figma/plugin && bun test
```

---

## Ghi chú license

Canvas dùng SDK phát hành chính thức **`tldraw@5.2.5`**, asset self‑host từ `@tldraw/assets@5.2.5`. Development/testing được phép theo license tldraw; **trước khi phát hành production**, cấu hình trial/commercial/hobby license key phù hợp và giữ nguyên license notices.
