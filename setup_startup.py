import os
import winshell
from win32com.client import Dispatch

def create_startup_shortcut():
    # Đường dẫn file vbs
    current_dir = os.path.dirname(os.path.abspath(__file__))
    target = os.path.join(current_dir, "silent_run.vbs")
    
    if not os.path.exists(target):
        print(f"Loi: Khong tim thay file {target}")
        return

    # Đường dẫn thư mục Startup của Windows
    startup_path = winshell.startup()
    shortcut_path = os.path.join(startup_path, "XrayViewSystem.lnk")

    # Tạo shortcut
    shell = Dispatch('WScript.Shell')
    shortcut = shell.CreateShortCut(shortcut_path)
    shortcut.Targetpath = target
    shortcut.WorkingDirectory = current_dir
    shortcut.Description = "Tu dong khoi dong Xray View System"
    shortcut.IconLocation = target
    shortcut.save()

    print(f"Thanh cong! Da tao shortcut tai: {shortcut_path}")
    print("Tu gio, he thong se tu dong chay moi khi ban bat may tinh.")

if __name__ == "__main__":
    try:
        create_startup_shortcut()
    except Exception as e:
        print(f"Co loi xay ra: {e}")
        print("Hay thu chay script nay voi quyen Administrator.")
    input("\nNhan Enter de ket thuc...")
