"""
NEXUS 2.0 configuration. All settings from env with startup validation.
"""
import os, sys, pathlib


# ---- .env loading ----
_env_path = pathlib.Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except ImportError:
        pass
    # Pure-Python fallback parser to ensure environment variables are loaded
    with open(_env_path, "r", encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#"):
                continue
            if "=" in _line:
                _k, _v = _line.split("=", 1)
                _k = _k.strip()
                _v = _v.strip().strip("'\"")
                if _k not in os.environ:
                    os.environ[_k] = _v

class ConfigError(Exception):
    pass

def _require_int(key: str, default: int, min_val: int = 1, max_val: int = 1000000) -> int:
    raw = os.getenv(key, str(default))
    try:
        val = int(raw)
    except ValueError:
        raise ConfigError(f"{key} must be an integer, got {raw!r}")
    if val < min_val or val > max_val:
        raise ConfigError(f"{key}={val} out of range [{min_val}, {max_val}]")
    return val

def _require_bool(key: str, default: bool) -> bool:
    raw = os.getenv(key, str(default)).lower()
    if raw in ("1", "true", "yes"):
        return True
    if raw in ("0", "false", "no", ""):
        return False
    raise ConfigError(f"{key} must be true/false, got {raw!r}")

class Settings:
    def __init__(self):
        # ---- Mode ----
        self.dev_mode: bool = _require_bool("NEXUS_DEV_MODE", False)

        # ---- Data ----
        self.nexus_data_dir: str = os.getenv("NEXUS_DATA_DIR") or str(
            pathlib.Path.home() / ".nexus-core-2.0"
        )

        # ---- Planner ----
        self.planner_base_url: str = os.getenv(
            "PLANNER_BASE_URL",
            "https://dashscope.aliyuncs.com/compatible-mode/v1",
        )
        self.planner_model: str = os.getenv("PLANNER_MODEL", "qwen-plus")
        self.planner_api_key: str = os.getenv("DASHSCOPE_API_KEY", "")
        self.planner_timeout: int = _require_int("PLANNER_TIMEOUT", 30, 1, 300)

        # ---- Security ----
        self.api_token: str = os.getenv("NEXUS_API_TOKEN", "")
        self.approval_token: str = os.getenv("NEXUS_APPROVAL_TOKEN", "")

        # ---- Adapter gates ----
        self.enable_dsh_adapter: bool = _require_bool("ENABLE_DSH_ADAPTER", False)
        self.enable_hermes_adapter: bool = _require_bool("ENABLE_HERMES_ADAPTER", False)
        self.enable_antigravity_adapter: bool = _require_bool("ENABLE_ANTIGRAVITY_ADAPTER", False)

        # ---- Budget limits ----
        self.default_max_steps: int = _require_int("DEFAULT_MAX_STEPS", 5, 1, 50)
        self.default_max_agents: int = _require_int("DEFAULT_MAX_AGENTS", 5, 1, 50)
        self.default_max_parallel: int = _require_int("DEFAULT_MAX_PARALLEL", 1, 1, 20)

        # ---- M0-B reserved (not enforced yet) ----
        self.default_max_model_calls: int = _require_int("DEFAULT_MAX_MODEL_CALLS", 10, 1, 1000)
        self.default_max_total_tokens: int = _require_int("DEFAULT_MAX_TOTAL_TOKENS", 100000, 100, 10000000)

    @property
    def planner_available(self) -> bool:
        return bool(self.planner_api_key)

    @property
    def db_url(self) -> str:
        url = os.getenv("DATABASE_URL")
        if url:
            return url
        data = pathlib.Path(self.nexus_data_dir).resolve()
        data.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{data / 'nexus_2.db'}"

    @property
    def database_url(self) -> str:
        return self.db_url

    @property
    def auth_required(self) -> bool:
        """True unless explicit dev mode bypass."""
        return not self.dev_mode

try:
    settings = Settings()
except ConfigError as e:
    print(f"[NEXUS] FATAL config error: {e}", file=sys.stderr)
    sys.exit(1)
