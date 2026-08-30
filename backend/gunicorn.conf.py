"""Gunicorn settings, kept in the repo rather than in a start command.

Gunicorn auto-loads `./gunicorn.conf.py` from its working directory, which on
Render (rootDir: backend) is this directory. That matters because the settings
below are correctness requirements, not tuning, and the deployed service was
started with a hand-typed dashboard command that omitted them — so the values
here apply even when the start command is just
`gunicorn -k uvicorn.workers.UvicornWorker main:app`.

Command-line flags still win over this file, so an explicit `--timeout` in a
start command or Procfile continues to override it.
"""

import os

# Bind to the port the platform hands us; 8000 locally.
bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"

worker_class = "uvicorn.workers.UvicornWorker"

# ONE worker, deliberately, and not to save memory. Background analysis runs on
# an in-process ThreadPoolExecutor and tracks tasks in an in-memory registry, so
# a second worker would accept a status poll for a task it has never heard of and
# report it as missing. Render also sets WEB_CONCURRENCY from the CPU count,
# which would silently scale this up — hence pinning it here.
workers = 1

# Postmortem generation is a synchronous LLM call that legitimately runs past a
# minute. Gunicorn's default is 30s, which kills the request mid-flight and
# returns a WORKER TIMEOUT with no application-level error to explain it.
timeout = 180

# Let an in-flight analysis finish on redeploy instead of being severed.
graceful_timeout = 30

# Must exceed the upstream proxy's idle timeout, or the proxy reuses a connection
# gunicorn has already closed and the client sees a sporadic 502.
keepalive = 75

accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
