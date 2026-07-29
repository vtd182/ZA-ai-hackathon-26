# DualMind — Kịch bản quay demo (MOCK, click-by-click cho BGK)

> Toàn bộ chạy **offline / Mock**, **không API key, không Figma live**, **không lo timeout**. Bạn chỉ việc bấm/gõ đúng theo từng bước. Mock là **deterministic** nên quay lần nào cũng ra y hệt.
> Tổng thời lượng mục tiêu: **~3–4 phút**. Flow: **chat → Khám phá → Quyết định → ProductSpec/PRD → sửa canvas → sinh Figma (mock) → xem PRD/backlog/Figma**.

---

## 0. Chuẩn bị (làm trước khi bấm record)

1. Chạy app: `pnpm --filter @pm-agent/desktop dev` (hoặc mở bản đã cài). Full-screen.
2. **Provider = Mock · Offline**: dropdown provider trên topbar → chọn **Mock · Offline** (chấm xanh, `deterministic-v1`). ⚠️ ĐỪNG dùng AgentRouter khi quay (dễ chậm/timeout).
3. **Reset cho sạch**: `⌘,` → **Workspace → Reset** → xác nhận. (Cho trạng thái tái lập.)
4. Kéo **mép trái khung chat** sang trái để nới rộng ~1 chút cho dễ đọc.
5. Bấm record.

---

## Cảnh 1 — Chat ý tưởng + Khám phá bằng LỰA CHỌN (0:00–0:55)

1. Bấm **＋** (New chat) ở góc phải khung chat → thread trống.
2. Gõ vào ô chat và Enter:
   > `Tôi muốn làm Mini App đặt suất ăn trưa theo nhóm cho văn phòng`
   → Agent (mock) trả lời hội thoại ngắn.
3. Trên **stepper** (thanh "Bước 1/5") bấm nút **"Chốt ý tưởng → Khám phá"**.
   → Nhảy sang **Khám phá**, hiện **3 câu hỏi lựa chọn**.
4. Bấm chọn nhanh mỗi câu 1 đáp án (demo gợi ý):
   - *Ai là người dùng chính?* → **Nhân viên văn phòng**
   - *Outcome ưu tiên của MVP?* → **Giảm thời gian chờ**
   - *Constraint nào cần khóa trước?* → **Mini App only**
5. Bấm nút **"Tạo phương án"**.

**Lời thoại:** "DualMind không phải chatbot mở — nó dẫn bằng **lựa chọn bấm được**: khóa đúng 3 câu Khám phá để làm rõ scope, rồi tạo phương án MVP."

---

## Cảnh 2 — Quyết định → ProductSpec (0:55–1:25)

1. Ở bước **Quyết định**, panel hiện các **phương án MVP**. Bấm chọn **một phương án**.
   → Agent tổng hợp **ProductSpec**, nhảy sang **Delivery**. Panel **"Delivery workspace"** hiện với số **Req / Screen / Story**.
2. (Nếu muốn) bấm thẻ **ProductSpec** phía trên để xem nhanh requirement/screen.

**Lời thoại:** "Chọn một phương án → agent chốt thành **ProductSpec** — nguồn sự thật duy nhất để sinh mọi artifact."

> ⚠️ Nếu nút **"Tạo kickoff package"** đang mờ (spec còn mỏng): bấm nút **"ProductSpec"** trong Delivery workspace 1 lần để agent bổ sung scope, hoặc dùng **Reset** (fixture *đặt suất ăn trưa* có sẵn 4 Req/4 Screen/4 Story — giàu nội dung nhất để quay).

---

## Cảnh 3 — Chốt ProductSpec + xem PRD/tài liệu (1:25–2:00)

1. Trong **Delivery workspace**, bấm **"Chốt ProductSpec"** (khóa source of truth) → trạng thái **Confirmed**.
2. Bấm thẻ **ProductSpec** (góc phải panel spec) → mở overview đầy đủ requirement/screen/story. Lướt cho thấy nội dung.

**Lời thoại:** "Chốt ProductSpec để khóa phạm vi. Đây là bản đặc tả agent tự dựng, sẽ dùng chung cho Figma, backlog và PRD."

---

## Cảnh 4 — Sửa CANVAS: vẽ user flow (2:00–2:45)

1. Trong **Delivery workspace**, bấm nút **"User flow"**.
   → Agent (mock) **vẽ user-flow lên canvas** bên trái (các node + mũi tên, layout tự động).
2. Chỉ vào **Logical Flow Linter** ở góc canvas (badge "Scene sạch" / cảnh báo) — DualMind tự soi ngõ cụt / nhánh thiếu / vòng lặp.
3. **Chọn 1 node** trên canvas → chip **"Context canvas"** hiện ngay trên ô chat → gõ:
   > `Thêm nhánh xử lý khi hết suất ăn`
   → Agent cập nhật canvas đúng vùng.
4. (Tùy chọn) bấm **"Prototype"** trong Delivery workspace để vẽ 3–5 màn hình bấm được.

**Lời thoại:** "Từ ProductSpec, agent dựng **user-flow trên Infinity Canvas** và **tự phản biện** logic. Tôi chọn đúng vùng cần sửa và chat ngay về vùng đó."

---

## Cảnh 5 — Sinh Figma + PRD + backlog (có DUYỆT + HASH) (2:45–3:40)

1. Bấm **"Tạo kickoff package"** (Delivery workspace).
   → Hiện panel **duyệt**: 4 target **Figma · Backlog · Confluence · PRD.md** kèm **payload hash bất biến** (zoom vào cho thấy hash).
2. Bấm **"Duyệt & tạo"**.
   → **ExecutionPanel** chạy từng target, kết thúc **verified** (read-back). Ở mock: Figma tự dựng **bản preview**, Jira/Confluence/PRD đều mock.
3. Bấm **"Mở backlog"** → modal **Phân rã task (Jira)**: Epic + Story + acceptance criteria.
4. Bấm **"Mở tài liệu Confluence"** → modal **tài liệu**: summary + section theo requirement.
5. Bấm **"Mở tài liệu"** (PRD) → mở file **PRD.md** local.

**Lời thoại:** "Delivery sinh trọn gói kickoff — Figma, backlog Jira, tài liệu Confluence, PRD Markdown. **Mọi ghi ra ngoài đều qua DUYỆT + hash bất biến + read-back verify**. Và tôi review **ngay trong app** trước khi export."

---

## Cảnh 6 — Kết (3:40–4:00)

Về màn tổng: canvas có user-flow, khung chat có gói kickoff **verified**.

**Lời thoại:** "Từ một ý tưởng, **DualMind** dẫn qua Khám phá → Quyết định → Delivery bằng lựa chọn, dựng flow tự phản biện, rồi sinh gói kickoff có kiểm soát — **local-first, offline, không cần một API key nào**."

---

## Bản 90 giây (teaser)
1. (0–15s) Mock offline + 5 bước.
2. (15–40s) Gõ ý tưởng → **"Chốt ý tưởng → Khám phá"** → chọn 3 clarification → **"Tạo phương án"**.
3. (40–55s) Chọn MVP → ProductSpec → **"Chốt ProductSpec"**.
4. (55–75s) **"User flow"** vẽ canvas + linter.
5. (75–90s) **"Tạo kickoff package" → "Duyệt & tạo"** → mở **backlog + PRD**. Chốt: "offline, không API key".

---

## Nút/nhãn cần bấm (tra nhanh khi quay)

| Bước | Bấm gì |
|---|---|
| Chat mới | **＋** góc phải khung chat |
| Idea → Khám phá | stepper: **"Chốt ý tưởng → Khám phá"** |
| Trả lời Khám phá | chọn đáp án từng câu → **"Tạo phương án"** |
| (Bỏ qua Khám phá) | stepper: **"Sang Quyết định (dùng giả định)"** |
| Chọn MVP | bấm 1 thẻ phương án trong panel Quyết định |
| Khóa spec | **"Chốt ProductSpec"** |
| Vẽ canvas | **"User flow"** / **"Prototype"** |
| Chat theo vùng chọn | chọn node → gõ vào ô chat |
| Sinh artifact | **"Tạo kickoff package" → "Duyệt & tạo"** |
| Xem kết quả | **"Mở backlog"**, **"Mở tài liệu Confluence"**, **"Mở tài liệu"** |

## Lưu ý chống vỡ khi quay
- **Luôn Reset trước mỗi lần quay** → trạng thái y hệt.
- **Chỉ dùng Mock · Offline** khi quay (AgentRouter/Codex có thể chậm/timeout, không hợp cho video nhanh).
- Nếu một panel chiếm chỗ (Delivery workspace / Reasoning turn), bấm **chevron thu gọn** để lộ khung chat; kéo mép trái để nới rộng.
- Nếu **"Tạo kickoff package"** mờ: bấm **"ProductSpec"** (bổ sung scope) hoặc **Reset** dùng fixture giàu sẵn.
