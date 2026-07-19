from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timedelta

DATABASE_URL = "mysql+pymysql://admin:111111@localhost:3306/XrayDB"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

try:
    target_date = "2026-04-10" # Example date
    d = datetime.strptime(target_date, "%Y-%m-%d")
    
    # 1. Test performance of join query (Current way)
    print("--- Testing Join Query (Original) ---")
    start = datetime.now()
    q1 = text("""
        SELECT 
            i.shot_num,
            COUNT(i.id) as total,
            SUM(CASE WHEN i.machine_result = 'NG' THEN 1 ELSE 0 END) as ng
        FROM pcb_images i
        JOIN pcbs p ON i.pcb_id = p.id
        WHERE p.client_time >= :sd AND p.client_time < :ed
        GROUP BY i.shot_num
    """)
    res1 = db.execute(q1, {"sd": d, "ed": d + timedelta(days=7)}).fetchall()
    end = datetime.now()
    print(f"Original join query took: {end - start}")

    # 2. Test performance of ID-range query (Proposed optimization)
    print("\n--- Testing ID-range Query (Optimized) ---")
    start = datetime.now()
    # Find ID range
    range_q = text("SELECT MIN(id), MAX(id) FROM pcbs WHERE client_time >= :sd AND client_time < :ed")
    min_id, max_id = db.execute(range_q, {"sd": d, "ed": d + timedelta(days=7)}).fetchone()
    print(f"ID Range: {min_id} to {max_id}")
    
    if min_id and max_id:
        q2 = text("""
            SELECT 
                shot_num,
                COUNT(id) as total,
                SUM(CASE WHEN machine_result = 'NG' THEN 1 ELSE 0 END) as ng
            FROM pcb_images
            WHERE pcb_id BETWEEN :min_id AND :max_id
            GROUP BY shot_num
        """)
        res2 = db.execute(q2, {"min_id": min_id, "max_id": max_id}).fetchall()
        end = datetime.now()
        print(f"Optimized ID-range query took: {end - start}")
    else:
        print("No data in range.")

except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
