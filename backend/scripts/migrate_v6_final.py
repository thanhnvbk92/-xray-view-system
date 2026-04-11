import pymysql

# Hardcoded for migration reliability
DB_HOST = "10.7.12.236"
DB_USER = "admin"
DB_PASS = "111111"
DB_NAME = "XrayDB"
DB_PORT = 3306

print(f"Connecting to {DB_NAME} at {DB_HOST}...")

try:
    connection = pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        port=DB_PORT
    )

    with connection.cursor() as cursor:
        print("1. Ensuring 'users' table exists...")
        sql_create_users = """
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
        """
        cursor.execute(sql_create_users)
        print("   -> Users table OK.")

        print("2. Upgrading 'pcbs' table...")
        # Check if column exists first to avoid errors
        cursor.execute("SHOW COLUMNS FROM pcbs LIKE 'confirmed_by_id'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE pcbs ADD COLUMN confirmed_by_id INT NULL")
            print("   -> Added confirmed_by_id")
        
        cursor.execute("SHOW COLUMNS FROM pcbs LIKE 'confirmed_at'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE pcbs ADD COLUMN confirmed_at DATETIME NULL")
            print("   -> Added confirmed_at")
            
        print("3. Upgrading 'pcb_images' table...")
        cursor.execute("SHOW COLUMNS FROM pcb_images LIKE 'confirmed_by_id'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE pcb_images ADD COLUMN confirmed_by_id INT NULL")
            print("   -> Added confirmed_by_id to pcb_images")

        print("4. Adding Foreign Keys...")
        try:
             # We use a try block because adding an existing constraint will fail
             cursor.execute("ALTER TABLE pcbs ADD CONSTRAINT fk_pcb_user FOREIGN KEY (confirmed_by_id) REFERENCES users(id)")
             print("   -> FK added to pcbs")
        except:
             print("   -> FK for pcbs already exists or error.")
             
        try:
             cursor.execute("ALTER TABLE pcb_images ADD CONSTRAINT fk_image_user FOREIGN KEY (confirmed_by_id) REFERENCES users(id)")
             print("   -> FK added to pcb_images")
        except:
             print("   -> FK for pcb_images already exists or error.")

    connection.commit()
    print("\n[SUCCESS] Database Migration Completed!")

except Exception as e:
    print(f"\n[ERROR] Migration failed: {e}")
finally:
    if 'connection' in locals():
        connection.close()
