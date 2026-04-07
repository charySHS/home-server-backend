Dim sh
Set sh = WScript.CreateObject("WScript.Shell")
sh.Run "cmd.exe /c """ & "C:\dev\home-server\start-server.bat" & """", 0, False
Set sh = Nothing
