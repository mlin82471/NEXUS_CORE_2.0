import os
import subprocess

def create_desktop_shortcut():
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    target_bat = r"C:\Users\linhr\.gemini\antigravity\scratch\nexus_core_2.0\NEXUS_CORE_2.0\run_nexus.bat"
    working_dir = r"C:\Users\linhr\.gemini\antigravity\scratch\nexus_core_2.0\NEXUS_CORE_2.0"
    shortcut_path = os.path.join(desktop, "NEXUS CORE 2.0.lnk")

    vbs_content = f'''Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "{shortcut_path}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "{target_bat}"
oLink.WorkingDirectory = "{working_dir}"
oLink.Description = "NEXUS CORE 2.0 Multi-Agent Orchestrator"
oLink.IconLocation = "shell32.dll,220"
oLink.Save
'''

    vbs_path = os.path.join(working_dir, "_temp_shortcut.vbs")
    with open(vbs_path, "w", encoding="latin1") as f:
        f.write(vbs_content)

    try:
        subprocess.run(["cscript", "//nologo", vbs_path], check=True)
    finally:
        if os.path.exists(vbs_path):
            os.remove(vbs_path)

    exists = os.path.exists(shortcut_path)
    print(f"Desktop shortcut created: {shortcut_path}")
    print(f"Verified exists on Desktop: {exists}")
    return exists

if __name__ == "__main__":
    create_desktop_shortcut()
