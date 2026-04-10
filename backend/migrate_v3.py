import pymysql
import os

def migrate():
    print("--- MIGRATION V3 (PyMySQL): Adding is_processed column ---")
    try:
        conn = pymysql.connect(
            host='10.7.12.236',
            user='admin',
            password='111111',
            database='XrayDB'
        )
        cursor = conn.cursor()

        # 1. Thêm cột is_processed nếu chưa tồn tại
        print("Checking for is_processed column...")
        cursor.execute("SHOW COLUMNS FROM pcb_images LIKE 'is_processed'")
        if not cursor.fetchone():
            print("Adding is_processed column to pcb_images table...")
            cursor.execute("ALTER TABLE pcb_images ADD COLUMN is_processed BOOLEAN DEFAULT FALSE")
            conn.commit()
            print("Column added.")
        else:
            print("Column already exists.")

        # 2. Cập nhật dữ liệu cũ
        print("Updating status for existing images in storage...")
        cursor.execute("UPDATE pcb_images SET is_processed = TRUE WHERE image_path LIKE '/storage/%'")
        conn.commit()
        print(f"Updated {cursor.rowcount} records.")

        cursor.close()
        conn.close()
        print("Migration successful!")
    except Exception as e:
        print(f"Migration error: {e}")

if __name__ == "__main__":
    migrate()
