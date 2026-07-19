-- GIAI ĐOẠN 1: TỐI ƯU HÓA MYSQL (PHASE 1 OPTIMIZATION)
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Cập nhật dữ liệu NULL (nếu có)
UPDATE pcbs SET client_time = system_time WHERE client_time IS NULL;

-- 2. Thay đổi cấu trúc bảng pcbs (Bao gồm PK và Partitioning)
-- Thực hiện tuần tự các lệnh ALTER TABLE
ALTER TABLE pcbs MODIFY client_time DATETIME NOT NULL;
ALTER TABLE pcbs DROP PRIMARY KEY, ADD PRIMARY KEY (id, client_time);
ALTER TABLE pcbs PARTITION BY RANGE COLUMNS(client_time) (
    PARTITION p2024_old VALUES LESS THAN ('2025-01-01'),
    PARTITION p2025_01 VALUES LESS THAN ('2025-02-01'),
    PARTITION p2025_02 VALUES LESS THAN ('2025-03-01'),
    PARTITION p2025_03 VALUES LESS THAN ('2025-04-01'),
    PARTITION p2025_04 VALUES LESS THAN ('2025-05-01'),
    PARTITION p2025_05 VALUES LESS THAN ('2025-06-01'),
    PARTITION p2025_06 VALUES LESS THAN ('2025-07-01'),
    PARTITION p2025_07 VALUES LESS THAN ('2025-08-01'),
    PARTITION p2025_08 VALUES LESS THAN ('2025-09-01'),
    PARTITION p2025_09 VALUES LESS THAN ('2025-10-01'),
    PARTITION p2025_10 VALUES LESS THAN ('2025-11-01'),
    PARTITION p2025_11 VALUES LESS THAN ('2025-12-01'),
    PARTITION p2025_12 VALUES LESS THAN ('2026-01-01'),
    PARTITION p2026_01 VALUES LESS THAN ('2026-02-01'),
    PARTITION p2026_02 VALUES LESS THAN ('2026-03-01'),
    PARTITION p2026_03 VALUES LESS THAN ('2026-04-01'),
    PARTITION p2026_04 VALUES LESS THAN ('2026-05-01'),
    PARTITION p_future VALUES LESS THAN (MAXVALUE)
);

-- 3. Tạo bảng tổng hợp dữ liệu hàng ngày
CREATE TABLE IF NOT EXISTS daily_stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stat_date DATE NOT NULL,
    machine_id INT NOT NULL,
    job_file VARCHAR(200),
    total_count INT DEFAULT 0,
    ok_count INT DEFAULT 0,
    ng_count INT DEFAULT 0,
    ai_ok_count INT DEFAULT 0,
    user_ok_count INT DEFAULT 0,
    avg_ai_score FLOAT DEFAULT 0.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_date_machine_job (stat_date, machine_id, job_file),
    INDEX idx_stat_date (stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Tạo Procedure cập nhật
DROP PROCEDURE IF EXISTS refresh_daily_stats;
CREATE PROCEDURE refresh_daily_stats(IN target_date DATE)
BEGIN
    INSERT INTO daily_stats (stat_date, machine_id, job_file, total_count, ok_count, ng_count, ai_ok_count, user_ok_count, avg_ai_score)
    SELECT 
        DATE(client_time) as d,
        machine_id,
        job_file,
        COUNT(*) as total,
        SUM(CASE WHEN machine_result = 'OK' THEN 1 ELSE 0 END) as ok,
        SUM(CASE WHEN machine_result = 'NG' THEN 1 ELSE 0 END) as ng,
        SUM(CASE WHEN ai_result = 'OK' THEN 1 ELSE 0 END) as ai_ok,
        SUM(CASE WHEN user_result = 'OK' THEN 1 ELSE 0 END) as user_ok,
        AVG(ai_score) as avg_score
    FROM pcbs
    WHERE DATE(client_time) = target_date
    GROUP BY DATE(client_time), machine_id, job_file
    ON DUPLICATE KEY UPDATE 
        total_count = VALUES(total_count),
        ok_count = VALUES(ok_count),
        ng_count = VALUES(ng_count),
        ai_ok_count = VALUES(ai_ok_count),
        user_ok_count = VALUES(user_ok_count),
        avg_ai_score = VALUES(avg_ai_score);
END;

SET FOREIGN_KEY_CHECKS = 1;
