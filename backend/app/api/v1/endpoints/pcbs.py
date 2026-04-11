import os
import json
import shutil
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ....database import get_db, PCB, PCBImage, Machine, User
from .... import schemas, config, database
from ....core.security import get_current_user, check_permission
from ....core.websocket import manager
from ....core.cache import global_stats_cache
from ....workers.image_worker import image_queue

router = APIRouter()

@router.post("/upload-scan")
async def upload_scan(
    pid: str = Form(...),
    board_pid: Optional[str] = Form(None),
    array_index: int = Form(1),
    machine_id: int = Form(...),
    machine_result: str = Form(...),
    client_time: str = Form(...),
    job_file: Optional[str] = Form(None),
    image_results: Optional[str] = Form(None),
    log_file: Optional[str] = Form(None), # Thêm tham số log_file
    files: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_db)
):
    # 0. Kiểm tra trùng lặp để thực hiện UPSERT
    existing_pcb = None
    try:
        c_time_dt = datetime.fromisoformat(client_time)
        existing_pcb = db.query(PCB).filter(
            PCB.pid == pid, 
            PCB.client_time == c_time_dt,
            PCB.array_index == array_index,
            PCB.machine_id == machine_id
        ).first()
    except Exception:
        pass
        
    # 1. Parse kết quả từng ảnh
    img_result_list = image_results.split(",") if image_results else []
    
    # 2. Lấy thông tin Machine để đặt tên file
    machine_info = db.query(Machine).filter(Machine.id == machine_id).first()
    line_name = "UnknownLine"
    m_name = f"M{machine_id}"
    
    if machine_info:
        m_name = machine_info.name
        if machine_info.line:
            line_name = machine_info.line.name

    # 3. Lưu các file ảnh tạm
    saved_paths = []
    main_image_path = None

    if files:
        for i, file in enumerate(files):
            safe_original_name = os.path.basename(file.filename).replace(" ", "_")
            file_name = f"{line_name}_{m_name}_{pid}_{safe_original_name}"
            file_path = os.path.join(config.UPLOAD_DIR, file_name)
            
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            saved_paths.append(file_path)
            if i == 0: main_image_path = file_path

    # Nếu đã tồn tại, thực hiện CẬP NHẬT (UPSERT)
    if existing_pcb:
        # Cập nhật tên file log vào image_path theo yêu cầu
        if log_file:
            existing_pcb.image_path = log_file
        
        # Chỉ cập nhật danh sách ảnh nếu bản ghi cũ đang thiếu ảnh
        existing_images_count = db.query(func.count(PCBImage.id)).filter(PCBImage.pcb_id == existing_pcb.id).scalar()
        if existing_images_count == 0 and saved_paths:
            for i, img_path in enumerate(saved_paths):
                m_res = img_result_list[i] if i < len(img_result_list) else machine_result
                a_res = "OK" if m_res == "OK" else "NG"
                
                new_img = PCBImage(
                    pcb_id=existing_pcb.id,
                    image_path=img_path,
                    machine_result=m_res,
                    ai_result=a_res,
                    user_result="PENDING",
                    is_processed=False
                )
                db.add(new_img)
                if m_res == "OK":
                    db.flush() # Để lấy ID cho queue
                    await image_queue.put(new_img.id)
            
            db.commit()
            global_stats_cache.clear()
            return {"status": "success", "message": "Record updated with images", "pcb_id": existing_pcb.id}
        
        db.commit()
        return {"status": "success", "message": "Duplicate verified", "pcb_id": existing_pcb.id}

    # 4. Giả lập AI processing (Tạo mới)
    overall_ai_score = 0.95 if machine_result == "OK" else 0.45 
    overall_ai_result = "OK" if overall_ai_score > 0.8 else "NG"
    
    # 5. Lưu PCB vào Database (Tạo mới)
    new_pcb = PCB(
        pid=pid,
        board_pid=board_pid or pid,
        array_index=array_index,
        machine_id=machine_id,
        machine_result=machine_result,
        ai_result=overall_ai_result,
        user_result="PENDING",
        final_result=machine_result,
        job_file=job_file,
        client_time=datetime.fromisoformat(client_time),
        image_path=log_file or main_image_path, # Lưu tên file log hoặc path ảnh đầu tiên
        ai_score=overall_ai_score,
        user_confirmed=False
    )
    db.add(new_pcb)
    db.commit()
    db.refresh(new_pcb)

    # 6. Lưu danh sách ảnh
    for i, img_path in enumerate(saved_paths):
        m_res = img_result_list[i] if i < len(img_result_list) else machine_result
        a_res = "OK" if m_res == "OK" else "NG"
        
        new_img = PCBImage(
            pcb_id=new_pcb.id,
            image_path=img_path,
            machine_result=m_res,
            ai_result=a_res,
            user_result="PENDING",
            is_processed=False
        )
        db.add(new_img)
        db.commit()
        db.refresh(new_img)
        
        if m_res == "OK":
            await image_queue.put(new_img.id)
    
    # WebSocket broadcast... (giữ nguyên logic bên dưới)
    
    # 7. Broadcast qua WebSocket và Xóa cache
    main_img_url = new_pcb.image_path
    if main_img_url and not main_img_url.startswith("/"):
        main_img_url = f"/images/{os.path.basename(main_img_url)}"

    global_stats_cache.clear()

    await manager.broadcast(json.dumps({
        "type": "NEW_SCAN",
        "data": {
            "id": new_pcb.id,
            "pid": new_pcb.pid,
            "array_index": new_pcb.array_index,
            "machine_result": new_pcb.machine_result,
            "job_file": new_pcb.job_file,
            "image_url": main_img_url or ""
        }
    }))
    
    return {"status": "success", "pcb_id": new_pcb.id}

@router.get("/unconfirmed/{machine_id}", response_model=schemas.PCBListResponse)
async def get_unconfirmed_pcbs(machine_id: int, db: Session = Depends(get_db)):
    """Lấy danh sách các PCB NG chưa duyệt của 1 máy kèm tổng số lượng"""
    # 1. Đếm tổng số lượng thực tế trong DB
    total = db.query(func.count(PCB.id)).filter(
        PCB.machine_id == machine_id,
        PCB.final_result == "NG",
        PCB.user_confirmed == False
    ).scalar() or 0

    # 2. Lấy danh sách 50 bản ghi mới nhất để hiển thị
    pcbs = db.query(PCB).options(joinedload(PCB.images)).filter(
        PCB.machine_id == machine_id,
        PCB.final_result == "NG",
        PCB.user_confirmed == False
    ).order_by(PCB.client_time.desc()).limit(50).all()
    
    return {"total": total, "pcbs": pcbs}

@router.get("/{pcb_id}/images", response_model=List[schemas.PCBImageResponse])
async def get_pcb_images(pcb_id: int, db: Session = Depends(get_db)):
    """Lấy danh sách tất cả ảnh thuộc về 1 PCB"""
    return db.query(PCBImage).filter(PCBImage.pcb_id == pcb_id).all()

@router.post("/confirm/{pcb_id}")
async def confirm_pcb(
    pcb_id: int, 
    user_result: str = Form(...), 
    db: Session = Depends(get_db),
    current_user: User = Depends(check_permission("CAN_CONFIRM_RESULTS"))
):
    """Xác nhận kết quả cuối cùng cho PCB"""
    pcb = db.query(PCB).filter(PCB.id == pcb_id).first()
    if not pcb:
        raise HTTPException(status_code=404, detail="PCB not found")
        
    pcb.user_confirmed = True
    pcb.user_result = user_result
    pcb.final_result = user_result
    pcb.confirmed_by_id = current_user.id
    pcb.confirmed_at = datetime.utcnow()
    
    db.query(PCBImage).filter(PCBImage.pcb_id == pcb_id).update({
        "machine_result": user_result, # Cập nhật để giao diện đổi màu
        "user_result": user_result,
        "confirmed_by_id": current_user.id
    })
    db.commit()
    
    # Nén ảnh sau khi confirm
    all_images = db.query(PCBImage).filter(PCBImage.pcb_id == pcb_id).all()
    for img in all_images:
        await image_queue.put(img.id)

    # Xóa cache stats
    global_stats_cache.clear()

    # Thông báo qua WebSocket
    await manager.broadcast(json.dumps({
        "type": "PCB_CONFIRMED",
        "data": {
            "pcb_id": pcb_id,
            "final_result": user_result,
            "confirmed_by": current_user.full_name
        }
    }))
        
    return {"status": "success", "pcb_id": pcb_id, "final_result": user_result}

@router.post("/confirm-image/{image_id}")
async def confirm_image(
    image_id: int,
    user_result: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Xác nhận kết quả cho một ảnh riêng lẻ"""
    img = db.query(PCBImage).filter(PCBImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    
    img.machine_result = user_result
    img.user_result = user_result
    img.confirmed_by_id = current_user.id
    
    # Xử lý ảnh gốc tương ứng
    base_path = img.image_path.rsplit('.', 1)[0]
    ext = img.image_path.rsplit('.', 1)[1]
    original_path = f"{base_path}_o.{ext}"
    
    orig_img = db.query(PCBImage).filter(
        PCBImage.pcb_id == img.pcb_id,
        PCBImage.image_path == original_path
    ).first()
    
    if orig_img:
        orig_img.machine_result = user_result
        orig_img.user_result = user_result
        orig_img.confirmed_by_id = current_user.id

    # Auto confirm PCB if all images OK
    all_images = db.query(PCBImage).filter(PCBImage.pcb_id == img.pcb_id).all()
    if all(i.machine_result == "OK" for i in all_images):
        pcb = db.query(PCB).filter(PCB.id == img.pcb_id).first()
        if pcb:
            pcb.user_confirmed = True
            pcb.user_result = "OK"
            pcb.final_result = "OK"
            pcb.confirmed_by_id = current_user.id
            pcb.confirmed_at = datetime.utcnow()
            
    db.commit()

    # Nén ảnh sau khi confirm
    await image_queue.put(img.id)
    if orig_img:
        await image_queue.put(orig_img.id)

    # Xóa cache stats
    global_stats_cache.clear()

    # Thông báo qua WebSocket
    await manager.broadcast(json.dumps({
        "type": "IMAGE_CONFIRMED",
        "data": {
            "image_id": image_id,
            "pcb_id": img.pcb_id,
            "user_result": user_result
        }
    }))

    return {"status": "success", "image_id": image_id, "user_result": user_result}

@router.get("/trace/search", response_model=List[schemas.PCBResponse])
async def search_trace(
    pid: Optional[str] = None,
    machine_id: Optional[int] = None,
    result: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Truy vết PCB theo nhiều điều kiện"""
    query = db.query(PCB).join(Machine).outerjoin(User, PCB.confirmed_by_id == User.id)
    
    if pid: query = query.filter(PCB.pid.like(f"%{pid}%"))
    if machine_id: query = query.filter(PCB.machine_id == machine_id)
    if result: query = query.filter(PCB.final_result == result)
    if start_date: query = query.filter(PCB.client_time >= start_date)
    if end_date: query = query.filter(PCB.client_time <= end_date)
        
    pcbs = query.order_by(PCB.client_time.desc()).limit(200).all()
    return pcbs
