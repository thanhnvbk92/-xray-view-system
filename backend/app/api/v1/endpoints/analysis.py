from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy import func, case, and_, or_, text, distinct, exists
from sqlalchemy.orm import Session

from ....database import get_db, PCB, PCBImage, Machine, Line, User
from ....core.security import get_current_user
from ....core.cache import global_stats_cache

router = APIRouter()

@router.get("/summary")
def get_analysis_summary(
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
    
    # 1. Caching logic
    cache_key = f"analysis_summary_{machine_id}_{job_file}_{array_index}_{shot_idx}_{target_date}_{start_date}_{end_date}"
    cached_data = global_stats_cache.get(cache_key)
    if cached_data:
        return cached_data

    # Phân tách bộ lọc: base_filters (không có machine_id) và full_filters (có machine_id)
    base_filters = []
    
    if job_file:
        base_filters.append(PCB.job_file == job_file)
    if array_index:
        base_filters.append(PCB.array_index == array_index)
    if shot_idx:
        # Lọc các PCB có ít nhất một ảnh tương ứng với shot_idx này
        shot_subquery = db.query(PCBImage.pcb_id).filter(
            PCBImage.shot_num == shot_idx
        ).subquery()
        base_filters.append(PCB.id.in_(shot_subquery))
    
    if target_date:
        d = datetime.strptime(target_date, "%Y-%m-%d")
        base_filters.append(and_(PCB.client_time >= d, PCB.client_time < d + timedelta(days=1)))
    elif start_date and end_date:
        sd = datetime.strptime(start_date, "%Y-%m-%d")
        ed = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        base_filters.append(and_(PCB.client_time >= sd, PCB.client_time < ed))
    else:
        # Mặc định 7 ngày gần nhất
        sd = datetime.now() - timedelta(days=7)
        base_filters.append(PCB.client_time >= sd)

    # full_filters bao gồm cả machine_id
    full_filters = list(base_filters)
    if machine_id:
        full_filters.append(PCB.machine_id == machine_id)

    def get_rate(count, total):
        return round((count / total * 100), 1) if total > 0 else 0

    # 1. --- XỬ LÝ SONG SONG ---
    from concurrent.futures import ThreadPoolExecutor
    from ....database import SessionLocal

    # Tối ưu hóa: Tìm dải ID của PCB trong khoảng thời gian để hỗ trợ query PCBImage nhanh hơn
    id_range = db.query(func.min(PCB.id), func.max(PCB.id)).filter(*full_filters).first()
    min_id, max_id = id_range

    def run_query(func, *args, **kwargs):
        with SessionLocal() as session:
            return func(session, *args, **kwargs)

    # --- TỐI ƯU HÓA: Sử dụng DailyStat cho các truy vấn tổng quát ---
    use_summary_table = not (array_index or shot_idx)
    from ....database import DailyStat

    # Các hàm truy vấn thành phần - LUÔN SỬ DỤNG DỮ LIỆU GỐC TỪ MÁY (machine_result)
    def fetch_overall(s):
        # Truy vấn trực tiếp từ bảng PCB để lấy dữ liệu machine_result gốc
        return s.query(
            func.count(PCB.id).label('total'),
            func.sum(case((PCB.machine_result == 'OK', 1), else_=0)).label('ok'),
            func.sum(case((PCB.machine_result == 'NG', 1), else_=0)).label('ng'),
            func.sum(case((PCB.ai_result == 'OK', 1), else_=0)).label('ai_ok'),
            func.sum(case((PCB.user_result == 'OK', 1), else_=0)).label('user_ok')
        ).filter(*full_filters).first()

    def fetch_pcb_machine(s):
        return s.query(
            PCB.machine_id,
            func.count(PCB.id).label('total'),
            func.sum(case((PCB.machine_result == 'NG', 1), else_=0)).label('ng')
        ).filter(*base_filters).group_by(PCB.machine_id).all()

    def fetch_trends(s):
        return s.query(
            func.date(PCB.client_time).label('date'),
            func.count(PCB.id).label('total'),
            func.sum(case((PCB.machine_result == 'NG', 1), else_=0)).label('ng'),
            func.sum(case((PCB.machine_result == 'OK', 1), else_=0)).label('ok'),
            func.sum(case((PCB.ai_result == 'OK', 1), else_=0)).label('ai_ok'),
            func.sum(case((PCB.user_result == 'OK', 1), else_=0)).label('user_ok')
        ).filter(*full_filters).group_by(func.date(PCB.client_time)).order_by(func.date(PCB.client_time)).all()

    def fetch_jobs(s):
        return s.query(
            PCB.job_file,
            func.count(PCB.id).label('total'),
            func.sum(case((PCB.machine_result == 'NG', 1), else_=0)).label('ng')
        ).filter(*full_filters).group_by(PCB.job_file).all()

    def fetch_arrays(s):
        return s.query(
            PCB.array_index,
            func.count(PCB.id).label('total'),
            func.sum(case((PCB.machine_result == 'NG', 1), else_=0)).label('ng')
        ).filter(*full_filters).group_by(PCB.array_index).all()

    def fetch_shots(s):
        if not min_id or not max_id: return []
        
        # 1. Lấy tổng số PCB thực tế từ bộ lọc hiện tại để làm mốc Total đồng nhất
        overall_total = s.query(func.count(PCB.id)).filter(*full_filters).scalar() or 0
        if overall_total == 0: return []

        # 2. Truy vấn số lượng NG cho từng Shot từ bảng PCBImage
        # Chỉ đếm những PCB nằm trong bộ lọc hiện tại
        pcb_id_subquery = s.query(PCB.id).filter(*full_filters).subquery()
        
        ng_data = s.query(
            PCBImage.shot_num.label('shot'),
            func.count(PCBImage.id).label('ng_images') # Đếm số lượng ảnh bị NG (không cần bản mạch duy nhất)
        ).filter(
            PCBImage.pcb_id >= min_id,
            PCBImage.pcb_id <= max_id,
            PCBImage.machine_result == 'NG',
            PCBImage.pcb_id.in_(pcb_id_subquery)
        ).group_by(PCBImage.shot_num).all()

        ng_map = {r.shot: r.ng_images for r in ng_data}
        
        # 3. Tạo kết quả với Total luôn khớp với Overall
        # Tìm max_shot thực tế
        max_shot_in_db = s.query(func.max(PCBImage.shot_num)).filter(
            PCBImage.pcb_id >= min_id, 
            PCBImage.pcb_id <= max_id
        ).scalar() or 0
        max_shot = min(max_shot_in_db, 500)
        
        results = []
        for i in range(1, max_shot + 1):
            ng_count = int(ng_map.get(i, 0))
            results.append({
                "shot": i,
                "displayLabel": f"Shot {i}",
                "total": overall_total, # Luôn khớp với số lượng ở các đồ thị khác
                "ng": ng_count,
                "ng_rate": round((ng_count / overall_total * 100), 2) if overall_total > 0 else 0
            })
        
        return results

    # Chạy đồng thời
    with ThreadPoolExecutor(max_workers=6) as executor:
        f_overall = executor.submit(run_query, fetch_overall)
        f_machines = executor.submit(run_query, fetch_pcb_machine)
        f_trends = executor.submit(run_query, fetch_trends)
        f_jobs = executor.submit(run_query, fetch_jobs)
        f_arrays = executor.submit(run_query, fetch_arrays)
        f_shots = executor.submit(run_query, fetch_shots)

        overall_stats = f_overall.result()
        pcb_machine_stats = f_machines.result()
        trend_stats = f_trends.result()
        job_stats = f_jobs.result()
        array_stats = f_arrays.result()
        shot_stats = f_shots.result()

    # 2. --- XỬ LÝ KẾT QUẢ ---
    overall = {"total": 0, "ok": 0, "ng": 0, "ai_ok": 0, "user_ok": 0, "ok_rate": 0, "ng_rate": 0, "ai_ok_rate": 0, "user_ok_rate": 0}
    if overall_stats:
        total = overall_stats.total or 0
        ok = int(overall_stats.ok or 0); ng = int(overall_stats.ng or 0)
        overall = {
            "total": total, "ok": ok, "ng": ng,
            "ai_ok": int(overall_stats.ai_ok or 0), "user_ok": int(overall_stats.user_ok or 0),
            "ok_rate": get_rate(ok, total), "ng_rate": get_rate(ng, total),
            "ai_ok_rate": get_rate(int(overall_stats.ai_ok or 0), total),
            "user_ok_rate": get_rate(int(overall_stats.user_ok or 0), total)
        }

    # Machines
    all_machines = db.query(Machine.id, Machine.name, Line.name.label('line_name'))\
        .join(Line, Machine.line_id == Line.id).order_by(Line.name, Machine.name).all()
    stats_map = {row.machine_id: row for row in pcb_machine_stats}
    machines = [{
        "id": m.id, "display_name": f"{m.line_name} - {m.name}",
        "total": stats_map.get(m.id).total if stats_map.get(m.id) else 0,
        "ng": int(stats_map.get(m.id).ng or 0) if stats_map.get(m.id) else 0,
        "ng_rate": get_rate(int(stats_map.get(m.id).ng or 0), stats_map.get(m.id).total) if stats_map.get(m.id) else 0
    } for m in all_machines]

    # Trends
    trends = []
    for r in trend_stats:
        trends.append({
            "date": str(r.date), "total": r.total, 
            "ok": int(r.ok or 0), "ng": int(r.ng or 0),
            "ai_ok": int(r.ai_ok or 0), "user_ok": int(r.user_ok or 0),
            "ng_rate": get_rate(int(r.ng or 0), r.total)
        })

    jobs_data = [{
        "job": r.job_file, "total": r.total, "ng": int(r.ng or 0), "ng_rate": get_rate(int(r.ng or 0), r.total)
    } for r in job_stats if r.job_file]
    jobs_data.sort(key=lambda x: x["ng_rate"], reverse=True)
    jobs = jobs_data[:10] if len(jobs_data) > 10 else jobs_data

    arrays = [{
        "array_index": r.array_index, "displayLabel": f"Array Index {r.array_index}",
        "total": r.total, "ng": int(r.ng or 0), "ng_rate": get_rate(int(r.ng or 0), r.total)
    } for r in array_stats]

    # Shots - Sử dụng trực tiếp kết quả từ fetch_shots (đã xử lý Gap Filling)
    shots = shot_stats
    shots.sort(key=lambda x: x["shot"])

    result = {
        "overall": overall, "machines": machines, "jobs": jobs,
        "shots": shots, "arrays": arrays, "trends": trends
    }
    
    global_stats_cache.set(cache_key, result)
    return result
