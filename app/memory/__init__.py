"""
NEXUS CORE 2.0 — Memory Module
M3 Long-term Memory & Continuous Learning System (§3 & §M3).
"""
from app.memory.distiller import distill_task_experience
from app.memory.retriever import retrieve_relevant_memory, MemoryContext
from app.memory.knowledge import save_knowledge_snippet, list_knowledge_items

__all__ = [
    "distill_task_experience",
    "retrieve_relevant_memory",
    "MemoryContext",
    "save_knowledge_snippet",
    "list_knowledge_items",
]
