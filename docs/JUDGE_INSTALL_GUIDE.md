# BGK Install Guide

Guide này dành cho BGK cài nhanh DualMind từ GitHub Release để chạy demo app và, nếu muốn, kết nối Figma thật.

## 1. Tải đúng file trên GitHub Release

Mở trang release:

```text
https://github.com/vtd182/ZA-ai-hackathon-26/releases
```

Chọn release mới nhất, rồi tải theo hệ điều hành:

| Nhu cầu | File cần tải |
| --- | --- |
| macOS Apple Silicon | `DualMind-<version>-arm64.dmg` |
| Windows | `DualMind-Setup-<version>.exe` |
| Plugin Figma | `za-talk-to-figma-plugin.zip` |
| Runtime Figma rời, chỉ khi cần debug/chạy ngoài app | `za-talk-to-figma-runtime-<os>-<arch>.zip` |

Không cần tải `latest.yml`, `*.blockmap`, `Source code (zip)` hoặc `Source code (tar.gz)` để cài thủ công. Các file đó dành cho auto-update hoặc mã nguồn.

## 2. Cài ứng dụng

### macOS

1. Mở file `.dmg`.
2. Kéo **DualMind** vào **Applications**.
3. Mở **DualMind** từ Applications.

Nếu macOS Gatekeeper chặn vì app chưa notarize:

1. Mở **Finder -> Applications**.
2. Chuột phải vào **DualMind** -> **Open**.
3. Bấm **Open** trong hộp thoại xác nhận.

Nếu vẫn bị chặn, vào **System Settings -> Privacy & Security** và bấm **Open Anyway** cho DualMind.

Fallback bằng Terminal, chỉ dùng với app tải từ release chính thức:

```bash
xattr -dr com.apple.quarantine /Applications/DualMind.app
```

Sau đó mở lại app.

### Windows

1. Chạy `DualMind-Setup-<version>.exe`.
2. Nếu Windows SmartScreen hiện cảnh báo, chọn **More info -> Run anyway**.
3. Mở DualMind từ Start Menu hoặc shortcut sau khi cài.

## 3. Chạy nhanh không cần Figma

DualMind có provider **Mock · Offline**, nên BGK có thể thử flow chính ngay cả khi chưa cấu hình API key hoặc Figma:

1. Mở app.
2. Chọn provider **Mock · Offline** nếu app chưa có API key.
3. Tạo chat mới và nhập một ý tưởng sản phẩm.
4. Dùng canvas/chat để tạo ProductSpec, confirm spec, rồi chuẩn bị kickoff package.

Trong chế độ này, Jira/Zdoc là mock rõ nhãn; Figma có thể hạ xuống mock nếu chưa kết nối plugin.

## 4. Cài plugin Figma

Yêu cầu: dùng **Figma Desktop**. Import plugin development không chạy ổn trong Figma browser.

1. Tải `za-talk-to-figma-plugin.zip` từ cùng GitHub Release.
2. Giải nén zip. Bên trong có `manifest.json` và thư mục `dist/`.
3. Mở **Figma Desktop**.
4. Vào **Plugins -> Development -> Import plugin from manifest...**.
5. Chọn file `manifest.json` trong thư mục vừa giải nén.
6. Mở hoặc duplicate file demo/ZDS nếu cần.
7. Chạy plugin **ZA Talk To Figma** từ **Plugins -> Development**.
8. Quay lại DualMind, mở panel **Figma** và kiểm tra trạng thái plugin đã connected.

Ghi chú: app installer đã nhúng Figma runtime/plugin tối thiểu trong app resources và tự khởi động runtime local. File `za-talk-to-figma-plugin.zip` là cách dễ nhất để BGK import plugin vào Figma.

## 5. Chọn chế độ Figma

Sau khi plugin kết nối, DualMind có hai đường:

### Dùng ZDS

1. Trong Figma Desktop, mở page chứa component/reference của Zalo Mini App Framework/ZDS.
2. Trong DualMind panel Figma, chọn **Dùng ZDS** hoặc **Dùng Page đang mở**.
3. App sẽ allowlist đúng file/page này làm nguồn Design System.
4. Khi tạo artifact, Figma output được guard bằng component/icon/style đọc từ nguồn đó.

### Không dùng ZDS

1. Trong Figma Desktop, mở page trống hoặc page target muốn agent vẽ vào.
2. Trong DualMind panel Figma, chọn **Không dùng ZDS**.
3. Agent được phép thiết kế tự do theo ProductSpec và vẽ lên page target/page mới, không bắt buộc mobile hay component ZDS.

Đổi file hoặc page trong Figma thì cần chọn lại trong DualMind. Đây là guardrail để tránh ghi nhầm vào file của BGK.

## 6. Troubleshooting nhanh

| Hiện tượng | Cách xử lý |
| --- | --- |
| Tải nhầm `.blockmap` hoặc `latest.yml` | Tải lại `.dmg` trên macOS hoặc `.exe` trên Windows. |
| macOS báo app không mở được | Dùng **chuột phải -> Open**, **Open Anyway**, hoặc lệnh `xattr` ở trên. |
| Figma không thấy plugin | Đảm bảo dùng **Figma Desktop**, giải nén zip trước, rồi import đúng `manifest.json`. |
| DualMind báo chưa connected Figma | Chạy plugin **ZA Talk To Figma** trong Figma Desktop và giữ panel plugin mở khi tạo design. |
| ZDS missing roles | Nếu muốn bám ZDS, hãy chọn lại page chứa ZDS bằng **Dùng ZDS**. Nếu muốn agent tự do thiết kế, chọn **Không dùng ZDS**. |
| Figma tạo quá lâu | Design thật có thể mất vài phút. Không đóng app/plugin trong lúc trạng thái đang `Artifact sync` hoặc `Figma craft`. |
| Provider/API lỗi | Chuyển sang **Mock · Offline** để demo flow local, hoặc cấu hình lại provider trong Settings. |

## 7. Kịch bản demo ngắn cho BGK

1. Mở DualMind.
2. Tạo chat mới: mô tả một ý tưởng Mini App/OA/web/admin.
3. Khi ý tưởng rõ, confirm ProductSpec.
4. Yêu cầu tạo flow hoặc prototype trên canvas.
5. Chọn Figma mode: **Dùng ZDS** nếu có page ZDS, hoặc **Không dùng ZDS** nếu muốn agent tự do.
6. Chuẩn bị kickoff package, review contract, approve write.
7. Xem read-back: Figma/Jira/Zdoc/PRD cùng trỏ về một ProductSpec hash.
