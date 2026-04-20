from datetime import datetime, timezone
from typing import List, Optional, Any
from uuid import uuid4
from sqlmodel import SQLModel, Field, Column, JSON

class Incident(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
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
