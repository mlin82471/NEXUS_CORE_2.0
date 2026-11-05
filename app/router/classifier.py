"""
NEXUS CORE 2.0 — Task Classifier & Complexity Assessor (§4 & §M2)
Enforces the core design principle: '不能为了多Agent而多Agent'.
Categorizes tasks into:
- SIMPLE: 1 agent, 0 DAG overhead, direct execution.
- SINGLE_EXPERT: 1 specialized agent + optional 1 verifier.
- COMPLEX: Multi-agent orchestrated pipeline (max 3 parallel agents, depth <= 2, retry <= 1).
"""
import re
from enum import Enum
from typing import Dict, Any, List
from pydantic import BaseModel, Field


class TaskComplexity(str, Enum):
    SIMPLE = "simple"
    SINGLE_EXPERT = "single_expert"
    COMPLEX = "complex"


class TaskClassification(BaseModel):
    complexity: TaskComplexity
    reason: str
    suggested_max_steps: int = Field(default=1, ge=1, le=10)
    suggested_max_agents: int = Field(default=1, ge=1, le=5)
    suggested_max_parallel: int = Field(default=1, ge=1, le=3)
    suggested_max_replans: int = Field(default=0, ge=0, le=1)
    needs_multi_agent: bool = False
    primary_role: str = "general"
    required_roles: List[str] = Field(default_factory=list)


# Keywords indicating simple immediate tasks
SIMPLE_KEYWORDS = [
    "计算", "算一下", "formula", "calculate", "1+1", "2+", "求和",
    "翻译", "translate", "解释词汇", "meaning of", "define",
    "是什么", "what is", "首都", "capital of", "你好", "hello", "hi",
    "查一下", "常识", "trivia", "ping", "echo"
]

# Keywords indicating complex cross-disciplinary multi-agent workflows
COMPLEX_KEYWORDS = [
    "研究并开发", "调研并实现", "比较不同架构", "方案选型并测试",
    "全流程", "端到端", "从零设计并实现", "系统架构与落地",
    "design and implement", "research and develop", "benchmark and compare",
    "综合对比", "架构重构", "微服务体系", "全链路"
]

# Single expert domain triggers
DOMAIN_ROLE_MAP = {
    "coding": ["写代码", "实现", "写一个", "编写", "bug", "函数", "算法", "class", "function", "coding", "code", "重构"],
    "analysis": ["分析", "排查", "诊断", "日志", "性能瓶颈", "analyze", "profile", "investigate"],
    "research": ["调研", "研究", "综述", "文献", "趋势", "survey", "overview", "compare"],
    "execution": ["部署", "执行命令", "脚本运行", "deploy", "run script", "bash", "shell"],
    "knowledge": ["知识库", "总结文档", "整理笔记", "faq", "knowledge base", "summarize docs"],
}


def classify_task(goal: str, task_type: str = "general") -> TaskClassification:
    """
    Deterministic rule-based task complexity classifier with strict cost bounds.
    """
    text = (goal or "").strip().lower()
    length = len(text)

    # 1. Simple Task Check
    # Very short goals, pure calculations, or common definition questions
    is_simple_keyword = any(kw in text for kw in SIMPLE_KEYWORDS)
    is_arithmetic = bool(re.search(r"^\s*[\d\s\+\-\*\/\(\)\.\^\%]+\s*$", text))
    
    if (is_simple_keyword and length < 60) or is_arithmetic or (length < 15 and "写" not in text and "设计" not in text):
        return TaskClassification(
            complexity=TaskComplexity.SIMPLE,
            reason="Goal is concise calculation, definition, or direct factual query; single agent sufficient.",
            suggested_max_steps=1,
            suggested_max_agents=1,
            suggested_max_parallel=1,
            suggested_max_replans=0,
            needs_multi_agent=False,
            primary_role="analysis" if task_type == "general" else task_type,
            required_roles=[task_type if task_type != "general" else "analysis"],
        )

    # 2. Complex Task Check
    # Cross-domain multi-stage tasks explicitly requiring research + design + implementation + test
    is_complex_keyword = any(kw in text for kw in COMPLEX_KEYWORDS)
    matched_domains = [role for role, kws in DOMAIN_ROLE_MAP.items() if any(kw in text for kw in kws)]

    if is_complex_keyword or (len(matched_domains) >= 3 and length > 40):
        # M0 Blueprint Limit: Complex tasks <= 3 parallel agents, depth <= 2, max 1 retry
        roles = matched_domains[:3]
        if "verification" not in roles:
            roles.append("verification")
        return TaskClassification(
            complexity=TaskComplexity.COMPLEX,
            reason="Goal involves multi-phase cross-functional orchestration (e.g. research, coding, verification).",
            suggested_max_steps=4,
            suggested_max_agents=3,
            suggested_max_parallel=2,
            suggested_max_replans=1,
            needs_multi_agent=True,
            primary_role="coding" if "coding" in roles else roles[0],
            required_roles=roles[:3],
        )

    # 3. Single Expert Task (Default)
    # One dominant domain task (e.g. write an algorithm, inspect a log) + optional verification
    primary = task_type if task_type in DOMAIN_ROLE_MAP else (matched_domains[0] if matched_domains else "coding")
    req_roles = [primary]
    if primary in ("coding", "execution"):
        req_roles.append("verification")

    return TaskClassification(
        complexity=TaskComplexity.SINGLE_EXPERT,
        reason=f"Goal focused on single primary domain ({primary}) with targeted verification.",
        suggested_max_steps=2,
        suggested_max_agents=2,
        suggested_max_parallel=1,
        suggested_max_replans=1,
        needs_multi_agent=len(req_roles) > 1,
        primary_role=primary,
        required_roles=req_roles,
    )
