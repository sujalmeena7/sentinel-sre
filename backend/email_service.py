"""
Email delivery for Sentinel-SRE.

Sends transactional emails (verification, password reset) via SMTP.
If SMTP is not configured, falls back to logging the email body to the
backend console so development / self-hosted deploys still work and the
user can copy the link manually.

Configuration (env vars):
  SMTP_HOST        e.g. smtp.gmail.com
  SMTP_PORT        default 587 (STARTTLS) or 465 (SMTPS)
  SMTP_USER        auth username
  SMTP_PASSWORD    auth password / app password
  SMTP_FROM        "From" address; defaults to SMTP_USER
  SMTP_USE_SSL     "true"  → implicit TLS on port 465
                   anything else → STARTTLS on port 587
  FRONTEND_URL     base URL used to build verification / reset links,
                   e.g. https://sentinel-sre.vercel.app
"""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

logger = logging.getLogger(__name__)


def _frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def _smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_USER") and os.getenv("SMTP_PASSWORD"))


def send_email(to: str, subject: str, text_body: str, html_body: Optional[str] = None) -> bool:
    """
    Send an email. Returns True if delivered (or logged in dev).
    Never raises — callers should keep working even if email delivery fails.
    """
    if not _smtp_configured():
        logger.warning(
            "SMTP not configured — logging email to console instead.\n"
            "--- EMAIL ---\n"
            "To:      %s\n"
            "Subject: %s\n"
            "Body:\n%s\n"
            "-------------",
            to, subject, text_body,
        )
        return True

    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    from_addr = os.getenv("SMTP_FROM", user)
    use_ssl = os.getenv("SMTP_USE_SSL", "").lower() == "true"

    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        if use_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=15) as server:
                server.login(user, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.starttls(context=ssl.create_default_context())
                server.login(user, password)
                server.send_message(msg)
        logger.info(f"Email sent to {to}: {subject}")
        return True
    except Exception as exc:
        logger.error(f"SMTP delivery failed for {to}: {exc}")
        return False


# ─── Templates ──────────────────────────────────────────────────────

def send_verification_email(to: str, token: str, display_name: Optional[str] = None) -> bool:
    link = f"{_frontend_url()}/verify-email?token={token}"
    greeting = f"Hi {display_name}," if display_name else "Hi there,"
    text = (
        f"{greeting}\n\n"
        f"Welcome to Sentinel-SRE. Please confirm your email address by clicking the link below:\n\n"
        f"{link}\n\n"
        f"This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.\n\n"
        f"— Sentinel-SRE"
    )
    html = f"""
<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;">
    <div style="max-width:520px;margin:0 auto;background:#111;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
        <div style="width:32px;height:32px;border-radius:8px;background:#f97316;display:flex;align-items:center;justify-content:center;font-weight:700;">S</div>
        <span style="font-weight:600;font-size:15px;">Sentinel-SRE</span>
      </div>
      <h1 style="font-size:22px;font-weight:600;margin:0 0 12px;">Confirm your email</h1>
      <p style="color:rgba(255,255,255,.7);line-height:1.6;margin:0 0 24px;">{greeting} Welcome to Sentinel-SRE. Please confirm your email address to finish creating your account.</p>
      <a href="{link}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#f97316;color:#fff;text-decoration:none;font-weight:500;font-size:14px;">Verify email</a>
      <p style="color:rgba(255,255,255,.4);font-size:12px;line-height:1.6;margin:24px 0 0;">Or copy this link into your browser:<br><span style="color:rgba(255,255,255,.6);word-break:break-all;">{link}</span></p>
      <p style="color:rgba(255,255,255,.4);font-size:12px;margin:24px 0 0;">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
    </div>
  </body>
</html>
"""
    return send_email(to, "Confirm your Sentinel-SRE email", text, html)


def send_password_reset_email(to: str, token: str, display_name: Optional[str] = None) -> bool:
    link = f"{_frontend_url()}/reset-password?token={token}"
    greeting = f"Hi {display_name}," if display_name else "Hi there,"
    text = (
        f"{greeting}\n\n"
        f"We received a request to reset the password for your Sentinel-SRE account.\n\n"
        f"Reset your password here:\n{link}\n\n"
        f"This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email — "
        f"your password will not change.\n\n"
        f"— Sentinel-SRE"
    )
    html = f"""
<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;">
    <div style="max-width:520px;margin:0 auto;background:#111;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
        <div style="width:32px;height:32px;border-radius:8px;background:#f97316;display:flex;align-items:center;justify-content:center;font-weight:700;">S</div>
        <span style="font-weight:600;font-size:15px;">Sentinel-SRE</span>
      </div>
      <h1 style="font-size:22px;font-weight:600;margin:0 0 12px;">Reset your password</h1>
      <p style="color:rgba(255,255,255,.7);line-height:1.6;margin:0 0 24px;">{greeting} We received a request to reset your password. Click below to choose a new one.</p>
      <a href="{link}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#f97316;color:#fff;text-decoration:none;font-weight:500;font-size:14px;">Reset password</a>
      <p style="color:rgba(255,255,255,.4);font-size:12px;line-height:1.6;margin:24px 0 0;">Or copy this link into your browser:<br><span style="color:rgba(255,255,255,.6);word-break:break-all;">{link}</span></p>
      <p style="color:rgba(255,255,255,.4);font-size:12px;margin:24px 0 0;">This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email — your password will not change.</p>
    </div>
  </body>
</html>
"""
    return send_email(to, "Reset your Sentinel-SRE password", text, html)
