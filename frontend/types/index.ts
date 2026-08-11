// ============================================================
// BoxOfficePulse — Shared TypeScript Types
// Mirrors FastAPI Pydantic schemas exactly
// ============================================================

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
}

export interface ThreadSchema {
  thread_id: string;
  user_id: string;
  title: string;
  created_at: string;
}

export interface ChatResponse {
  response: string;
  thread_id: string;
  user_id: string;
  intent?: string | null;
  generated_sql?: string | null;
  query_results?: Record<string, unknown>[] | null;
  recommended_actions?: ActionItem[] | null;
  reasoning_steps: string[];
}

export interface ActionItem {
  action_type: string;
  target: string;
  description: string;
  estimated_impact: string;
  status: string;
}

// SSE event payload emitted per node update
export interface SSEPayload {
  node: string;
  user_id: string;
  thread_id: string;
  reasoning_steps: string[];
  intent?: string | null;
  generated_sql?: string | null;
  query_results?: Record<string, unknown>[] | null;
  recommended_actions?: ActionItem[] | null;
  message?: string;
}

// Internal chat message model
export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  // Rich assistant payload
  intent?: string | null;
  generated_sql?: string | null;
  query_results?: Record<string, unknown>[] | null;
  recommended_actions?: ActionItem[] | null;
  reasoning_steps: string[];
  isStreaming?: boolean;
}

// Auth context
export interface AuthUser {
  user_id: string;
  email: string;
  token: string;
}
