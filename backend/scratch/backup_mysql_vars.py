import sys
import os
from sqlalchemy import create_engine, text
from datetime import datetime

DATABASE_URL = "mysql+pymysql://admin:111111@localhost:3306/XrayDB"
BACKUP_DIR = "backup"
if not os.path.exists(BACKUP_DIR):
    os.makedirs(BACKUP_DIR)

BACKUP_FILE = os.path.join(BACKUP_DIR, "mysql_vars_before_optimization.txt")

try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as connection:
        print(f"Starting backup to {BACKUP_FILE}...")
        
        variables = connection.execute(text("SHOW VARIABLES")).fetchall()
        
        with open(BACKUP_FILE, "w", encoding="utf-8") as f:
            f.write(f"--- MYSQL SETTINGS BACKUP ({datetime.now().isoformat()}) ---\n")
            for var in variables:
                f.write(f"{var[0]}: {var[1]}\n")
        
        print("Logical backup completed successfully.")
                
except Exception as e:
    print(f"Backup failed: {e}")
