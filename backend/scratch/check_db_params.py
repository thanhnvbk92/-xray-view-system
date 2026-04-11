import sys
import os
from sqlalchemy import create_engine, text

# Lấy URL từ biến môi trường hoặc dùng mặc định
DATABASE_URL = "mysql+pymysql://admin:111111@localhost:3306/XrayDB"

try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as connection:
        print("--- MySQL Optimization Research ---")
        
        # 1. Kiểm tra phiên bản
        version = connection.execute(text("SELECT VERSION()")).fetchone()
        print(f"MySQL Version: {version[0]}")
        
        # 2. Các biến quan trọng
        variables = [
            'innodb_buffer_pool_size',
            'innodb_log_file_size',
            'innodb_flush_log_at_trx_commit',
            'max_connections',
            'query_cache_size',
            'innodb_thread_concurrency'
        ]
        
        for var in variables:
            res = connection.execute(text(f"SHOW VARIABLES LIKE '{var}'")).fetchone()
            if res:
                val = res[1]
                # Convert bytes to GB if it's a large number
                if val.isdigit() and int(val) > 1024*1024:
                    print(f"{var}: {int(val)/1024/1024/1024:.2f} GB ({val} bytes)")
                else:
                    print(f"{var}: {val}")
            else:
                print(f"{var}: Not found/Not supported")
                
except Exception as e:
    print(f"Error connecting to DB: {e}")
