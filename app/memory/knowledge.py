"""
NEXUS CORE 2.0 — Structured Knowledge Management (§3 & §M3)
Stores curated snippets, engineering guidelines, and proven code templates.
"""
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.models import KnowledgeItem


def save_knowledge_snippet(
    db: Session,
    key: str,
    content: str,
    category: Optional[str] = None,
    tags: Optional[List[str]] = None,
    source_task_id: Optional[str] = None,
) -> KnowledgeItem:
    """Creates or updates a persistent knowledge snippet."""
    existing = db.query(KnowledgeItem).filter(KnowledgeItem.key == key).first()
    if existing:
        existing.content = content
        if category:
            existing.category = category
        if tags is not None:
            existing.tags = tags
        existing.usage_count = (existing.usage_count or 0) + 1
        db.commit()
        db.refresh(existing)
        return existing

    item = KnowledgeItem(
        key=key,
        category=category or "general",
        content=content,
        tags=tags or [],
        source_task_id=source_task_id,
        usage_count=1,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_knowledge_items(
    db: Session,
    category: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Lists knowledge snippets with optional category filtering."""
    q = db.query(KnowledgeItem)
    if category:
        q = q.filter(KnowledgeItem.category == category)
    items = q.order_by(KnowledgeItem.created_at.desc()).limit(limit).all()
    return [{
        "id": it.id,
        "key": it.key,
        "category": it.category,
        "content": it.content,
        "tags": it.tags,
        "source_task_id": it.source_task_id,
        "usage_count": it.usage_count,
        "created_at": it.created_at.isoformat() if it.created_at else None,
    } for it in items]
