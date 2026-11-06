"""
NEXUS CORE 2.1 — NEXUS DEV Isolated Test Runner (§DEV-4).
Executes automated test suites within the isolated workspace and packages objective evidence.
"""

import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional
from app.platform.evidence import evidence_engine


class DevTestRunner:
    """
    Executes unit and integration tests safely within a workspace sandbox.
    """

    def run_tests(
        self,
        workspace_path: Path,
        task_id: str,
        test_command: Optional[str] = None,
        timeout_seconds: int = 60,
    ) -> Dict[str, Any]:
        target_dir = Path(workspace_path).resolve()
        if not target_dir.exists():
            return {
                "ok": False,
                "all_passed": False,
                "exit_code": -1,
                "error": f"Workspace directory not found: {target_dir}",
            }

        cmd = test_command or f"{sys.executable} -m pytest -q"
        try:
            res = subprocess.run(
                cmd,
                cwd=str(target_dir),
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                encoding="utf-8",
            )
            stdout = res.stdout or ""
            stderr = res.stderr or ""
            output = (stdout + "\n" + stderr).strip()

            passed = 0
            failed = 0
            # Parse simple pytest output like "10 passed, 1 failed"
            if "passed" in stdout:
                import re
                m_pass = re.search(r"(\d+)\s+passed", stdout)
                if m_pass:
                    passed = int(m_pass.group(1))
            if "failed" in stdout:
                import re
                m_fail = re.search(r"(\d+)\s+failed", stdout)
                if m_fail:
                    failed = int(m_fail.group(1))

            all_passed = (res.returncode == 0 and failed == 0)

            # Record objective evidence in platform EvidenceEngine
            evidence = evidence_engine.record_test_run(
                task_id=task_id,
                agent_id="dev-test-runner",
                test_command=cmd,
                exit_code=res.returncode,
                passed_count=passed,
                failed_count=failed,
                stdout_tail=output[-1500:],
            )

            return {
                "ok": True,
                "all_passed": all_passed,
                "exit_code": res.returncode,
                "passed": passed,
                "failed": failed,
                "output": output,
                "evidence_id": evidence.evidence_id,
            }
        except subprocess.TimeoutExpired:
            return {
                "ok": False,
                "all_passed": False,
                "exit_code": 124,
                "error": f"Test run timed out after {timeout_seconds}s",
            }
        except Exception as exc:
            return {
                "ok": False,
                "all_passed": False,
                "exit_code": 1,
                "error": str(exc),
            }
