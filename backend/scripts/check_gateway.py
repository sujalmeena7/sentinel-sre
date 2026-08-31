"""Probe an OpenAI-compatible gateway before wiring it into .env.

Answers the three questions the config cannot answer on its own: which model
ids this key can actually reach, how slow each one is, and whether /embeddings
exists at all. Guessing any of these produces a 404 or a hang that looks like an
application outage, which is why this runs before the app does.

    python scripts/check_gateway.py                       # reads LLM_GATEWAY_* from .env
    python scripts/check_gateway.py <base_url> <api_key>  # or pass them explicitly
    python scripts/check_gateway.py --models a,b,c        # only test these ids

Prints outcomes and timings only — never the key.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
# Long enough to see a slow pooled gateway succeed rather than misreporting it
# as broken; a marketplace gateway retries across upstream keys internally.
PROBE_TIMEOUT = 120
# A realistic prompt, not "reply ok". Latency on a toy prompt is worthless here:
# on a pooled gateway the same model answered a 5-token prompt in 12s and the
# real analysis prompt in a 42s median, so a trivial probe would have sized the
# timeouts about four times too tight. This asks for a comparable amount of
# structured output to the real narrative.
PROMPT = (
    "You are an SRE assistant. A service was OOMKilled after memory climbed to "
    "98% and restarted 7 times; p99 latency exceeded 4s and the error rate hit "
    "12%. Give a root cause, a confidence percentage, three evidence bullets, "
    "immediate mitigation steps and a long-term fix. Use markdown headings."
)


def load_env() -> dict:
    if not ENV_PATH.exists():
        return {}
    values = {}
    for line in ENV_PATH.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.split("#")[0].strip()
    return values


def request(method: str, url: str, key: str, payload=None, timeout=PROBE_TIMEOUT):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, json.loads(res.read() or b"null")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode(errors="replace")[:200]
    except Exception as exc:
        return 0, f"{type(exc).__name__}: {exc}"


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only = ""
    for a in sys.argv[1:]:
        if a.startswith("--models"):
            only = a.partition("=")[2] or (args.pop() if args else "")

    env = load_env()
    base = (args[0] if args else "") or os.getenv("LLM_GATEWAY_BASE_URL") or env.get("LLM_GATEWAY_BASE_URL", "")
    key = (args[1] if len(args) > 1 else "") or os.getenv("LLM_GATEWAY_API_KEY") or env.get("LLM_GATEWAY_API_KEY", "")
    base = base.rstrip("/")

    if not base or not key:
        print("Need a base URL and an API key. Set LLM_GATEWAY_BASE_URL and")
        print("LLM_GATEWAY_API_KEY in backend/.env, or pass them as arguments.")
        return 2
    if not base.endswith("/v1"):
        print(f"  note: base URL does not end in /v1 ({base}) — most gateways need it.\n")

    print(f"  gateway : {base}")
    print(f"  key     : ...{key[-4:]} (len {len(key)})\n")

    # ── Which models does this key actually have? ──
    candidates = [m.strip() for m in only.split(",") if m.strip()]
    advertised = []
    if not candidates:
        status, body = request("GET", f"{base}/models", key, timeout=30)
        if status == 200 and isinstance(body, dict):
            advertised = [m.get("id", "") for m in body.get("data", []) if m.get("id")]
            candidates = list(advertised)
            print(f"  /models -> 200, {len(candidates)} model(s) advertised")
        else:
            print(f"  /models -> {status}: {body}")
            print("  Gateway does not list models. Re-run with --models=id1,id2 to test ids directly.")
            return 1

    configured = os.getenv("LLM_GATEWAY_MODEL") or env.get("LLM_GATEWAY_MODEL", "")
    if configured and advertised and configured not in advertised:
        print(f"  WARNING: LLM_GATEWAY_MODEL={configured} is not in the advertised list.")
    # Embedding models do not answer /chat/completions; testing them there only
    # produces noise in the table.
    chat_candidates = [m for m in candidates if "embed" not in m.lower()]
    if len(chat_candidates) > 12 and not only:
        print(f"  Testing the first 12 of {len(chat_candidates)} chat model(s); use --models= to choose others.")
        chat_candidates = chat_candidates[:12]
    candidates = chat_candidates

    # ── Does each one answer, how slowly, and how much did it emit? ──
    print(f"\n  {'model':<40} {'status':<7} {'secs':>6} {'out tok':>8}  note")
    print(f"  {'-' * 40} {'-' * 7} {'-' * 6} {'-' * 8}  {'-' * 22}")
    working = []
    for model in candidates:
        started = time.time()
        status, body = request(
            "POST",
            f"{base}/chat/completions",
            key,
            {"model": model, "messages": [{"role": "user", "content": PROMPT}], "temperature": 0},
        )
        elapsed = time.time() - started
        out_tokens = ""
        note = ""
        if status == 200:
            try:
                note = (body["choices"][0]["message"]["content"] or "")[:22].replace("\n", " ")
                # Output tokens drive cost on almost every provider, and a model
                # that emits its whole reasoning trace can cost several times a
                # terser one at the same advertised price.
                out_tokens = (body.get("usage") or {}).get("completion_tokens", "") or ""
                working.append((model, elapsed, out_tokens))
            except Exception:
                status, note = 0, "200 but malformed payload"
        else:
            note = (body if isinstance(body, str) else json.dumps(body))[:60].replace("\n", " ")
        print(f"  {model[:40]:<40} {status:<7} {elapsed:>6.1f} {str(out_tokens):>8}  {note}")

    # ── Embeddings are a separate capability; most gateways lack them ──
    # Probing with a chat model id would report "chat-only" for a gateway that
    # does support embeddings under a proper embedding id, so try the ids that
    # look like embedding models first.
    embed_candidates = [m for m in advertised if "embed" in m.lower()]
    embed_candidates += [
        m for m in ("text-embedding-3-small", "text-embedding-ada-002")
        if m not in embed_candidates
    ]
    embed_result = None
    for model in embed_candidates:
        status, body = request(
            "POST", f"{base}/embeddings", key, {"model": model, "input": "healthcheck"}, timeout=30
        )
        if status == 200 and isinstance(body, dict) and body.get("data"):
            embed_result = (model, len(body["data"][0].get("embedding", [])))
            break

    if embed_result:
        model, width = embed_result
        print(f"\n  /embeddings -> 200 with '{model}', vector width {width}")
        print(f"    LLM_GATEWAY_EMBED_MODEL={model}")
        print("  Note: changing this later starts a new Chroma collection, so previously")
        print("  indexed incidents are not retrievable until they are re-indexed.")
    else:
        print(f"\n  /embeddings -> unavailable (tried {len(embed_candidates)} id(s); chat-only is normal)")
        print("  Leave LLM_GATEWAY_EMBED_MODEL empty; embeddings stay on the local hashing")
        print("  fallback, which is lexical rather than semantic but needs no quota.")

    if not working:
        print("\n  No model answered. Nothing to configure yet.")
        return 1

    working.sort(key=lambda row: row[1])
    print("\n  Reachable models, fastest first:")
    for model, elapsed, out_tokens in working:
        tokens = f", {out_tokens} out tok" if out_tokens else ""
        print(f"    {model}  ({elapsed:.1f}s{tokens})")

    slowest = working[-1][1]
    if slowest > 45:
        print(f"\n  Slowest reachable model took {slowest:.0f}s. Keep LLM_TIMEOUT_SECONDS")
        print("  comfortably above that — a per-attempt timeout below the real")
        print("  response time reads as 'every model failed'.")

    primary = working[0][0]
    backups = ",".join(m for m, _, _ in working[1:4])
    print("\n  Suggested backend/.env (ORDERED BY SPEED, NOT BY COST):")
    print(f"    LLM_GATEWAY_BASE_URL={base}")
    print(f"    LLM_GATEWAY_MODEL={primary}")
    if backups:
        print(f"    LLM_GATEWAY_FALLBACK_MODELS={backups}")
    print("\n  Check the price of these before committing to them. The OpenAI protocol")
    print("  exposes no pricing, so this script cannot see it, and on a credit-billed")
    print("  gateway the fastest responder is often a flagship model costing 100x a")
    print("  flash-class one for the same job. Compare against your gateway's own")
    print("  pricing page, and prefer a cheap model that returns all the sections the")
    print("  narrative needs over an expensive one that returns them faster.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
