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

export interface Settings {
  // Deployment
  deployMode: 'safe' | 'direct';
  
  // Model
  model: ModelType;
  effort: EffortLevel;
  
  // Features
  enableWebSearch: boolean;
  webSearchAutoDetect: boolean;
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
  model: 'claude-sonnet-4-5-20250929',
  effort: 'medium',
  enableWebSearch: true,
  webSearchAutoDetect: true,
  enableExtendedThinking: false,
  thinkingBudget: 10000,
  enableContextCompaction: true,
  enableCodeExecution: false,
  enableMemory: false,
  enableInterleavedThinking: true,
  enableFilesApi: false,
  tokenBudget: {
    enabled: true,
    perMessage: 1.0,
    perDay: 10.0,
  },
};

// ----------------------------------------------------------------------------
// Model Pricing (per million tokens)
// ----------------------------------------------------------------------------

export const MODEL_PRICING: Record<ModelType, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-4-5-20250929': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.75,
  },
  'claude-opus-4-5-20251101': {
    input: 15.00,
    output: 75.00,
    cacheRead: 1.50,
    cacheWrite: 18.75,
  },
  'claude-haiku-4-5-20251001': {
    input: 0.80,
    output: 4.00,
    cacheRead: 0.08,
    cacheWrite: 1.00,
  },
};
