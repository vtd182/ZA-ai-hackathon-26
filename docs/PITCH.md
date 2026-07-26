# Pitch & demo script — Zalo Product Kickoff Agent

## One-liner

> **Zalo Product Kickoff Agent** — một AI agent giúp PM/PO trong hệ sinh thái Zalo biến
> một ý tưởng **OA / Mini App / Bot** thành kickoff package nhất quán (ProductSpec, PRD,
> user flow, prototype, backlog) **có traceability, human approval và verified sync** sang
> Figma — và tự phân tích impact khi scope thay đổi.

Không phải "AI viết PRD". Đây là **agent điều phối vòng đời sản phẩm** có kiểm soát.

## Vì sao thuộc "Agentic AI in Zalo Ecosystem"

- Đầu vào là ý tưởng cho **OA / Mini App / Bot** của Zalo (demo: Mini App đặt suất ăn nội
  bộ, nhắc backup, đặt chuyến).
- Agent tự **discovery → hỏi clarification → sinh option → tổng hợp ProductSpec → preview
  artifact → xin approval → write + verify** — một workflow automation agent thực thụ.
- Guardrail đúng tinh thần sản phẩm Zalo: mọi external write cần approval gắn payload-hash,
  đọc lại (read-back) để verify, dữ liệu synthetic/sandbox, không PII/production.

## Ba điểm khác biệt để "wow"

1. **🔒 Verified change loop** — signature moment *"Bỏ payment khỏi MVP"* → impact set đúng
   → before/after → approval → ProductSpec v2 → Figma cập nhật và **read-back verified**.
   Đây là thứ làm sản phẩm "thật", không phải slideware.
2. **🤝 Multi-agent trên cùng canvas (mới)** — chip **"AI Canvas"** ở header cho thấy Dev
   Canvas Bridge đang chạy. Từ terminal, một Claude Code / Codex gõ *"vẽ user flow"* và nét
   vẽ **hiện live trong app**. Skill tự cài vào `~/.claude/skills` trên bất kỳ máy nào (như
   tldraw). Chưa đối thủ hackathon nào có mặt này.
3. **🧩 Provider-agnostic** — Mock/Codex offline (demo an toàn) + OpenAI/Gemini/Anthropic
   native, switch tại safe checkpoint. "Bring your own AI".

## Business impact (định lượng để nói trên sân khấu)

- Kickoff một tính năng thủ công: **~2–3 ngày** (PM viết spec, căn với design, tạo ticket,
  đồng bộ khi scope đổi).
- Với agent: **~30 phút** tới kickoff package có traceability + Figma verified.
- Giá trị lớn nhất **không phải tốc độ mà là nhất quán**: một nguồn sự thật (ProductSpec),
  impact khi đổi scope được tính tự động → giảm rework và lệch scope giữa PM/design/dev.

## Demo script (~5 phút, chạy Mock/Codex offline)

1. **Mở app** — chỉ chip "AI Canvas" (bridge sẵn sàng) + provider `Mock · Offline`.
2. **Ý tưởng** — gõ ý tưởng Mini App (đặt suất ăn / nhắc backup). Agent discovery → 3 câu
   hỏi → 2–3 option → chọn → **ProductSpec** sinh ra (inspector cập nhật).
3. **Vẽ flow** — *"Vẽ toàn bộ user flow"* → workflow 17 node hiện trên canvas (dot-grid,
   card có accent, lane). *(Tùy chọn wow: từ terminal Claude Code vẽ thêm — hiện live.)*
4. **Prototype** — *"Vẽ prototype các màn hình"* → 5 frame Mini App low-fi editable.
5. **Signature change** — *"Bỏ payment khỏi MVP"* → impact set 5 entity, before/after,
   **approval card**.
6. **Kickoff package** — Duyệt → Figma (Mock hoặc live ZDS) + PRD.md + backlog mock, tất cả
   **verified** (đọc lại). Mở `PRD.md`.
7. **Chốt** — nhấn mạnh: mọi write có approval + read-back; một nguồn sự thật; multi-agent
   canvas.

**Backup:** nếu demo live hỏng → dùng screenshot/video đã capture (bundle export của thread).
Không chọn Gemini cho demo live (đã có timeout/cancel nhưng ưu tiên Mock/Codex offline).

## Đối chiếu 5 tiêu chí

| Tiêu chí | Điểm nhấn khi pitch |
| --- | --- |
| Idea Advancement | Agent orchestration có traceability/approval/verification/impact, không phải chatbot. |
| Business Impact | Kickoff 2–3 ngày → 30 phút; giảm rework nhờ một nguồn sự thật + impact tự động. |
| Product Design | Canvas design-tool (grid, prototype editable), signature "bỏ payment", verified card. |
| Tech Excellence | ProductSpec source-of-truth, SQLite outbox, payload-hash approval, read-back verify, provider-agnostic, skill packaging. |
| Pitch/Zalo fit | Khung OA/Mini App/Bot rõ ràng; guardrail synthetic/sandbox; multi-agent canvas là điểm nhớ. |
