"""SQLite + WAL + FK + busy timeout. Stable data dir from config."""
import pathlib
import sqlite3
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.schema import CreateTable
from app.config import settings

_db_url = settings.db_url
_is_sqlite = _db_url.startswith("sqlite")

if _is_sqlite:
    engine = create_engine(
        _db_url,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(
        _db_url,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()

if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn, _rec):
        dbapi_conn.execute("PRAGMA journal_mode=WAL")
        dbapi_conn.execute("PRAGMA foreign_keys=ON")
        dbapi_conn.execute("PRAGMA busy_timeout=5000")


def ensure_sqlite_schema(eng, base):
    """Ensure SQLite tables match declared SQLAlchemy models and constraints without losing data."""
    db_url = str(eng.url)
    if not db_url.startswith("sqlite"):
        base.metadata.create_all(bind=eng)
        return
    db_file = pathlib.Path(settings.nexus_data_dir).resolve() / "nexus_2.db"
    if not db_file.exists():
        base.metadata.create_all(bind=eng)
        return
    conn = sqlite3.connect(db_file)
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute("PRAGMA legacy_alter_table=ON")
    cur = conn.cursor()
    for table_name in ["agents", "tasks", "plan_steps"]:
        has_t = cur.execute(f"SELECT count(*) FROM sqlite_master WHERE type='table' AND name='{table_name}'").fetchone()[0] > 0
        if not has_t:
            continue
        existing_cols = {c[1] for c in cur.execute(f"PRAGMA table_info({table_name})").fetchall()}
        table_obj = base.metadata.tables.get(table_name)
        if table_obj is None:
            continue
        expected_cols = {c.name for c in table_obj.columns}
        ddl_row = cur.execute(f"SELECT sql FROM sqlite_master WHERE type='table' AND name='{table_name}'").fetchone()
        ddl = ddl_row[0] if ddl_row else ""
        needs_rebuild = False
        if not expected_cols.issubset(existing_cols):
            needs_rebuild = True
        if table_name == "agents" and "antigravity" not in ddl:
            needs_rebuild = True
        if table_name == "tasks" and ("approval_status" not in existing_cols or "allowed_permissions" not in existing_cols):
            needs_rebuild = True
        if needs_rebuild:
            cur.execute(f"ALTER TABLE {table_name} RENAME TO _{table_name}_old")
            create_ddl = str(CreateTable(table_obj).compile(eng))
            cur.execute(create_ddl)
            common_cols = existing_cols.intersection(expected_cols)
            col_list = ", ".join(common_cols)
            cur.execute(f"INSERT INTO {table_name} ({col_list}) SELECT {col_list} FROM _{table_name}_old")
            cur.execute(f"DROP TABLE _{table_name}_old")
    conn.commit()
    conn.close()
    base.metadata.create_all(bind=eng)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

