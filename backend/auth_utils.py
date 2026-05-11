"""
Authentication utilities for Sentinel-SRE multi-tenant SaaS.

Provides:
  - Password hashing / verification (bcrypt)
  - JWT access token creation + decoding
  - Webhook token generation + SHA-256 hashing (tokens are shown
    once to the user on registration and stored only as hashes,
    so even DB access can't recover the raw webhook token)
  - FastAPI dependency `get_current_user` for route protection
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from database import get_session
from models import User

logger = logging.getLogger(__name__)

# ─── Configuration ───────────────────────────────────────────────────
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MIN = int(os.getenv("ACCESS_TOKEN_TTL_MIN", "1440"))  # 24h default

_JWT_FALLBACK_WARNED = False


def _jwt_secret() -> str:
    """Read JWT secret from env. Refuse to start with a dev secret in production."""
    global _JWT_FALLBACK_WARNED
    secret = os.getenv("JWT_SECRET")
    if not secret:
        # In production environments, refuse to issue tokens with a predictable secret.
        env = os.getenv("APP_ENV", "").lower() or os.getenv("ENV", "").lower()
        if env in {"production", "prod"} or os.getenv("RENDER") or os.getenv("VERCEL"):
            raise RuntimeError(
                "JWT_SECRET is not set in a production environment. "
                "Refusing to issue tokens with a predictable dev secret."
            )
        if not _JWT_FALLBACK_WARNED:
            logger.warning(
                "JWT_SECRET is not set — falling back to an INSECURE dev secret. "
                "Set JWT_SECRET in your environment for any non-local use."
            )
            _JWT_FALLBACK_WARNED = True
        secret = "DEV-ONLY-INSECURE-REPLACE-IN-PRODUCTION-" + hashlib.sha256(
            b"sentinel-sre-dev"
        ).hexdigest()
    return secret


# ─── Password hashing (bcrypt) ───────────────────────────────────────

def hash_password(password: str) -> str:
    if not password:
        raise ValueError("password must not be empty")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ─── JWT access tokens ───────────────────────────────────────────────

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_TTL_MIN),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    return payload


# ─── Webhook token: generate + SHA-256 hash ──────────────────────────
# Webhook tokens are shown to the user exactly once (on registration /
# rotation). The DB stores only the SHA-256 hex so the raw token cannot
# be recovered. Lookup is O(1) via the hash column.

def generate_webhook_token() -> str:
    """Generate a URL-safe random webhook token (~43 chars)."""
    return secrets.token_urlsafe(32)


def hash_webhook_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ─── FastAPI dependency ──────────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> User:
    """Extract + verify the Bearer JWT, return the owning User, else 401."""
    if not creds or creds.scheme.lower() != "bearer" or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(creds.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return user


def get_user_by_webhook_token(token: str, session: Session) -> Optional[User]:
    """Resolve the owning User for a raw webhook token (used by Prometheus ingest)."""
    if not token:
        return None
    token_hash = hash_webhook_token(token)
    return session.exec(
        select(User).where(User.webhook_token_hash == token_hash)
    ).first()
