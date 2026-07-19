import pymysql
import os
import re

DB_CONFIG = {
    "host": "localhost",
    "user": "admin",
    "password": "111111",
    "database": "XrayDB",
    "charset": "utf8mb4"
}

SQL_FILE = r"D:\1. Project\Xray View System\backend\app\migrations\phase1_optimization.sql"

def run_migration():
    print(f"--- Starting Migration: {SQL_FILE} ---")
    
    if not os.path.exists(SQL_FILE):
        print(f"Error: File not found {SQL_FILE}")
        return

    connection = None
    try:
        connection = pymysql.connect(**DB_CONFIG)
        cursor = connection.cursor()

        # Tự động tìm và xóa Foreign Keys trên pcbs và pcb_images (Tránh lỗi Partitioning)
        for table in ['pcbs', 'pcb_images']:
            cursor.execute(f"SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = '{DB_CONFIG['database']}' AND TABLE_NAME = '{table}' AND REFERENCED_TABLE_NAME IS NOT NULL")
            fks = cursor.fetchall()
            for (fk_name,) in fks:
                try:
                    print(f"  > Dropping Foreign Key {fk_name} on {table}...")
                    cursor.execute(f"ALTER TABLE {table} DROP FOREIGN KEY {fk_name}")
                except Exception as e:
                    print(f"  ! Warning: Could not drop FK {fk_name}: {e}")

        with open(SQL_FILE, 'r', encoding='utf-8') as f:
            full_sql = f.read()

        # Loại bỏ comments
        sql_clean = re.sub(r'--.*', '', full_sql)
        
        # Tách các câu lệnh theo dấu chấm phẩy, ngoại trừ trong các khối BEGIN...END
        # Cách đơn giản: split theo ; và kiểm tra nếu đang ở trong khối PROC
        commands = []
        current_cmd = ""
        in_procedure = False
        
        for line in full_sql.split('\n'):
            line_clean = line.strip()
            if not line_clean or line_clean.startswith('--'):
                continue
            
            if 'CREATE PROCEDURE' in line_clean:
                in_procedure = True
            
            current_cmd += " " + line
            
            if in_procedure:
                if 'END;' in line_clean or 'END //' in line_clean:
                    commands.append(current_cmd.replace('//', '').replace('DELIMITER', '').strip())
                    current_cmd = ""
                    in_procedure = False
            else:
                if ';' in line_clean:
                    # Có thể có nhiều lệnh trên 1 dòng nhưng ở đây ta giả định 1 lệnh kết thúc bằng ;
                    cmds = current_cmd.split(';')
                    for c in cmds[:-1]:
                        if c.strip():
                            commands.append(c.strip())
                    current_cmd = cmds[-1]

        if current_cmd.strip():
            commands.append(current_cmd.strip())

        for cmd in commands:
            cmd = cmd.strip()
            if not cmd or cmd.upper().startswith('DELIMITER'):
                continue
            
            print(f"Executing: {cmd[:70]}...")
            try:
                cursor.execute(cmd)
                connection.commit() # Commit mỗi lệnh để tránh treo long-running alter
                print("  [OK]")
            except Exception as e:
                print(f"  [FAILED] Error: {e}")
                # Không dừng lại nếu là lỗi vặt, nhưng log lại
                if "PARTITION" in cmd.upper() or "PRIMARY KEY" in cmd.upper():
                    print("Critical step failed. Stopping.")
                    break

        print("\n--- Migration Process Finished ---")
            
    except Exception as e:
        print(f"Global Migration Error: {e}")
    finally:
        if connection:
            connection.close()

if __name__ == "__main__":
    run_migration()
