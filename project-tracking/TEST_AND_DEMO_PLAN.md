# Test and Demo Plan

## 1. Quality strategy

Test theo risk và boundary:

- **Unit:** schema, invariants, transitions, impact graph, layout, guard rules.
- **Contract:** mọi reasoning provider và artifact connector adapter.
- **Integration:** SQLite history/checkpoint transaction/recovery, IPC, outbox, connector snapshots.
- **E2E:** history/resume, provider switch, chat-canvas, change impact, partial failure và offline fallback.
- **Visual:** canvas/Figma preview ở desktop viewport mục tiêu; không overlap, không mất node/edge.

## 2. P0 test matrix

| ID | Behavior | Level | Expected |
| --- | --- | --- | --- |
| `T-DOM-01` | ProductSpec fixture hợp lệ | Unit | Parse và preserve version |
| `T-DOM-02` | Dangling requirement/screen/story ref | Unit | Reject với entity/path cụ thể |
| `T-WF-01` | Full lifecycle transitions | Unit | Chỉ transition hợp lệ được commit |
| `T-WF-02` | Execute trước approval | Unit | Policy reject, connector không được gọi |
| `T-APP-01` | Payload đổi sau approval | Unit | Approval invalidated |
| `T-IDM-01` | Retry cùng idempotency key | Contract | Một external artifact, receipt được link lại |
| `T-VER-01` | Execute success nhưng read-back mismatch | Contract | `VERIFICATION_FAILED` |
| `T-PER-01` | Crash sau receipt trước verify | Integration | Restart vào `VERIFYING`, không duplicate |
| `T-HIS-01` | Thread A/B với canvas riêng | Integration | Message/spec/canvas không rò giữa thread |
| `T-HIS-02` | Restart và resume 500-message thread | E2E/performance | Latest checkpoint đúng; renderer không block |
| `T-PRV-01` | Provider adapter conformance | Contract | Cùng canonical fixture/result; SDK types không leak |
| `T-PRV-02` | Switch Mock -> real provider | Integration | Cùng thread/canvas; segment và handoff persisted |
| `T-PRV-03` | Switch khi stream/write in flight | Unit | Bị chặn đến safe checkpoint |
| `T-PRV-04` | Provider unavailable khi resume | E2E | Local history/canvas mở; có thể chọn provider khác |
| `T-CAN-01` | Cùng ProductSpec render hai lần | Unit/visual | Stable refs, positions và edges |
| `T-CAN-02` | Canvas shape edit business field | Unit | Bị chặn hoặc chuyển thành domain command |
| `T-CAN-03` | Chat command dùng selected shape context | Integration | Proposal scope đúng entity; cần preview/approval |
| `T-FIG-01` | Allowed component/token | Unit | Preflight pass |
| `T-FIG-02` | Unknown/deprecated component | Unit | Block trước write |
| `T-FIG-03` | Raw style hoặc wrong sandbox target | Unit | Block với compliance issue |
| `T-FIG-04` | Node thiếu requirement metadata | Contract | Postflight fail |
| `T-CHG-01` | Remove payment impact | Unit | Đúng 4 entity groups + related edges |
| `T-CHG-02` | Cancel change approval | Integration | Spec/artifact giữ nguyên |
| `T-CHG-03` | Figma pass, Jira mock fail | Integration | `PARTIAL_FAILURE`, retry Jira riêng |
| `T-E2E-01` | Full seeded demo | E2E | Kết thúc với artifacts verified |
| `T-E2E-02` | Figma bridge unavailable | E2E | Chuyển mock có nhãn, demo tiếp tục |
| `T-PFM-01` | 500 messages + 500 visible shapes | Performance | Đạt hoặc ghi deviation so với budgets |
| `T-SEC-01` | Logs/DB export scan | Integration | Không có token, auth header, PII fixture |

## 3. Connector contract suite

Mỗi connector real/mock phải pass cùng các case:

1. `checkAvailability` trả typed status và không throw raw SDK error ra UI.
2. `preflight` không mutate external state.
3. `execute` reject action chưa approve hoặc payload hash không khớp.
4. Cùng idempotency key không tạo duplicate.
5. Receipt có connector, action ID, external ID, payload hash và timestamp.
6. `readBack` lấy snapshot từ external/mock store, không dùng execute response cache.
7. `verify` kiểm business invariants, không chỉ HTTP/tool status.
8. Unavailable/timeout/partial failure được normalize thành typed error.

## 3A. Provider contract suite

Mỗi provider adapter phải pass:

1. Probe trả capability/availability typed và không leak SDK error/credential.
2. Stream được normalize thành cùng event union và kết thúc bằng một terminal event.
3. Structured output qua schema validation rồi domain validation.
4. Partial JSON/tool-call delta không mutate state.
5. Tool call chỉ trở thành ProposedAction; connector không chạy trực tiếp.
6. Cancel/timeout có terminal status và thread vẫn resumable.
7. Handoff package không chứa hidden reasoning hoặc provider SDK payload.
8. Usage, provider/model và remote-state policy được lưu theo segment.

## 4. Test fixtures

### Main fixture: Zalo Mini App meal ordering

Idea:

> Xây Mini App đặt suất ăn trước cho nhân viên, chọn pantry, theo dõi trạng thái và nhận món bằng QR; phương án Balanced ban đầu có thanh toán bằng ví nội bộ.

Synthetic discovery:

- Wallet SDK capability exists.
- Pantry directory capability exists.
- QR pickup component exists.
- Pantry capacity API does not exist.
- Cancellation policy is unresolved.
- Zalo Design System fixture has MenuCard, PantryPicker, OrderSummary, PaymentMethod, StatusTimeline and QRCodePanel.

Expected Balanced ProductSpec:

- 5 MVP requirements: menu, pantry, wallet payment, status, QR pickup.
- 4 primary screens: Menu/Pantry, Order Summary, Payment, Order Status/QR.
- 5 stories and explicit requirement relationships.

Expected change:

- `REQ-PAYMENT` scope changes from `mvp` to `removed`.
- Payment screen is removed or excluded from active flow.
- Wallet story/dependency become removed/deprecated.
- Order Summary routes directly to confirmation/status.
- ProductSpec version increments exactly once after approval.

## 5. Demo script (target 5-6 minutes)

### 0:00-0:35 - Problem and promise

Mở History, resume nhanh một thread fixture để chứng minh local history/canvas, rồi tạo/reset demo thread. Nói ngắn: một PM thường phải gom context, quyết định scope, viết PRD, dựng flow và backlog; khi scope đổi, các artifact lệch nhau. Agent này biến idea thành kickoff package có kiểm soát và giữ chúng đồng bộ.

### 0:35-1:25 - Agentic discovery

- Submit meal-ordering idea.
- Cho thấy findings có source/relevance/confidence.
- Trả lời tối đa ba clarification questions.
- Nhấn mạnh fixture/sandbox để tuân thủ dữ liệu cuộc thi.

### 1:25-2:15 - Decision

- So sánh Minimal/Balanced/Ambitious.
- Chọn Balanced.
- Cho thấy decision rationale và ProductSpec được tạo sau quyết định.
- Chỉ ra provider hiện tại và segment status; history/canvas vẫn thuộc app.

### 2:15-3:15 - Traceability and guarded artifacts

- Chuyển Deliver view: Requirement -> Screen -> Story -> Dependency.
- Mở artifact preview, chỉ ra `Figma`, `Mock Jira`, `Mock Zdoc` rõ ràng.
- Mở Figma compliance report: resolved component/token, warning/error count, manifest version.
- Approve, execute và read-back verify; không gọi success ngay sau write.

### 3:15-4:45 - Signature moment

- Nhập `Bỏ payment khỏi MVP`.
- Change view highlight payment requirement, screen, story, wallet dependency và affected route.
- Hiển thị before/after + planned target updates.
- Approve change.
- ProductSpec tăng version; Figma + ít nhất một mock artifact read-back verified.

### 4:45-5:30 - Close

Kết luận bằng outcome: nhanh hơn ở discovery/kickoff, giảm artifact drift, quyết định có evidence, mọi write có human approval và verification. Nêu rõ Jira/Zdoc là mock trong hackathon, connector contract sẵn để thay bằng sandbox thật.

## 6. Demo safeguards

- Có `Reset demo` đưa DB và mock stores về seed version.
- Figma bridge được health-check trước khi demo; không health-check thì mặc định mock fallback rõ nhãn.
- Không mở console/log chứa path, token hoặc runtime metadata nhạy cảm.
- Chuẩn bị screenshot/video cho ba checkpoint: delivery map, Figma compliance report, change impact verified.
- Không live-edit code hoặc login trong demo.
- Không dựa vào provider cloud cho nội dung chính; fixture mode tạo cùng kết quả.

## 7. Rehearsal checklist

- [ ] Build và app mở trên clean profile.
- [ ] Reset tạo đúng fixture/version.
- [ ] Thread history resume đúng canvas và ProductSpec checkpoint.
- [ ] Provider switch demo/fallback không mất transcript hoặc canvas.
- [ ] Canvas không overlap ở demo resolution.
- [ ] Figma target đúng sandbox allowlist.
- [ ] Mọi mock artifact có nhãn `Mock`.
- [ ] Approval và verification status nhìn thấy rõ.
- [ ] Remove-payment impact set chính xác.
- [ ] Retry path đã thử ít nhất một lần.
- [ ] Full demo hoàn tất ba lần liên tiếp.
- [ ] Backup screenshots/video mở được offline.
- [ ] Pitch không tuyên bố Jira/Zdoc mock là integration production.

## 8. Release gate

Không package bản demo cuối nếu còn một trong các lỗi sau:

- Write chạy trước approval.
- Duplicate artifact khi retry.
- UI báo verified dựa trên execute response.
- Change impact chạm entity ngoài expected set.
- Figma plan dùng component/token ngoài manifest nhưng vẫn pass.
- App không resume được sau restart.
- Thread A/B dùng chung hoặc làm rò canvas state.
- Provider switch làm mất history/checkpoint hoặc tự chuyển sang paid API.
- Renderer vượt performance budget mà chưa có measured deviation/fallback.
- Fixture/log/artifact chứa PII, secret hoặc production data.
