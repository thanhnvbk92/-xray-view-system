import json
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database import get_db, User
from app import schemas

# --- AUTH CONFIGURATION ---
SECRET_KEY = "antigravity_xray_secret_key" # Trong thực tế nên dùng env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480 # 8 tiếng làm việc

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login") # Cập nhật url cho v1

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = schemas.TokenData(username=username)
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.username == token_data.username).first()
    if user is None:
        raise credentials_exception
    if not user.is_approved:
        raise HTTPException(status_code=403, detail="Tài khoản chưa được Admin phê duyệt")
    
    # Parse permissions từ JSON string sang List (Sử dụng tạm thời thuộc tính ảo)
    if user.permissions:
        try:
            permissions_data = json.loads(user.permissions)
            user.permissions_list = permissions_data
        except:
            user.permissions_list = []
    else:
        user.permissions_list = []
        
    return user

def check_permission(permission: str):
    async def permission_checker(current_user: User = Depends(get_current_user)):
        # Admin có toàn quyền hoặc user có quyền cụ thể trong danh sách
        if current_user.role == "ADMIN":
            return current_user
        if permission in current_user.permissions_list:
            return current_user
        raise HTTPException(status_code=403, detail=f"Bạn không có quyền: {permission}")
    return permission_checker
