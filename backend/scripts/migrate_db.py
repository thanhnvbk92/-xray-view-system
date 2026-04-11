from sqlalchemy import create_engine, text
from database import DATABASE_URL

engine = create_engine(DATABASE_URL)

def migrate():
    with engine.connect() as conn:
        print("Starting migration...")
        
        # 1. Cập nhật bảng pcbs
        try:
            conn.execute(text("ALTER TABLE pcbs ADD COLUMN machine_result VARCHAR(20) DEFAULT 'PENDING'"))
            print("Added machine_result")
        except Exception as e: print(f"machine_result might exist: {e}")

        try:
            conn.execute(text("ALTER TABLE pcbs ADD COLUMN ai_result VARCHAR(20) DEFAULT 'PENDING'"))
            print("Added ai_result")
        except Exception as e: print(f"ai_result might exist: {e}")

        try:
            conn.execute(text("ALTER TABLE pcbs ADD COLUMN user_result VARCHAR(20) DEFAULT 'PENDING'"))
            print("Added user_result")
        except Exception as e: print(f"user_result might exist: {e}")

        try:
            conn.execute(text("ALTER TABLE pcbs ADD COLUMN final_result VARCHAR(20) DEFAULT 'PENDING'"))
            print("Added final_result")
        except Exception as e: print(f"final_result might exist: {e}")

        try:
            conn.execute(text("ALTER TABLE pcbs ADD COLUMN job_file VARCHAR(200)"))
            print("Added job_file")
        except Exception as e: print(f"job_file might exist: {e}")

        try:
            conn.execute(text("ALTER TABLE pcbs ADD COLUMN client_time DATETIME"))
            print("Added client_time")
        except Exception as e: print(f"client_time might exist: {e}")

        try:
            conn.execute(text("ALTER TABLE pcbs ADD COLUMN system_time DATETIME DEFAULT CURRENT_TIMESTAMP"))
            print("Added system_time")
        except Exception as e: print(f"system_time might exist: {e}")

        # Sync data from old columns if they exist
        try:
            conn.execute(text("UPDATE pcbs SET machine_result = result, final_result = result, client_time = test_time"))
            print("Synchronized data from old columns")
        except: pass

        # 2. Tạo bảng pcb_images nếu chưa có
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS pcb_images (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    pcb_id INT,
                    image_path VARCHAR(255),
                    image_type VARCHAR(20),
                    FOREIGN KEY (pcb_id) REFERENCES pcbs(id) ON DELETE CASCADE
                )
            """))
            print("Created pcb_images table")
        except Exception as e: print(f"pcb_images error: {e}")
        
        conn.commit()
        print("Migration completed successfully.")

if __name__ == "__main__":
    migrate()
