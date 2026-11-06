"""
NEXUS CORE 2.1 — Platform Workspace Isolation Engine (§Platform-1).
Provides isolated execution workspaces using Git Worktree or isolated directory sandboxes.
Ensures base project files remain strictly read-only while agents operate on dedicated task branches.
"""

import os
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional


@dataclass
class WorkspaceContext:
    workspace_id: str
    task_id: str
    workspace_path: Path
    base_repo_path: Path
    branch_name: Optional[str] = None
    is_git_worktree: bool = False
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    status: str = "active"  # "active" | "cleaned" | "merged"


class WorkspaceError(Exception):
    """Base exception for workspace management failures."""


class WorkspaceManager:
    """
    Manages isolated work environments for DEV and OPS agents.
    Prevents workspace contamination and baseline corruption.
    """

    def __init__(self, storage_root: Optional[Path] = None):
        self.storage_root = (
            Path(storage_root)
            if storage_root
            else Path(tempfile.gettempdir()) / "nexus_workspaces"
        )
        self.storage_root.mkdir(parents=True, exist_ok=True)
        self._workspaces: Dict[str, WorkspaceContext] = {}

    def create_workspace(
        self,
        task_id: str,
        base_repo_path: Path,
        branch_name: Optional[str] = None,
        use_git_worktree: bool = True,
    ) -> WorkspaceContext:
        """
        Creates an isolated workspace for a task.
        If the base_repo is a git repository and use_git_worktree is True,
        creates an isolated `git worktree` checkout.
        Otherwise creates a physical isolated copy.
        """
        base_path = Path(base_repo_path).resolve()
        if not base_path.exists():
            raise WorkspaceError(f"Base repository path does not exist: {base_path}")

        ws_id = f"ws-{uuid.uuid4().hex[:8]}"
        target_dir = self.storage_root / ws_id
        target_branch = branch_name or f"nexus-task-{task_id[:8]}-{ws_id}"

        is_git = (base_path / ".git").exists()
        created_worktree = False

        if is_git and use_git_worktree:
            try:
                # Attempt to create a git worktree on target_branch
                cmd = [
                    "git",
                    "-C",
                    str(base_path),
                    "worktree",
                    "add",
                    "-b",
                    target_branch,
                    str(target_dir),
                ]
                res = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=30,
                    encoding="utf-8",
                )
                if res.returncode == 0 and target_dir.exists():
                    created_worktree = True
            except Exception:
                created_worktree = False

        # Fallback to isolated directory copy if not a git repo or worktree creation failed
        if not created_worktree:
            target_dir.mkdir(parents=True, exist_ok=True)
            # Copy source tree excluding git, cache and temp files
            for item in base_path.iterdir():
                if item.name in (".git", "__pycache__", ".pytest_cache", "node_modules", "dist", ".venv"):
                    continue
                dest = target_dir / item.name
                if item.is_dir():
                    shutil.copytree(item, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
                else:
                    shutil.copy2(item, dest)

        ctx = WorkspaceContext(
            workspace_id=ws_id,
            task_id=task_id,
            workspace_path=target_dir,
            base_repo_path=base_path,
            branch_name=target_branch if created_worktree else None,
            is_git_worktree=created_worktree,
        )
        self._workspaces[ws_id] = ctx
        return ctx

    def get_diff(self, workspace_id: str) -> str:
        """
        Extract patch / diff generated in the isolated workspace compared to base.
        """
        ctx = self._workspaces.get(workspace_id)
        if not ctx or not ctx.workspace_path.exists():
            raise WorkspaceError(f"Workspace '{workspace_id}' not found or already cleaned")

        if ctx.is_git_worktree:
            cmd = ["git", "-C", str(ctx.workspace_path), "diff", "HEAD"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=15, encoding="utf-8")
            return res.stdout

        # Directory diff fallback
        return f"[Workspace {workspace_id} File Tree Modified]"

    def cleanup_workspace(self, workspace_id: str, prune_git: bool = True) -> bool:
        """
        Safely destroys isolated workspace and purges worktree references.
        """
        ctx = self._workspaces.get(workspace_id)
        if not ctx:
            return False

        if ctx.is_git_worktree and prune_git:
            try:
                subprocess.run(
                    ["git", "-C", str(ctx.base_repo_path), "worktree", "remove", "--force", str(ctx.workspace_path)],
                    capture_output=True,
                    timeout=15,
                )
            except Exception:
                pass

        if ctx.workspace_path.exists():
            shutil.rmtree(ctx.workspace_path, ignore_errors=True)

        ctx.status = "cleaned"
        return True

    def get_workspace(self, workspace_id: str) -> Optional[WorkspaceContext]:
        return self._workspaces.get(workspace_id)
