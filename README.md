# PM Lifecycle Agent

Local-first Electron workspace cho PM discovery, decision, delivery mapping và change impact.

## Chạy ứng dụng

```bash
./run.sh
```

Script tự dùng `pnpm` hoặc Corepack, cài dependencies khi cần và rebuild `better-sqlite3` đúng Electron ABI.

Các mode kiểm tra:

```bash
./run.sh typecheck
./run.sh test
./run.sh build
./run.sh smoke
```

## Provider

- `Mock · Offline` chạy ngay, deterministic và không gọi mạng.
- `Codex · Local login` dùng `codex app-server` và phiên Codex CLI hiện có.
- OpenAI, Gemini và Claude dùng native SDK; API key nhập trong Settings được mã hóa qua Electron `safeStorage`.
- Có thể dùng biến môi trường `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` thay cho Keychain.

Model ID là cấu hình có thể sửa cho từng provider. Lịch sử, message, provider segment và canvas snapshot được lưu local trong SQLite tại Electron user data directory.

## tldraw

Canvas dùng SDK phát hành chính thức `tldraw@5.2.5`; icon, font và translation được self-host từ `@tldraw/assets@5.2.5`, không gọi CDN lúc chạy. Không clone cả monorepo `tldraw/tldraw` vì app đang consume SDK, không sửa source upstream.

Development/testing được phép theo tldraw license. Trước khi phát hành production, cấu hình trial/commercial/hobby license key phù hợp và giữ nguyên license notices.
