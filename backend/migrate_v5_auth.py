import pymysql
import os
from database import DATABASE_URL

print(f"Connecting to database: {DATABASE_URL}")

# Parse connection string
# mysql+pymysql://admin:111111@10.7.12.236:3306/XrayDB
try:
    conn_str = DATABASE_URL.replace("mysql+pymysql://", "")
    auth, rest = conn_str.split("@")
    user, password = auth.split(":")
    host_port, db_name = rest.split("/")
    host, port = host_port.split(":")
    port = int(port)

    connection = pymysql.connect(
        host=host,
        user=user,
        password=password,
        database=db_name,
        port=port
    )

    with connection.cursor() as cursor:
        print("Ensuring 'users' table exists...")
        # Lệnh này sẽ được create_all xử lý nhưng ta cứ chạy cho chắc
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

        print("Adding columns to 'pcbs'...")
        try:
            cursor.execute("ALTER TABLE pcbs ADD COLUMN confirmed_by_id INT NULL")
            cursor.execute("ALTER TABLE pcbs ADD FOREIGN KEY (confirmed_by_id) REFERENCES users(id)")
            print("Added confirmed_by_id to pcbs")
        except Exception as e:
            print(f"Note: {e}")

        try:
            cursor.execute("ALTER TABLE pcbs ADD COLUMN confirmed_at DATETIME NULL")
            print("Added confirmed_at to pcbs")
        except Exception as e:
            print(f"Note: {e}")

        print("Adding columns to 'pcb_images'...")
        try:
            cursor.execute("ALTER TABLE pcb_images ADD COLUMN confirmed_by_id INT NULL")
            cursor.execute("ALTER TABLE pcb_images ADD FOREIGN KEY (confirmed_by_id) REFERENCES users(id)")
            print("Added confirmed_by_id to pcb_images")
        except Exception as e:
            print(f"Note: {e}")

    connection.commit()
    print("Migration successful!")

except Exception as e:
    print(f"Migration error: {e}")
finally:
    if 'connection' in locals():
        connection.close()
