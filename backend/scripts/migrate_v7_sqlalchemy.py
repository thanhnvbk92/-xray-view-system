import os
from sqlalchemy import create_engine, text
from database import DATABASE_URL

engine = create_engine(DATABASE_URL)

def run_migration():
    print(f"Starting SQLAlchemy Migration on {DATABASE_URL}...")
    
    with engine.connect() as connection:
        trans = connection.begin()
        try:
            print("1. Ensuring 'users' table...")
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    hashed_password VARCHAR(255) NOT NULL,
                    full_name VARCHAR(100),
                    employee_id VARCHAR(50) UNIQUE,
                    position VARCHAR(100),
                    role VARCHAR(20) DEFAULT 'OPERATOR',
                    is_approved BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """))

            print("2. Upgrading 'pcbs' table...")
            # MySQL doesn't have 'IF NOT EXISTS' for columns, so we check first
            cols_pcb = connection.execute(text("SHOW COLUMNS FROM pcbs")).fetchall()
            col_names_pcb = [c[0] for c in cols_pcb]
            
            if 'confirmed_by_id' not in col_names_pcb:
                print("   Adding confirmed_by_id to pcbs...")
                connection.execute(text("ALTER TABLE pcbs ADD COLUMN confirmed_by_id INT NULL"))
            
            if 'confirmed_at' not in col_names_pcb:
                print("   Adding confirmed_at to pcbs...")
                connection.execute(text("ALTER TABLE pcbs ADD COLUMN confirmed_at DATETIME NULL"))

            print("3. Upgrading 'pcb_images' table...")
            cols_img = connection.execute(text("SHOW COLUMNS FROM pcb_images")).fetchall()
            col_names_img = [c[0] for c in cols_img]
            
            if 'confirmed_by_id' not in col_names_img:
                print("   Adding confirmed_by_id to pcb_images...")
                connection.execute(text("ALTER TABLE pcb_images ADD COLUMN confirmed_by_id INT NULL"))

            print("4. Adding Constraints...")
            # We try/except these because constraints might already exist
            try:
                connection.execute(text("ALTER TABLE pcbs ADD CONSTRAINT fk_pcb_user FOREIGN KEY (confirmed_by_id) REFERENCES users(id)"))
                print("   FK added to pcbs.")
            except:
                print("   FK to pcbs already exists or skipped.")
                
            try:
                connection.execute(text("ALTER TABLE pcb_images ADD CONSTRAINT fk_image_user FOREIGN KEY (confirmed_by_id) REFERENCES users(id) ON DELETE SET NULL"))
                print("   FK added to pcb_images.")
            except:
                print("   FK to pcb_images already exists or skipped.")

            trans.commit()
            print("\n[SUCCESS] Database Migration via SQLAlchemy completed!")
        except Exception as e:
            trans.rollback()
            print(f"\n[ERROR] Migration failed: {e}")
            raise

if __name__ == "__main__":
    run_migration()
