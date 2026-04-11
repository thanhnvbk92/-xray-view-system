import os
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Boolean, Enum, Float, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import enum

# Cấu hình Database
# Sử dụng pymysql để đảm bảo tính ổn định trên Windows/Python 3.13
DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://admin:111111@localhost:3306/XrayDB")

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
    permissions = Column(Text, nullable=True) # JSON list of permissions
    
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
    name = Column(String(100), nullable=False, index=True) # Loại bỏ unique=True, thêm nullable=False
    ip_address = Column(String(45), unique=True, nullable=True) # Thêm unique=True, cho phép nullable
    line_id = Column(Integer, ForeignKey("lines.id"), nullable=False) # Thêm nullable=False
    status = Column(String(20), default="OFFLINE") # ONLINE/OFFLINE
    last_heartbeat = Column(DateTime, default=datetime.utcnow)
    
    line = relationship("Line", back_populates="machines")
    pcbs = relationship("PCB", back_populates="machine")
    
    machine_type_id = Column(Integer, ForeignKey("machine_types.id"), nullable=False) # Thêm nullable=False
    machine_type = relationship("MachineType", back_populates="machines")

class MachineType(Base):
    __tablename__ = "machine_types"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True)
    part_no = Column(String(100), nullable=True) # Machine Part Number
    log_extension = Column(String(20), default=".log") # Filter cho file log
    
    machines = relationship("Machine", back_populates="machine_type")

class PCB(Base):
    __tablename__ = "pcbs"
    id = Column(Integer, primary_key=True, index=True)
    pid = Column(String(100), index=True) # Product ID (Mã đã map)
    board_pid = Column(String(100), index=True, nullable=True) # Mã gốc từ Log
    array_index = Column(Integer, default=1, index=True) # Số thứ tự trong mảng
    machine_id = Column(Integer, ForeignKey("machines.id"), index=True)
    
    # Kết quả đa tầng
    machine_result = Column(String(20), default="PENDING", index=True) # OK/NG/PENDING từ máy quét
    ai_result = Column(String(20), default="PENDING", index=True)      # OK/NG/PENDING từ AI
    user_result = Column(String(20), default="PENDING", index=True)    # OK/NG/PENDING từ User xác nhận
    final_result = Column(String(20), default="PENDING", index=True)   # Kết quả cuối cùng sau khi tổng hợp
    
    job_file = Column(String(200), nullable=True)          # Tên jobfile sử dụng
    ai_score = Column(Float, default=0.0)
    
    # Double-Timestamp
    client_time = Column(DateTime, index=True)          # Thời gian ghi nhận tại máy quét (từ log)
    system_time = Column(DateTime, default=datetime.utcnow, index=True) # Thời gian ghi nhận tại server
    
    image_path = Column(String(255))
    user_confirmed = Column(Boolean, default=False, index=True)
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
            
            # USERS table: permissions
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN permissions TEXT NULL"))
            except: pass

            # PCBS table INDEXES
            try: conn.execute(text("CREATE INDEX idx_pcb_system_time ON pcbs(system_time)"))
            except: pass
            try: conn.execute(text("CREATE INDEX idx_pcb_machine_id ON pcbs(machine_id)"))
            except: pass
            try: conn.execute(text("CREATE INDEX idx_pcb_final_result ON pcbs(final_result)"))
            except: pass
            try: conn.execute(text("CREATE INDEX idx_pcb_ai_result ON pcbs(ai_result)"))
            except: pass
            try: conn.execute(text("CREATE INDEX idx_pcb_client_time ON pcbs(client_time)"))
            except: pass
            try: conn.execute(text("CREATE INDEX idx_pcb_user_confirmed ON pcbs(user_confirmed)"))
            except: pass

            # MACHINE_TYPES table
            try:
                conn.execute(text("""
                CREATE TABLE IF NOT EXISTS machine_types (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) UNIQUE NOT NULL,
                    part_no VARCHAR(100),
                    log_extension VARCHAR(20) DEFAULT '.log'
                )
                """))
            except: pass

            # MACHINES table: machine_type_id và các ràng buộc mới
            try:
                # 1. Đảm bảo có ít nhất 1 Line và 1 MachineType để gán làm mặc định nếu cần
                conn.execute(text("INSERT IGNORE INTO `lines` (name) VALUES ('Default Line')"))
                conn.execute(text("INSERT IGNORE INTO machine_types (name) VALUES ('Default Type')"))
                
                # 2. Xử lý dữ liệu NULL trước khi đặt NOT NULL
                conn.execute(text("UPDATE machines SET line_id = (SELECT id FROM `lines` LIMIT 1) WHERE line_id IS NULL"))
                conn.execute(text("UPDATE machines SET machine_type_id = (SELECT id FROM machine_types LIMIT 1) WHERE machine_type_id IS NULL"))
                
                # 3. Thay đổi các ràng buộc cột
                # Bỏ unique trên Name (Bằng cách xóa index cũ)
                try: conn.execute(text("ALTER TABLE machines DROP INDEX name"))
                except: pass
                
                # Cập nhật các cột sang NOT NULL và IP thành UNIQUE
                conn.execute(text("ALTER TABLE machines MODIFY name VARCHAR(100) NOT NULL"))
                conn.execute(text("ALTER TABLE machines MODIFY line_id INT NOT NULL"))
                conn.execute(text("ALTER TABLE machines MODIFY machine_type_id INT NOT NULL"))
                
                # Thêm UNIQUE cho ip_address (Nếu chưa có)
                try: conn.execute(text("ALTER TABLE machines ADD UNIQUE (ip_address)"))
                except: pass

                # PCBS table: line_id (nếu cần sync)
            except Exception as e:
                print(f"Machine table migration error: {e}")

            # PCB_IMAGES table
            try:
                conn.execute(text("ALTER TABLE pcb_images ADD COLUMN confirmed_by_id INT NULL"))
                conn.execute(text("ALTER TABLE pcb_images ADD CONSTRAINT fk_img_user FOREIGN KEY (confirmed_by_id) REFERENCES users(id)"))
            except: pass
            
            # 4. Đảm bảo có tài khoản ADMIN mặc định
            from passlib.context import CryptContext
            pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
            
            check_admin = conn.execute(text("SELECT id FROM users WHERE username = 'admin'")).fetchone()
            if not check_admin:
                print("Database: Admin user not found. Creating default admin...")
                hashed_pw = pwd_context.hash("admin")
                conn.execute(text("""
                    INSERT INTO users (username, hashed_password, full_name, role, is_approved, created_at)
                    VALUES ('admin', :hp, 'System Administrator', 'ADMIN', 1, :now)
                """), {"hp": hashed_pw, "now": datetime.utcnow()})
                
            conn.commit()
            print("Database migration and admin initialization completed.")
        except Exception as e:
            print(f"Migration error: {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
