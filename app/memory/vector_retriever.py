"""
NEXUS CORE 2.0 — Hybrid Semantic Vector Retriever (§3 & §M3)
Combines dense vector embeddings (cosine similarity) with sparse keyword matching
using Reciprocal Rank Fusion (RRF) for enhanced memory recall across task experiences
and lessons learned.
"""
import math
import hashlib
import re
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session

from app.models import TaskExperience, KnowledgeItem
from app.config import settings
from app.memory.retriever import _extract_keywords


def _compute_deterministic_embedding(text: str, dim: int = 256) -> List[float]:
    """
    Computes a deterministic dense normalized subword hash embedding vector.
    Zero external dependencies, fast, deterministic, and language-agnostic.
    """
    if not text:
        return [0.0] * dim

    vec = [0.0] * dim
    clean_text = text.lower().strip()

    # 1. Word tokens & character n-grams (1, 2, 3 chars)
    tokens = re.findall(r"[\w\u4e00-\u9fff]+", clean_text)
    features = list(tokens)

    # Character n-grams for capturing subword semantics
    for t in tokens:
        if len(t) > 1:
            for i in range(len(t) - 1):
                features.append(t[i:i+2])
        if len(t) > 2:
            for i in range(len(t) - 2):
                features.append(t[i:i+3])

    if not features:
        return [0.0] * dim

    # 2. Hash features into vector dimensions with Murmur/MD5 hash
    for feat in features:
        h = int(hashlib.md5(feat.encode("utf-8")).hexdigest()[:8], 16)
        idx = h % dim
        sign = 1.0 if (h & 0x10) else -1.0
        vec[idx] += sign

    # 3. L2 Normalization
    norm_sq = sum(x * x for x in vec)
    if norm_sq > 0:
        norm = math.sqrt(norm_sq)
        return [x / norm for x in vec]
    return vec


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Computes cosine similarity between two unit vectors."""
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    dot = sum(a * b for a, b in zip(vec1, vec2))
    return max(-1.0, min(1.0, dot))


def hybrid_search_experiences(
    db: Session,
    query_text: str,
    top_k: int = 5,
    rrf_k: int = 60
) -> List[Dict[str, Any]]:
    """
    Performs hybrid retrieval over TaskExperience:
    1. Sparse keyword rank
    2. Dense vector cosine similarity rank
    3. Fused with Reciprocal Rank Fusion (RRF)
    """
    if not query_text.strip():
        return []

    experiences = db.query(TaskExperience).order_by(TaskExperience.created_at.desc()).limit(100).all()
    if not experiences:
        return []

    # 1. Sparse keyword ranking with bilingual tokenization
    query_words = set(_extract_keywords(query_text))
    keyword_scores = []
    for exp in experiences:
        target_text = f"{exp.goal or ''} {exp.lessons_learned or ''}".lower()
        matches = sum(1 for w in query_words if w.lower() in target_text)
        keyword_scores.append((exp, matches))

    # Sort descending by keyword matches
    keyword_scores.sort(key=lambda x: x[1], reverse=True)
    sparse_ranks = {exp.id: rank for rank, (exp, _) in enumerate(keyword_scores)}

    # 2. Dense vector cosine ranking
    query_vec = _compute_deterministic_embedding(query_text)
    vector_scores = []
    for exp in experiences:
        target_text = f"{exp.goal or ''} {exp.lessons_learned or ''}"
        target_vec = _compute_deterministic_embedding(target_text)
        sim = cosine_similarity(query_vec, target_vec)
        vector_scores.append((exp, sim))

    # Sort descending by cosine similarity
    vector_scores.sort(key=lambda x: x[1], reverse=True)
    dense_ranks = {exp.id: rank for rank, (exp, _) in enumerate(vector_scores)}
    dense_sim_map = {exp.id: sim for exp, sim in vector_scores}

    # 3. Reciprocal Rank Fusion (RRF)
    rrf_results = []
    for exp in experiences:
        s_rank = sparse_ranks.get(exp.id, 999)
        d_rank = dense_ranks.get(exp.id, 999)
        rrf_score = (1.0 / (rrf_k + s_rank + 1)) + (1.0 / (rrf_k + d_rank + 1))
        
        rrf_results.append({
            "experience_id": exp.id,
            "task_id": exp.task_id,
            "goal": exp.goal,
            "status": exp.status,
            "lessons_learned": exp.lessons_learned,
            "failure_reasons": exp.failure_reasons,
            "plan_summary": exp.plan_summary,
            "cosine_similarity": round(dense_sim_map.get(exp.id, 0.0), 4),
            "sparse_rank": s_rank,
            "dense_rank": d_rank,
            "rrf_score": round(rrf_score, 6),
        })

    # Sort by final RRF score
    rrf_results.sort(key=lambda x: x["rrf_score"], reverse=True)
    return rrf_results[:top_k]
