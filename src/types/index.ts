// ============================================================================
// TYPES - Claude Coder
// All TypeScript interfaces and types
// ============================================================================

// ----------------------------------------------------------------------------
// Chat & Message Types
// ----------------------------------------------------------------------------

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  cost?: number;
  savedPercent?: number;
  tokensUsed?: TokenUsage;
  filesChanged?: FileChange[];
  files?: UploadedFile[];
  isStreaming?: boolean;
  thinkingContent?: string;
  artifacts?: Artifact[];
  citations?: Citation[];
  // Tool action tracking for ActionBlock display
  toolActions?: ToolAction[];
  // PR info for Safe Mode
  prUrl?: string;
  prNumber?: number;
  previewUrl?: string;
}

// Tool action for displaying tool usage in ActionBlock
export interface ToolAction {
  id: string;
  type: 'web_search' | 'web_fetch' | 'read_file' | 'str_replace' | 'create_file' | 'grep_search' | 'search_files' | 'verify_edit';
  status: 'running' | 'complete' | 'error';
  summary: string;
  details?: string;
  result?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface FileChange {
  path: string;
  action: 'create' | 'edit' | 'delete';
  additions?: number;
  deletions?: number;
  diff?: string;
}

export interface UploadedFile {
  name: string;
  type: string;
  size: number;
  base64: string;
}

// ----------------------------------------------------------------------------
// Artifact Types
// ----------------------------------------------------------------------------

export interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  content: string;
  language?: string;
}

export type ArtifactType = 
  | 'code'
  | 'markdown'
  | 'html'
  | 'svg'
  | 'mermaid'
  | 'react';

// ----------------------------------------------------------------------------
// Conversation & Session Types
// ----------------------------------------------------------------------------

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  totalCost?: number;
  filesChanged?: FileChange[];
  isComplete?: boolean;
}

export interface Session {
  id: string;
  title: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  date: Date;
  filesChanged: FileChange[];
  totalAdditions: number;
  totalDeletions: number;
  isComplete: boolean;
  prUrl?: string;
  prNumber?: number;
}

// ----------------------------------------------------------------------------
// GitHub Types
// ----------------------------------------------------------------------------

export interface RepoFile {
  path: string;
  content: string;
  sha: string;
}

export interface RepoTree {
  path: string;
  type: 'file' | 'dir';
  children?: RepoTree[];
}

export interface Branch {
  name: string;
  sha: string;
  isDefault: boolean;
}

export interface Repository {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
}

export interface PullRequest {
  number: number;
  url: string;
  title: string;
  state: 'open' | 'closed' | 'merged';
  branch: string;
}

// ----------------------------------------------------------------------------
// Settings Types
// ----------------------------------------------------------------------------

export type WebSearchMode = 'off' | 'manual' | 'auto';
export type ToolExecutionMode = 'direct' | 'hybrid' | 'programmatic';

export interface Settings {
  // Deployment
  deployMode: 'safe' | 'direct';
  railwayServiceName: string; // For building preview URLs

  // Model
  model: ModelType;
  effort: EffortLevel;
  
  // Tool Execution
  toolExecutionMode: ToolExecutionMode;

  // Features
  enableWebSearch: boolean;
  webSearchMode: WebSearchMode;
  enableExtendedThinking: boolean;
  thinkingBudget: number;
  enableContextCompaction: boolean;
  enableCodeExecution: boolean;
  enableMemory: boolean;
  enableInterleavedThinking: boolean;
  enableFilesApi: boolean;

  // Budget
  tokenBudget: {
    enabled: boolean;
    perMessage: number;
    perDay: number;
  };
}

// ----------------------------------------------------------------------------
// Citation Type (for web search results)
// ----------------------------------------------------------------------------

export interface Citation {
  url: string;
  title?: string;
  snippet?: string;
  startIndex: number;
  endIndex: number;
}

export type ModelType = 
  | 'claude-sonnet-4-5-20250929'
  | 'claude-opus-4-5-20251101'
  | 'claude-haiku-4-5-20251001';

export type EffortLevel = 'low' | 'medium' | 'high';

// ----------------------------------------------------------------------------
// Cost Tracking Types
// ----------------------------------------------------------------------------

export interface CostTracker {
  sessionCost: number;
  dailyCost: number;
  monthlyCost: number;
  tokensUsed: TokenUsage;
}

export interface MessageCost {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
  savedPercent: number;
}

// ----------------------------------------------------------------------------
// API Types
// ----------------------------------------------------------------------------

export interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  settings: Settings;
  repoContext: {
    owner: string;
    repo: string;
    branch: string;
    fileTree?: string;
    loadedFiles?: RepoFile[];
  };
  files?: UploadedFile[];
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  cost: number;
  savedPercent: number;
  thinkingContent?: string;
  artifacts?: Artifact[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// Post-Edit Action Types
// ----------------------------------------------------------------------------

export interface PostEditState {
  mode: 'safe' | 'direct';
  branch?: string;
  filesChanged: FileChange[];
  totalAdditions: number;
  totalDeletions: number;
  prUrl?: string;
  prNumber?: number;
  previewUrl?: string;
  status: 'pending' | 'pushed' | 'pr_created' | 'confirmed' | 'discarded';
}

// ----------------------------------------------------------------------------
// UI State Types
// ----------------------------------------------------------------------------

export interface AppState {
  // Auth
  isAuthenticated: boolean;
  
  // UI
  darkMode: boolean;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  artifactPanelOpen: boolean;
  
  // Active states
  currentConversationId: string | null;
  currentRepo: Repository | null;
  currentBranch: string;
  
  // Loading states
  isLoading: boolean;
  isStreaming: boolean;
}

// ----------------------------------------------------------------------------
// Tool Types for Claude
// ----------------------------------------------------------------------------

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, ToolProperty>;
    required: string[];
  };
}

export interface ToolProperty {
  type: string;
  description: string;
  enum?: string[];
}

// ----------------------------------------------------------------------------
// Default Values
// ----------------------------------------------------------------------------

export const DEFAULT_SETTINGS: Settings = {
  deployMode: 'safe',
  railwayServiceName: '', // Empty by default, user sets in settings
  model: 'claude-sonnet-4-5-20250929',
  effort: 'medium',
  toolExecutionMode: 'hybrid',
  enableWebSearch: true,
  webSearchMode: 'auto',
  enableExtendedThinking: false,
  thinkingBudget: 10000,
  enableContextCompaction: true,
  enableCodeExecution: false,
  enableMemory: true,
  enableInterleavedThinking: false,
  enableFilesApi: false,
  tokenBudget: {
    enabled: true,
    perMessage: 0.50,
    perDay: 10.0,
  },
};

// ----------------------------------------------------------------------------
// Model Pricing (per million tokens) - Per Anthropic API docs
// ----------------------------------------------------------------------------

export const MODEL_PRICING: Record<ModelType, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-4-5-20250929': {
    input: 3.00,      // $3/M input
    output: 15.00,    // $15/M output
    cacheRead: 0.30,  // 90% off = $0.30/M
    cacheWrite: 3.75, // 25% more = $3.75/M
  },
  'claude-opus-4-5-20251101': {
    input: 15.00,     // $15/M input
    output: 75.00,    // $75/M output
    cacheRead: 1.50,  // 90% off = $1.50/M
    cacheWrite: 18.75,// 25% more = $18.75/M
  },
  'claude-haiku-4-5-20251001': {
    input: 1.00,      // $1/M input (corrected from $0.80)
    output: 5.00,     // $5/M output (corrected from $4.00)
    cacheRead: 0.10,  // 90% off = $0.10/M
    cacheWrite: 1.25, // 25% more = $1.25/M
  },
};

// ----------------------------------------------------------------------------
// Application Constants
// ----------------------------------------------------------------------------

export const APP_CONSTANTS = {
  // Cache settings
  CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_CACHE_SIZE: 100,

  // File content limits
  MAX_TREE_CHARS: 12000,
  MAX_FILE_CHARS: 16000,
  MAX_FILE_SNIPPET_CHARS: 20000,
  MAX_TOOL_RESULT_CHARS: 6000,

  // Agentic loop settings - Claude decides when done, but we have safety limits
  // These are effort-based: low=10 (cost efficient), medium=15, high=25 (complex tasks)
  MAX_AGENTIC_ROUNDS_LOW: 10,
  MAX_AGENTIC_ROUNDS_MEDIUM: 15,
  MAX_AGENTIC_ROUNDS_HIGH: 25,
  MAX_AGENTIC_ROUNDS: 10, // Default (low) for backward compatibility
  MAX_TOOL_ROUNDS: 10, // Alias for backward compatibility

  // Search limits
  MAX_GREP_RESULTS: 50,
  MAX_SEARCH_RESULTS: 20,
  MAX_KEYWORDS: 10,

  // Thinking budget range
  MIN_THINKING_BUDGET: 1024,
  MAX_THINKING_BUDGET: 32000,

  // Conversation title length
  MAX_TITLE_LENGTH: 50,

  // Stuck detection - how many times same tool calls can repeat
  MAX_REPEATED_TOOL_CALLS: 2,
} as const;

// ----------------------------------------------------------------------------
// Agentic Loop Types
// ----------------------------------------------------------------------------

export interface AgenticState {
  round: number;
  seenFiles: Set<string>;
  lastToolCalls: string[];
  isStuck: boolean;
  stuckReason?: string;
}

export interface AgenticStreamChunk {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'tool_start' | 'round_start' | 'stuck_warning' | 'done' | 'error';
  content?: string;
  round?: number;
  toolCall?: { id: string; name: string; input: Record<string, unknown> };
  toolUseId?: string;
  name?: string;
  result?: string;
  message?: string; // Human-friendly message
  cost?: number;
  savedPercent?: number;
  fileChanges?: FileChange[];
  seenFiles?: string[];
  prUrl?: string;
  prNumber?: number;
}

// Model display names for UI
export const MODEL_DISPLAY_NAMES: Record<ModelType, { name: string; cost: string; description: string }> = {
  'claude-haiku-4-5-20251001': {
    name: 'Haiku 4.5',
    cost: '💸',
    description: 'Fastest',
  },
  'claude-sonnet-4-5-20250929': {
    name: 'Sonnet 4.5',
    cost: '💸💸',
    description: 'Default',
  },
  'claude-opus-4-5-20251101': {
    name: 'Opus 4.5',
    cost: '💸💸💸',
    description: 'Best',
  },
};
