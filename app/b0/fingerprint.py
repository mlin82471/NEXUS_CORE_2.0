"""
NEXUS CORE 2.0 — B0 AgentRun Fingerprint and Request Consistency (§11)
"""
import hashlib
import json
import unicodedata
from typing import Any, Mapping, Sequence

class FingerprintConflictError(Exception):
    """Raised when an execution_id is replayed with a mismatched request payload."""
    pass

def canonical_json(obj: Any) -> str:
    """Serialize object into a deterministic canonical JSON string (§11.1).
    - Keys are sorted lexicographically at all nesting levels.
    - No whitespace around separators: (',', ':').
    - Unicode strings normalized to NFC form.
    - ensure_ascii=False for strict UTF-8 deterministic representation.
    """
    def _normalize_item(v: Any) -> Any:
        if isinstance(v, str):
            return unicodedata.normalize("NFC", v)
        if isinstance(v, dict):
            return {unicodedata.normalize("NFC", str(k)): _normalize_item(val) for k, val in v.items()}
        if isinstance(v, (list, tuple)):
            return [_normalize_item(x) for x in v]
        return v

    norm_obj = _normalize_item(obj)
    return json.dumps(norm_obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

def compute_request_fingerprint(
    goal: str,
    context: Mapping[str, Any] | None = None,
    role: str | None = None,
    required_permissions: Sequence[str] | None = None,
) -> str:
    """Compute deterministic SHA256 request fingerprint per §11.1.
    All execution parameters are unified into a single canonical dictionary
    to eliminate delimiter ambiguity.
    """
    payload = {
        "context": dict(context or {}),
        "goal": goal.strip(),
        "required_permissions": sorted(required_permissions or []),
        "role": str(role or ""),
    }
    canonical_repr = canonical_json(payload)
    return hashlib.sha256(canonical_repr.encode("utf-8")).hexdigest()

def verify_replay_match(stored_fingerprint: str, incoming_fingerprint: str) -> bool:
    """Verify request fingerprint on execution_id replay per §11.2.
    Returns True on exact match (idempotent replay).
    Raises FingerprintConflictError on mismatch (request conflict / tampering).
    """
    if stored_fingerprint == incoming_fingerprint:
        return True
    raise FingerprintConflictError(
        f"Fingerprint conflict on execution replay: stored={stored_fingerprint}, incoming={incoming_fingerprint}"
    )
