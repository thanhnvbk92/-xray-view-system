import pymysql
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timedelta

# Mocking the configuration
SQLALCHEMY_DATABASE_URL = "mysql+pymysql://admin:111111@10.7.12.236/XrayDB"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

try:
    start_date = datetime.now() - timedelta(days=7)
    # Test only the unit query which is the most complex
    pcb_ids_query = text("SELECT id FROM pcbs WHERE system_time >= :start")
    pcb_ids = [r[0] for r in db.execute(pcb_ids_query, {"start": start_date}).fetchall()]
    
    print(f"Found {len(pcb_ids)} PCBs")
    
    if not pcb_ids:
        print("No PCBs found in the last 7 days.")
    else:
        unit_query = text("""
            SELECT 
                SUBSTRING_INDEX(SUBSTRING_INDEX(image_path, '_', -1), '.', 1) as unit_idx,
                COUNT(*) as total,
                SUM(CASE WHEN machine_result = 'NG' THEN 1 ELSE 0 END) as ng_count
            FROM pcb_images
            WHERE pcb_id IN :pcb_ids
            GROUP BY unit_idx
            ORDER BY CAST(unit_idx AS UNSIGNED) ASC
        """)
        # SQLAlchemy requires tuple for IN clause in some versions
        results = db.execute(unit_query, {"pcb_ids": tuple(pcb_ids)}).fetchall()
        print(f"Results: {len(results)}")
        for r in results:
            print(r)

except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
