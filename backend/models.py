from datetime import datetime, timezone
from typing import List, Optional, Any
from uuid import uuid4
from sqlmodel import SQLModel, Field, Column, JSON


class User(SQLModel, table=True):
    """Tenant account. Every incident is scoped to a user_id."""
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    # SHA-256 hex of the raw webhook token. The raw value is only shown
    # to the user once (at registration / rotation) and never stored.
    webhook_token_hash: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Optional display fields (for future profile page).
    name: Optional[str] = None
    role: str = Field(default="user")  # "user" | "admin"


class Incident(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)

    # Multi-tenant ownership — every new incident MUST have a user_id.
    # Nullable only so legacy rows created before this migration can be
    # back-filled by the startup migration; new code always sets it.
    user_id: Optional[str] = Field(default=None, foreign_key="user.id", index=True)

    service: str = Field(index=True)
    environment: str = Field(index=True)

    start_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    peak_time: Optional[datetime] = None
    resolved_time: Optional[datetime] = None

    symptoms: List[str] = Field(default=[], sa_column=Column(JSON))
    signals: List[dict] = Field(default=[], sa_column=Column(JSON))
    changes: List[dict] = Field(default=[], sa_column=Column(JSON))

    root_cause: Optional[str] = None
    fixes_applied: List[Any] = Field(default=[], sa_column=Column(JSON))
    runbook_refs: List[str] = Field(default=[], sa_column=Column(JSON))

    # Slack Interaction Tracking
    acknowledged_by: Optional[str] = None

    # Evaluation Tracking
    expected_cause: Optional[str] = None
    predicted_cause: Optional[str] = None
    is_correct: Optional[bool] = None

    # Human Loop Feedback
    human_feedback_score: int = Field(default=0)
    human_feedback_count: int = Field(default=0)
    human_feedback_comment: Optional[str] = None

    # ── Async Analysis Tracking ──────────────────────────────────
    # Drives the non-blocking /incidents/analyze flow.
    #   "idle"       → never analyzed (default)
    #   "processing" → background task running (RAG + LLM)
    #   "completed"  → analysis_result is populated
    #   "failed"     → analysis_error has the reason
    analysis_status: str = Field(default="idle", index=True)
    analysis_result: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    analysis_error: Optional[str] = None