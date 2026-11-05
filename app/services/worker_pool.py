"""
Background Worker Pool and Task Event Streaming Engine for NEXUS CORE 2.0.
Provides:
1. Async background thread worker pool for non-blocking task execution.
2. In-memory and DB-backed pub/sub channel for Server-Sent Events (SSE).
3. Thread-safe task cancellation registry.
"""
import asyncio
import json
import time
import threading
from typing import Dict, Any, AsyncGenerator, Optional
from concurrent.futures import ThreadPoolExecutor

from app.database import SessionLocal
from app.models import Task, PlanStep, TaskEvent
from app.services.scheduler import execute_plan

# Maximum 8 concurrent worker threads
_EXECUTOR = ThreadPoolExecutor(max_workers=8, thread_name_prefix="nexus_worker_")

# Cancellation events per task_id
_CANCEL_EVENTS: Dict[str, threading.Event] = {}

# Active SSE subscriber queues per task_id: task_id -> list of asyncio.Queue
_SUBSCRIBERS: Dict[str, list[asyncio.Queue]] = {}
_SUBSCRIBERS_LOCK = threading.Lock()

_SESSION_FACTORY = None

def get_session():
    if _SESSION_FACTORY is not None:
        return _SESSION_FACTORY()
    return SessionLocal()

def set_session_factory(factory):
    global _SESSION_FACTORY
    _SESSION_FACTORY = factory



def get_cancel_event(task_id: str) -> threading.Event:
    if task_id not in _CANCEL_EVENTS:
        _CANCEL_EVENTS[task_id] = threading.Event()
    return _CANCEL_EVENTS[task_id]


def cancel_task(task_id: str) -> bool:
    """Signals cancellation to running task."""
    evt = _CANCEL_EVENTS.get(task_id)
    if evt:
        evt.set()
        return True
    return False


def broadcast_task_event(task_id: str, event_type: str, data: Dict[str, Any]):
    """Thread-safe event broadcast to all active SSE subscribers."""
    with _SUBSCRIBERS_LOCK:
        queues = _SUBSCRIBERS.get(task_id, [])
        payload = {
            "task_id": task_id,
            "event_type": event_type,
            "timestamp": time.time(),
            "data": data,
        }
        for q in queues:
            try:
                q.put_nowait(payload)
            except Exception:
                pass


def submit_task_execution(task_id: str, approval_token: Optional[str] = None):
    """
    Submits a task for non-blocking asynchronous execution in the worker pool.
    """
    cancel_evt = get_cancel_event(task_id)
    cancel_evt.clear()

    def _worker():
        db = get_session()
        try:
            task = db.get(Task, task_id)
            if not task or task.status not in ("queued", "running"):
                return

            broadcast_task_event(task_id, "task_started", {
                "status": "running",
                "goal": task.goal,
                "complexity": task.complexity,
            })

            # Run scheduler
            execute_plan(db, task, cancel_event=cancel_evt)
            db.refresh(task)

            broadcast_task_event(task_id, "task_finished", {
                "status": task.status,
                "result": (task.result or "")[:500],
                "steps": [{
                    "step_key": s.step_key,
                    "status": s.status,
                    "role": s.role,
                    "result": (s.result or "")[:300]
                } for s in task.steps]
            })
        except Exception as exc:
            broadcast_task_event(task_id, "task_error", {
                "error": str(exc),
                "status": "failed",
            })
        finally:
            db.close()
            # Clean up cancel event
            _CANCEL_EVENTS.pop(task_id, None)

    _EXECUTOR.submit(_worker)


async def sse_event_stream(task_id: str) -> AsyncGenerator[str, None]:
    """
    Generates Server-Sent Events (SSE) formatted text stream for task_id.
    First emits historical events from DB, then streams live events as they happen.
    """
    q: asyncio.Queue = asyncio.Queue()

    with _SUBSCRIBERS_LOCK:
        if task_id not in _SUBSCRIBERS:
            _SUBSCRIBERS[task_id] = []
        _SUBSCRIBERS[task_id].append(q)

    # 1. Emit historical events from DB
    db = get_session()
    task_done = False
    try:
        task = db.get(Task, task_id)
        if task:
            for ev in task.events:
                yield f"event: {ev.event_type}\ndata: {json.dumps({'message': ev.message, 'payload': ev.payload, 'created_at': str(ev.created_at)})}\n\n"
            if task.status in ("success", "partial", "failed", "cancelled"):
                task_done = True
                yield f"event: task_finished\ndata: {json.dumps({'status': task.status, 'result': (task.result or '')[:500]})}\n\n"
    finally:
        db.close()

    if task_done:
        # Task already finished, close SSE stream
        with _SUBSCRIBERS_LOCK:
            if task_id in _SUBSCRIBERS and q in _SUBSCRIBERS[task_id]:
                _SUBSCRIBERS[task_id].remove(q)
        return

    # 2. Stream live events
    try:
        while True:
            try:
                # Wait for next event or timeout for heartbeat
                item = await asyncio.wait_for(q.get(), timeout=2.0)
                event_name = item.get("event_type", "message")
                data_str = json.dumps(item.get("data", {}), ensure_ascii=False)
                yield f"event: {event_name}\ndata: {data_str}\n\n"

                if event_name in ("task_finished", "task_error", "task_cancelled"):
                    break
            except asyncio.TimeoutError:
                # Send SSE keep-alive comment
                yield ": keepalive heartbeat\n\n"
    finally:
        with _SUBSCRIBERS_LOCK:
            if task_id in _SUBSCRIBERS and q in _SUBSCRIBERS[task_id]:
                _SUBSCRIBERS[task_id].remove(q)
