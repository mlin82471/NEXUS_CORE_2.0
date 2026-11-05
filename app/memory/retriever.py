"""
NEXUS CORE 2.0 — Experience Retriever & Memory Augmentation Engine (§3 & §M3)
Searches prior task execution experiences, failure root-causes, and knowledge snippets
to empower the Planner and Agents with continuous learning:
- Reuses proven successful execution structures
- Injects failure prevention guardrails
"""
import re
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models import TaskExperience, KnowledgeItem


class MemoryContext(BaseModel):
    has_memory: bool = False
    best_practice_hints: List[str] = Field(default_factory=list)
    failure_warnings: List[str] = Field(default_factory=list)
    recommended_roles: List[str] = Field(default_factory=list)
    knowledge_snippets: List[str] = Field(default_factory=list)
    prompt_injection: str = ""


# Stopwords to filter out for keyword matching
STOPWORDS = {
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
    "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
    "自己", "这", "请", "写", "帮我", "使用", "做", "并", "给", "用", "the", "a",
    "an", "and", "or", "in", "on", "at", "to", "for", "with", "is", "are"
}


def _extract_keywords(text: str) -> List[str]:
    """Extracts distinctive keywords from goal string (bilingual English + Chinese n-grams)."""
    text = (text or "").lower()
    # 1. Alphanumeric English words
    latin_words = [w for w in re.findall(r"[a-z0-9_]{2,}", text) if w not in STOPWORDS]

    # 2. Chinese 2-character and 3-character n-grams
    chinese_chars = re.findall(r"[\u4e00-\u9fff]", text)
    chinese_ngrams = []
    if chinese_chars:
        for i in range(len(chinese_chars) - 1):
            gram2 = "".join(chinese_chars[i:i+2])
            if gram2 not in STOPWORDS:
                chinese_ngrams.append(gram2)
        for i in range(len(chinese_chars) - 2):
            gram3 = "".join(chinese_chars[i:i+3])
            chinese_ngrams.append(gram3)

    combined = []
    seen = set()
    for item in latin_words + chinese_ngrams:
        if item not in seen and len(item) >= 2:
            seen.add(item)
            combined.append(item)
    return combined[:10]


def retrieve_relevant_memory(
    db: Session,
    goal: str,
    task_type: str = "general",
    max_records: int = 3,
) -> MemoryContext:
    """
    Retrieves historical experiences and knowledge related to the current goal.
    Synthesizes actionable advice and failure warnings.
    """
    keywords = _extract_keywords(goal)
    if not keywords:
        return MemoryContext(has_memory=False)

    # 1. Search TaskExperience
    query = db.query(TaskExperience)
    conditions = []
    for kw in keywords:
        conditions.append(TaskExperience.goal.ilike(f"%{kw}%"))
    
    matched_exps = query.filter(or_(*conditions)).order_by(TaskExperience.created_at.desc()).limit(max_records * 2).all()

    best_practices = []
    failure_warnings = []
    recommended_roles = []

    for exp in matched_exps:
        if exp.status == "success":
            if exp.lessons_learned and exp.lessons_learned not in best_practices:
                best_practices.append(exp.lessons_learned)
            for s in exp.plan_summary or []:
                role = s.get("role")
                if role and role not in recommended_roles:
                    recommended_roles.append(role)
        elif exp.status in ("failed", "partial"):
            for fr in exp.failure_reasons or []:
                desc = f"[{fr.get('cause', 'ERROR')}]: {fr.get('detail', '')}" if isinstance(fr, dict) else str(fr)
                if desc not in failure_warnings:
                    failure_warnings.append(desc)
            if exp.lessons_learned and exp.lessons_learned not in failure_warnings:
                failure_warnings.append(exp.lessons_learned)

    # 2. Search KnowledgeItem
    k_conditions = []
    for kw in keywords:
        k_conditions.append(KnowledgeItem.key.ilike(f"%{kw}%"))
        k_conditions.append(KnowledgeItem.content.ilike(f"%{kw}%"))

    matched_knowledge = db.query(KnowledgeItem).filter(or_(*k_conditions)).limit(2).all()
    k_snippets = [k.content[:400] for k in matched_knowledge]

    has_mem = bool(best_practices or failure_warnings or k_snippets)
    
    # 3. Format Prompt Injection Block
    injection_parts = []
    if best_practices:
        injection_parts.append("### 🧠 历史成功经验 (Proven Patterns):")
        for bp in best_practices[:2]:
            injection_parts.append(f"- {bp}")

    if failure_warnings:
        injection_parts.append("### ⚠️ 历史踩坑与失败预警 (Failure Prevention):")
        for fw in failure_warnings[:2]:
            injection_parts.append(f"- {fw}")

    if k_snippets:
        injection_parts.append("### 📚 沉淀知识参考 (Knowledge Snippets):")
        for ks in k_snippets[:2]:
            injection_parts.append(f"```\n{ks}\n```")

    prompt_inj = "\n".join(injection_parts) if injection_parts else ""

    return MemoryContext(
        has_memory=has_mem,
        best_practice_hints=best_practices[:3],
        failure_warnings=failure_warnings[:3],
        recommended_roles=recommended_roles[:3],
        knowledge_snippets=k_snippets,
        prompt_injection=prompt_inj,
    )
