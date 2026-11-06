import argparse
import os
import sys
import zipfile
from pathlib import Path

def package_project(output_path: Path | None = None):
    project_root = Path(__file__).resolve().parent.parent
    if output_path is None:
        desktop_dir = Path("C:/Users/linhr/Desktop")
        zip_path = desktop_dir / "NEXUS_CORE_2.0_Project.zip"
    else:
        zip_path = Path(output_path).resolve()

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
    EXCLUDE_FILES = {
        ".env",
        ".env.local",
        ".env.production",
        "b0_v6_test.db",
        "b0_v7_test.db",
    }

    count = 0
    total_uncompressed = 0

    temp_zip = zip_path.parent / (zip_path.stem + "_new.zip")
    with zipfile.ZipFile(temp_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zipf:
        for root, dirs, files in os.walk(project_root):
            # Prune excluded directories
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

            for file in files:
                if file in EXCLUDE_FILES:
                    continue

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

    try:
        if zip_path.exists():
            zip_path.unlink()
        temp_zip.rename(zip_path)
    except Exception:
        fallback_zip = zip_path.parent / "NEXUS_CORE_2.1_Project.zip"
        if fallback_zip.exists():
            try:
                fallback_zip.unlink()
            except Exception:
                pass
        temp_zip.rename(fallback_zip)
        zip_path = fallback_zip

    compressed_size = zip_path.stat().st_size
    print(f"✅ Success! Packed {count} files.")
    print(f"📊 Uncompressed: {total_uncompressed / 1024 / 1024:.2f} MB")
    print(f"🗜️  ZIP Size:    {compressed_size / 1024 / 1024:.2f} MB ({compressed_size / 1024:.1f} KB)")
    print(f"📍 Location:    {zip_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Package NEXUS CORE 2.0 release archive")
    parser.add_argument("--output", "-o", type=str, default=None, help="Output zip file path (default: Desktop)")
    args = parser.parse_args()
    package_project(args.output)
