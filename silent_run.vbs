Set WshShell = CreateObject("WScript.Shell")
strPath = WshShell.CurrentDirectory

' Chạy Backend ẩn (0 = Hidden)
WshShell.Run chr(34) & strPath & "\start_backend.bat" & Chr(34), 0

' Chạy Frontend ẩn (0 = Hidden)
WshShell.Run chr(34) & strPath & "\start_frontend.bat" & Chr(34), 0
