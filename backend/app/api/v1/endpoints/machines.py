import json
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from ....database import get_db, Machine, Line, User
from .... import schemas
from ....core.security import get_current_user, check_permission
from ....core.websocket import manager

router = APIRouter()

@router.get("/", response_model=List[schemas.MachineResponse])
def get_machines(db: Session = Depends(get_db)):
    return db.query(Machine).all()

@router.post("/", response_model=schemas.MachineResponse)
def create_machine(
    machine: schemas.MachineCreate, 
    current_user: User = Depends(check_permission("CAN_MANAGE_SYSTEM")), 
    db: Session = Depends(get_db)
):
    # 1. Kiểm tra IP duy nhất toàn hệ thống (chỉ khi có nhập IP)
    if machine.ip_address:
        existing_ip = db.query(Machine).filter(Machine.ip_address == machine.ip_address).first()
        if existing_ip:
            raise HTTPException(
                status_code=400,
                detail=f"Lỗi: IP {machine.ip_address} đã được gán cho máy '{existing_ip.name}'"
            )
    else:
        # Nếu gửi chuỗi rỗng từ frontend, chuyển thành None để lưu vào DB là NULL
        machine.ip_address = None
    
    # 2. Kiểm tra tên máy duy nhất trong Line
    existing_name = db.query(Machine).filter(
        Machine.name == machine.name,
        Machine.line_id == machine.line_id
    ).first()
    if existing_name:
        line = db.query(Line).filter(Line.id == machine.line_id).first()
        line_name = line.name if line else f"Line {machine.line_id}"
        raise HTTPException(
            status_code=400,
            detail=f"Lỗi: Máy '{machine.name}' đã tồn tại trong '{line_name}'"
        )

    db_machine = Machine(**machine.dict(), status="OFFLINE")
    db.add(db_machine)
    try:
        db.commit()
        db.refresh(db_machine)
        return db_machine
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{machine_id}")
def get_machine_detail(machine_id: int, db: Session = Depends(get_db)):
    """Lấy thông tin chi tiết máy bao gồm Line và MachineType"""
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Không tìm thấy máy")
    
    return {
        "id": machine.id,
        "name": machine.name,
        "line_name": machine.line.name if machine.line else "Unknown",
        "machine_type_name": machine.machine_type.name if machine.machine_type else "Unknown",
        "machine_type_part_no": machine.machine_type.part_no if machine.machine_type else "N/A"
    }

@router.put("/{machine_id}", response_model=schemas.MachineResponse)
def update_machine(
    machine_id: int, 
    machine_data: schemas.MachineUpdate, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    db_machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not db_machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    for key, value in machine_data.dict(exclude_unset=True).items():
        if key == "ip_address":
            setattr(db_machine, key, value if value else None)
        else:
            setattr(db_machine, key, value)
    
    db.commit()
    db.refresh(db_machine)
    return db_machine

@router.delete("/{machine_id}")
def delete_machine(
    machine_id: int, 
    current_user: User = Depends(check_permission("CAN_MANAGE_SYSTEM")), 
    db: Session = Depends(get_db)
):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    db.delete(machine)
    db.commit()
    return {"status": "success"}

# --- OPERATIONAL ENDPOINTS ---

@router.post("/heartbeat")
def heartbeat(
    request: schemas.HeartbeatRequest, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    machine = db.query(Machine).filter(Machine.id == request.machine_id).first()
    if not machine:
        return {"status": "unregistered", "message": f"Connected to DB, but Machine ID {request.machine_id} is not registered."}
    
    # Kiểm tra trùng IP
    if request.ip_address:
        duplicate = db.query(Machine).filter(
            Machine.ip_address == request.ip_address,
            Machine.id != request.machine_id
        ).first()
        
        if duplicate:
            line_name = duplicate.line.name if duplicate.line else "Unknown"
            error_msg = f"Trùng IP {request.ip_address} với máy {duplicate.name} tại Line {line_name}"
            
            # Vẫn cập nhật trạng thái Online nhưng báo lỗi trùng
            machine.last_heartbeat = datetime.now()
            machine.status = "ONLINE"
            db.commit()
            raise HTTPException(status_code=400, detail=error_msg)
            
        machine.ip_address = request.ip_address

    machine.last_heartbeat = datetime.now()
    machine.status = "ONLINE"
    db.commit()
    
    # Thông báo cho Dashboard
    background_tasks.add_task(manager.broadcast, json.dumps({
        "type": "MACHINE_STATUS",
        "machine_id": machine.id,
        "status": "ONLINE"
    }))
    
    return {"status": "ok"}

@router.post("/offline")
def offline(
    request: schemas.HeartbeatRequest, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    machine = db.query(Machine).filter(Machine.id == request.machine_id).first()
    if not machine:
        return {"status": "unregistered", "message": f"Connected to DB, but Machine ID {request.machine_id} is not registered."}
    machine.status = "OFFLINE"
    db.commit()
    background_tasks.add_task(manager.broadcast, json.dumps({"type": "MACHINE_STATUS", "machine_id": machine.id, "status": "OFFLINE"}))
    return {"status": "ok"}
