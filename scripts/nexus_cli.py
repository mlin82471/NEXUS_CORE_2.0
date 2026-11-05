"""
NEXUS CORE 2.0 — Unified Developer CLI (命令行终端控制台)
Allows managing tasks, inspecting execution streaming, browsing memory,
triggering self-evolution analysis, and approving proposals directly from the terminal.
"""
import sys
import json
import time
import argparse
import urllib.request
import urllib.error

DEFAULT_API_BASE = "http://127.0.0.1:8000"


def _api_call(path: str, method: str = "GET", data: dict = None, token: str = "nexus-dev-token"):
    url = f"{DEFAULT_API_BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-Nexus-Token"] = token

    req_data = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                return content
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        print(f"[ERROR] HTTP {e.code}: {err_msg}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"[ERROR] Cannot connect to NEXUS CORE 2.0 at {DEFAULT_API_BASE}: {e.reason}", file=sys.stderr)
        print("Please ensure the server daemon is running: python scripts/start_server.py", file=sys.stderr)
        sys.exit(1)


# ---- 1. Task Commands ----

def cmd_task_create(args):
    payload = {
        "goal": args.goal,
        "task_type": args.type,
        "execution_mode": args.mode,
        "risk_suggestion": "low"
    }
    res = _api_call("/tasks", method="POST", data=payload)
    print(f"✅ Task created successfully!")
    print(f"   Task ID    : {res.get('task_id')}")
    print(f"   Complexity : {res.get('complexity')}")
    print(f"   Mode       : {res.get('execution_mode')}")
    print(f"   Plan Source: {res.get('plan_source')} ({res.get('steps')} steps)")

    if args.execute:
        print("\n🚀 Triggering background execution...")
        exec_res = _api_call(f"/tasks/{res.get('task_id')}/execute_async", method="POST")
        print(f"   Status     : {exec_res.get('status')}")
        if args.stream:
            cmd_task_stream(argparse.Namespace(task_id=res.get("task_id")))


def cmd_task_list(args):
    res = _api_call("/tasks")
    print(f"{'ID':<14} {'STATUS':<10} {'TYPE':<12} {'PLAN':<8} {'GOAL':<40}")
    print("-" * 88)
    for t in res[:args.limit]:
        status_color = t.get("status", "")
        print(f"{t.get('id', ''):<14} {status_color:<10} {t.get('risk_level', ''):<12} {t.get('plan_source', ''):<8} {t.get('goal', '')[:38]}")


def cmd_task_show(args):
    res = _api_call(f"/tasks/{args.task_id}")
    print("=" * 60)
    print(f"TASK ID     : {res.get('id')}")
    print(f"STATUS      : {res.get('status')}")
    print(f"GOAL        : {res.get('goal')}")
    print(f"COMPLEXITY  : {res.get('complexity')} | MODE: {res.get('execution_mode')}")
    print(f"MODEL ROUTE : {res.get('routing_decision', {}).get('model_name', 'default')}")
    print("=" * 60)
    steps = res.get("steps", [])
    print(f"STEPS ({len(steps)}):")
    for s in steps:
        print(f"  [{s.get('step_key')}] ({s.get('role')}) -> {s.get('status')}")
        if s.get("result"):
            print(f"       Result preview: {s.get('result')[:120]}...")
        if s.get("error"):
            print(f"       Error: {s.get('error')}")


def cmd_task_stream(args):
    url = f"{DEFAULT_API_BASE}/tasks/{args.task_id}/stream"
    print(f"📡 Subscribing to live SSE stream for task: {args.task_id}...")
    req = urllib.request.Request(url, headers={"Authorization": "Bearer nexus-dev-token"})
    try:
        with urllib.request.urlopen(req) as resp:
            for line in resp:
                decoded = line.decode("utf-8").strip()
                if decoded.startswith("event:"):
                    print(f"\n[EVENT] {decoded[6:].strip()}", end=" -> ")
                elif decoded.startswith("data:"):
                    try:
                        data = json.loads(decoded[5:].strip())
                        if "message" in data:
                            print(f"{data['message']}")
                        elif "status" in data:
                            print(f"Status: {data['status']}")
                        else:
                            print(f"{data}")
                    except Exception:
                        print(decoded[5:].strip())
    except KeyboardInterrupt:
        print("\nStream listener stopped by user.")


def cmd_task_cancel(args):
    res = _api_call(f"/tasks/{args.task_id}/cancel", method="POST")
    print(f"⏹️ Cancel signal sent for {args.task_id}: {res}")


# ---- 2. Evolution Commands ----

def cmd_evolution_analyze(args):
    print("🔍 Scanning telemetry, experiences, and failure RCA across NEXUS CORE 2.0...")
    res = _api_call("/evolution/analyze", method="POST")
    if not res:
        print("No new optimization opportunities detected. System is running within optimal bounds.")
        return
    print(f"Discovered {len(res)} evolution proposals:")
    for p in res:
        print(f"  [{p.get('id')}] ({p.get('proposal_type')}) {p.get('title')} -> {p.get('status')}")


def cmd_evolution_proposals(args):
    res = _api_call("/evolution/proposals")
    if not res:
        print("No evolution proposals recorded.")
        return
    print(f"{'ID':<14} {'STATUS':<14} {'TYPE':<24} {'TITLE':<35}")
    print("-" * 90)
    for p in res:
        print(f"{p.get('id', ''):<14} {p.get('status', ''):<14} {p.get('proposal_type', ''):<24} {p.get('title', '')[:34]}")


def cmd_evolution_approve(args):
    token = args.token or "nexus-dev-approval-token"
    payload = {"approval_token": token, "comment": args.comment or "Approved via CLI"}
    res = _api_call(f"/evolution/proposals/{args.proposal_id}/approve", method="POST", data=payload)
    print(f"✅ Proposal {args.proposal_id} approved and applied successfully!")
    print(f"   Status    : {res.get('status')}")
    print(f"   Applied At: {res.get('applied_at')}")


def cmd_evolution_rollback(args):
    res = _api_call(f"/evolution/proposals/{args.proposal_id}/rollback", method="POST")
    print(f"↩️ Proposal {args.proposal_id} rolled back to previous snapshot successfully!")


def cmd_evolution_sweep(args):
    res = _api_call("/evolution/sweeper/trigger", method="POST")
    print(f"🧹 Autonomous Evolution Sweep #{res.get('sweep_id')} Completed in {res.get('duration_seconds')}s:")
    print(f"   New Proposals Found        : {res.get('new_proposals_found')}")
    print(f"   Verified (Pending Approval) : {res.get('verified_pending_approval')}")
    print(f"   Sandbox Failed             : {res.get('sandbox_failed')}")


def cmd_evolution_sweeper_status(args):
    res = _api_call("/evolution/sweeper/status")
    print(f"🧬 Autonomous Evolution Sweeper Status:")
    print(f"   Enabled         : {res.get('enabled')}")
    print(f"   Is Running      : {res.get('is_running')}")
    print(f"   Interval        : {res.get('interval_seconds')}s")
    print(f"   Total Sweeps    : {res.get('total_sweeps')}")
    print(f"   Last Sweep At   : {res.get('last_sweep_at')}")



# ---- 3. Memory Commands ----

def cmd_memory_search(args):
    payload = {"goal": args.query, "task_type": args.type or "general"}
    res = _api_call("/memory/search", method="POST", data=payload)
    print(f"🧠 Memory Recall for: '{args.query}'")
    hints = res.get("best_practice_hints", [])
    warnings = res.get("failure_warnings", [])
    print(f"\n💡 Best Practice Hints ({len(hints)}):")
    for h in hints:
        print(f"  - {h}")
    print(f"\n⚠️ Failure Warnings ({len(warnings)}):")
    for w in warnings:
        print(f"  - {w}")


def cmd_memory_search_hybrid(args):
    payload = {"query": args.query, "top_k": args.top}
    res = _api_call("/memory/search/hybrid", method="POST", data=payload)
    print(f"🔮 Hybrid Semantic Memory Search for: '{args.query}' (Found {res.get('count', 0)}):")
    for r in res.get("results", []):
        print(f"\n[{r.get('status', '').upper()}] Task: {r.get('task_id')} | Cosine Sim: {r.get('cosine_similarity')} | RRF: {r.get('rrf_score')}")
        print(f"   Goal   : {r.get('goal')}")
        if r.get("lessons_learned"):
            print(f"   Lesson : {r.get('lessons_learned')}")



def cmd_metrics_agents(args):
    res = _api_call("/metrics/agents")
    print(f"{'AGENT ID':<14} {'ROLE':<14} {'CALLS':<8} {'SUCCESS':<10} {'RATE':<8} {'TOKENS':<12}")
    print("-" * 70)
    for m in res:
        print(f"{m.get('agent_id', ''):<14} {m.get('role', ''):<14} {m.get('total_calls', 0):<8} {m.get('success_calls', 0):<10} {m.get('success_rate', 1.0):<8} {m.get('total_tokens', 0):<12}")


def main():
    parser = argparse.ArgumentParser(description="NEXUS CORE 2.0 Unified CLI")
    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # task
    p_task = subparsers.add_parser("task", help="Manage and execute tasks")
    task_subs = p_task.add_subparsers(dest="task_action")

    p_t_create = task_subs.add_parser("create", help="Create a new task")
    p_t_create.add_argument("goal", help="Task goal description")
    p_t_create.add_argument("--type", default="general", choices=["general", "coding", "analysis", "research", "knowledge"])
    p_t_create.add_argument("--mode", default="orchestrated", choices=["orchestrated", "single_agent"])
    p_t_create.add_argument("-e", "--execute", action="store_true", help="Immediately execute task asynchronously")
    p_t_create.add_argument("-s", "--stream", action="store_true", help="Subscribe to live SSE stream after creating")
    p_t_create.set_defaults(func=cmd_task_create)

    p_t_list = task_subs.add_parser("list", help="List recent tasks")
    p_t_list.add_argument("-n", "--limit", type=int, default=20)
    p_t_list.set_defaults(func=cmd_task_list)

    p_t_show = task_subs.add_parser("show", help="Show task details")
    p_t_show.add_argument("task_id", help="Task ID")
    p_t_show.set_defaults(func=cmd_task_show)

    p_t_stream = task_subs.add_parser("stream", help="Stream live task events via SSE")
    p_t_stream.add_argument("task_id", help="Task ID")
    p_t_stream.set_defaults(func=cmd_task_stream)

    p_t_cancel = task_subs.add_parser("cancel", help="Cancel a running task")
    p_t_cancel.add_argument("task_id", help="Task ID")
    p_t_cancel.set_defaults(func=cmd_task_cancel)

    # evolution
    p_evo = subparsers.add_parser("evolution", help="Controlled self-evolution management")
    evo_subs = p_evo.add_subparsers(dest="evo_action")

    p_e_analyze = evo_subs.add_parser("analyze", help="Scan telemetry and formulate evolution proposals")
    p_e_analyze.set_defaults(func=cmd_evolution_analyze)

    p_e_list = evo_subs.add_parser("list", help="List evolution proposals")
    p_e_list.set_defaults(func=cmd_evolution_proposals)

    p_e_approve = evo_subs.add_parser("approve", help="Approve and apply an evolution proposal")
    p_e_approve.add_argument("proposal_id", help="Proposal ID")
    p_e_approve.add_argument("--token", default=None, help="Approval token")
    p_e_approve.add_argument("--comment", default="", help="Approval comment")
    p_e_approve.set_defaults(func=cmd_evolution_approve)

    p_e_rollback = evo_subs.add_parser("rollback", help="Roll back an approved proposal")
    p_e_rollback.add_argument("proposal_id", help="Proposal ID")
    p_e_rollback.set_defaults(func=cmd_evolution_rollback)

    p_e_sweep = evo_subs.add_parser("sweep", help="Trigger autonomous evolution sweep and sandbox testing")
    p_e_sweep.set_defaults(func=cmd_evolution_sweep)

    p_e_sw_status = evo_subs.add_parser("sweeper-status", help="Get autonomous evolution sweeper status")
    p_e_sw_status.set_defaults(func=cmd_evolution_sweeper_status)

    # memory
    p_mem = subparsers.add_parser("memory", help="Inspect and search long-term memory")
    mem_subs = p_mem.add_subparsers(dest="mem_action")

    p_m_search = mem_subs.add_parser("search", help="Search memory for similar goals")
    p_m_search.add_argument("query", help="Goal query string")
    p_m_search.add_argument("--type", default="general")
    p_m_search.set_defaults(func=cmd_memory_search)

    p_m_hybrid = mem_subs.add_parser("search-hybrid", help="Hybrid semantic vector search with dense cosine similarity & RRF")
    p_m_hybrid.add_argument("query", help="Goal or problem query string")
    p_m_hybrid.add_argument("--top", type=int, default=5, help="Top K results")
    p_m_hybrid.set_defaults(func=cmd_memory_search_hybrid)

    # metrics
    p_met = subparsers.add_parser("metrics", help="View agent execution metrics")
    p_met.set_defaults(func=cmd_metrics_agents)

    args = parser.parse_args()
    if hasattr(args, "func"):
        args.func(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
