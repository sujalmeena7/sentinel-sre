import os
from sqlmodel import create_engine, SQLModel, Session
from sqlalchemy import text

# Using an embedded SQLite database
DATABASE_URL = "sqlite:///./incidents.db"

# Requires check_same_thread for FastAPI concurrency with SQLite
engine = create_engine(DATABASE_URL, echo=True, connect_args={"check_same_thread": False})

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
