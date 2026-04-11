import pymysql
import sys
import os

# Ensure backend package can be imported
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from backend.database import init_db, DATABASE_URL
    from sqlalchemy import create_engine, text
except ImportError as e:
    print(f"Import error: {e}")
    sys.exit(1)

def ensure_db_exists():
    # URL: mysql+pymysql://admin:111111@localhost:3306/XrayDB
    # Extract the base connection string (everything before the last '/')
    try:
        base_url = DATABASE_URL.rsplit('/', 1)[0]
        db_name = DATABASE_URL.rsplit('/', 1)[1]
        
        # Connect to MySQL server without a specific database
        engine = create_engine(base_url)
        with engine.connect() as conn:
            conn.execute(text(f"CREATE DATABASE IF NOT EXISTS {db_name}"))
            conn.commit()
            print(f"Database '{db_name}' ensured.")
    except Exception as e:
        print(f"Error ensuring database exists: {e}")
        sys.exit(1)

if __name__ == "__main__":
    ensure_db_exists()
    try:
        init_db()
        print("Database tables initialized successfully.")
    except Exception as e:
        print(f"Error initializing tables: {e}")
        sys.exit(1)
