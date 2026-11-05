"""
Fix foreign keys on task_events and agent_runs caused by SQLite table rename.
"""
import os, sys, pathlib, sqlite3
from sqlalchemy.schema import CreateTable

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import engine, Base
import app.models
from app.config import settings

def fix_fk():
    db_file = pathlib.Path(settings.nexus_data_dir).resolve() / "nexus_2.db"
    conn = sqlite3.connect(db_file)
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute("PRAGMA legacy_alter_table=ON")
    cur = conn.cursor()

    for table_name in ["task_events", "agent_runs"]:
        existing_cols = {c[1] for c in cur.execute(f"PRAGMA table_info({table_name})").fetchall()}
        table_obj = Base.metadata.tables[table_name]
        expected_cols = {c.name for c in table_obj.columns}
        
        cur.execute(f"ALTER TABLE {table_name} RENAME TO _{table_name}_tmp")
        create_ddl = str(CreateTable(table_obj).compile(engine))
        cur.execute(create_ddl)
        
        common_cols = existing_cols.intersection(expected_cols)
        col_list = ", ".join(common_cols)
        cur.execute(f"INSERT INTO {table_name} ({col_list}) SELECT {col_list} FROM _{table_name}_tmp")
        cur.execute(f"DROP TABLE _{table_name}_tmp")
        print(f"Table '{table_name}' rebuilt with correct foreign keys.")

    # Also drop _agents_old if left over
    cur.execute("DROP TABLE IF EXISTS _agents_old")

    conn.commit()
    conn.close()
    print("FK fix complete!")

if __name__ == "__main__":
    fix_fk()
