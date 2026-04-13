from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, case, and_
from sqlalchemy.orm import Session

from ....database import get_db, PCB, PCBImage, Machine, Line, User
from .... import database
from ....core.security import get_current_user
from ....core.cache import global_stats_cache

router = APIRouter()

@router.get("/summary")
async def get_dashboard_summary(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Trả về danh sách máy kèm số lượng PCB NG chưa được confirm"""
    cache_key = "dashboard_summary"
    cached = global_stats_cache.get(cache_key)
    if cached: return cached

    machine_counts = db.query(
        Machine,
        func.count(PCB.id).label('unconfirmed_ng_count')
    ).outerjoin(
        PCB, 
        and_(
            PCB.machine_id == Machine.id,
            PCB.final_result == "NG",
            PCB.user_confirmed == False
        )
    ).group_by(Machine.id).all()
    
    summary = []
    for m, count in machine_counts:
        summary.append({
            "id": m.id,
            "name": m.name,
            "line_name": m.line.name if m.line else "Unknown",
            "display_name": f"{m.line.name if m.line else 'Unknown'} - {m.name}",
            "ip_address": m.ip_address,
            "status": m.status,
            "unconfirmed_ng_count": count,
            "has_ng": count > 0
        })
    global_stats_cache.set(cache_key, summary)
    return summary

@router.get("/stats")
async def get_overall_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Thống kê tổng hợp trong 24 giờ qua"""
    cache_key = "dashboard_stats"
    cached = global_stats_cache.get(cache_key)
    if cached: return cached

    start_time = datetime.now() - timedelta(hours=24)
    stats = db.query(
        func.count(PCB.id).label('total'),
        func.sum(case((PCB.final_result == 'OK', 1), else_=0)).label('ok'),
        func.sum(case((PCB.final_result == 'NG', 1), else_=0)).label('ng'),
        func.sum(case((PCB.ai_result == 'OK', 1), else_=0)).label('ai_ok'),
        func.sum(case((PCB.user_result == 'OK', 1), else_=0)).label('user_ok')
    ).filter(PCB.client_time >= start_time).first()
    
    total = stats.total or 0
    ok = int(stats.ok or 0)
    ng = int(stats.ng or 0)
    ai_ok = int(stats.ai_ok or 0)
    user_ok = int(stats.user_ok or 0)
    
    def get_rate(count, total):
        return round((count / total * 100), 1) if total > 0 else 0

    result = {
        "total": total, "ok": ok, "ok_rate": get_rate(ok, total),
        "ng": ng, "ng_rate": get_rate(ng, total),
        "ai_ok": ai_ok, "ai_ok_rate": get_rate(ai_ok, total),
        "user_ok": user_ok, "user_ok_rate": get_rate(user_ok, total)
    }
    global_stats_cache.set(cache_key, result)
    return result

@router.get("/trends")
async def get_trends(
    machine_id: Optional[int] = None,
    job_file: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cache_key = f"trends_{machine_id}_{job_file}_{start_date}_{end_date}"
    cached = global_stats_cache.get(cache_key)
    if cached: return cached

    # Logic xử lý ngày tương tự main.py nhưng đã được nén gọn
    if start_date and end_date:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    else:
        end_dt = datetime.now()
        start_dt = (end_dt - timedelta(days=6)).replace(hour=0, minute=0, second=0)

    query = db.query(
        func.date(PCB.client_time).label('day'),
        func.count(PCB.id).label('total'),
        func.sum(case((PCB.final_result == 'NG', 1), else_=0)).label('ng'),
        func.sum(case((PCB.final_result == 'OK', 1), else_=0)).label('ok'),
        func.sum(case((PCB.ai_result == 'OK', 1), else_=0)).label('ai_ok'),
        func.sum(case((PCB.user_result == 'OK', 1), else_=0)).label('user_ok')
    ).filter(PCB.client_time >= start_dt, PCB.client_time <= end_dt)

    if machine_id: query = query.filter(PCB.machine_id == machine_id)
    if job_file: query = query.filter(PCB.job_file == job_file)

    results = query.group_by(func.date(PCB.client_time)).all()
    
    # 3. Logic Zero-filling: Đảm bảo luôn có dữ liệu cho 7 ngày gần nhất
    current_trends = {str(r[0]): {
        "total": r[1], 
        "ok": int(r[3] or 0), 
        "ng": int(r[2] or 0),
        "ai_ok": int(r[4] or 0),
        "user_ok": int(r[5] or 0)
    } for r in results}
    trends = []
    
    # Iterate từ start_dt đến end_dt (7 ngày)
    for i in range(7):
        d = (start_dt + timedelta(days=i)).date()
        d_str = str(d)
        
        if d_str in current_trends:
            data = current_trends[d_str]
            total = data["total"]
            trends.append({
                "date": d_str,
                "total": total,
                "ok": data["ok"],
                "ng": data["ng"],
                "ai_ok": data["ai_ok"],
                "user_ok": data["user_ok"],
                "ng_rate": round((data["ng"] / total * 100), 1) if total > 0 else 0
            })
        else:
            trends.append({
                "date": d_str,
                "total": 0,
                "ok": 0,
                "ng": 0,
                "ai_ok": 0,
                "user_ok": 0,
                "ng_rate": 0
            })
    
    global_stats_cache.set(cache_key, trends)
    return trends
