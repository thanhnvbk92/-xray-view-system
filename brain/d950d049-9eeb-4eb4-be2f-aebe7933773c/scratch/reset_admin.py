
import os
from sqlalchemy import create_engine, text
from passlib.context import CryptContext

# Sử dụng đúng scheme của hệ thống
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

DATABASE_URL = "mysql+pymysql://admin:111111@localhost:3306/XrayDB"
engine = create_engine(DATABASE_URL)

new_hashed_password = pwd_context.hash("admin")

with engine.connect() as conn:
    print(f"Setting new hash for admin: {new_hashed_password}")
    conn.execute(text("UPDATE users SET hashed_password = :hp, is_approved = 1 WHERE username = 'admin'"), {"hp": new_hashed_password})
    conn.commit()
    print("Password reset successful for user 'admin'")
