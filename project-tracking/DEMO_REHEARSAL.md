# Demo Rehearsal

Mục tiêu của rehearsal là chứng minh DualMind khác một agent chat thường: AI có thể sáng tạo trên canvas/Figma, nhưng ProductSpec, approval, payload hash và read-back vẫn do Agent Core giữ.

## Primary Path: Clear Brief -> Figma

1. Chọn provider `AgentRouter` và một model đang available.
2. Chọn Figma setup:
   - `Không dùng ZDS` cho web/admin/landing/free creative.
   - Chọn Page đích trong Figma, page đó sẽ là nơi ghi artifact.
3. Gửi brief rõ:

```text
Tôi cần admin web dashboard quản lý booking nội bộ cho ops. Có sidebar, bảng booking realtime, filter theo trạng thái, màn xử lý exception, phân quyền admin/staff. MVP chưa cần analytics.
```

4. Kỳ vọng:
   - App không ép guided discovery 3 câu.
   - Draft ProductSpec xuất hiện với surface `admin_dashboard`.
   - ProductSpec có zero ZDS roles vì đang ở no-ZDS/free mode.
5. Chạy `/spec confirm`.
6. Chạy `/figma prepare`.
7. Kỳ vọng trước approval:
   - Approval panel hiển thị `ArtifactBrief`.
   - Mode là `free_adaptive`.
   - Output policy là `selected_page`.
   - Design-system policy là `none`.
   - Source ProductSpec hash hiển thị.
8. Approve artifact.
9. Kỳ vọng sau execution:
   - Figma write chạy qua Agent Core/Figma MCP.
   - App chỉ báo thành công sau read-back + verification.

## ZDS Mini App Path

1. Chọn `Dùng ZDS`.
2. Chọn public framework duplicate page làm ZDS source.
3. Gửi brief Mini App rõ, ví dụ onboarding/login/booking/reminder.
4. Kỳ vọng:
   - ArtifactBrief mode `zds_strict` hoặc `zds_reference`.
   - Component roles được resolve từ allowlisted same-file ZDS instances.
   - Strict missing role không tự biến thành primitive fallback.

## Fallback Path

Nếu AgentRouter hoặc Figma craft worker chậm/lỗi:

- Dùng provider `Mock Local` hoặc `Codex Local` để tiếp tục ProductSpec/canvas.
- Với ZDS mode, Figma có thể degrade sang Mock Figma có nhãn nếu live Figma không sẵn sàng.
- Với `Không dùng ZDS`, app không tự chuyển sang Mock Figma khi user đã chọn live target; phải reconnect/allowlist lại để tránh vẽ sai page.

## Timebox

- Clear brief -> Draft ProductSpec: dưới 10 giây với Mock/Codex local, tùy AgentRouter queue.
- `/spec confirm`: tức thời.
- `/figma prepare`: có thể nhanh nếu dùng scaffold, có thể lâu nếu craft worker gọi AgentRouter/Codex.
- Figma execution: cần xem progress theo stage `ArtifactBrief + plan`, `Guard preflight`, `Write có approval`, `Read-back`, `Verify read-back`.

## Fast Verification Command

```bash
./run.sh demo-rehearsal
```

Lệnh này không mở Electron và không ghi Figma thật. Nó kiểm đường contract chính:

- Clear admin brief tạo ProductSpec `admin_dashboard`.
- ProductSpec được confirm thành `approved`.
- No-ZDS/free Figma ArtifactBrief dùng `free_adaptive`.
- Figma plan ghi vào selected page, không yêu cầu ZDS component roles.
- AgentRouter capability khai đúng `remoteResume`.
