# Kiểm kê lưu dữ liệu Kitchen OS

Ngày kiểm tra: 2026-09-05

## Kết luận

Bản production sử dụng PostgreSQL trên VPS cho dữ liệu dùng chung. `localStorage` chỉ còn là cache để giao diện phản hồi nhanh và giữ trạng thái hiển thị; dữ liệu nghiệp vụ được đồng bộ qua API theo quyền của tài khoản.

## Ma trận persistence

| Phân hệ | Dữ liệu ghi | Cách lưu | Nơi lưu chuẩn | Trạng thái |
| --- | --- | --- | --- | --- |
| Tài khoản và phân quyền | thêm/sửa/xóa, mật khẩu, vai trò, quyền xem/sửa | nút Lưu | `app_users` + VPS Auth | Đạt |
| Kho Trung tâm, Fuxing, Yongji | danh mục, vị trí, định mức, số lượng, nhập/lấy/chuyển/xuất, nơi nhận mặc định | thao tác kho + nút Lưu sản phẩm | bảng inventory trên PostgreSQL | Đạt |
| Tổng quan/đặt bàn | số bàn, cơm còn lại | tự lưu sau thay đổi | `business_state.reservations` | Đạt |
| Gọi hàng | kế hoạch, hàng về, ngày đặt, lịch nhà cung cấp | tự lưu sau thay đổi | `business_state.procurement` | Đạt |
| Chuẩn bị | checklist, việc bổ sung, phân công | tự lưu sau thay đổi/form | `business_state.preparation` | Đạt |
| Menu món | danh mục, trạng thái đào tạo | nút Lưu/tự lưu | `business_state.menu` | Đạt |
| SOP | nội dung, phiên bản, duyệt, học và ảnh kiểm tra | nút Lưu | `business_state.sop` | Đạt |
| Năng lực | kỹ năng, hồ sơ và đánh giá | nút Lưu | `business_state.skills` | Đạt |
| Chấm công/lương | vào/ra ca, điều chỉnh, chính sách | nút/form | `business_state.attendance` | Đạt |
| Lịch làm | ca làm | nút Lưu | `business_state.schedule` | Đạt |
| Quản lý từ xa | danh mục công việc | nút Lưu | `business_state.remote` | Đạt |
| Cài đặt nghiệp vụ | định mức/cấu hình | tự lưu sau thay đổi | `business_state.settings` | Đạt |
| Nhân viên dùng chung | hồ sơ nhân viên không gồm PIN | nút Lưu | `business_state.shared` | Đạt |
| Nhật ký nghiệp vụ | lịch sử thao tác | tự động | `business_state.audit` + `audit_logs` | Đạt |

## Trạng thái chỉ giữ trên thiết bị (có chủ đích)

- Ngôn ngữ và hồ sơ phiên hiện tại; ngôn ngữ ưu tiên đồng thời được lưu vào tài khoản VPS.
- Ngày đang xem, bộ lọc, từ khóa tìm kiếm và tab đang mở.
- Cache nghiệp vụ tạm để render nhanh; khi đăng nhập/tập trung lại cửa sổ, hệ thống tải dữ liệu VPS và hợp nhất theo quyền.
- PIN nhân viên không được đưa vào tài liệu business state dùng chung.

## Sửa lỗi nút Lưu sản phẩm

- Nút `Lưu sản phẩm · 儲存品項` có cả ở đầu modal và cuối form, nên mở form là nhìn thấy ngay trên điện thoại.
- Áp dụng giống nhau cho Trung tâm, Fuxing và Yongji.
- Thanh cuối form vẫn hỗ trợ thao tác sau khi cuộn.
- Khi đang lưu, cả hai nút bị khóa để tránh gửi trùng.
- Bếp trung tâm không còn được phép coi lưu local là thành công khi VPS database mất kết nối; dữ liệu tạm được hoàn tác nếu API lỗi.

## Kiểm thử bắt buộc

- Kiểm tra tĩnh mọi `data-action` và `data-field` có handler.
- Kiểm tra quyền frontend/backend không lệch nhau.
- Kiểm tra nút Lưu sản phẩm nằm trong viewport ở trình duyệt desktop/mobile.
- Kiểm tra round-trip API và PostgreSQL cho business state và inventory trong CI trước khi deploy.
