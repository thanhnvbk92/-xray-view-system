import os
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Boolean, Enum, Float, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import enum

# Cấu hình Database
# Sử dụng pymysql để đảm bảo tính ổn định trên Windows/Python 3.13
DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://admin:111111@10.7.12.236:3306/XrayDB")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class MachineStatus(enum.Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"

class PCBResult(enum.Enum):
    OK = "OK"
    NG = "NG"
    PENDING = "PENDING"

class UserRole(enum.Enum):
    ADMIN = "ADMIN"
    OPERATOR = "OPERATOR"
    VIEWER = "VIEWER"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    hashed_password = Column(String(255))
    full_name = Column(String(100))
    employee_id = Column(String(50), unique=True, index=True) # Mã nhân viên
    position = Column(String(100)) # Chức vụ
    role = Column(String(20), default="OPERATOR") # ADMIN/OPERATOR
    is_approved = Column(Boolean, default=False) # Chờ admin phê duyệt
    created_at = Column(DateTime, default=datetime.utcnow)
    
    confirmed_pcbs = relationship("PCB", back_populates="confirmed_by")
    confirmed_images = relationship("PCBImage", back_populates="confirmed_by")

class Line(Base):
    __tablename__ = "lines"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True)
    description = Column(Text, nullable=True)
    
    machines = relationship("Machine", back_populates="line")

class Machine(Base):
    __tablename__ = "machines"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True)
    ip_address = Column(String(45))
    line_id = Column(Integer, ForeignKey("lines.id"))
    status = Column(String(20), default="OFFLINE") # ONLINE/OFFLINE
    last_heartbeat = Column(DateTime, default=datetime.utcnow)
    
    line = relationship("Line", back_populates="machines")
    pcbs = relationship("PCB", back_populates="machine")

class PCB(Base):
    __tablename__ = "pcbs"
    id = Column(Integer, primary_key=True, index=True)
    pid = Column(String(100), index=True) # Product ID
    machine_id = Column(Integer, ForeignKey("machines.id"))
    
    # Kết quả đa tầng
    machine_result = Column(String(20), default="PENDING") # OK/NG/PENDING từ máy quét
    ai_result = Column(String(20), default="PENDING")      # OK/NG/PENDING từ AI
    user_result = Column(String(20), default="PENDING")    # OK/NG/PENDING từ User xác nhận
    final_result = Column(String(20), default="PENDING")   # Kết quả cuối cùng sau khi tổng hợp
    
    job_file = Column(String(200), nullable=True)          # Tên jobfile sử dụng
    ai_score = Column(Float, default=0.0)
    
    # Double-Timestamp
    client_time = Column(DateTime)          # Thời gian ghi nhận tại máy quét (từ log)
    system_time = Column(DateTime, default=datetime.utcnow) # Thời gian ghi nhận tại server
    
    image_path = Column(String(255))
    user_confirmed = Column(Boolean, default=False)
    confirmed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    
    machine = relationship("Machine", back_populates="pcbs")
    images = relationship("PCBImage", back_populates="pcb", cascade="all, delete-orphan")
    confirmed_by = relationship("User", back_populates="confirmed_pcbs")

class PCBImage(Base):
    __tablename__ = "pcb_images"
    id = Column(Integer, primary_key=True, index=True)
    pcb_id = Column(Integer, ForeignKey("pcbs.id"))
    image_path = Column(String(255))
    
    # Kết quả hậu kiểm từng ảnh
    machine_result = Column(String(20), default="PENDING")
    ai_result = Column(String(20), default="PENDING")
    user_result = Column(String(20), default="PENDING")
    is_processed = Column(Boolean, default=False) # Cờ đánh dấu đã nén và chuyển vào storage
    confirmed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    pcb = relationship("PCB", back_populates="images")
    confirmed_by = relationship("User", back_populates="confirmed_images")

def init_db():
    from sqlalchemy import text
    Base.metadata.create_all(bind=engine)
    
    # Migration logic tích hợp
    with engine.connect() as conn:
        # Thêm các cột nếu chưa có
        try:
            # Kiểm tra xem cột đã tồn tại chưa bằng cách truy vấn schema
            # Cách đơn giản hơn là cứ chạy ALTER TABLE và catch exception nếu đã có
            print("Running database migration...")
            
            # PCBS table
            try:
                conn.execute(text("ALTER TABLE pcbs ADD COLUMN confirmed_by_id INT NULL"))
                conn.execute(text("ALTER TABLE pcbs ADD CONSTRAINT fk_pcb_user FOREIGN KEY (confirmed_by_id) REFERENCES users(id)"))
            except: pass
            
            try:
                conn.execute(text("ALTER TABLE pcbs ADD COLUMN confirmed_at DATETIME NULL"))
            except: pass
            
            # PCB_IMAGES table
            try:
                conn.execute(text("ALTER TABLE pcb_images ADD COLUMN confirmed_by_id INT NULL"))
                conn.execute(text("ALTER TABLE pcb_images ADD CONSTRAINT fk_img_user FOREIGN KEY (confirmed_by_id) REFERENCES users(id)"))
            except: pass
            
            conn.commit()
            print("Database migration completed.")
        except Exception as e:
            print(f"Migration error: {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
