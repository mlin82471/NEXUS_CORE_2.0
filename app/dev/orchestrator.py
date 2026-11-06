"""
NEXUS CORE 2.1 — NEXUS DEV Autonomous Engineering Pipeline (§DEV-Orchestrator).
Coordinates Requirements -> Workspace Isolation -> Coding -> Testing -> Review -> Release.
"""

import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from app.dev.schemas import DevChangeSet, DevCodeReview, DevReleasePackage, DevRequirement, DevTaskStage
from app.dev.requirements import RequirementsAnalyzer
from app.dev.reviewer import DevCodeReviewer
from app.dev.test_runner import DevTestRunner
from app.dev.repair import DevRepairEngine
from app.platform.workspace import WorkspaceManager
from app.platform.evidence import evidence_engine, EvidenceType


class DevPipelineOrchestrator:
    """
    End-to-end coordinator for autonomous software engineering tasks.
    """

    def __init__(self, workspace_manager: Optional[WorkspaceManager] = None):
        self.workspace_mgr = workspace_manager or WorkspaceManager()
        self.req_analyzer = RequirementsAnalyzer()
        self.reviewer = DevCodeReviewer()
        self.test_runner = DevTestRunner()
        self.repair_engine = DevRepairEngine()

    def run_dev_pipeline(
        self,
        task_id: str,
        base_repo_path: Path,
        user_prompt: str,
        code_patches: Dict[str, str],  # rel_path -> code_content
        run_tests: bool = True,
        test_command: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes an autonomous software engineering cycle in a verified sandbox.
        """
        # 1. Requirements Extraction
        req = self.req_analyzer.analyze(user_prompt)

        # 2. Workspace Isolation
        ws_ctx = self.workspace_mgr.create_workspace(
            task_id=task_id,
            base_repo_path=base_repo_path,
            use_git_worktree=False,
        )

        try:
            # 3. Apply Code Changes to Isolated Workspace
            modified_files = []
            patch_diffs = []
            for rel_file, content in code_patches.items():
                dest_file = ws_ctx.workspace_path / rel_file
                dest_file.parent.mkdir(parents=True, exist_ok=True)
                dest_file.write_text(content, encoding="utf-8")
                modified_files.append(rel_file)
                patch_diffs.append(f"--- /dev/null\n+++ {rel_file}\n@@ +1,{len(content.splitlines())} @@\n{content}")

                # Record file patch evidence
                evidence_engine.record_file_patch(
                    task_id=task_id,
                    agent_id="dev-coder",
                    target_file=rel_file,
                    patch_content=content,
                )

            changeset = DevChangeSet(
                changeset_id=f"cs-{uuid.uuid4().hex[:8]}",
                workspace_id=ws_ctx.workspace_id,
                task_id=task_id,
                modified_files=modified_files,
                patch_diff="\n\n".join(patch_diffs),
                commit_message=f"feat: implement {req.title}",
                author_agent_id="dev-coder",
            )

            # 4. Automated Testing
            test_res = None
            if run_tests:
                test_res = self.test_runner.run_tests(
                    workspace_path=ws_ctx.workspace_path,
                    task_id=task_id,
                    test_command=test_command,
                )

                # 5. Auto-repair attempt if tests failed
                if not test_res.get("all_passed", False) and "repair_patch" in code_patches:
                    repair_plan = self.repair_engine.diagnose_failure(test_res.get("output", ""))
                    # Apply repair patch if provided
                    repair_file = ws_ctx.workspace_path / code_patches["repair_file"]
                    repair_file.write_text(code_patches["repair_patch"], encoding="utf-8")
                    test_res = self.test_runner.run_tests(
                        workspace_path=ws_ctx.workspace_path,
                        task_id=task_id,
                        test_command=test_command,
                    )

            # 6. Independent 4-Level Code Review
            review = self.reviewer.review(
                changeset=changeset,
                requirement=req,
                test_evidence=test_res,
                file_contents=code_patches,
            )

            # 7. Package Final Deliverable
            evidence_summary = evidence_engine.verify_evidence_package(task_id)
            release_pkg = None
            if review.passed:
                release_pkg = DevReleasePackage(
                    release_id=f"rel-{uuid.uuid4().hex[:8]}",
                    version="1.0.0",
                    project_name=req.title,
                    summary=f"Successfully built and verified {req.title}",
                    deliverables=modified_files,
                    changelog=[f"* Implemented {req.title}", f"* Verified with quality score {review.quality_score}/10"],
                    evidence_fingerprints=[it.fingerprint for it in evidence_engine.get_task_evidence(task_id)],
                )

            return {
                "success": review.passed,
                "requirement": req,
                "changeset": changeset,
                "test_result": test_res,
                "code_review": review,
                "release_package": release_pkg,
                "evidence_summary": evidence_summary,
                "workspace_id": ws_ctx.workspace_id,
            }
        finally:
            # Workspace can be cleaned up or retained for manual inspection
            pass
