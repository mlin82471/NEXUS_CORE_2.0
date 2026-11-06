export type TaskStatus = 'queued' | 'running' | 'success' | 'partial' | 'failed' | 'cancelled';
export type TaskComplexity = 'simple' | 'single_expert' | 'complex';
export type ExecutionMode = 'orchestrated' | 'single_agent';

export interface PlanStep {
  step_key: string;
  step_order: number;
  role: string;
  status: string;
  goal: string;
  depends_on: string[];
  error?: string;
  result?: string;
  attempts?: number;
  verification_status?: string;
}

export interface TaskDetail {
  id: string;
  goal: string;
  task_type: string;
  risk_level: string;
  status: TaskStatus;
  plan_source?: string;
  complexity?: TaskComplexity;
  execution_mode?: ExecutionMode;
  routing_decision?: {
    model_name: string;
    tier: string;
    reason: string;
  };
  steps: PlanStep[];
  events: Array<{
    event_type: string;
    message: string;
    created_at: string;
  }>;
}

export interface EvolutionProposal {
  id: string;
  title: string;
  proposal_type: string;
  status: 'pending_test' | 'test_passed' | 'test_failed' | 'approved' | 'rejected' | 'rolled_back';
  evidence: {
    analysis?: string;
    trigger?: string;
    step_exhaustion_count?: number;
    token_exhaustion_count?: number;
    total_calls?: number;
    failure_rate?: number;
    approval_comment?: string;
  };
  proposed_diff: {
    target?: string;
    before?: any;
    after?: any;
  };
  sandbox_test_result?: {
    passed: boolean;
    summary: string;
    execution_time_s: number;
  };
  rejection_reason?: string;
  applied_at?: string;
  created_at?: string;
}

export interface AgentMetric {
  agent_id: string;
  name: string;
  role: string;
  adapter_type: string;
  total_calls: number;
  success_calls: number;
  failed_calls: number;
  total_tokens: number;
  success_rate: number;
}

export interface TaskExperience {
  id: string;
  task_id: string;
  goal: string;
  task_type: string;
  complexity: string;
  status: string;
  lessons_learned: string;
  failure_reasons: Array<{ cause: string; detail: string }>;
  token_cost: number;
  execution_time_s: number;
  created_at?: string;
}

// ===== Control Center 2.1 Types =====

export interface AgentItem {
  agent_id: string;
  name: string;
  role: string;
  adapter_type: string;
  description: string;
  status: 'active' | 'paused' | 'error' | 'provisional';
  primary_model_id: string;
  fallback_model_id?: string;
  budget_tokens_per_task: number;
  max_retries: number;
  timeout_seconds: number;
  permission_level: 'strict' | 'supervised' | 'autonomous';
  allowed_tools: string[];
  system_prompt: string;
  tags: string[];
  total_tokens_consumed: number;
  total_tasks_completed: number;
  success_rate: number;
  verification_pass_rate: number;
  average_latency_ms: number;
  last_active_at?: string;
}

export interface AgentTemplateItem {
  template_id: string;
  name: string;
  role: string;
  display_title: string;
  description: string;
  recommended_model: string;
  default_budget_tokens: number;
  default_permission_level: string;
  recommended_tools: string[];
  system_prompt_preview: string;
}

export interface ModelItem {
  model_id: string;
  provider_type: string;
  display_name: string;
  api_base: string;
  credential_ref: string;
  capabilities: {
    supports_tools: boolean;
    supports_vision: boolean;
    supports_streaming: boolean;
    supports_reasoning: boolean;
    context_window: number;
    max_output_tokens: number;
  };
  pricing: {
    input_price_per_m: number;
    output_price_per_m: number;
    cached_discount_pct: number;
    currency: string;
  };
  enabled: boolean;
  is_default: boolean;
  health_status: string;
  last_ping_ms: number;
}

export interface ProviderPresetItem {
  provider_type: string;
  display_name: string;
  default_api_base: string;
  description: string;
  icon: string;
  docs_url: string;
  recommended_models: string[];
}

export interface UsageSummaryData {
  today_tokens: number;
  today_cost_usd: number;
  today_tasks_count: number;
  avg_tokens_per_task: number;
  real_tokens_pct: number;
  estimated_tokens_pct: number;
}

export interface AgentRankingItem {
  agent_id: string;
  agent_name: string;
  total_tokens: number;
  total_cost_usd: number;
  task_count: number;
  avg_tokens_per_task: number;
  efficiency_score: number;
}

export interface ModelCostItem {
  model_id: string;
  provider_id: string;
  total_tokens: number;
  cost_usd: number;
  share_pct: number;
}

export interface TaskCostAuditItem {
  task_id: string;
  goal_preview: string;
  total_tokens: number;
  retry_tokens: number;
  total_cost_usd: number;
  retry_overhead_pct: number;
}

export interface DashboardOverviewData {
  status: string;
  version: string;
  system: {
    core_engine: string;
    active_agents: number;
    total_agents: number;
    connected_models: number;
    total_models: number;
    routing_mode: string;
  };
  kpi: {
    today_tokens: number;
    today_cost_usd: number;
    today_tasks: number;
    avg_tokens_per_task: number;
    real_tokens_pct: number;
    estimated_tokens_pct: number;
  };
  budget: {
    allowed: boolean;
    status: string;
    pct_used: number;
    current_tokens: number;
    limit_tokens: number;
    current_cost_usd: number;
    limit_cost_usd: number;
    action: string;
    message: string;
  };
  recent_agent_leaderboard: AgentRankingItem[];
  model_cost_share: ModelCostItem[];
  time_series_trends: {
    days: string[];
    tokens_k: number[];
    cost_usd: number[];
  };
}
