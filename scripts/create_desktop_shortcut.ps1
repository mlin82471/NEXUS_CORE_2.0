$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "⚡ NEXUS CORE 2.0.lnk"

$TargetBat = "C:\Users\linhr\.gemini\antigravity\scratch\nexus_core_2.0\NEXUS_CORE_2.0\run_nexus.bat"
$WorkingDir = "C:\Users\linhr\.gemini\antigravity\scratch\nexus_core_2.0\NEXUS_CORE_2.0"

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetBat
$Shortcut.WorkingDirectory = $WorkingDir
$Shortcut.WindowStyle = 1
$Shortcut.Description = "NEXUS CORE 2.0 企业级多智能体主控系统"
$Shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
$Shortcut.Save()

Write-Host "SUCCESS: Desktop shortcut created at $ShortcutPath"
