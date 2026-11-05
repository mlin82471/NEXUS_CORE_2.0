"""
NEXUS CORE 2.0 — Empirical Benchmark Suite (§7 Acceptance Verification)
Runs real-world benchmark tasks across Simple, Single-Expert, Complex, and Edge-Case categories.
Executes both Single Agent and Multi-Agent modes to evaluate token efficiency, latency,
and architectural necessity per Chapter 7 of NEXUS CORE 2.0 Project Blueprint.
"""
import sys
import os
import time
import json
import pathlib
import argparse

# Line buffering for immediate console output
sys.stdout.reconfigure(line_buffering=True)

# Ensure workspace root in sys.path
WORKSPACE_ROOT = pathlib.Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from app.config import settings
from app.database import SessionLocal
from app.benchmark.comparator import run_ab_comparison
from app.services.registry import seed_default_agents

CURATED_8_TASKS = [
    # ---- 1. SIMPLE TASKS (预期：单 Agent 绝对优势，验证避免多 Agent 冗余) ----
    {
        "id": "BM-01",
        "category": "SIMPLE",
        "task_type": "general",
        "goal": "计算 123456 * 654321 的精确乘积数值",
        "expected_mode": "use_single_agent",
        "description": "简单基础算术，测试系统是否能识别简单任务并阻断冗余多 Agent DAG 拆分"
    },
    {
        "id": "BM-02",
        "category": "SIMPLE",
        "task_type": "knowledge",
        "goal": "简要解释 HTTP 状态码 401 Unauthorized 与 403 Forbidden 的核心区别",
        "expected_mode": "use_single_agent",
        "description": "基础知识问答，测试是否直接通过单 Agent 直达返回，零规划延迟"
    },

    # ---- 2. SINGLE EXPERT TASKS (预期：单专家完成，低额外开销) ----
    {
        "id": "BM-03",
        "category": "SINGLE_EXPERT",
        "task_type": "coding",
        "goal": "编写一个 Python 函数，计算平面直角坐标系中两点间的欧几里得距离，并对输入异常做防御性断言",
        "expected_mode": "use_single_agent",
        "description": "单函数代码编写，测试代码专家执行与独立轻量验证"
    },
    {
        "id": "BM-04",
        "category": "SINGLE_EXPERT",
        "task_type": "analysis",
        "goal": "分析一段缺少联合索引的高频 SQL 查询慢日志，给出 EXPLAIN 分析和最佳复合索引创建语句",
        "expected_mode": "use_single_agent",
        "description": "SQL 性能分析，单专家即可交付高水准方案"
    },

    # ---- 3. COMPLEX / MULTI-STAGE TASKS (预期：多 Agent 协作体现解耦分工与独立验证价值) ----
    {
        "id": "BM-05",
        "category": "COMPLEX",
        "task_type": "coding",
        "goal": "设计并实现一个支持 O(1) 读写的高并发线程安全 LRU 缓存类，编写测试用例并验证淘汰策略",
        "expected_mode": "use_multi_agent",
        "description": "多步骤工程：包含数据结构设计、并发安全锁、测试用例编写与多阶段验证"
    },
    {
        "id": "BM-06",
        "category": "COMPLEX",
        "task_type": "research",
        "goal": "调研比较 Redis 与 Memcached 在微服务架构分布式缓存场景下的优缺点，给出具体落地选型建议",
        "expected_mode": "use_multi_agent",
        "description": "跨维度深度调研：涵盖架构演进、内存模型对比与落地决策"
    },

    # ---- 4. ROBUSTNESS & EDGE CASES (边界与复杂推理) ----
    {
        "id": "BM-07",
        "category": "EDGE_CASE",
        "task_type": "coding",
        "goal": "编写一个能够递归展开任意深层嵌套字典与列表的 Python 工具函数，支持循环引用检测",
        "expected_mode": "use_multi_agent",
        "description": "递归与深度边界：测试多 Agent 是否能提供代码设计与边界对抗测试"
    },
    {
        "id": "BM-08",
        "category": "EDGE_CASE",
        "task_type": "analysis",
        "goal": "对一段存在除以零漏洞、未捕获 NoneType 异常的数据清洗脚本进行语法检查与防御性重构",
        "expected_mode": "use_single_agent",
        "description": "漏洞修复与重构：评估单专家分析与多 Agent 协作的性价比边界"
    }
]


def run_benchmark_suite(tasks=CURATED_8_TASKS, mock_mode=False):
    if mock_mode:
        settings.enable_hermes_adapter = False
        settings.enable_antigravity_adapter = False
        settings.enable_dsh_adapter = False

    db = SessionLocal()
    seed_default_agents(db)

    print("================================================================================")
    print("NEXUS CORE 2.0 — EMPIRICAL BENCHMARK SUITE (§7 ACCEPTANCE VERIFICATION)")
    print(f"Total Test Cases : {len(tasks)}")
    print(f"Execution Engine : {'Offline Simulation (Mock)' if mock_mode else 'Live Model Gateway (gemini-3.8-flash-medium)'}")
    print("================================================================================")

    results = []
    t_start_all = time.perf_counter()

    for idx, item in enumerate(tasks, 1):
        print(f"\n[{idx:02d}/{len(tasks):02d}] Testing {item['id']} [{item['category']}]: {item['goal'][:45]}...")
        t_case_start = time.perf_counter()
        
        report = run_ab_comparison(item["goal"], item["task_type"], db)
        case_elapsed = round(time.perf_counter() - t_case_start, 2)

        entry = {
            "id": item["id"],
            "category": item["category"],
            "task_type": item["task_type"],
            "goal": item["goal"],
            "description": item.get("description", ""),
            "complexity": report.complexity,
            "expected_mode": item["expected_mode"],
            "recommendation": report.recommendation,
            "verdict_match": report.recommendation == item["expected_mode"],
            "single_agent": {
                "status": report.single_agent.status,
                "total_tokens": report.single_agent.total_tokens,
                "elapsed_seconds": report.single_agent.elapsed_seconds,
                "steps": report.single_agent.steps_count,
            },
            "multi_agent": {
                "status": report.multi_agent.status,
                "total_tokens": report.multi_agent.total_tokens,
                "elapsed_seconds": report.multi_agent.elapsed_seconds,
                "steps": report.multi_agent.steps_count,
            },
            "token_multiplier": report.token_multiplier,
            "time_delta_seconds": report.time_delta_seconds,
            "reason": report.reason,
        }
        results.append(entry)
        match_symbol = "✅ 一致" if entry["verdict_match"] else "⚠️ 偏离"
        print(f"    Mode A (Single Agent): {entry['single_agent']['total_tokens']} tok | {entry['single_agent']['elapsed_seconds']}s")
        print(f"    Mode B (Multi-Agent) : {entry['multi_agent']['total_tokens']} tok | {entry['multi_agent']['elapsed_seconds']}s ({entry['token_multiplier']}x)")
        print(f"    System Decision      : {report.recommendation} (Expected: {item['expected_mode']}) {match_symbol}")
        print(f"    Decision Reason      : {report.reason[:80]}...")

    t_total = round(time.perf_counter() - t_start_all, 2)

    # Statistical Aggregation
    tot_single_tokens = sum(r["single_agent"]["total_tokens"] for r in results)
    tot_multi_tokens = sum(r["multi_agent"]["total_tokens"] for r in results)
    overall_multiplier = round(tot_multi_tokens / max(1, tot_single_tokens), 2)
    verdict_accuracy = round(sum(1 for r in results if r["verdict_match"]) / len(results) * 100, 1)

    simple_cases = [r for r in results if r["category"] == "SIMPLE"]
    complex_cases = [r for r in results if r["category"] == "COMPLEX"]

    simple_multi_overhead = round(
        sum(r["multi_agent"]["total_tokens"] for r in simple_cases) /
        max(1, sum(r["single_agent"]["total_tokens"] for r in simple_cases)), 2
    ) if simple_cases else 1.0

    complex_multi_overhead = round(
        sum(r["multi_agent"]["total_tokens"] for r in complex_cases) /
        max(1, sum(r["single_agent"]["total_tokens"] for r in complex_cases)), 2
    ) if complex_cases else 1.0

    summary = {
        "total_cases": len(results),
        "total_duration_seconds": t_total,
        "single_agent_total_tokens": tot_single_tokens,
        "multi_agent_total_tokens": tot_multi_tokens,
        "overall_token_multiplier": overall_multiplier,
        "simple_tasks_overhead_ratio": simple_multi_overhead,
        "complex_tasks_overhead_ratio": complex_multi_overhead,
        "verdict_accuracy_pct": verdict_accuracy,
        "single_agent_recommended_count": sum(1 for r in results if r["recommendation"] == "use_single_agent"),
        "multi_agent_recommended_count": sum(1 for r in results if r["recommendation"] == "use_multi_agent"),
    }

    # Save JSON report
    out_dir = WORKSPACE_ROOT / "docs"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_file = out_dir / "benchmark_evaluation_results.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump({"summary": summary, "cases": results}, f, indent=2, ensure_ascii=False)

    print("\n================================================================================")
    print("BENCHMARK AGGREGATED METRICS SUMMARY")
    print(f"Total Cases Evaluated       : {summary['total_cases']}")
    print(f"Total Suite Wall-Clock Time : {summary['total_duration_seconds']}s")
    print(f"Single Agent Total Tokens   : {summary['single_agent_total_tokens']:,}")
    print(f"Multi-Agent Total Tokens    : {summary['multi_agent_total_tokens']:,}")
    print(f"Overall Token Multiplier    : {summary['overall_token_multiplier']}x")
    print(f"Simple Tasks Overhead Ratio : {summary['simple_tasks_overhead_ratio']}x (Demonstrates Avoidance of Blind Multi-Agent)")
    print(f"Complex Tasks Overhead Ratio: {summary['complex_tasks_overhead_ratio']}x")
    print(f"Strategic Alignment Score   : {summary['verdict_accuracy_pct']}%")
    print(f"Recommended Single Agent    : {summary['single_agent_recommended_count']} tasks")
    print(f"Recommended Multi Agent     : {summary['multi_agent_recommended_count']} tasks")
    print("================================================================================")
    print(f"Detailed JSON results exported to: {report_file}")

    db.close()
    return summary, results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock", action="store_true", help="Run in fast mock simulation mode")
    args = parser.parse_args()
    run_benchmark_suite(mock_mode=args.mock)
