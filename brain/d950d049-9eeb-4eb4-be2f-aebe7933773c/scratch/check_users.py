
import os
from sqlalchemy import create_engine, text

DATABASE_URL = "mysql+pymysql://admin:111111@localhost:3306/XrayDB"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    result = conn.execute(text("SELECT id, username, is_approved, role FROM users")).fetchall()
    print("--- USERS IN DATABASE ---")
    for row in result:
        print(f"ID: {row[0]}, Username: {row[1]}, Approved: {row[2]}, Role: {row[3]}")
    if not result:
        print("No users found.")
