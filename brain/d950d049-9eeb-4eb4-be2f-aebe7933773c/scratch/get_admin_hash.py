
import os
from sqlalchemy import create_engine, text

DATABASE_URL = "mysql+pymysql://admin:111111@localhost:3306/XrayDB"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    result = conn.execute(text("SELECT hashed_password FROM users WHERE username='admin'")).fetchone()
    if result:
        print(f"Current Hash: {result[0]}")
    else:
        print("Admin user not found.")
