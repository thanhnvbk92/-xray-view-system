import os
from sqlalchemy import create_engine, inspect, text
from database import DATABASE_URL

engine = create_engine(DATABASE_URL)

def check_db():
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"Tables: {tables}")
    
    if 'pcbs' in tables:
        columns = [c['name'] for c in inspector.get_columns('pcbs')]
        print(f"Columns in 'pcbs': {columns}")
        
    if 'pcb_images' in tables:
        columns = [c['name'] for c in inspector.get_columns('pcb_images')]
        print(f"Columns in 'pcb_images': {columns}")

if __name__ == "__main__":
    check_db()
