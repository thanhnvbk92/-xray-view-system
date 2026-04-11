from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy import func, case, and_, text
from sqlalchemy.orm import Session

from ....database import get_db, PCB, PCBImage, Machine, Line, User
from ....core.security import get_current_user

router = APIRouter()

@router.get("/summary")
async def get_analysis_summary(
    machine_id: Optional[int] = None,
    job_file: Optional[str] = None,
    array_index: Optional[int] = None,
    shot_idx: Optional[int] = None,
    target_date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Tổng hợp dữ liệu chuyên sâu cho trang Analysis"""
    
    # 1. Xây dựng Filter
    filters = []
    if machine_id:
        filters.append(PCB.machine_id == machine_id)
    if job_file:
        filters.append(PCB.job_file == job_file)
    if array_index:
        filters.append(PCB.array_index == array_index)
    if shot_idx:
        # Lọc các PCB có ít nhất một ảnh tương ứng với shot_idx này
        # Shot Index được tách từ image_path: ..._{shot_idx}.jpg
        shot_subquery = db.query(PCBImage.pcb_id).filter(
            func.substring_index(func.substring_index(PCBImage.image_path, '_', -1), '.', 1).cast(Integer) == shot_idx
        ).subquery()
        filters.append(PCB.id.in_(shot_subquery))
    
    if target_date:
        d = datetime.strptime(target_date, "%Y-%m-%d")
        filters.append(and_(PCB.system_time >= d, PCB.system_time < d + timedelta(days=1)))
    elif start_date and end_date:
        sd = datetime.strptime(start_date, "%Y-%m-%d")
        ed = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        filters.append(and_(PCB.system_time >= sd, PCB.system_time < ed))
    else:
        # Mặc định 7 ngày gần nhất
        sd = datetime.now() - timedelta(days=7)
        filters.append(PCB.system_time >= sd)

    def get_rate(count, total):
        return round((count / total * 100), 1) if total > 0 else 0

    # 2. Overall Stats
    overall_stats = db.query(
        func.count(PCB.id).label('total'),
        func.sum(case((PCB.final_result == 'OK', 1), else_=0)).label('ok'),
        func.sum(case((PCB.final_result == 'NG', 1), else_=0)).label('ng'),
        func.sum(case((PCB.ai_result == 'OK', 1), else_=0)).label('ai_ok'),
        func.sum(case((PCB.user_result == 'OK', 1), else_=0)).label('user_ok')
    ).filter(*filters).first()

    total = overall_stats.total or 0
    ok = int(overall_stats.ok or 0)
    ng = int(overall_stats.ng or 0)
    
    overall = {
        "total": total,
        "ok": ok,
        "ng": ng,
        "ai_ok": int(overall_stats.ai_ok or 0),
        "user_ok": int(overall_stats.user_ok or 0),
        "ok_rate": get_rate(ok, total),
        "ng_rate": get_rate(ng, total)
    }

    # 3. Stats by Machine
    machine_stats = db.query(
        Machine.id,
        Machine.name,
        Line.name.label('line_name'),
        func.count(PCB.id).label('total'),
        func.sum(case((PCB.final_result == 'NG', 1), else_=0)).label('ng')
    ).join(PCB, PCB.machine_id == Machine.id).join(Line, Machine.line_id == Line.id)\
        .filter(*filters).group_by(Machine.id).order_by(Line.name, Machine.name).all()

    machines = []
    for row in machine_stats:
        machines.append({
            "id": row.id,
            "display_name": f"{row.line_name} - {row.name}",
            "total": row.total,
            "ng": int(row.ng or 0),
            "ng_rate": get_rate(int(row.ng or 0), row.total)
        })

    # 4. Stats by Job File
    job_stats = db.query(
        PCB.job_file,
        func.count(PCB.id).label('total'),
        func.sum(case((PCB.final_result == 'NG', 1), else_=0)).label('ng')
    ).filter(*filters).group_by(PCB.job_file).order_by(func.sum(case((PCB.final_result == 'NG', 1), else_=0)).desc()).limit(20).all()

    jobs = []
    for row in job_stats:
        if not row.job_file: continue
        jobs.append({
            "job": row.job_file,
            "total": row.total,
            "ng": int(row.ng or 0),
            "ng_rate": get_rate(int(row.ng or 0), row.total)
        })

    # 5. Stats by Array Index
    array_stats = db.query(
        PCB.array_index,
        func.count(PCB.id).label('total'),
        func.sum(case((PCB.final_result == 'NG', 1), else_=0)).label('ng')
    ).filter(*filters).group_by(PCB.array_index).all()

    arrays = []
    for row in array_stats:
        arrays.append({
            "array_index": row.array_index,
            "displayLabel": f"Array Index {row.array_index}",
            "total": row.total,
            "ng": int(row.ng or 0),
            "ng_rate": get_rate(int(row.ng or 0), row.total)
        })

    # 6. Stats by Shot (Vị trí ảnh trên PCB) - Map theo tên ảnh (ví dụ _1.jpg)
    shot_query = db.query(
        func.substring_index(func.substring_index(PCBImage.image_path, '_', -1), '.', 1).label('shot_idx'),
        func.count(PCBImage.id).label('total'),
        func.sum(case((PCBImage.machine_result == 'NG', 1), else_=0)).label('ng')
    ).join(PCB, PCBImage.pcb_id == PCB.id).filter(*filters).group_by(text('shot_idx')).all()

    shots = []
    for row in shot_query:
        if row.shot_idx and row.shot_idx.isdigit() and row.total > 0:
            shots.append({
                "shot": int(row.shot_idx),
                "displayLabel": f"Shot {row.shot_idx}",
                "total": row.total,
                "ng": int(row.ng or 0),
                "ng_rate": get_rate(int(row.ng or 0), row.total)
            })
    
    # Sắp xếp theo thứ tự shot
    shots.sort(key=lambda x: x["shot"])

    # 7. Lọc các danh sách khác chỉ lấy những mục có dữ liệu (total > 0)
    machines = [m for m in machines if m["total"] > 0]
    jobs = [j for j in jobs if j["total"] > 0]
    arrays = [a for a in arrays if a["total"] > 0]

    return {
        "overall": overall,
        "machines": machines,
        "jobs": jobs,
        "shots": shots,
        "arrays": arrays
    }
