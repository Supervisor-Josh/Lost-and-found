import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

# Optional dotenv support for development
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Retrieve database URL from environment or fall back to local SQLite
raw_db_url = os.getenv("DATABASE_URL", "").strip()

if raw_db_url:
    # Normalize postgres:// to postgresql:// for SQLAlchemy compatibility
    if raw_db_url.startswith("postgres://"):
        raw_db_url = raw_db_url.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URL = raw_db_url
else:
    custom_path = os.getenv("SQLITE_DB_PATH")
    if custom_path:
        default_sqlite_path = Path(custom_path)
    else:
        default_sqlite_path = Path(__file__).resolve().with_name("lost_and_found.sqlite3")
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{default_sqlite_path.as_posix()}"

is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

if is_sqlite:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False, "timeout": 30},
    )

    @event.listens_for(engine, "connect")
    def enable_sqlite_pragmas(connection, _connection_record):
        cursor = connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=30000")
        finally:
            cursor.close()
else:
    # Production PostgreSQL / MySQL engine with connection pool recycling and ping
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
