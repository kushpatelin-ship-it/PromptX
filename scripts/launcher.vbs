Dim fso, appDir, electronCmd
Set fso = CreateObject("Scripting.FileSystemObject")

' App is one level up from scripts folder
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
appDir = fso.GetParentFolderName(appDir)

Dim WShell
Set WShell = CreateObject("WScript.Shell")
WShell.CurrentDirectory = appDir

electronCmd = appDir & "\node_modules\.bin\electron.cmd"

If fso.FileExists(electronCmd) Then
  WShell.Run Chr(34) & electronCmd & Chr(34) & " " & Chr(34) & appDir & Chr(34), 0, False
Else
  WShell.Run "node " & Chr(34) & appDir & "\agent.js" & Chr(34), 1, False
End If
