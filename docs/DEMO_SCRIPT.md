# DualMind — Kịch bản quay Demo (Mock mode)

> Mục tiêu: một video **4–6 phút** chạy hoàn toàn **offline / mock** (không cần API key, không cần Figma live), lột tả đủ chức năng: guided lifecycle bằng lựa chọn, Infinity Canvas + tự phản biện flow, promote thành ProductSpec, kickoff package có duyệt + hash bất biến, review phân rã task & tài liệu ngay trong app, và các tiện ích workspace.

---

## 0. Chuẩn bị trước khi quay

| Việc | Cách làm |
|---|---|
| Chạy app | `pnpm --filter @pm-agent/desktop dev` (hoặc mở bản `.dmg` đã cài) |
| Kích thước cửa sổ | Full-screen hoặc ≥ 1440×900 để 2 cột (canvas + chat) rõ ràng |
| Provider | Dropdown trên topbar → chọn **Mock · Offline** (`deterministic-v1`). Chấm xanh = sẵn sàng, **không cần key** |
| Trạng thái sạch | **⌘,** (hoặc menu **DualMind → Cài đặt…**) → **Workspace → Reset** → xác nhận. App nạp fixture *"Mini App đặt suất ăn trưa cho nhân viên"* — tái lập được 100% |
| Ẩn nhiễu | Đóng devtools, tắt thông báo hệ thống, ẩn thanh Dock nếu quay full-screen |
| Con trỏ | Bật hiệu ứng highlight click (Screen Studio / Keycastr) để người xem thấy thao tác |

> Mẹo: quay **từng cảnh rời** rồi ghép, dễ hơn one-take. Mỗi cảnh dưới đây ghi rõ *Thao tác → Kết quả kỳ vọng → Lời thoại*.

---

## Cảnh 1 — Mở màn & định vị (0:00 – 0:25)

**Thao tác:** Mở app ở trạng thái vừa reset. Rê chuột chậm qua topbar: chấm xanh provider **Mock · Offline**, badge **Figma**, gear **Cài đặt**; rồi qua panel chat bên phải (stepper 5 bước).

**Kết quả:** Thấy 2 cột — canvas trái, chat phải. Stepper: **Ý tưởng · Khám phá · Quyết định · Delivery · Kickoff Figma**.

**Lời thoại:**
> "Đây là **DualMind** — workspace cho Product Manager, chạy **hoàn toàn trên máy**, dữ liệu lưu SQLite local. Hôm nay tôi chạy ở chế độ **Mock offline**: không cần API key, không cần kết nối gì — mọi thứ vẫn hoạt động đầy đủ. Nó dẫn tôi đi qua 5 bước: Ý tưởng → Khám phá → Quyết định → Delivery → Kickoff."

---

## Cảnh 2 — Guided discovery bằng LỰA CHỌN, không phải chatbot mở (0:25 – 1:20)

**Thao tác:**
1. Bấm nút **＋ (Cuộc hội thoại mới)** ở góc phải panel chat → mở thread trống.
2. Gõ một ý tưởng vào ô nhập, ví dụ: *"Mini App đặt suất ăn trưa theo nhóm cho văn phòng"* → Enter.
3. Khi agent phản hồi, bấm nút **"Bắt đầu Discovery"**.
4. Agent khoá **3 câu Khám phá** dạng **lựa chọn bấm được** → bấm chọn từng phương án (không gõ tự do).
5. Sang bước **Quyết định**: agent đưa các **phương án MVP** → bấm chọn một phương án.

**Kết quả:** Stepper nhảy **Ý tưởng → Khám phá → Quyết định**. Panel chat hiện các thẻ lựa chọn (đã bounded + cuộn gọn, không tràn). Sau khi chốt MVP, agent tổng hợp **ProductSpec**.

**Lời thoại:**
> "Điểm khác biệt: DualMind **không phải chatbot hỏi mở**. Nó dẫn bằng **lựa chọn bấm được** — khoá đúng 3 câu Khám phá để làm rõ scope, rồi đưa vài phương án MVP để tôi chọn. Nhờ vậy đầu ra **hội tụ nhanh và nhất quán**, thay vì chat lan man."

---

## Cảnh 3 — Infinity Canvas + TỰ PHẢN BIỆN flow (1:20 – 2:20)

> Dùng thread fixture *"Mini App đặt suất ăn trưa…"* (đã có sẵn sau reset) để canvas giàu nội dung. Bấm **Lịch sử** (biểu tượng đồng hồ ở panel chat) → chọn thread này.

**Thao tác:**
1. Gõ yêu cầu vào chat: *"Vẽ user-flow cho luồng đặt suất ăn theo nhóm"* → agent vẽ **user-flow** lên canvas (node semantic + mũi tên). Zoom/pan để khoe layout dagre có định hướng. *(Mock là deterministic nên lần nào cũng ra cùng flow.)*
2. Chỉ vào các node bị **tô đỏ / cảnh báo** do **Logical Flow Linter** phát hiện: ngõ cụt (dead-end), nhánh thiếu điều kiện, hoặc vòng lặp vô tận.
3. Kéo chọn (select) một node/vùng → chip **"Context canvas"** hiện **ngay trên khung chat** → bấm icon 💬 để "chat về vùng đang chọn".
4. Gõ yêu cầu sửa (ví dụ *"thêm nhánh xử lý hết suất"*) → agent cập nhật canvas.

**Kết quả:** Canvas cập nhật; cảnh báo linter giảm đi. Chip selection nằm sát ô nhập, **không làm giật UI**.

**Lời thoại:**
> "DualMind dựng **user-flow trên Infinity Canvas** và **tự phản biện**: nó coi flow như một đồ thị có hướng, tự tô đỏ **ngõ cụt, nhánh thiếu điều kiện, vòng lặp vô tận**. Tôi chọn đúng vùng cần sửa, chat ngay về vùng đó — mọi lỗ hổng logic được bít **trước khi** đụng tới thiết kế hay code."

---

## Cảnh 4 — Chốt Canvas → ProductSpec (2:20 – 2:50)

**Thao tác:**
1. Bấm **"Chốt canvas → ProductSpec"** (nút xuất hiện trong stepper/hint khi có node trên canvas).
2. Xem preview: số **Requirement / Screen / Story** sinh ra từ các node semantic → bấm **Xác nhận**.
3. Mở **ProductSpec Inspector** (bấm thẻ spec) để lướt qua requirements/screens.

**Kết quả:** Mỗi node semantic → 1 requirement + 1 screen; ProductSpec có version.

**Lời thoại:**
> "Khi flow đã chắc, tôi **chốt canvas thành ProductSpec** — mỗi node trở thành requirement và screen có truy vết. Từ **một ProductSpec duy nhất** này, toàn bộ gói kickoff sẽ được sinh ra."

---

## Cảnh 5 — Kickoff package: duyệt + HASH BẤT BIẾN (2:50 – 3:50)

**Thao tác:**
1. Sang bước **Delivery** → bấm **"Tạo kickoff package"**.
2. App hiện panel **duyệt**: liệt kê 4 target — **Figma · Backlog (Jira) · Tài liệu (Confluence) · PRD.md** — kèm **payload hash bất biến**. Zoom vào cho thấy hash.
3. Bấm **"Duyệt & tạo"**.
4. Quan sát **ExecutionPanel** chạy từng target với tiến trình, kết thúc trạng thái **verified** (read-back).

**Kết quả:** Ở mock mode, Figma **tự hạ xuống bản mock/free-creative** (không cần plugin), Jira & Confluence là mock, PRD.md xuất ra local. Mọi target **verified độc lập**.

**Lời thoại:**
> "Delivery sinh trọn **gói kickoff**: thiết kế Figma, backlog Jira, tài liệu Confluence và PRD Markdown. Điểm mấu chốt về quản trị: **mọi thao tác ghi ra ngoài đều phải qua DUYỆT**, payload gắn **hash bất biến**, và mỗi target **verified bằng read-back** độc lập — một target lỗi không kéo sập target khác. Vì đang mock nên Figma **tự hạ xuống bản preview**, nhưng **Jira, Confluence, PRD vẫn ra đủ** — app **dùng được kể cả khi không có Figma**."

---

## Cảnh 6 — Review PHÂN RÃ TASK & TÀI LIỆU ngay trong app (3:50 – 4:40)

**Thao tác:**
1. Trong ExecutionPanel bấm **"Mở backlog"** → modal **Phân rã task (Jira)**: **Epic** + danh sách **Story** (tiêu đề, requirement, acceptance criteria, trạng thái). Cuộn cho thấy chi tiết.
2. Bấm **"Mở tài liệu Confluence"** → modal **Tài liệu**: summary + **section theo từng requirement** (mô tả, priority, AC, screens, stories).
3. Chỉ vào nút **"Mở file .md"** trong modal (xuất file gốc).

**Kết quả:** Xem được **cách agent phân rã task** và **nội dung tài liệu** trực tiếp — không phải mở file rời.

**Lời thoại:**
> "Trước khi đẩy đi đâu, tôi **review ngay trong app**: đây là cách agent **phân rã task** — Epic và các Story kèm acceptance criteria; và đây là **tài liệu** dựng theo từng requirement. Bản này đã sẵn sàng để **đẩy sang Jira/Confluence qua MCP** ở bước tiếp theo."

---

## Cảnh 7 — Tiện ích workspace & quản trị UI (4:40 – 5:30)

**Thao tác (lướt nhanh, mỗi ý ~4–6s):**
1. **Đổi tên hội thoại:** bấm tiêu đề trên topbar (icon ✏️) → gõ tên mới → Enter.
2. **Lịch sử:** bấm icon đồng hồ ở panel chat → dialog History (tìm, mở, đổi tên, lưu trữ). Bấm **＋** tạo chat mới — thử bấm lần nữa để cho thấy **không sinh thread rỗng trùng lặp**.
3. **Đổi provider:** mở dropdown provider trên topbar (Mock/Codex/OpenAI/Gemini/Claude/AgentRouter) — nhấn mạnh có thể chuyển mà **giữ nguyên context**.
4. **Cài đặt:** **⌘,** hoặc menu **DualMind → Cài đặt…** → dialog gồm Providers · Tích hợp (Figma, Atlassian) · Workspace (Reset).
5. **Export:** bấm icon **tải xuống** ở panel chat → xuất bundle (transcript + ProductSpec + canvas + review).
6. **Thu gọn stepper:** bấm mũi tên thu gọn thanh tiến trình để lấy thêm chỗ cho chat.
7. (Tuỳ chọn) Nếu có lỗi, cho thấy nó hiện **toast góc phải-dưới**, không che toolbar.

**Lời thoại:**
> "Vài tiện ích: đổi tên hội thoại, lịch sử gọn trong một dialog, tạo chat mới không spam, chuyển provider giữ nguyên ngữ cảnh, và mọi cấu hình gom vào **Cài đặt** — mở nhanh bằng ⌘,. Có thể export cả phiên ra bundle để bàn giao."

---

## Cảnh 8 — Kết (5:30 – 6:00)

**Thao tác:** Về màn tổng: canvas có flow + chat có kickoff đã verified. Giữ khung ổn định.

**Lời thoại:**
> "Từ một ý tưởng thô, **DualMind** dẫn tôi qua Discovery → Decision → Delivery bằng **lựa chọn**, dựng flow **tự phản biện**, rồi sinh **gói kickoff có kiểm soát** — Figma, Jira, Confluence, PRD — tất cả **local-first, có duyệt và hash bất biến**. Và toàn bộ demo này chạy **offline, không một API key nào**."

---

## Checklist "lột tả đủ chức năng"

- [ ] Chế độ **Mock offline** (không key) — Cảnh 1
- [ ] **Guided discovery bằng lựa chọn** (3 clarification + MVP options) — Cảnh 2
- [ ] **Infinity Canvas** + layout dagre — Cảnh 3
- [ ] **Logical Flow Linter** (ngõ cụt / thiếu nhánh / vòng lặp) — Cảnh 3
- [ ] **Chat theo vùng chọn** (selection chip trên composer) — Cảnh 3
- [ ] **Promote canvas → ProductSpec** (truy vết node→req/screen) — Cảnh 4
- [ ] **Kickoff package** 4 target — Cảnh 5
- [ ] **Duyệt + payload hash bất biến + read-back verified** — Cảnh 5
- [ ] **Figma-optional / graceful degrade** (mock vẫn ra Jira+Confluence+PRD) — Cảnh 5
- [ ] **Viewer phân rã task (Jira)** trong app — Cảnh 6
- [ ] **Viewer tài liệu (Confluence)** trong app — Cảnh 6
- [ ] **Đổi tên hội thoại** — Cảnh 7
- [ ] **History dialog + chống spam thread rỗng** — Cảnh 7
- [ ] **Chuyển provider giữ context** — Cảnh 7
- [ ] **Settings dialog + phím ⌘,** — Cảnh 7
- [ ] **Export bundle** — Cảnh 7
- [ ] **Stepper thu gọn / toast lỗi góc phải** — Cảnh 7

---

## Bản rút gọn 90 giây (nếu cần teaser)

1. (0–15s) Mock offline + 5 bước lifecycle.
2. (15–40s) Guided discovery bằng lựa chọn → chốt MVP.
3. (40–60s) Canvas + tự phản biện flow.
4. (60–80s) Kickoff: duyệt + hash → 4 target verified.
5. (80–90s) Mở viewer phân rã task + tài liệu → "local-first, không cần key".

---

## Lưu ý kỹ thuật khi quay

- **Tái lập:** luôn **Reset** trước mỗi lần quay để fixture *đặt suất ăn trưa* xuất hiện y hệt.
- **Mock là deterministic:** cùng thao tác → cùng kết quả, không sợ lệch giữa các take.
- **Không cần Figma Desktop** cho demo này; nếu muốn khoe Figma live thì để dành một video riêng (cần import plugin — xem README → *Kết nối Figma*).
- Nếu quay tiếng Anh, giữ nguyên thao tác; chỉ đổi lời thoại — nhãn UI vẫn tiếng Việt.
