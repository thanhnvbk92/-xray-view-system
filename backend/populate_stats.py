import pymysql
import datetime

DB_CONFIG = {
    "host": "localhost",
    "user": "admin",
    "password": "111111",
    "database": "XrayDB",
    "charset": "utf8mb4"
}

def populate_historical_stats():
    print("--- Populating Historical Daily Stats ---")
    connection = pymysql.connect(**DB_CONFIG)
    try:
        with connection.cursor() as cursor:
            # Lấy danh sách các ngày duy nhất có trong dữ liệu
            print("Fetching unique dates from pcbs...")
            cursor.execute("SELECT DISTINCT DATE(client_time) FROM pcbs ORDER BY 1")
            dates = [row[0] for row in cursor.fetchall() if row[0]]
            
            total_dates = len(dates)
            print(f"Found {total_dates} days to process.")
            
            for i, d in enumerate(dates):
                print(f"[{i+1}/{total_dates}] Processing {d}...", end="", flush=True)
                cursor.callproc('refresh_daily_stats', (d,))
                connection.commit()
                print(" OK")
                
        print("\n--- History Population Finished ---")
    finally:
        connection.close()

if __name__ == "__main__":
    populate_historical_stats()
