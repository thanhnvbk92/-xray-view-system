import json
from datetime import timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Form
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ....database import get_db, User
from .... import schemas
from ....core.security import (
    get_password_hash, 
    verify_password, 
    create_access_token, 
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

router = APIRouter()

@router.post("/register", response_model=schemas.UserResponse)
async def register_user(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    # Check if username exists
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="Tài khoản đã tồn tại")
    
    # Check if this is the first user
    user_count = db.query(User).count()
    is_first = user_count == 0
    
    new_user = User(
        username=user_in.username,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        employee_id=user_in.employee_id,
        position=user_in.position,
        role="ADMIN" if is_first else "OPERATOR",
        is_approved=is_first
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login", response_model=schemas.Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Tài khoản hoặc mật khẩu không chính xác")
    
    if not user.is_approved:
        raise HTTPException(status_code=403, detail="Tài khoản đang chờ Admin phê duyệt")
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    perms = []
    if user.permissions:
        try: perms = json.loads(user.permissions)
        except: pass

    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name,
        "permissions": perms
    }

@router.get("/me", response_model=schemas.UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# --- ADMIN ENDPOINTS ---

@router.get("/users", response_model=List[schemas.UserResponse])
async def list_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Admin")
    return db.query(User).all()

@router.post("/users/{user_id}/approve")
async def approve_user(
    user_id: int, 
    role: str = "OPERATOR", 
    permissions: Optional[str] = None, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Admin")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if role not in ["ADMIN", "OPERATOR", "VIEWER"]:
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ")

    user.is_approved = True
    user.role = role
    if permissions:
        user.permissions = permissions
    db.commit()
    return {"status": "success", "user": user.username, "role": user.role}

@router.post("/users/{user_id}/reject")
async def reject_user(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Admin")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"status": "success"}
