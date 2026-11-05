"""
Database upgrade script for NEXUS CORE 2.0 SQLite database.
Migrates existing SQLite tables to match current SQLAlchemy models.
"""
import os
import sys
import shutil
import sqlite3
import datetime
import pathlib
from sqlalchemy.schema import CreateTable

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine, Base, SessionLocal
from app.models import Agent, Task, PlanStep, TaskEvent
from app.services.registry import seed_default_agents
from app.config import settings

def upgrade_database():
    db_file = pathlib.Path(settings.nexus_data_dir).resolve() / "nexus_2.db"
    print(f"Target DB path: {db_file}")

    if not db_file.exists():
        print(f"Database file {db_file} does not exist yet. Initializing clean.")
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            seed_default_agents(db)
        finally:
            db.close()
        print("Initialization complete.")
        return

    # Backup existing db
    backup_file = db_file.with_name(f"{db_file.stem}.bak_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}{db_file.suffix}")
    shutil.copy2(db_file, backup_file)
    print(f"Backup created at: {backup_file}")

    conn = sqlite3.connect(db_file)
    conn.execute("PRAGMA foreign_keys=OFF")
    cur = conn.cursor()

    tables_to_check = ["agents", "tasks", "plan_steps"]

    for table_name in tables_to_check:
        has_table = cur.execute(f"SELECT count(*) FROM sqlite_master WHERE type='table' AND name='{table_name}'").fetchone()[0] > 0
        if not has_table:
            continue

        existing_cols = {c[1] for c in cur.execute(f"PRAGMA table_info({table_name})").fetchall()}
        table_obj = Base.metadata.tables[table_name]
        expected_cols = {c.name for c in table_obj.columns}
        
        # Check if DDL matches (especially CHECK constraints and all columns)
        ddl = cur.execute(f"SELECT sql FROM sqlite_master WHERE type='table' AND name='{table_name}'").fetchone()[0]
        
        needs_rebuild = False
        if not expected_cols.issubset(existing_cols):
            needs_rebuild = True
        if table_name == "agents" and "antigravity" not in ddl:
            needs_rebuild = True
        if table_name == "tasks" and ("approval_status" not in existing_cols or "allowed_permissions" not in existing_cols):
            needs_rebuild = True

        if needs_rebuild:
            print(f"Rebuilding table '{table_name}' to match current schema...")
            # 1. Rename existing
            cur.execute(f"ALTER TABLE {table_name} RENAME TO _{table_name}_old")
            # 2. Generate CREATE TABLE SQL from SQLAlchemy
            create_ddl = str(CreateTable(table_obj).compile(engine))
            cur.execute(create_ddl)
            # 3. Copy intersecting columns
            common_cols = existing_cols.intersection(expected_cols)
            col_list = ", ".join(common_cols)
            cur.execute(f"INSERT INTO {table_name} ({col_list}) SELECT {col_list} FROM _{table_name}_old")
            # 4. Drop old table
            cur.execute(f"DROP TABLE _{table_name}_old")
            print(f"Table '{table_name}' successfully rebuilt and data preserved.")

    conn.commit()
    conn.close()

    # Create any other new tables
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_default_agents(db)
    finally:
        db.close()
    print("All tables up to date and default agents seeded!")

if __name__ == "__main__":
    upgrade_database()
