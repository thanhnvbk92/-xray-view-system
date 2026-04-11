from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ....database import get_db, Line, MachineType, User
from .... import schemas
from ....core.security import get_current_user, check_permission

router = APIRouter()

# --- LINE ENDPOINTS ---

@router.get("/lines", response_model=List[schemas.LineResponse])
def get_lines(db: Session = Depends(get_db)):
    return db.query(Line).all()

@router.post("/lines", response_model=schemas.LineResponse)
def create_line(
    line: schemas.LineCreate, 
    current_user: User = Depends(check_permission("CAN_MANAGE_SYSTEM")), 
    db: Session = Depends(get_db)
):
    db_line = Line(**line.dict())
    db.add(db_line)
    db.commit()
    db.refresh(db_line)
    return db_line

@router.put("/lines/{line_id}", response_model=schemas.LineResponse)
def update_line(
    line_id: int, 
    line_data: schemas.LineUpdate, 
    current_user: User = Depends(check_permission("CAN_MANAGE_SYSTEM")), 
    db: Session = Depends(get_db)
):
    db_line = db.query(Line).filter(Line.id == line_id).first()
    if not db_line:
        raise HTTPException(status_code=404, detail="Line not found")
    for key, value in line_data.dict(exclude_unset=True).items():
        setattr(db_line, key, value)
    db.commit()
    db.refresh(db_line)
    return db_line

@router.delete("/lines/{line_id}")
def delete_line(
    line_id: int, 
    current_user: User = Depends(check_permission("CAN_MANAGE_SYSTEM")), 
    db: Session = Depends(get_db)
):
    line = db.query(Line).filter(Line.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    db.delete(line)
    db.commit()
    return {"status": "success"}

# --- MACHINE TYPE ENDPOINTS ---

@router.get("/machine-types", response_model=List[schemas.MachineTypeResponse])
def get_machine_types(db: Session = Depends(get_db)):
    return db.query(MachineType).all()

@router.post("/machine-types", response_model=schemas.MachineTypeResponse)
def create_machine_type(
    mt: schemas.MachineTypeCreate, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Admin")
    db_mt = MachineType(**mt.dict())
    db.add(db_mt)
    db.commit()
    db.refresh(db_mt)
    return db_mt

@router.put("/machine-types/{mt_id}", response_model=schemas.MachineTypeResponse)
def update_machine_type(
    mt_id: int, 
    mt_data: schemas.MachineTypeUpdate, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    db_mt = db.query(MachineType).filter(MachineType.id == mt_id).first()
    if not db_mt:
        raise HTTPException(status_code=404, detail="Machine Type not found")
    for key, value in mt_data.dict(exclude_unset=True).items():
        setattr(db_mt, key, value)
    db.commit()
    db.refresh(db_mt)
    return db_mt

@router.delete("/machine-types/{mt_id}")
def delete_machine_type(
    mt_id: int, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    mt = db.query(MachineType).filter(MachineType.id == mt_id).first()
    if not mt:
        raise HTTPException(status_code=404, detail="Machine Type not found")
    db.delete(mt)
    db.commit()
    return {"status": "success"}
