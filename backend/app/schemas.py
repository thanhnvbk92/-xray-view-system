from pydantic import BaseModel, Field, field_validator
import json
from datetime import datetime
from typing import Optional, List
import enum

class PCBStatus(str, enum.Enum):
    OK = "OK"
    NG = "NG"
    PENDING = "PENDING"

class MachineStatus(str, enum.Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"

# --- LINE SCHEMAS ---
class LineBase(BaseModel):
    name: str
    description: Optional[str] = None

class LineCreate(LineBase):
    pass

class LineUpdate(LineBase):
    pass

class LineResponse(LineBase):
    id: int
    
    class Config:
        from_attributes = True

# --- MACHINE TYPE SCHEMAS ---
class MachineTypeBase(BaseModel):
    name: str
    part_no: Optional[str] = None
    log_extension: Optional[str] = ".log"

class MachineTypeCreate(MachineTypeBase):
    pass

class MachineTypeUpdate(MachineTypeBase):
    name: Optional[str] = None

class MachineTypeResponse(MachineTypeBase):
    id: int
    
    class Config:
        from_attributes = True

# --- MACHINE SCHEMAS ---
class MachineBase(BaseModel):
    name: str
    ip_address: Optional[str] = None
    line_id: int
    machine_type_id: Optional[int] = None

class MachineCreate(MachineBase):
    pass

class MachineUpdate(MachineBase):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    line_id: Optional[int] = None

class MachineResponse(MachineBase):
    id: int
    status: str
    last_heartbeat: datetime
    machine_type: Optional[MachineTypeResponse] = None

    class Config:
        from_attributes = True

# --- PCB SCHEMAS ---
class PCBImageResponse(BaseModel):
    id: int
    image_path: str
    machine_result: str
    ai_result: str
    user_result: str
    
    class Config:
        from_attributes = True

    @field_validator('image_path', mode='after')
    @classmethod
    def format_image_url(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        if v.startswith("/") or v.startswith("http"):
            return v
        # Nếu là đường dẫn cục bộ (Local Path), chuyển đổi thành web path /images/
        import os
        return f"/images/{os.path.basename(v)}"

class PCBCreate(BaseModel):
    pid: str
    board_pid: Optional[str] = None
    array_index: Optional[int] = 1
    machine_id: int
    machine_result: str
    client_time: datetime
    job_file: Optional[str] = None
    ai_score: Optional[float] = 0.0

# --- USER SCHEMAS ---
class UserBase(BaseModel):
    username: str
    full_name: str
    employee_id: str
    position: str

class UserCreate(UserBase):
    password: str = Field(..., min_length=2)
    
    @field_validator('password')
    @classmethod
    def validate_password_bytes(cls, v: str) -> str:
        if len(v.encode('utf-8')) > 72:
            raise ValueError('Mật khẩu quá dài (tối đa 72 bytes sau khi mã hóa)')
        return v

class UserResponse(UserBase):
    id: int
    role: str
    is_approved: bool
    created_at: datetime
    permissions: Optional[List[str]] = []
    
    @field_validator('permissions', mode='before')
    @classmethod
    def parse_permissions(cls, v):
        if isinstance(v, str) and v:
            try:
                return json.loads(v)
            except:
                return []
        return v or []

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel) :
    access_token: str
    token_type: str
    username: str
    role: str
    full_name: str
    permissions: Optional[List[str]] = []
    
    @field_validator('permissions', mode='before')
    @classmethod
    def parse_permissions(cls, v):
        if isinstance(v, str) and v:
            try:
                return json.loads(v)
            except:
                return []
        return v or []

class TokenData(BaseModel):
    username: Optional[str] = None

# --- HEARTBEAT SCHEMAS ---
class HeartbeatRequest(BaseModel):
    machine_id: int
    ip_address: Optional[str] = None

# --- UPDATED PCB RESPONSE ---
class PCBResponse(BaseModel):
    id: int
    pid: str
    machine_id: int
    machine_result: str
    ai_result: str
    user_result: str
    final_result: str
    job_file: Optional[str]
    ai_score: float
    client_time: datetime
    system_time: datetime
    image_path: Optional[str]
    user_confirmed: bool
    confirmed_by_id: Optional[int] = None
    confirmed_at: Optional[datetime] = None
    display_name: Optional[str] = None
    result: Optional[str] = None
    time: Optional[datetime] = None
    confirmed_by_name: Optional[str] = None
    images: List[PCBImageResponse] = []

    class Config:
        from_attributes = True

    @field_validator('image_path', mode='after')
    @classmethod
    def format_image_url(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        if v.startswith("/") or v.startswith("http"):
            return v
        # Nếu là đường dẫn cục bộ (Local Path), chuyển đổi thành web path /images/
        import os
        return f"/images/{os.path.basename(v)}"

class PCBListResponse(BaseModel):
    total: int
    pcbs: List[PCBResponse]
