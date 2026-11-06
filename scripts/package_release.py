import os
import sys
import zipfile
from pathlib import Path

def package_project():
    project_root = Path(__file__).resolve().parent.parent
    desktop_dir = Path("C:/Users/linhr/Desktop")
    zip_path = desktop_dir / "NEXUS_CORE_2.0_Project.zip"

    print(f"📦 Packaging project from: {project_root}")
    print(f"🎯 Output ZIP destination: {zip_path}")

    # Exclusions
    EXCLUDE_DIRS = {
        ".git",
        "__pycache__",
        ".pytest_cache",
        "build",
        "node_modules",
        ".venv",
        "venv",
        ".idea",
        ".vscode",
    }
    EXCLUDE_EXTS = {
        ".pyc",
        ".pyo",
        ".db",
        ".sqlite",
        ".sqlite3",
        ".log",
    }

    count = 0
    total_uncompressed = 0

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zipf:
        for root, dirs, files in os.walk(project_root):
            # Prune excluded directories
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

            for file in files:
                file_path = Path(root) / file
                suffix = file_path.suffix.lower()

                if suffix in EXCLUDE_EXTS:
                    continue
                if file.startswith(".tmp") or file.endswith("~"):
                    continue

                rel_path = file_path.relative_to(project_root)
                # Put under a top-level directory NEXUS_CORE_2.0/ in the zip
                arcname = Path("NEXUS_CORE_2.0") / rel_path

                zipf.write(file_path, arcname=str(arcname))
                count += 1
                total_uncompressed += file_path.stat().st_size

    compressed_size = zip_path.stat().st_size
    print(f"✅ Success! Packed {count} files.")
    print(f"📊 Uncompressed: {total_uncompressed / 1024 / 1024:.2f} MB")
    print(f"🗜️  ZIP Size:    {compressed_size / 1024 / 1024:.2f} MB ({compressed_size / 1024:.1f} KB)")
    print(f"📍 Location:    {zip_path}")

if __name__ == "__main__":
    package_project()
