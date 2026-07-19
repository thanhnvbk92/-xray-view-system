-- Script: add_cause_column.sql
-- Mục tiêu: Thêm cột nguyên nhân lỗi (cause) vào bảng pcb_images

-- 1. Thêm cột cause
ALTER TABLE pcb_images ADD COLUMN cause VARCHAR(255) DEFAULT NULL AFTER user_result;

-- 2. Cập nhật bảng daily_stats (nếu cần phân tích theo nguyên nhân lỗi trong tương lai)
-- Hiện tại bảng daily_stats chỉ lưu số lượng tổng quát, nên chưa cần thay đổi cấu trúc.
