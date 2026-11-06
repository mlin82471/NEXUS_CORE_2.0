"""
NEXUS CORE 2.0 — Cross-Platform Server Launcher.
Initializes SQLite database, verifies B0 contracts, and launches Uvicorn.
"""

import os
import sys
import threading
import time
import webbrowser
import uvicorn
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.config import settings

def _open_browser_when_ready():
    """Auto-launch the dashboard in the default browser once server is running."""
    time.sleep(1.8)
    try:
        webbrowser.open("http://127.0.0.1:8000/dashboard/")
    except Exception as e:
        print(f"[Warning] Could not auto-open browser: {e}")

def main():
    print("=" * 60)
    print("⚡ Starting NEXUS CORE 2.0 Engine...")
    print(f"📁 Project Root: {PROJECT_ROOT}")
    print(f"🔧 Dev Mode:     {settings.dev_mode}")
    print(f"🤖 Planner:      {settings.planner_model} (Available: {settings.planner_available})")
    print(f"🔌 Adapters:     Antigravity={settings.enable_antigravity_adapter}, DSH={settings.enable_dsh_adapter}, Hermes={settings.enable_hermes_adapter}")
    print(f"🌐 Server URL:    http://127.0.0.1:8000")
    print(f"📊 Dashboard:     http://127.0.0.1:8000/dashboard/")
    print(f"📚 API Docs:      http://127.0.0.1:8000/docs")
    print("=" * 60)

    # Launch browser in a background daemon thread
    threading.Thread(target=_open_browser_when_ready, daemon=True).start()

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )

if __name__ == "__main__":
    main()
