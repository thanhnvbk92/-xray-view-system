from pydantic import BaseModel, Field, field_validator
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

# --- MACHINE SCHEMAS ---
class MachineBase(BaseModel):
    name: str
    ip_address: str
    line_id: int

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

class PCBCreate(BaseModel):
    pid: str
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

class TokenData(BaseModel):
    username: Optional[str] = None

# --- HEARTBEAT SCHEMAS ---
class HeartbeatRequest(BaseModel):
    machine_id: int

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
    images: List[PCBImageResponse] = []

    class Config:
        from_attributes = True
