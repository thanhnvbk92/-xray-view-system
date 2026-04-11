import os
from sqlalchemy import create_engine, text

# Cấu hình Database
DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://admin:111111@localhost:3306/XrayDB")
engine = create_engine(DATABASE_URL)

def migrate():
    print(f"Connecting to {DATABASE_URL}...")
    with engine.connect() as conn:
        # Nâng cấp bảng pcbs
        print("Upgrading 'pcbs' table...")
        try:
            conn.execute(text("ALTER TABLE pcbs ADD COLUMN board_pid VARCHAR(100) NULL"))
            print("  - Added 'board_pid' to 'pcbs'")
        except Exception as e:
            print(f"  - 'board_pid' already exists or error: {e}")
            
        try:
            conn.execute(text("ALTER TABLE pcbs ADD COLUMN array_index INT DEFAULT 1"))
            print("  - Added 'array_index' to 'pcbs'")
        except Exception as e:
            print(f"  - 'array_index' already exists or error: {e}")

        # Tạo index cho hiệu năng ánh xạ ảnh
        print("Creating indexes...")
        try:
            conn.execute(text("CREATE INDEX idx_pcb_board_pid ON pcbs(board_pid)"))
            conn.execute(text("CREATE INDEX idx_pcb_array_index ON pcbs(array_index)"))
            print("  - Indexes created successfully")
        except:
            print("  - Indexes might already exist")

        conn.commit()
        print("Migration completed successfully!")

if __name__ == "__main__":
    migrate()
