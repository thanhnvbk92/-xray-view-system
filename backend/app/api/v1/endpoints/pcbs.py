import os
import json
import shutil
import re
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile, BackgroundTasks
from sqlalchemy import func, text, and_, or_, exists
from sqlalchemy.orm import Session, joinedload, selectinload

from ....database import get_db, PCB, PCBImage, Machine, User, refresh_stats_task
from .... import schemas, config, database
from ....core.security import get_current_user, check_permission
from ....core.websocket import manager
from ....core.cache import global_stats_cache
from ....workers.image_worker import enqueue_image
from ....services.mes_service import block_pcb_in_mes

router = APIRouter()

async def add_to_image_queue(image_id: int):
    """Async helper to push image id into image processing queue thread-safely via FastAPI BackgroundTasks"""
    await enqueue_image(image_id)

@router.post("/upload-scan")
def upload_scan(
    pid: str = Form(...),
    board_pid: Optional[str] = Form(None),
    array_index: int = Form(1),
    machine_id: int = Form(...),
    machine_result: str = Form(...),
    client_time: str = Form(...),
    job_file: Optional[str] = Form(None),
    image_results: Optional[str] = Form(None),
    image_causes: Optional[str] = Form(None), # Thêm: nguyên nhân lỗi cho từng ảnh
    shot_nums: Optional[str] = Form(None), 
    image_types: Optional[str] = Form(None), # Thêm: danh sách image_type (origin/marked)
    log_file: Optional[str] = Form(None), # Thêm tham số log_file
    files: Optional[List[UploadFile]] = File(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    # 0. Kiểm tra trùng lặp để thực hiện UPSERT
    # Chuẩn hóa client_time về độ chính xác giây để tránh lệch mili/vi giây của MySQL DATETIME
    try:
        c_time_dt = datetime.fromisoformat(client_time).replace(microsecond=0)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid client_time format. Must be ISO format.")

    existing_pcb = None
    try:
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
    img_cause_list = image_causes.split(",") if image_causes else []
    shot_num_list = shot_nums.split(",") if shot_nums else []
    image_type_list = image_types.split(",") if image_types else []
    
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
                # Xác định image_type và shot_num linh hoạt
                m_res = img_result_list[i] if i < len(img_result_list) else machine_result
                a_res = "OK" if m_res == "OK" else "NG"
                
                # Logic lấy shot_num từ tên file nếu không được gửi kèm
                s_num = 1
                if i < len(shot_num_list):
                    s_num = int(shot_num_list[i])
                else:
                    # Tìm số cuối cùng trong tên file (trước đuôi mở rộng)
                    match = re.search(r'(\d+)(?:_o)?\.[^.]+$', img_path)
                    if match:
                        s_num = int(match.group(1))

                i_type = image_type_list[i] if i < len(image_type_list) else ("origin" if "_o." in img_path.lower() else "marked")
                
                new_img = PCBImage(
                    pcb_id=existing_pcb.id,
                    image_path=img_path,
                    machine_result=m_res,
                    ai_result=a_res,
                    user_result="PENDING",
                    is_processed=False,
                    shot_num=s_num,
                    image_type=i_type,
                    cause=img_cause_list[i] if i < len(img_cause_list) else None
                )
                db.add(new_img)
                if m_res == "OK":
                    db.flush() # Để lấy ID cho queue
                    background_tasks.add_task(add_to_image_queue, new_img.id)
            
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
        client_time=c_time_dt,
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
        
        # Logic lấy shot_num từ tên file nếu không được gửi kèm
        s_num = 1
        if i < len(shot_num_list):
            s_num = int(shot_num_list[i])
        else:
            match = re.search(r'(\d+)(?:_o)?\.[^.]+$', img_path)
            if match:
                s_num = int(match.group(1))

        i_type = image_type_list[i] if i < len(image_type_list) else ("origin" if "_o." in img_path.lower() else "marked")
        
        new_img = PCBImage(
            pcb_id=new_pcb.id,
            image_path=img_path,
            machine_result=m_res,
            ai_result=a_res,
            user_result="PENDING",
            is_processed=False,
            shot_num=s_num,
            image_type=i_type,
            cause=img_cause_list[i] if i < len(img_cause_list) else None
        )
        db.add(new_img)
        db.commit()
        db.refresh(new_img)
        
        if m_res == "OK":
            background_tasks.add_task(add_to_image_queue, new_img.id)
    
    # WebSocket broadcast... (giữ nguyên logic bên dưới)
    
    # 7. Broadcast qua WebSocket và Xóa cache
    main_img_url = new_pcb.image_path
    if main_img_url and not main_img_url.startswith("/"):
        main_img_url = f"/images/{os.path.basename(main_img_url)}"

    global_stats_cache.clear()

    background_tasks.add_task(manager.broadcast, json.dumps({
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
    
    # 8. Refresh stats in background
    background_tasks.add_task(refresh_stats_task, new_pcb.client_time.date())
    
    return {"status": "success", "pcb_id": new_pcb.id}

@router.get("/unconfirmed/{machine_id}", response_model=schemas.PCBListResponse)
def get_unconfirmed_pcbs(machine_id: int, db: Session = Depends(get_db)):
    """Lấy danh sách các PCB NG chưa duyệt của 1 máy kèm tổng số lượng"""
    import time
    t_start = time.time()
    
    # 1. Đếm tổng số lượng thực tế trong DB
    total = db.query(func.count(PCB.id)).filter(
        PCB.machine_id == machine_id,
        PCB.final_result == "NG",
        PCB.user_confirmed == False
    ).scalar() or 0
    t_count = time.time()
    print(f"API unconfirmed: Step 1 (count) took {t_count - t_start:.4f}s")

    # 2. LẤY DANH SÁCH BẰNG CHIẾN LƯỢC HAI GIAI ĐOẠN (TWO-STAGE ID LOOKUP)
    # Giai đoạn 2.1: Truy vấn tìm danh sách các PCB ID có lỗi ưu tiên (Short, Area) trước
    priority_ids_query = db.query(PCB.id).filter(
        PCB.machine_id == machine_id,
        PCB.final_result == "NG",
        PCB.user_confirmed == False,
        exists().where(
            and_(
                PCBImage.pcb_id == PCB.id,
                or_(PCBImage.cause.like('%Short%'), PCBImage.cause.like('%Area%'))
            )
        )
    ).order_by(PCB.client_time.asc()).limit(50)
    
    priority_ids = [r[0] for r in priority_ids_query.all()]
    t_priority = time.time()
    print(f"API unconfirmed: Step 2.1 (priority IDs) took {t_priority - t_count:.4f}s")
    
    final_ids = list(priority_ids)
    
    # Giai đoạn 2.2: Nếu chưa đủ 50 bản ghi, bù bằng các PCB không ưu tiên
    if len(final_ids) < 50:
        needed = 50 - len(final_ids)
        normal_query = db.query(PCB.id).filter(
            PCB.machine_id == machine_id,
            PCB.final_result == "NG",
            PCB.user_confirmed == False
        )
        if final_ids:
            normal_query = normal_query.filter(PCB.id.not_in(final_ids))
            
        normal_ids = [r[0] for r in normal_query.order_by(PCB.client_time.asc()).limit(needed).all()]
        final_ids.extend(normal_ids)
    t_normal = time.time()
    print(f"API unconfirmed: Step 2.2 (normal IDs) took {t_normal - t_priority:.4f}s")

    # Giai đoạn 2.3: Truy vấn thông tin chi tiết bằng selectinload dựa trên danh sách ID đã thu thập
    if not final_ids:
        pcbs = []
    else:
        # Load đầy đủ đối tượng kèm ảnh, machine và line để tránh N+1 queries khi serialize display_name
        unordered_pcbs = db.query(PCB).options(
            selectinload(PCB.images),
            joinedload(PCB.machine).joinedload(Machine.line)
        ).filter(PCB.id.in_(final_ids)).all()
        # Sắp xếp lại trong Python theo thứ tự của final_ids để giữ đúng độ ưu tiên
        pcb_map = {p.id: p for p in unordered_pcbs}
        pcbs = [pcb_map[pid] for pid in final_ids if pid in pcb_map]
    t_detail = time.time()
    print(f"API unconfirmed: Step 2.3 (details query) took {t_detail - t_normal:.4f}s")
    print(f"API unconfirmed: Total DB query time: {t_detail - t_start:.4f}s")
    
    return {"total": total, "pcbs": pcbs}

@router.get("/{pcb_id}/images", response_model=List[schemas.PCBImageResponse])
def get_pcb_images(pcb_id: int, db: Session = Depends(get_db)):
    """Lấy danh sách tất cả ảnh thuộc về 1 PCB"""
    return db.query(PCBImage).filter(PCBImage.pcb_id == pcb_id).all()

@router.post("/confirm/{pcb_id}")
def confirm_pcb(
    pcb_id: int, 
    user_result: str = Form(...), 
    background_tasks: BackgroundTasks = BackgroundTasks(),
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
    pcb.confirmed_at = datetime.now()
    
    db.query(PCBImage).filter(PCBImage.pcb_id == pcb_id).update({
        "user_result": user_result,
        "confirmed_by_id": current_user.id,
        "confirmed_at": datetime.now()
    })
    db.commit()
    
    # Refresh stats in background
    background_tasks.add_task(refresh_stats_task, pcb.client_time.date())
    
    # Nén ảnh sau khi confirm
    all_images = db.query(PCBImage).filter(PCBImage.pcb_id == pcb_id).all()
    for img in all_images:
        background_tasks.add_task(add_to_image_queue, img.id)

    # Xóa cache stats
    global_stats_cache.clear()

    # Thông báo qua WebSocket
    background_tasks.add_task(manager.broadcast, json.dumps({
        "type": "PCB_CONFIRMED",
        "data": {
            "pcb_id": pcb_id,
            "final_result": user_result,
            "confirmed_by": current_user.full_name
        }
    }))
        
    # Block in MES if result is NG
    if user_result == "NG":
        background_tasks.add_task(
            block_pcb_in_mes, 
            pid=pcb.pid, 
            reason="PCB_CONFIRMED_NG",
            status=1
        )
        
    return {"status": "success", "pcb_id": pcb_id, "final_result": user_result}

@router.post("/confirm-image/{image_id}")
def confirm_image(
    image_id: int,
    user_result: str = Form(...),
    cause: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Xác nhận kết quả cho một ảnh riêng lẻ"""
    img = db.query(PCBImage).filter(PCBImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Cập nhật kết quả cho toàn bộ các ảnh có cùng shot_num (bao gồm cả marked và origin)
    db.query(PCBImage).filter(
        PCBImage.pcb_id == img.pcb_id,
        PCBImage.shot_num == img.shot_num
    ).update({
        "user_result": user_result,
        "cause": cause,
        "confirmed_by_id": current_user.id,
        "confirmed_at": datetime.now()
    })
    db.commit()

    # Block in MES if result is NG
    if user_result == "NG":
        # Lấy thông tin PCB để lấy PID
        pcb = db.query(PCB).filter(PCB.id == img.pcb_id).first()
        if pcb:
            background_tasks.add_task(
                block_pcb_in_mes, 
                pid=pcb.pid, 
                reason=cause or "XRAY_NG_CONFIRMED",
                status=1
            )

    # Auto confirm PCB if all relevant images (NG by machine or AI) have been reviewed
    all_images = db.query(PCBImage).filter(PCBImage.pcb_id == img.pcb_id).all()
    # Chỉ yêu cầu xác nhận đối với các ảnh mà Machine hoặc AI báo NG
    ng_flagged_images = [i for i in all_images if i.machine_result == "NG" or i.ai_result == "NG"]
    
    if not ng_flagged_images or all(i.user_result != "PENDING" for i in ng_flagged_images):
        pcb = db.query(PCB).filter(PCB.id == img.pcb_id).first()
        if pcb:
            pcb.user_confirmed = True
            pcb.confirmed_by_id = current_user.id
            pcb.confirmed_at = datetime.now()
            
            # Kết quả cuối cùng của PCB: 
            # Ưu tiên user_result của các ảnh. Nếu có bất kỳ ảnh nào user xác nhận NG hoặc (chưa xác nhận nhưng máy/AI báo NG)
            # Thực tế: Nếu đã vào đây thì all(i.user_result != "PENDING") cho các ảnh NG.
            # Vậy chỉ cần kiểm tra xem có ảnh nào có user_result == "NG" không.
            # Đối với các ảnh OK (không nằm trong ng_flagged_images), user_result thường là PENDING, ta coi là OK.
            
            board_is_ng = False
            for i in all_images:
                res = i.user_result if i.user_result != "PENDING" else i.machine_result
                if res == "NG":
                    board_is_ng = True
                    break
            
            final_res = "NG" if board_is_ng else "OK"
            pcb.user_result = final_res
            pcb.final_result = final_res
            # Refresh stats in background
            background_tasks.add_task(refresh_stats_task, pcb.client_time.date())
            
    db.commit()

    # Nén ảnh sau khi confirm (Toàn bộ các ảnh cùng shot)
    all_shot_images = db.query(PCBImage).filter(
        PCBImage.pcb_id == img.pcb_id,
        PCBImage.shot_num == img.shot_num
    ).all()
    for shot_img in all_shot_images:
        background_tasks.add_task(add_to_image_queue, shot_img.id)

    # Xóa cache stats
    global_stats_cache.clear()

    # Thông báo qua WebSocket
    background_tasks.add_task(manager.broadcast, json.dumps({
        "type": "IMAGE_CONFIRMED",
        "data": {
            "image_id": image_id,
            "pcb_id": img.pcb_id,
            "user_result": user_result
        }
    }))

    return {"status": "success", "image_id": image_id, "user_result": user_result}

@router.get("/trace/search", response_model=List[schemas.PCBResponse])
def search_trace(
    pid: Optional[str] = None,
    machine_id: Optional[int] = None,
    result: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Truy vết PCB theo nhiều điều kiện - Tối ưu hiệu năng cao"""
    # Chỉ load machine và line, KHÔNG load images (Lazy load ở Frontend)
    query = db.query(PCB).options(
        joinedload(PCB.machine).joinedload(Machine.line),
        joinedload(PCB.confirmed_by)
    )
    
    if pid:
        # Tối ưu hóa: Nếu không có dấu * ở đầu, MySQL có thể dùng Index (Prefix Search)
        search_term = pid.strip()
        if search_term.startswith('*'):
            # Tìm kiếm chứa hoặc kết thúc bằng (Chậm hơn vì không dùng được Index)
            search_term = search_term.replace('*', '%')
            query = query.filter(PCB.pid.like(search_term))
        elif '*' in search_term:
            # Tìm kiếm có chứa dấu * ở giữa hoặc cuối (Nhanh vì dùng Index)
            search_term = search_term.replace('*', '%')
            query = query.filter(PCB.pid.like(search_term))
        else:
            # Mặc định tìm kiếm Bắt đầu bằng (Cực nhanh - Tận dụng Index ix_pcbs_pid)
            query = query.filter(PCB.pid.like(f"{search_term}%"))
        
    if machine_id: query = query.filter(PCB.machine_id == machine_id)
    if result: query = query.filter(PCB.final_result == result)
    
    if start_date: 
        query = query.filter(PCB.client_time >= f"{start_date} 00:00:00")
    if end_date: 
        query = query.filter(PCB.client_time <= f"{end_date} 23:59:59")
        
    # Tăng limit lên một chút vì gói tin đã nhẹ hơn rất nhiều
    pcbs = query.order_by(PCB.client_time.desc()).limit(300).all()
    return pcbs
