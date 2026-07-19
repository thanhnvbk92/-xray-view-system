@echo off
TITLE Xray Backend Server
cd /d "%~dp0backend"
echo Dang kich hoat moi truong ao...
if exist ".venv\Scripts\activate" (
    call .venv\Scripts\activate
) else (
    echo Khong tim thay thu muc .venv! Hay kiem tra lai.
    pause
    exit
)
echo Dang khoi dong FastAPI Server tai port 8000...
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
