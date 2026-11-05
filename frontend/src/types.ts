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
