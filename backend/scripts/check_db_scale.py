from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = "mysql+pymysql://admin:111111@localhost:3306/XrayDB"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

try:
    print("--- Table Counts ---")
    res = db.execute(text("SELECT count(*) FROM pcbs")).fetchone()
    print(f"Total PCBS: {res[0]}")
    
    res = db.execute(text("SELECT count(*) FROM pcb_images")).fetchone()
    print(f"Total PCB_IMAGES: {res[0]}")
    
    print("\n--- PCBS Indexes ---")
    res = db.execute(text("SHOW INDEX FROM pcbs")).fetchall()
    for r in res:
        print(f"Index: {r[2]} ({r[4]})")
        
    print("\n--- PCB_IMAGES Indexes ---")
    res = db.execute(text("SHOW INDEX FROM pcb_images")).fetchall()
    for r in res:
        print(f"Index: {r[2]} ({r[4]})")

except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
