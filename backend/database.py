import os
from sqlmodel import create_engine, SQLModel, Session
from sqlalchemy import text

# Use DATABASE_URL from environment with SQLite as fallback
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./incidents.db")

# SQLite requires check_same_thread=False for FastAPI concurrency. 
# Other DBs (Postgres, MySQL) should not use this argument.
is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}

engine = create_engine(DATABASE_URL, echo=True, connect_args=connect_args)

def init_db():
    # Only create tables if they don't exist
    SQLModel.metadata.create_all(engine)
    
    # Gracefully add new Evaluation columns to existing SQLite DB (ignores if exists)
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE incident ADD COLUMN expected_cause VARCHAR"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE incident ADD COLUMN predicted_cause VARCHAR"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE incident ADD COLUMN is_correct BOOLEAN"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE incident ADD COLUMN human_feedback_score INTEGER DEFAULT 0"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE incident ADD COLUMN human_feedback_count INTEGER DEFAULT 0"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE incident ADD COLUMN human_feedback_comment VARCHAR"))
        except Exception:
            pass

def get_session():
    with Session(engine) as session:
        yield session
