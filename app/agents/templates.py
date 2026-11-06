"""
NEXUS CORE 2.1 — Built-in Agent Role Templates (§AGENT-TEMPLATES).
Provides pre-tuned templates for immediate creation without complex manual prompt tuning.
"""

from typing import Dict, List
from app.agents.schemas import AgentRole, AgentTemplate, PermissionLevel

BUILTIN_TEMPLATES: Dict[str, AgentTemplate] = {
    "tpl-planner": AgentTemplate(
        template_id="tpl-planner",
        name="Architecture & Task Planner",
        display_title="任务规划与架构师",
        role=AgentRole.PLANNER,
        description="负责将高维目标分解为确定性 DAG 拓扑，制定验收准则并分配预算。",
        recommended_model="deepseek-reasoner",
        default_budget_tokens=45000,
        default_permission_level=PermissionLevel.SUPERVISED,
        recommended_tools=["read_data", "reason", "plan_dag", "estimate_budget"],
        system_prompt_preview=(
            "你是一个高精度系统架构规划专家。将复杂任务拆分为原子子任务，"
            "杜绝无效多 Agent，明确每个环节的输入、输出契约与验收准则。"
        ),
    ),
    "tpl-coder": AgentTemplate(
        template_id="tpl-coder",
        name="Full-Stack Coding Engineer",
        display_title="全栈代码工程专家",
        role=AgentRole.CODING,
        description="基于需求与验收标准编写生产级代码，严格接受 AST 语法检查与独立验证。",
        recommended_model="deepseek-chat",
        default_budget_tokens=35000,
        default_permission_level=PermissionLevel.SUPERVISED,
        recommended_tools=["read_files", "write_files", "execute_cmd", "code_analysis"],
        system_prompt_preview=(
            "你是一个严谨的软件开发工程师。编写符合 PEP 8 / TypeScript 规范的高质量代码，"
            "优先考虑异常处理与边界防御，输出必须包含完整可运行实现。"
        ),
    ),
    "tpl-reviewer": AgentTemplate(
        template_id="tpl-reviewer",
        name="4-Tier Independent Code Reviewer",
        display_title="4层独立代码审查员",
        role=AgentRole.VERIFICATION,
        description="不轻信 Agent 自报成功，独立开展结构、静态安全、动态测试与业务契约 4 级核验。",
        recommended_model="deepseek-reasoner",
        default_budget_tokens=25000,
        default_permission_level=PermissionLevel.STRICT,
        recommended_tools=["read_files", "ast_parse", "security_lint", "run_test_sandbox"],
        system_prompt_preview=(
            "你是一个中立的质量保障与代码安全审查官。审查代码时严格检查类型完备性、"
            "凭据泄漏隐患、未捕获异常与契约符合度，不因生成代码篇幅长而放宽标准。"
        ),
    ),
    "tpl-rca": AgentTemplate(
        template_id="tpl-rca",
        name="Root Cause Analysis Expert",
        display_title="故障根因诊断专家",
        role=AgentRole.ANALYSIS,
        description="分析崩溃日志、系统遥测与 Traceback，推导核心假设并输出结构化 RCA 归因。",
        recommended_model="qwen-max",
        default_budget_tokens=30000,
        default_permission_level=PermissionLevel.STRICT,
        recommended_tools=["read_logs", "telemetry_inspect", "pattern_match", "reason"],
        system_prompt_preview=(
            "你是一个资深分布式系统故障排查专家。根据日志与指标推导根因，"
            "量化推断置信度，给出明确的问题定位与修复前置依赖。"
        ),
    ),
    "tpl-sre": AgentTemplate(
        template_id="tpl-sre",
        name="Autonomous SRE & Self-Healing Agent",
        display_title="自主运维与自愈专家",
        role=AgentRole.SRE_OPS,
        description="感知运行异常，制定 L0~L3 修复计划并在审批门禁与影子模式下安全自愈。",
        recommended_model="deepseek-chat",
        default_budget_tokens=40000,
        default_permission_level=PermissionLevel.SUPERVISED,
        recommended_tools=["system_ops", "service_restart", "config_patch", "health_check"],
        system_prompt_preview=(
            "你是一个生产高可用 SRE 工程师。所有修复操作严格评估风险等级，"
            "高风险操作必须等待操作批准，严格遵守回滚预案与前置健康核验。"
        ),
    ),
    "tpl-researcher": AgentTemplate(
        template_id="tpl-researcher",
        name="Deep Knowledge Researcher",
        display_title="深度知识检索与调研员",
        role=AgentRole.RESEARCH,
        description="聚合技术文档、开源代码库与历史经验，为任务团队提供前置背景上下文。",
        recommended_model="gemini-2.0-flash",
        default_budget_tokens=20000,
        default_permission_level=PermissionLevel.STRICT,
        recommended_tools=["read_data", "search", "summarize", "vector_retrieve"],
        system_prompt_preview=(
            "你是一个敏锐的技术研究员。提炼最准确的关键信息与技术方案选型对比，"
            "剔除无关冗余，为决策提供事实依据。"
        ),
    ),
    "tpl-custom": AgentTemplate(
        template_id="tpl-custom",
        name="Custom Agile Agent",
        display_title="自定义敏捷 Agent",
        role=AgentRole.CUSTOM,
        description="从零自定义角色、系统提示词、工具权限与模型路由策略。",
        recommended_model="deepseek-chat",
        default_budget_tokens=30000,
        default_permission_level=PermissionLevel.SUPERVISED,
        recommended_tools=["read_data", "reason"],
        system_prompt_preview="根据具体业务需求配置自定义提示词。",
    ),
}


def list_templates() -> List[AgentTemplate]:
    """Returns all available builtin agent templates."""
    return list(BUILTIN_TEMPLATES.values())


def get_template(template_id: str) -> AgentTemplate:
    """Returns a specific template or raises KeyError."""
    if template_id not in BUILTIN_TEMPLATES:
        raise KeyError(f"Template {template_id} not found")
    return BUILTIN_TEMPLATES[template_id]
