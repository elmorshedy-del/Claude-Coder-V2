// ============================================================================
// CLAUDE CLIENT - API Integration with all features
// Includes: Prompt caching, extended thinking, effort parameter, tools
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { 
  CostTracker, 
  TokenUsage, 
  MessageCost, 
  ModelType, 
  EffortLevel,
  Settings,
  ClaudeTool,
  MODEL_PRICING,
  Artifact,
  ArtifactType,
  Citation,
  ToolExecutionMode,
} from '@/types';

// ----------------------------------------------------------------------------
// Claude Client Class
// ----------------------------------------------------------------------------

export class ClaudeClient {
  private client: Anthropic;
  private model: ModelType;
  private costTracker: CostTracker;

  constructor(apiKey: string, model: ModelType = 'claude-sonnet-4-5-20250929') {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('API key is required');
    }
    if (!apiKey.startsWith('sk-ant-')) {
      throw new Error('Invalid API key format. Must start with "sk-ant-"');
    }
    try {
      this.client = new Anthropic({ apiKey });
    } catch (error) {
      throw new Error(`Failed to initialize Claude client: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    this.model = model;
    this.costTracker = {
      sessionCost: 0,
      dailyCost: 0,
      monthlyCost: 0,
      tokensUsed: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
  }

  setModel(model: ModelType): void {
    this.model = model;
  }

  // --------------------------------------------------------------------------
  // Cost Calculation - Enhanced with real savings tracking
  // --------------------------------------------------------------------------

  private calculateCost(usage: TokenUsage): MessageCost {
    if (!usage || typeof usage !== 'object') {
      throw new Error('Invalid usage data provided');
    }
    
    const pricing = MODEL_PRICING[this.model];
    if (!pricing) {
      throw new Error(`Unknown model: ${this.model}`);
    }
    
    const inputCost = (usage.input || 0) * pricing.input / 1_000_000;
    const outputCost = (usage.output || 0) * pricing.output / 1_000_000;
    const cacheReadCost = (usage.cacheRead || 0) * pricing.cacheRead / 1_000_000;
    const cacheWriteCost = (usage.cacheWrite || 0) * pricing.cacheWrite / 1_000_000;
    
    const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;
    
    // Accurate savings: what we WOULD have paid if cacheRead tokens were charged at full input price
    const cacheReadTokens = usage.cacheRead || 0;
    const costIfNoCache = cacheReadTokens * pricing.input / 1_000_000;
    const actualCacheReadCost = cacheReadCost;
    const savedAmount = costIfNoCache - actualCacheReadCost;
    
    // Calculate savings percentage based on what cache saved us
    const savedPercent = costIfNoCache > 0
      ? Math.round((savedAmount / (totalCost + savedAmount)) * 100)
      : 0;

    return {
      inputCost,
      outputCost,
      cacheReadCost,
      cacheWriteCost,
      totalCost,
      savedPercent: Math.max(0, Math.min(95, savedPercent)),
    };
  }

  private updateCostTracker(usage: TokenUsage): void {
    if (!usage || typeof usage !== 'object') {
      console.warn('Invalid usage data provided to updateCostTracker');
      return;
    }
    
    const cost = this.calculateCost(usage);
    this.costTracker.sessionCost += cost.totalCost;
    this.costTracker.dailyCost += cost.totalCost;
    this.costTracker.monthlyCost += cost.totalCost;

    this.updateTokenUsage(usage);
  }

  private updateTokenUsage(usage: TokenUsage): void {
    this.costTracker.tokensUsed.input += usage.input || 0;
    this.costTracker.tokensUsed.output += usage.output || 0;
    this.costTracker.tokensUsed.cacheRead = (this.costTracker.tokensUsed.cacheRead || 0) + (usage.cacheRead || 0);
    this.costTracker.tokensUsed.cacheWrite = (this.costTracker.tokensUsed.cacheWrite || 0) + (usage.cacheWrite || 0);
  }

  getCostTracker(): CostTracker {
    return { ...this.costTracker };
  }

  resetSessionCost(): void {
    this.costTracker.sessionCost = 0;
    this.costTracker.tokensUsed = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }

  // --------------------------------------------------------------------------
  // Helper Functions
  // --------------------------------------------------------------------------

  private getEffortConfig(effort: EffortLevel, thinkingBudget: number) {
    const configs = {
      low: { maxTokens: 4000, thinkingMultiplier: 0.3 },
      medium: { maxTokens: 12000, thinkingMultiplier: 0.6 },
      high: { maxTokens: 24000, thinkingMultiplier: 1.0 },
    };
    const config = configs[effort] ?? configs.medium;
    return {
      ...config,
      adjustedThinkingBudget: Math.round(thinkingBudget * config.thinkingMultiplier)
    };
  }

  private buildToolsArray(tools: ClaudeTool[] | undefined, toolExecutionMode: ToolExecutionMode, enableCodeExecution: boolean, enableMemory: boolean) {
    const allTools: Array<ClaudeTool | { type: string; name: string }> = [...(tools ?? this.getDefaultTools(toolExecutionMode))];
    if (enableCodeExecution) allTools.push(this.getCodeExecutionTool());
    if (enableMemory) allTools.push(this.getMemoryTool());
    return allTools;
  }

  private buildBetaHeaders(enableCodeExecution: boolean, enableMemory: boolean, enableContextCompaction: boolean, enableInterleavedThinking: boolean, toolExecutionMode: ToolExecutionMode) {
    const betas: string[] = [];
    if (enableCodeExecution) betas.push('code-execution-2025-05-22');
    if (enableMemory || enableContextCompaction) betas.push('context-management-2025-06-27');
    if (enableInterleavedThinking) betas.push('interleaved-thinking-2025-05-14');
    if (toolExecutionMode !== 'direct') betas.push('advanced-tool-use-2025-11-20');
    return betas;
  }

  // --------------------------------------------------------------------------
  // Main Chat Function (Non-streaming)
  // --------------------------------------------------------------------------

  async chat(
    messages: Array<{ role: 'user' | 'assistant'; content: string | Anthropic.ContentBlockParam[] }>,
    systemPrompt: string,
    codeContext: string,
    options: {
      tools?: ClaudeTool[];
      enableThinking?: boolean;
      thinkingBudget?: number;
      effort?: EffortLevel;
      enableCodeExecution?: boolean;
      enableMemory?: boolean;
      enableContextCompaction?: boolean;
      enableInterleavedThinking?: boolean;
      toolExecutionMode?: ToolExecutionMode;
    } = {}
  ): Promise<{
    content: string;
    toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
    usage: TokenUsage;
    cost: number;
    savedPercent: number;
    thinkingContent?: string;
    artifacts?: Artifact[];
    citations?: Citation[];
    codeExecutionResults?: Array<{ stdout: string; stderr: string; returnCode: number }>;
  }> {
    const { 
      tools, 
      enableThinking = false, 
      thinkingBudget = 10000,
      effort = 'medium',
      enableCodeExecution = false,
      enableMemory = false,
      enableContextCompaction = false,
      enableInterleavedThinking = false,
      toolExecutionMode = 'direct',
    } = options;

    const config = this.getEffortConfig(effort, thinkingBudget);
    const allTools = this.buildToolsArray(tools, toolExecutionMode, enableCodeExecution, enableMemory);

    // Build system blocks with prompt caching for BOTH system prompt and code context
    // Cache order matters: put most stable content first (system prompt), then code context
    // Both get cache_control to maximize cache hits (90% cost savings on cached tokens)
    const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [];
    if (systemPrompt && systemPrompt.trim()) {
      systemBlocks.push({
        type: 'text',
        text: systemPrompt,
        // Cache system prompt - it's stable across messages in a conversation
        cache_control: { type: 'ephemeral' },
      });
    }
    if (codeContext && codeContext.trim()) {
      systemBlocks.push({
        type: 'text',
        text: codeContext,
        // Cache code context - stable within a session (file tree + loaded files)
        cache_control: { type: 'ephemeral' },
      });
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: config.maxTokens,
        system: systemBlocks as Anthropic.Messages.TextBlockParam[],
        messages: messages as Anthropic.Messages.MessageParam[],
        tools: allTools.length > 0 ? allTools as Anthropic.Messages.Tool[] : undefined,
        stream: false,
        ...(enableThinking && {
          thinking: {
            type: 'enabled',
            budget_tokens: config.adjustedThinkingBudget,
          },
        }),
      } as Anthropic.Messages.MessageCreateParams) as Anthropic.Messages.Message;

      // Extract content
      let textContent = '';
      let thinkingContent = '';
      const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      const codeExecutionResults: Array<{ stdout: string; stderr: string; returnCode: number }> = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'thinking') {
          thinkingContent += (block as any).thinking || '';
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
        } else if ((block as any).type === 'code_execution_result') {
          const result = block as any;
          codeExecutionResults.push({
            stdout: result.stdout || '',
            stderr: result.stderr || '',
            returnCode: result.return_code || 0,
          });
        }
      }

      // Calculate usage
      const usage: TokenUsage = {
        input: response.usage?.input_tokens || 0,
        output: response.usage?.output_tokens || 0,
        cacheRead: (response.usage as any)?.cache_read_input_tokens || 0,
        cacheWrite: (response.usage as any)?.cache_creation_input_tokens || 0,
      };

      this.updateCostTracker(usage);
      const costInfo = this.calculateCost(usage);

      // Parse artifacts from response
      const artifacts = this.parseArtifacts(textContent);

      return {
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        cost: costInfo.totalCost,
        savedPercent: costInfo.savedPercent,
        thinkingContent: thinkingContent || undefined,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
        codeExecutionResults: codeExecutionResults.length > 0 ? codeExecutionResults : undefined,
      };
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Claude API error: ${error.message}`);
      }
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Streaming Chat Function
  // --------------------------------------------------------------------------

  async *streamChat(
    messages: Array<{ role: 'user' | 'assistant'; content: string | Anthropic.ContentBlockParam[] }>,
    systemPrompt: string,
    codeContext: string,
    options: {
      tools?: ClaudeTool[];
      enableThinking?: boolean;
      thinkingBudget?: number;
      effort?: EffortLevel;
      enableCodeExecution?: boolean;
      enableMemory?: boolean;
      enableContextCompaction?: boolean;
      enableInterleavedThinking?: boolean;
      toolExecutionMode?: ToolExecutionMode;
    } = {}
  ): AsyncGenerator<{
    type: 'text' | 'thinking' | 'tool_use' | 'done';
    content?: string;
    toolCall?: { id: string; name: string; input: Record<string, unknown> };
    usage?: TokenUsage;
    cost?: number;
    savedPercent?: number;
  }> {
    const { 
      tools, 
      enableThinking = false, 
      thinkingBudget = 10000,
      effort = 'medium',
      enableCodeExecution = false,
      enableMemory = false,
      enableContextCompaction = false,
      enableInterleavedThinking = false,
      toolExecutionMode = 'direct',
    } = options;

    const config = this.getEffortConfig(effort, thinkingBudget);
    const allTools = this.buildToolsArray(tools, toolExecutionMode, enableCodeExecution, enableMemory);

    // Build system blocks with caching
    const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [];
    if (systemPrompt && systemPrompt.trim()) {
      systemBlocks.push({
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      });
    }
    if (codeContext && codeContext.trim()) {
      systemBlocks.push({
        type: 'text',
        text: codeContext,
        cache_control: { type: 'ephemeral' },
      });
    }

    try {
      const stream = await this.client.messages.stream({
        model: this.model,
        max_tokens: config.maxTokens,
        system: systemBlocks as Anthropic.Messages.TextBlockParam[],
        messages: messages as Anthropic.Messages.MessageParam[],
        tools: allTools.length > 0 ? allTools as Anthropic.Messages.Tool[] : undefined,
        ...(enableThinking && {
          thinking: {
            type: 'enabled',
            budget_tokens: config.adjustedThinkingBudget,
          },
        }),
      } as Anthropic.Messages.MessageStreamParams);

      let currentToolCall: { id: string; name: string; input: string } | null = null;

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          const block = event.content_block;
          if (block.type === 'tool_use') {
            currentToolCall = {
              id: block.id,
              name: block.name,
              input: '',
            };
          }
        } else if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            yield { type: 'text', content: delta.text };
          } else if (delta.type === 'thinking_delta') {
            yield { type: 'thinking', content: (delta as any).thinking };
          } else if (delta.type === 'input_json_delta' && currentToolCall) {
            currentToolCall.input += (delta as any).partial_json || '';
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolCall) {
            try {
              const parsedInput = JSON.parse(currentToolCall.input || '{}');
              yield {
                type: 'tool_use',
                toolCall: {
                  id: currentToolCall.id,
                  name: currentToolCall.name,
                  input: parsedInput,
                },
              };
            } catch {
              // Invalid JSON, skip
            }
            currentToolCall = null;
          }
        } else if (event.type === 'message_stop') {
          // Get final message for usage
          const finalMessage = await stream.finalMessage();
          const usage: TokenUsage = {
            input: finalMessage.usage?.input_tokens || 0,
            output: finalMessage.usage?.output_tokens || 0,
            cacheRead: (finalMessage.usage as any)?.cache_read_input_tokens || 0,
            cacheWrite: (finalMessage.usage as any)?.cache_creation_input_tokens || 0,
          };

          this.updateCostTracker(usage);
          const costInfo = this.calculateCost(usage);

          yield {
            type: 'done',
            usage,
            cost: costInfo.totalCost,
            savedPercent: costInfo.savedPercent,
          };
        }
      }
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Claude API error: ${error.message}`);
      }
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Default Tools - WITH LINE RANGE SUPPORT
  // --------------------------------------------------------------------------

  getDefaultTools(_toolExecutionMode: ToolExecutionMode = 'direct'): ClaudeTool[] {
    const baseTools: ClaudeTool[] = [
      {
        name: 'read_file',
        description: `Read file contents. Use start_line/end_line to read specific sections (saves tokens).
        
Examples:
- Read whole file: read_file({ path: "src/app.ts" })
- Read lines 50-100: read_file({ path: "src/app.ts", start_line: 50, end_line: 100 })
- Read first 50 lines: read_file({ path: "src/app.ts", end_line: 50 })

TIP: Use grep_search first to find the line numbers you need, then read_file with line range.`,
        input_schema: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string',
              description: 'The path to the file relative to repo root',
            },
            start_line: {
              type: 'number',
              description: 'Optional: Start reading from this line (1-indexed)',
            },
            end_line: {
              type: 'number',
              description: 'Optional: Stop reading at this line (inclusive)',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'str_replace',
        description: 'Replace a unique string in a file with another string. The old_str must appear exactly once in the file.',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string',
              description: 'The path to the file to edit',
            },
            old_str: {
              type: 'string',
              description: 'The exact string to find and replace (must be unique in the file)',
            },
            new_str: {
              type: 'string',
              description: 'The string to replace it with',
            },
          },
          required: ['path', 'old_str', 'new_str'],
        },
      },
      {
        name: 'create_file',
        description: 'Create a new file with the given content',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string',
              description: 'The path where the file should be created',
            },
            content: {
              type: 'string',
              description: 'The content of the new file',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'search_files',
        description: 'Search for files by name. Returns file paths matching the query.',
        input_schema: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description: 'The search term to look for in file names',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'grep_search',
        description: 'Search inside file contents. Returns matching lines with file paths and LINE NUMBERS. Use this to find where code is before using read_file.',
        input_schema: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description: 'The term to search for inside files',
            },
            file_extensions: {
              type: 'string',
              description: 'Optional comma-separated list of file extensions to search (e.g., "ts,tsx,js")',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'verify_edit',
        description: 'After making an edit with str_replace, verify the change was applied correctly by checking if expected content exists in the file. ALWAYS use this after str_replace to confirm your edit worked.',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string',
              description: 'The path to the file to verify',
            },
            expected_content: {
              type: 'string',
              description: 'A snippet of text that should now exist in the file after the edit',
            },
          },
          required: ['path', 'expected_content'],
        },
      },
      {
        name: 'run_command',
        description: 'Execute a bash command in the repository directory. Use for: running tests, installing packages, git operations, building, linting, etc.',
        input_schema: {
          type: 'object' as const,
          properties: {
            command: {
              type: 'string',
              description: 'The bash command to execute (e.g., "npm test", "git status", "grep -r TODO")',
            },
          },
          required: ['command'],
        },
      },
    ];

    return baseTools;
  }

  // --------------------------------------------------------------------------
  // Code Execution Tool (Beta)
  // --------------------------------------------------------------------------

  getCodeExecutionTool(): { type: string; name: string } {
    return {
      type: 'bash_20250124',
      name: 'bash',
    };
  }

  // --------------------------------------------------------------------------
  // Memory Tool (Beta) 
  // --------------------------------------------------------------------------

  getMemoryTool(): { type: string; name: string } {
    return {
      type: 'memory_20250818',
      name: 'memory',
    };
  }

  // --------------------------------------------------------------------------
  // Web Search Tool
  // --------------------------------------------------------------------------

  getWebSearchTool(): ClaudeTool {
    return {
      name: 'web_search',
      description: `Search the web for current, real-time information.

ALWAYS USE when the query involves:
- Current events, news, recent happenings
- "Latest", "newest", "current", "today", "2024", "2025"
- Prices, stock values, exchange rates
- Version numbers, release dates, changelogs
- Documentation for libraries/frameworks (may have updated)
- Error messages you don't recognize
- People's current roles/positions
- Availability, schedules, hours of operation
- Laws, regulations, policies (may have changed)
- Product comparisons, reviews, recommendations

NEVER USE when:
- User asks about their own code/repository
- Basic programming concepts
- Math calculations
- Historical facts that won't change
- Debugging user's specific code
- Explaining code the user provided
- Creative writing, brainstorming
- General coding patterns/best practices you already know

ASK YOURSELF: "Could this information have changed since my training?"
- If YES → search
- If NO → don't search`,
      input_schema: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
        },
        required: ['query'],
      },
    };
  }

  // --------------------------------------------------------------------------
  // Web Fetch Tool - Get full page content
  // --------------------------------------------------------------------------

  getWebFetchTool(): ClaudeTool {
    return {
      name: 'web_fetch',
      description: `Fetch the full content of a web page by URL.

USE when:
- You found a promising URL from web_search and need more details
- User provides a specific URL to read
- Documentation page needs complete reading
- Article or blog post requires full context

DO NOT USE for:
- Random URLs without reason
- Sites requiring authentication
- Very large pages (will be truncated)`,
      input_schema: {
        type: 'object' as const,
        properties: {
          url: {
            type: 'string',
            description: 'The full URL to fetch (must include https://)',
          },
        },
        required: ['url'],
      },
    };
  }

  // --------------------------------------------------------------------------
  // Parse Artifacts from Response
  // Extracts code blocks and determines their type for rendering
  // --------------------------------------------------------------------------

  private parseArtifacts(content: string): Artifact[] {
    const artifacts: Artifact[] = [];
    const matches = content.matchAll(/```(\w+)?\n([\s\S]*?)```/g);
    
    // Pre-compiled type mapping for O(1) lookup
    const typeMap: Record<string, ArtifactType> = {
      html: 'html', svg: 'svg', mermaid: 'mermaid',
      jsx: 'react', tsx: 'react', react: 'react',
      md: 'markdown', markdown: 'markdown'
    };

    let artifactIndex = 0;
    for (const match of matches) {
      const language = match[1]?.toLowerCase() ?? 'text';
      const type = typeMap[language] ?? 'code';
      
      artifacts.push({
        id: `artifact-${artifactIndex++}`,
        name: `Code ${artifactIndex}`,
        type,
        content: match[2],
        language,
      });
    }

    return artifacts;
  }
}

// ----------------------------------------------------------------------------
// System Prompt - FIXED: Action-oriented, no announcements
// ----------------------------------------------------------------------------

export function getSystemPrompt(
  owner: string,
  repo: string,
  branch: string,
  enableWebSearch: boolean = false,
  isLocalMode: boolean = false
): string {
  const tools = ['read_file', 'search_files', 'grep_search', 'str_replace', 'create_file', 'verify_edit', 'run_command'];
  if (enableWebSearch) tools.push('web_search', 'web_fetch');

  const repoInfo = isLocalMode
    ? `## Local Filesystem Mode
You have direct access to the local filesystem.`
    : `## Repository: ${owner}/${repo} (branch: ${branch})`;

  const editingInstructions = isLocalMode
    ? `## Editing (Local Mode)
Use run_command with sed/bash for all edits:
- Edit: run_command({command: "sed -i 's/old/new/' file.ts"})
- Create: run_command({command: "echo 'content' > file.ts"})
- Git: run_command({command: "git add . && git commit -m 'msg'"})`
    : `## Editing (GitHub Mode)
1. str_replace - old_str must be UNIQUE and EXACT
2. verify_edit - ALWAYS verify after str_replace
3. create_file - for new files`;

  return `You are a coding assistant. Execute tasks directly.

${repoInfo}

## Tools
${tools.join(', ')}

## RULES - READ CAREFULLY

1. **NO ANNOUNCEMENTS** - Never say "Let me...", "I will...", "I'm going to..."
2. **JUST DO IT** - Use tools immediately. Don't explain what you're about to do.
3. **EXPLORE FIRST** - Use grep_search to find code before reading entire files
4. **LINE RANGES** - Use read_file with start_line/end_line to save tokens
5. **BRIEF STATUS ONLY** - You may say "Searching...", "Editing...", "Done ✓"

## WRONG (verbose):
"Let me read the file first to understand the structure. I'll search for the function and then make the necessary changes."

## RIGHT (action):
[uses grep_search tool]
[uses read_file with line range]
[uses str_replace]
Done ✓

${editingInstructions}

## Response Style
- Minimal text
- Use tools immediately
- End with brief summary: "Done: changed X in file.ts"`;
}

// ----------------------------------------------------------------------------
// Generate Code Context for Prompt
// ----------------------------------------------------------------------------

const truncateFileContent = (content: string): string => {
  const MAX_LENGTH = 10000;
  return content.length > MAX_LENGTH 
    ? content.slice(0, MAX_LENGTH) + '\n\n// ... (truncated, use read_file for full content)'
    : content;
};

export function generateCodeContext(
  fileTree: string,
  files: Array<{ path: string; content: string }>
): string {
  let context = '';
  
  // Always include file tree (caching makes it cheap)
  if (fileTree) {
    const treeLines = fileTree.split('\n');
    const compactTree = treeLines.length > 500 
      ? treeLines.slice(0, 500).join('\n') + '\n... (truncated)'
      : fileTree;
    context += `## Repository Structure\n\`\`\`\n${compactTree}\n\`\`\`\n\n`;
  }
  
  if (files.length === 0) {
    context += `## Files\n(No files loaded. Use grep_search or search_files to explore, then read_file to load specific files.)\n`;
  } else {
    context += `## Loaded Files\n\n`;
    for (const file of files) {
      const ext = file.path.split('.').pop() ?? '';
      const content = truncateFileContent(file.content);
      context += `### ${file.path}\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
    }
  }

  return context;
}

// ----------------------------------------------------------------------------
// Extract Keywords - KEPT for backward compatibility but NOT USED for auto-loading
// ----------------------------------------------------------------------------

const COMMON_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use',
  'fix', 'add', 'create', 'update', 'change', 'modify', 'edit', 'help', 'please', 'want', 'need', 'make', 'file', 'code', 'function', 'component', 'error', 'bug', 'issue'
]);

const KEYWORD_PATTERNS = [
  /[A-Z][a-z]+(?:[A-Z][a-z]+)*/g, // PascalCase
  /[a-z]+(?:[A-Z][a-z]+)+/g, // camelCase
  /[a-z_]+\.[a-z]{2,4}/g, // filenames
  /[a-z_][a-z0-9_]{2,}/g // snake_case/identifiers
];

export function extractKeywords(message: string): string[] {
  const words = new Set<string>();
  
  for (const pattern of KEYWORD_PATTERNS) {
    for (const match of message.matchAll(pattern)) {
      if (words.size >= 5) return Array.from(words);
      const word = match[0];
      const lower = word.toLowerCase();
      if (word.length > 2 && !COMMON_WORDS.has(lower)) {
        words.add(word);
      }
    }
  }
  
  return Array.from(words);
}
