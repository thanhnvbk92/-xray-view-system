import sys
import os
import mysql.connector

# Configuration
DB_HOST = "10.7.12.236"
DB_USER = "admin"
DB_PASS = "111111"
DB_NAME = "XrayDB"

def setup_database():
    print("--- XRAY DATABASE SETUP ---")
    try:
        # 1. Connect to MySQL Server (without database)
        print(f"Connecting to MySQL as {DB_USER}...")
        conn = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASS
        )
        cursor = conn.cursor()
        
        # 2. Create Database
        print(f"Creating database {DB_NAME} if not exists...")
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
        
        # 3. Use Database
        cursor.execute(f"USE {DB_NAME}")
        print(f"Database {DB_NAME} is ready.")
        
        conn.close()
        
        # 4. Initialize SQLAlchemy Tables
        print("Initializing tables via SQLAlchemy...")
        # Add project root to path
        sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from backend.database import init_db
        init_db()
        
        print("SUCCESS: Database and tables are ready.")
        
    except mysql.connector.Error as err:
        print(f"MySQL Error: {err}")
    except Exception as e:
        print(f"General Error: {e}")

if __name__ == "__main__":
    setup_database()
