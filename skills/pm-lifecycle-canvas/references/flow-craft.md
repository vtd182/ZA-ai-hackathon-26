# Flow craft — vẽ flow đầy đủ và dễ nhìn

Bộ quy tắc dùng chung cho **agent** và **mọi AI ngoài** khi vẽ workflow/flow lên canvas. Mục tiêu:
một flow mà PM nhìn vào không thể bắt lỗi ngay — đầy đủ nhánh, không ngõ cụt, dễ đọc.

## 1. Đầy đủ (completeness) — bắt buộc

- **Mỗi điểm quyết định (`decision`) phải có ≥2 nhánh ra**, và **mỗi nhánh phải có nhãn điều kiện**
  rõ ràng (ví dụ `Có` / `Không`, `Hợp lệ` / `Sai định dạng`). Không để nhánh trống.
- **Không có ngõ cụt (dead-end).** Mọi node không phải điểm kết thúc đều phải có ít nhất một cạnh
  ra. Node kết thúc hợp lệ là node mang nghĩa terminal (`Hoàn tất`, `Vào Home`, `Thành công`,
  `Kết thúc`, `Hủy/Thoát`).
- **Mỗi bước rủi ro phải có nhánh lỗi + phục hồi.** Gửi OTP, gọi API, thanh toán, ghép tài khoản…
  luôn kèm nhánh: lỗi mạng → thử lại, sai dữ liệu → nhập lại, xung đột → xử lý.
- **Vòng lặp phải có lối thoát và giới hạn.** "Nhập lại OTP" phải có: (a) đếm số lần, (b) nhánh
  rời khỏi vòng khi vượt ngưỡng (khóa tạm thời **có hướng dẫn chờ/hỗ trợ**, không phải ngõ cụt).
- **Có exit tổng thể.** Người dùng phải rời được flow (Hủy/Quay lại) ở các bước dài, không chỉ
  đến được đích cuối.
- **Tách tín hiệu khác nhau khi có ý nghĩa sản phẩm.** "Từ chối quyền" (chủ động) và "thiếu dữ
  liệu" (lỗi hệ thống) nên là 2 nhánh để log/analytics phân biệt, dù cùng fallback.

Trước khi báo hoàn thành, tự soát: *mỗi decision đủ nhánh chưa? node nào cụt? loop nào không
thoát? có terminal chưa?* — đây đúng là các lỗi mà linter của app sẽ gắn cờ (xem mục Read-back).

## 2. Dễ nhìn (legibility)

- **Để app tự sắp xếp**: bỏ trống `x`/`y` cho flow thường. Layout engine (dagre) sẽ xếp
  crossing-light. Chỉ đặt tọa độ khi bố cục là chủ ý.
- **Flow dài (>10 node) đi dọc (T→B)**; flow ngắn đi ngang (L→R) — app tự chọn, đừng ép ngược.
- **Dùng `lane`** để tách trách nhiệm (User / Mini App / Backend) khi flow có nhiều actor → đọc
  như sequence, giảm cắt chéo.
- **Đặt tên node theo outcome**, không phải thao tác UI: "Đã tìm thấy tài xế?" thay vì "Màn 3".
- **Nhãn cạnh ngắn gọn** cho mọi nhánh quyết định. Cạnh happy-path có thể để trống, nhánh rẽ thì
  không.
- **Phân biệt loại node**: `screen` cho màn hình, `process` cho xử lý, `decision` cho rẽ nhánh,
  `note` cho ghi chú/cảnh báo (note không tính vào logic flow).
- **Giữ ID ổn định** để lần vẽ sau cập nhật đúng node cũ thay vì tạo trùng.

## 3. Sau khi vẽ (read-back) — bắt buộc

- Đọc lại canvas. Receipt trả về `lintIssues`. Ngoài lỗi hình (`node_overlap`, `dangling_edge`)
  còn có **cảnh báo logic**: `decision_missing_branch`, `unlabeled_branch`, `flow_dead_end`,
  `unbounded_loop`, `no_exit_point`.
- **Coi mọi cảnh báo logic là việc phải sửa**, không phải caveat. Bổ sung nhánh/nhãn/lối thoát
  rồi vẽ lại cho đến khi sạch cảnh báo logic.
- Nếu bố cục bị chồng/trôi sau nhiều lần chỉnh, yêu cầu **sắp xếp lại toàn bộ** (force re-layout)
  thay vì kê thủ công.

## Ví dụ tối thiểu đạt chuẩn

```
Mở app → [Có phiên?] ──Có──▶ Vào Home (terminal)
                     └─Không─▶ Nhập SĐT → [Định dạng hợp lệ?]
                                   ├─Sai──▶ Báo lỗi định dạng → (quay lại Nhập SĐT)
                                   └─Đúng─▶ Gửi OTP → [OTP đúng? · tối đa 5 lần]
                                              ├─Đúng────▶ Vào Home (terminal)
                                              ├─Sai─────▶ Nhập lại (đếm lần) → (quay lại Gửi OTP)
                                              └─Quá 5 lần▶ Khóa 15 phút + gợi ý hỗ trợ (terminal)
   (mọi bước: nút Hủy → Thoát login — exit tổng thể)
```
Mọi decision ≥2 nhánh có nhãn · không ngõ cụt · loop OTP có giới hạn + lối thoát · có terminal + exit.
