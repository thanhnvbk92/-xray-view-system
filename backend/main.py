import os
from typing import List, Optional
import shutil
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect, BackgroundTasks
from PIL import Image
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import json
import asyncio
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from jose import jwt, JWTError

from . import config
from . import database
from . import schemas
from .database import get_db, Line, Machine, PCB, User, PCBImage

# --- AUTH CONFIGURATION ---
SECRET_KEY = "antigravity_xray_secret_key" # Trong thực tế nên dùng env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480 # 8 tiếng làm việc

# Sử dụng pbkdf2_sha256 để tương thích tốt nhất với Python 3.13 và không bị giới hạn 72 bytes như bcrypt
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

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
    return user

def get_latest_version_info():
    version_file = os.path.join(config.DOWNLOAD_DIR, "version.json")
    if os.path.exists(version_file):
        try:
            with open(version_file, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"version": "1.0.0"} # Fallback

# Background task: Tự chuyển máy sang OFFLINE nếu quá 90s chưa nhận heartbeat
async def check_offline_machines():
    while True:
        await asyncio.sleep(30)
        try:
            db = next(database.get_db())
            timeout = datetime.utcnow() - timedelta(seconds=90)
            stale = db.query(Machine).filter(
                Machine.status == "ONLINE",
                Machine.last_heartbeat < timeout
            ).all()
            for m in stale:
                m.status = "OFFLINE"
                await manager.broadcast(json.dumps({"type": "MACHINE_STATUS", "machine_id": m.id, "status": "OFFLINE"}))
            if stale:
                db.commit()
            db.close()
        except Exception:
            pass

from . import image_processor

# Hàng đợi xử lý ảnh tập trung
image_queue = asyncio.Queue()

# Worker chuyên trách xử lý ảnh từ hàng đợi (Tuần tự, chống quá tải)
async def image_worker():
    print("Image Worker: Started and waiting for tasks...")
    while True:
        try:
            image_id = await image_queue.get()
            # print(f"Image Worker: Processing image ID {image_id}...")
            await asyncio.to_thread(image_processor.process_compressed_image, image_id)
            image_queue.task_done()
        except Exception as e:
            print(f"Worker Error: {e}")
        await asyncio.sleep(0.1) # Tránh chiếm dụng CPU 100%

# Background task: Quét định kỳ để tránh bỏ sót (Cleanup task)
async def scan_unprocessed_images():
    while True:
        try:
            db = next(database.get_db())
            pending = db.query(database.PCBImage).filter(database.PCBImage.is_processed == False).limit(50).all()
            if pending:
                # print(f"Cleanup Task: Found {len(pending)} pending images. Adding to queue...")
                for img in pending:
                    # Chúng ta không lo việc trùng lặp trong queue vì worker sẽ check is_processed
                    await image_queue.put(img.id)
            db.close()
        except Exception as e:
            print(f"Cleanup Task Error: {e}")
        
        await asyncio.sleep(300) # Quét mỗi 5 phút

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi tạo database (tạo bảng nếu chưa có)
    database.init_db()
    asyncio.create_task(check_offline_machines())
    asyncio.create_task(image_worker())
    asyncio.create_task(scan_unprocessed_images())
    yield

app = FastAPI(title="Xray View System API", lifespan=lifespan)

# Cấu hình CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount các thư mục chứa ảnh để có thể truy cập từ Web Browser
app.mount("/images", StaticFiles(directory=config.UPLOAD_DIR), name="images")

# Mount thư mục lưu trữ (ổ mạng hoặc local storage)
if os.path.exists(config.STORAGE_DIR):
    app.mount("/storage", StaticFiles(directory=config.STORAGE_DIR), name="storage")
else:
    # Nếu là ổ mạng chưa connect, ta vẫn mount để tránh lỗi startup, 
    # nhưng có thể sẽ bị 404 khi truy cập nếu terminal không có quyền.
    print(f"WARNING: STORAGE_DIR not found/accessible: {config.STORAGE_DIR}")
    # Có thể dùng một thư mục trống làm placeholder
    app.mount("/storage", StaticFiles(directory=config.DATA_ROOT), name="storage")

# Quản lý WebSockets (Sẽ chuyển logic serve frontend xuống cuối file)

# Quản lý WebSockets
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

# --- ENDPOINTS QUẢN LÝ ---

# 1. Quản lý Line
@app.get("/api/lines", response_model=List[schemas.LineResponse])
def get_lines(db: Session = Depends(get_db)):
    return db.query(Line).all()

@app.post("/api/lines", response_model=schemas.LineResponse)
def create_line(line: schemas.LineCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_line = Line(**line.dict())
    db.add(db_line)
    db.commit()
    db.refresh(db_line)
    return db_line

@app.delete("/api/lines/{line_id}")
def delete_line(line_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    line = db.query(Line).filter(Line.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    db.delete(line)
    db.commit()
    return {"status": "success"}

# 2. Quản lý Machine
@app.get("/api/machines", response_model=List[schemas.MachineResponse])
def get_machines(db: Session = Depends(get_db)):
    return db.query(Machine).all()

@app.post("/api/machines", response_model=schemas.MachineResponse)
def create_machine(machine: schemas.MachineCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 1. Kiểm tra IP duy nhất toàn hệ thống
    existing_ip = db.query(Machine).filter(Machine.ip_address == machine.ip_address).first()
    if existing_ip:
        raise HTTPException(
            status_code=400,
            detail=f"Lỗi: IP {machine.ip_address} đã được gán cho máy '{existing_ip.name}'"
        )
    
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

@app.put("/api/machines/{machine_id}", response_model=schemas.MachineResponse)
def update_machine(machine_id: int, machine_data: schemas.MachineUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not db_machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    for key, value in machine_data.dict(exclude_unset=True).items():
        setattr(db_machine, key, value)
    
    db.commit()
    db.refresh(db_machine)
    return db_machine

@app.delete("/api/machines/{machine_id}")
def delete_machine(machine_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    db.delete(machine)
    db.commit()
    return {"status": "success"}

# --- ENDPOINTS VẬN HÀNH ---

@app.post("/heartbeat")
async def heartbeat(request: schemas.HeartbeatRequest, db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == request.machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    machine.last_heartbeat = datetime.utcnow()
    machine.status = "ONLINE"
    db.commit()
    
    # Thông báo cho Dashboard
    await manager.broadcast(json.dumps({
        "type": "MACHINE_STATUS",
        "machine_id": machine.id,
        "status": "ONLINE"
    }))
    
    return {"status": "ok"}

@app.post("/offline")
async def offline(request: schemas.HeartbeatRequest, db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == request.machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    machine.status = "OFFLINE"
    db.commit()
    await manager.broadcast(json.dumps({"type": "MACHINE_STATUS", "machine_id": machine.id, "status": "OFFLINE"}))
    return {"status": "ok"}

def get_recent_scans(db: Session = Depends(get_db)):
    return db.query(PCB).order_by(PCB.test_time.desc()).limit(20).all()

@app.post("/upload-scan")
async def upload_scan(
    pid: str = Form(...),
    machine_id: int = Form(...),
    machine_result: str = Form(...),
    client_time: str = Form(...),
    job_file: Optional[str] = Form(None),
    image_results: Optional[str] = Form(None), # Chuỗi phân cách bởi dấu phẩy: OK,NG,NG
    files: Optional[List[UploadFile]] = File(None),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    # 0. Kiểm tra trùng lặp (Chống việc client gửi 2 lần cùng 1 log)
    try:
        c_time_dt = datetime.fromisoformat(client_time)
        existing_pcb = db.query(PCB).filter(PCB.pid == pid, PCB.client_time == c_time_dt).first()
        if existing_pcb:
            # print(f"DEBUG: Duplicate scan detected for PID {pid} at {client_time}. Ignored.")
            return {"status": "success", "message": "Duplicate ignored", "pcb_id": existing_pcb.id}
    except Exception as e:
        # print(f"DEBUG: Error checking duplicate: {e}")
        pass
        
    # 1. Parse kết quả từng ảnh
    img_result_list = image_results.split(",") if image_results else []
    
    # 2. Lấy thông tin Line/Machine để đặt tên file
    machine_info = db.query(database.Machine).filter(database.Machine.id == machine_id).first()
    line_name = "UnknownLine"
    m_name = f"M{machine_id}"
    
    if machine_info:
        m_name = machine_info.name
        if machine_info.line:
            line_name = machine_info.line.name

    # 3. Lưu các file ảnh
    saved_paths = []
    main_image_path = None

    if files and len(files) > 0:
        for i, file in enumerate(files):
            # Format: {Line}_{Machine}_{PID}_{OriginalFilename}
            # Làm sạch tên file gốc (tránh ký tự đặc biệt)
            safe_original_name = os.path.basename(file.filename).replace(" ", "_")
            file_name = f"{line_name}_{m_name}_{pid}_{safe_original_name}"
            
            file_path = os.path.join(config.UPLOAD_DIR, file_name)
            
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            saved_paths.append(file_path)
            if i == 0: main_image_path = file_path

    # 3. Giả lập AI processing tổng thể
    overall_ai_score = 0.95 if machine_result == "OK" else 0.45 
    overall_ai_result = "OK" if overall_ai_score > 0.8 else "NG"
    
    # 4. Lưu PCB vào Database
    new_pcb = PCB(
        pid=pid,
        machine_id=machine_id,
        machine_result=machine_result,
        ai_result=overall_ai_result,
        user_result="PENDING",
        final_result=machine_result,
        job_file=job_file,
        client_time=datetime.fromisoformat(client_time),
        image_path=main_image_path,
        ai_score=overall_ai_score,
        user_confirmed=False
    )
    db.add(new_pcb)
    db.commit()
    db.refresh(new_pcb)

    # 5. Lưu danh sách ảnh vào bảng pcb_images (Ghi nhận TOÀN BỘ file upload)
    for i, img_path in enumerate(saved_paths):
        # Khớp kết quả máy cho unit tương ứng, nếu dư ảnh thì dùng kết quả tổng quát
        m_res = img_result_list[i] if i < len(img_result_list) else machine_result
        a_res = "OK" if m_res == "OK" else "NG"
        
        new_img = database.PCBImage(
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
        
        # Đưa vào hàng đợi xử lý ngay lập tức
        await image_queue.put(new_img.id)
    
    # 6. Broadcast qua WebSocket
    main_img_url = new_pcb.image_path # Could be /storage/... or /images/...
    if not main_img_url: 
        main_img_url = ""
    elif not main_img_url.startswith("/"):
        main_img_url = f"/images/{os.path.basename(main_img_url)}"

    await manager.broadcast(json.dumps({
        "type": "NEW_SCAN",
        "data": {
            "id": new_pcb.id,
            "pid": new_pcb.pid,
            "machine_result": new_pcb.machine_result,
            "job_file": new_pcb.job_file,
            "image_url": main_img_url
        }
    }))
    
    return {"status": "success", "pcb_id": new_pcb.id}

@app.get("/api/dashboard/summary")
async def get_dashboard_summary(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Trả về danh sách máy kèm số lượng PCB NG chưa được confirm"""
    machines = db.query(database.Machine).all()
    summary = []
    
    for m in machines:
        # Đếm số PCB có kết quả NG và user_confirmed là False
        unconfirmed_ng_count = db.query(PCB).filter(
            PCB.machine_id == m.id,
            PCB.final_result == "NG",
            PCB.user_confirmed == False
        ).count()
        
        summary.append({
            "id": m.id,
            "name": m.name,
            "line_name": m.line.name if m.line else "Unknown",
            "display_name": f"{m.line.name if m.line else 'Unknown'} - {m.name}",
            "ip_address": m.ip_address,
            "status": m.status,
            "unconfirmed_ng_count": unconfirmed_ng_count,
            "has_ng": unconfirmed_ng_count > 0
        })
    
    return summary

@app.get("/api/pcbs/unconfirmed/{machine_id}")
async def get_unconfirmed_pcbs(machine_id: int, db: Session = Depends(get_db)):
    """Lấy danh sách các PCB NG chưa duyệt của 1 máy"""
    pcbs = db.query(PCB).filter(
        PCB.machine_id == machine_id,
        PCB.final_result == "NG",
        PCB.user_confirmed == False
    ).order_by(PCB.client_time.desc()).all()
    
    return pcbs

@app.get("/api/dashboard/stats")
async def get_overall_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Trả về thống kê tổng hợp trong 24 giờ qua"""
    from datetime import timedelta
    start_time = datetime.now() - timedelta(hours=24)
    
    total_pcbs = db.query(PCB).filter(PCB.system_time >= start_time).count()
    ok_pcbs = db.query(PCB).filter(PCB.system_time >= start_time, PCB.final_result == "OK").count()
    ng_pcbs = db.query(PCB).filter(PCB.system_time >= start_time, PCB.final_result == "NG").count()
    
    # Thống kê chi tiết
    ai_ok = db.query(PCB).filter(PCB.system_time >= start_time, PCB.ai_result == "OK").count()
    user_ok = db.query(PCB).filter(PCB.system_time >= start_time, PCB.user_result == "OK").count()
    
    # Tính tỉ lệ %
    def get_rate(count, total):
        return round((count / total * 100), 1) if total > 0 else 0

    return {
        "total": total_pcbs,
        "ok": ok_pcbs,
        "ok_rate": get_rate(ok_pcbs, total_pcbs),
        "ng": ng_pcbs,
        "ng_rate": get_rate(ng_pcbs, total_pcbs),
        "ai_ok": ai_ok,
        "ai_ok_rate": get_rate(ai_ok, total_pcbs),
        "user_ok": user_ok,
        "user_ok_rate": get_rate(user_ok, total_pcbs)
    }

@app.get("/api/dashboard/trends")
async def get_trends(
    machine_id: Optional[int] = None,
    job_file: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Trả về dữ liệu xu hướng 7 ngày gần nhất, hỗ trợ lọc"""
    from datetime import timedelta
    
    trends = []
    end_date = datetime.now().date()
    
    for i in range(6, -1, -1):
        day = end_date - timedelta(days=i)
        start = datetime.combine(day, datetime.min.time())
        end = datetime.combine(day, datetime.max.time())
        
        query = db.query(PCB).filter(PCB.system_time >= start, PCB.system_time <= end)
        if machine_id:
            query = query.filter(PCB.machine_id == machine_id)
        if job_file:
            query = query.filter(PCB.job_file == job_file)
            
        ok = query.filter(PCB.final_result == "OK").count()
        ng = query.filter(PCB.final_result == "NG").count()
        ai_ok = query.filter(PCB.ai_result == "OK").count()
        user_ok = query.filter(PCB.user_result == "OK").count()
        
        total = ok + ng
        ng_rate = (ng / total * 100) if total > 0 else 0
        
        trends.append({
            "date": day.strftime("%m/%d"),
            "ok": ok,
            "ng": ng,
            "ai_ok": ai_ok,
            "user_ok": user_ok,
            "ng_rate": round(ng_rate, 2)
        })
    
    return trends

@app.get("/api/analysis/summary")
async def get_analysis_summary(
    machine_id: Optional[int] = None,
    job_file: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Thống kê chuyên sâu hỗ trợ bộ lọc (Fixed version)"""
    from sqlalchemy import func, case
    from datetime import timedelta
    
    try:
        start_date = datetime.now() - timedelta(days=7)
        
        # 1. Tỉ lệ lỗi theo Máy
        ng_case = case((database.PCB.final_result == 'NG', 1), else_=0)
        machine_stats = db.query(
            database.Machine.id,
            database.Machine.name,
            func.count(database.PCB.id).label('total'),
            func.sum(ng_case).label('ng_count')
        ).join(database.PCB, database.Machine.id == database.PCB.machine_id)\
         .filter(database.PCB.system_time >= start_date)
        
        if job_file:
            machine_stats = machine_stats.filter(database.PCB.job_file == job_file)
        
        machine_results = machine_stats.group_by(database.Machine.id, database.Machine.name).all()
        
        machine_data = [
            {
                "id": r[0],
                "name": r[1],
                "display_name": f"{db.query(database.Line).join(database.Machine).filter(database.Machine.id == r[0]).first().name} - {r[1]}",
                "total": r[2],
                "ng": int(r[3]) if r[3] else 0,
                "ng_rate": round((int(r[3])/r[2]*100), 2) if r[2] > 0 else 0
            } for r in machine_results
        ]

        # 2. Tỉ lệ lỗi theo Job File
        job_stats_q = db.query(
            database.PCB.job_file,
            func.count(database.PCB.id).label('total'),
            func.sum(ng_case).label('ng_count')
        ).filter(database.PCB.system_time >= start_date, database.PCB.job_file != None)
        
        if machine_id:
            job_stats_q = job_stats_q.filter(database.PCB.machine_id == machine_id)
            
        job_results = job_stats_q.group_by(database.PCB.job_file).order_by(func.count(database.PCB.id).desc()).limit(15).all()
        
        job_data = [
            {
                "job": r[0],
                "total": r[1],
                "ng": int(r[2]) if r[2] else 0,
                "ng_rate": round((int(r[2])/r[1]*100), 2) if r[1] > 0 else 0
            } for r in job_results
        ]

        # 3. Tỉ lệ lỗi theo Unit
        pcb_ids_query = db.query(database.PCB.id).filter(database.PCB.system_time >= start_date)
        if machine_id: pcb_ids_query = pcb_ids_query.filter(database.PCB.machine_id == machine_id)
        if job_file: pcb_ids_query = pcb_ids_query.filter(database.PCB.job_file == job_file)
        
        pcb_ids = [r[0] for r in pcb_ids_query.all()]
        
        unit_data = []
        if pcb_ids:
            all_images = db.query(database.PCBImage).filter(database.PCBImage.pcb_id.in_(pcb_ids)).all()
            unit_groups = {}
            for img in all_images:
                try:
                    fname = os.path.basename(img.image_path)
                    unit_token = fname.split('_')[-1].split('.')[0]
                    unit_idx = "".join(filter(str.isdigit, unit_token))
                    if not unit_idx: unit_idx = unit_token
                except:
                    unit_idx = "?"
                
                if unit_idx not in unit_groups:
                    unit_groups[unit_idx] = {"total": 0, "ng": 0}
                unit_groups[unit_idx]["total"] += 1
                if img.machine_result == 'NG': unit_groups[unit_idx]["ng"] += 1
            
            sorted_keys = sorted(unit_groups.keys(), key=lambda x: int(x) if x.isdigit() else 999)
            for k in sorted_keys:
                v = unit_groups[k]
                unit_data.append({
                    "unit": f"Unit {k}",
                    "total": v["total"],
                    "ng": v["ng"],
                    "ng_rate": round((v["ng"]/v["total"]*100), 2) if v["total"] > 0 else 0
                })

        return {
            "machines": machine_data,
            "jobs": job_data,
            "units": unit_data
        }
    except Exception as e:
        print(f"Analysis API Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "machines": machine_data,
        "jobs": job_data,
        "units": unit_data
    }
# --- AUTH ENDPOINTS ---
@app.post("/api/auth/register", response_model=schemas.UserResponse)
async def register_user(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    # Check if username exists
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="Tài khoản đã tồn tại")
    
    # Check if this is the first user, if so make them Admin and approved
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

@app.post("/api/auth/login", response_model=schemas.Token)
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
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name
    }

@app.get("/api/auth/me", response_model=schemas.UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# --- ADMIN ENDPOINTS ---
@app.get("/api/admin/users", response_model=List[schemas.UserResponse])
async def list_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Admin")
    return db.query(User).all()

@app.post("/api/admin/users/{user_id}/approve")
async def approve_user(user_id: int, role: str = "OPERATOR", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Admin")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Kiểm tra role hợp lệ (ADMIN/OPERATOR/VIEWER)
    if role not in ["ADMIN", "OPERATOR", "VIEWER"]:
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ")

    user.is_approved = True
    user.role = role
    db.commit()
    return {"status": "success", "user": user.username, "role": user.role}

@app.post("/api/admin/users/{user_id}/reject")
async def reject_user(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Admin")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"status": "success"}

# --- UPDATED BUSINESS LOGIC WITH AUTH ---
@app.post("/api/pcbs/confirm/{pcb_id}")
async def confirm_pcb(
    pcb_id: int, 
    user_result: str = Form(...), 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Xác nhận kết quả cuối cùng cho PCB và ghi nhận người thực thực hiện"""
    pcb = db.query(PCB).filter(PCB.id == pcb_id).first()
    if not pcb:
        raise HTTPException(status_code=404, detail="PCB not found")
        
    pcb.user_confirmed = True
    pcb.user_result = user_result
    pcb.final_result = user_result
    pcb.confirmed_by_id = current_user.id
    pcb.confirmed_at = datetime.utcnow()
    
    if user_result == "OK":
        db.query(database.PCBImage).filter(database.PCBImage.pcb_id == pcb_id).update({
            "machine_result": "OK",
            "confirmed_by_id": current_user.id
        })
    
    db.commit()
    return {"status": "success", "pcb_id": pcb_id, "final_result": user_result}

@app.get("/api/pcbs/{pcb_id}/images", response_model=List[schemas.PCBImageResponse])
async def get_pcb_images(pcb_id: int, db: Session = Depends(get_db)):
    """Lấy danh sách tất cả ảnh thuộc về 1 PCB"""
    images = db.query(database.PCBImage).filter(database.PCBImage.pcb_id == pcb_id).all()
    return images

@app.post("/api/images/confirm/{image_id}")
async def confirm_image(
    image_id: int,
    user_result: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Xác nhận kết quả cho một ảnh riêng lẻ và ảnh gốc đi kèm"""
    img = db.query(database.PCBImage).filter(database.PCBImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # 1. Cập nhật ảnh hiện tại
    img.machine_result = user_result
    img.confirmed_by_id = current_user.id
    
    # 2. Tìm và cập nhật ảnh gốc tương ứng (_o.jpg)
    base_path = img.image_path.rsplit('.', 1)[0]
    ext = img.image_path.rsplit('.', 1)[1]
    original_path = f"{base_path}_o.{ext}"
    
    orig_img = db.query(database.PCBImage).filter(
        database.PCBImage.pcb_id == img.pcb_id,
        database.PCBImage.image_path == original_path
    ).first()
    
    if orig_img:
        orig_img.machine_result = user_result
        orig_img.confirmed_by_id = current_user.id

    # 3. Kiểm tra nếu tất cả ảnh của PCB này đã là OK
    # thì tự động confirm PCB này là OK
    all_images = db.query(database.PCBImage).filter(database.PCBImage.pcb_id == img.pcb_id).all()
    if all(i.machine_result == "OK" for i in all_images):
        pcb = db.query(PCB).filter(PCB.id == img.pcb_id).first()
        if pcb:
            pcb.user_confirmed = True
            pcb.user_result = "OK"
            pcb.final_result = "OK"
            pcb.confirmed_by_id = current_user.id
            pcb.confirmed_at = datetime.utcnow()
            
    db.commit()
    return {"status": "success", "image_id": image_id, "user_result": user_result}

@app.get("/api/trace/search")
async def search_trace(
    pid: Optional[str] = None,
    machine_id: Optional[int] = None,
    result: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Tìm kiếm PCB theo nhiều điều kiện để truy vết"""
    query = db.query(PCB).join(database.Machine).join(database.Line).outerjoin(User, PCB.confirmed_by_id == User.id)
    
    if pid:
        query = query.filter(PCB.pid.like(f"%{pid}%"))
    if machine_id:
        query = query.filter(PCB.machine_id == machine_id)
    if result:
        query = query.filter(PCB.final_result == result)
    if start_date:
        query = query.filter(PCB.client_time >= start_date)
    if end_date:
        query = query.filter(PCB.client_time <= end_date)
        
    pcbs = query.order_by(PCB.client_time.desc()).limit(200).all()
    
    results = []
    for pcb in pcbs:
        results.append({
            "id": pcb.id,
            "pid": pcb.pid,
            "machine_name": pcb.machine.name,
            "line_name": pcb.machine.line.name,
            "display_name": f"{pcb.machine.line.name} - {pcb.machine.name}",
            "result": pcb.final_result,
            "time": pcb.client_time.isoformat() if hasattr(pcb.client_time, 'isoformat') else str(pcb.client_time),
            "user_confirmed": pcb.user_confirmed,
            "confirmed_by_name": pcb.confirmed_by.full_name if pcb.confirmed_by else None
        })
    
    return results

@app.get("/api/version")
async def get_version():
    info = get_latest_version_info()
    return {"version": info.get("version", "1.0.0"), "download_url": "/api/download/collector"}

@app.get("/api/download/collector")
async def download_collector():
    file_path = os.path.join(config.DOWNLOAD_DIR, "XrayCollector.exe")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Update file not found. Please place XrayCollector.exe in backend/static/downloads/")
    return FileResponse(
        path=file_path,
        filename="XrayCollector.exe",
        media_type="application/octet-stream"
    )

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text() # Giữ kết nối
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# --- Background Task Giả lập check offline (Cần chạy riêng hoặc dùng Lifespan) ---
# Trong dự án thật, ta sẽ dùng Celery hoặc FastAPI BackgroundTasks để quét heartbeat.

# --- SERVE FRONTEND (CATCH-ALL) ---
# Đặt ở cuối cùng để không ghi đè các API routes ở trên
if os.path.exists(config.FRONTEND_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(config.FRONTEND_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Nếu đường dẫn bắt đầu bằng api, images hoặc ws mà rơi xuống đây 
        # nghĩa là route đó không tồn tại thực sự -> Trả về 404
        if full_path.startswith("api") or full_path.startswith("images") or full_path.startswith("ws"):
            raise HTTPException(status_code=404)
        
        # Ngược lại, trả về index.html cho SPA routing
        index_path = os.path.join(config.FRONTEND_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"message": "Frontend index.html missing"}
