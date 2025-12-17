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
    this.client = new Anthropic({ apiKey });
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
    const cost = this.calculateCost(usage);
    this.costTracker.sessionCost += cost.totalCost;
    this.costTracker.dailyCost += cost.totalCost;
    this.costTracker.monthlyCost += cost.totalCost;

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

    // Map effort to max_tokens and thinking budget - reduced for cost efficiency
    const effortConfig = {
      low: { maxTokens: 4000, thinkingMultiplier: 0.3 },
      medium: { maxTokens: 12000, thinkingMultiplier: 0.6 },
      high: { maxTokens: 24000, thinkingMultiplier: 1.0 },
    };
    const config = effortConfig[effort] ?? effortConfig.medium;
    const adjustedThinkingBudget = Math.round(thinkingBudget * config.thinkingMultiplier);

    // Build tools array with special tools
    const allTools: Array<ClaudeTool | { type: string; name: string }> = [...(tools ?? this.getDefaultTools(toolExecutionMode))];
    
    if (enableCodeExecution) {
      allTools.push(this.getCodeExecutionTool());
    }
    
    if (enableMemory) {
      allTools.push(this.getMemoryTool());
    }

    // Build beta headers array
    const betas: string[] = [];
    if (enableCodeExecution) {
      betas.push('code-execution-2025-05-22');
    }
    if (enableMemory || enableContextCompaction) {
      betas.push('context-management-2025-06-27');
    }
    if (enableInterleavedThinking) {
      betas.push('interleaved-thinking-2025-05-14');
    }
    if (toolExecutionMode !== 'direct') {
      betas.push('advanced-tool-use-2025-11-20');
    }

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

    // Build request parameters
    const requestParams: Anthropic.MessageCreateParams = {
      model: this.model,
      max_tokens: config.maxTokens,
      system: systemBlocks.length > 0 ? systemBlocks : undefined,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      tools: allTools as Anthropic.MessageCreateParams['tools'],
    };

    // Add extended thinking if enabled - capped at 10k for cost control
    if (enableThinking && (this.model.includes('opus') || this.model.includes('sonnet'))) {
      (requestParams as unknown as Record<string, unknown>).thinking = {
        type: 'enabled',
        budget_tokens: Math.max(1024, Math.min(adjustedThinkingBudget, 10000)),
      };
    }

    // Make API call with beta headers if needed
    let response: Anthropic.Message;
    try {
      if (betas.length > 0) {
        response = await this.client.beta.messages.create({
          ...requestParams,
          betas,
        } as Parameters<typeof this.client.beta.messages.create>[0]) as unknown as Anthropic.Message;
      } else {
        response = await this.client.messages.create(requestParams);
      }
    } catch (error) {
      throw new Error(`Claude API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Parse usage
    const usage: TokenUsage = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cacheRead: (response.usage as unknown as Record<string, number>).cache_read_input_tokens || 0,
      cacheWrite: (response.usage as unknown as Record<string, number>).cache_creation_input_tokens || 0,
    };

    this.updateCostTracker(usage);
    const costInfo = this.calculateCost(usage);

    // Extract content, tool calls, thinking, artifacts, and citations
    let content = '';
    let thinkingContent = '';
    const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    const artifacts: Artifact[] = [];
    const citations: Citation[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
        // Parse artifacts from content
        try {
          const parsedArtifacts = this.parseArtifacts(block.text);
          artifacts.push(...parsedArtifacts);
        } catch (error) {
          console.warn('Failed to parse artifacts:', error);
        }
        // Parse citations if present (from web search tool results)
        const blockAny = block as unknown as { text: string; citations?: Array<{ url?: string; cited_text?: string; start_char_index?: number; end_char_index?: number; title?: string }> };
        if (blockAny.citations && Array.isArray(blockAny.citations)) {
          for (const cite of blockAny.citations) {
            if (cite.url) {
              citations.push({
                url: cite.url,
                title: cite.title ?? undefined,
                snippet: cite.cited_text ?? undefined,
                startIndex: cite.start_char_index ?? 0,
                endIndex: cite.end_char_index ?? 0,
              });
            }
          }
        }
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      } else if (block.type === 'thinking') {
        thinkingContent += (block as { type: 'thinking'; thinking: string }).thinking;
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      cost: costInfo.totalCost,
      savedPercent: costInfo.savedPercent,
      thinkingContent: thinkingContent || undefined,
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      citations: citations.length > 0 ? citations : undefined,
    };
  }

  // --------------------------------------------------------------------------
  // Streaming Chat
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
      enableContextCompaction?: boolean;
      enableInterleavedThinking?: boolean;
      toolExecutionMode?: ToolExecutionMode;
    } = {}
  ): AsyncGenerator<{
    type: 'text' | 'thinking' | 'tool_use' | 'citation' | 'done';
    content?: string;
    toolCall?: { id: string; name: string; input: Record<string, unknown> };
    citation?: Citation;
    usage?: TokenUsage;
    cost?: number;
    savedPercent?: number;
  }> {
    const { 
      tools, 
      enableThinking = false, 
      thinkingBudget = 10000,
      effort = 'medium',
      enableContextCompaction = false,
      enableInterleavedThinking = false,
      toolExecutionMode = 'direct',
    } = options;

    // Map effort to max_tokens and thinking budget - reduced for cost efficiency
    const effortConfig = {
      low: { maxTokens: 4000, thinkingMultiplier: 0.3 },
      medium: { maxTokens: 12000, thinkingMultiplier: 0.6 },
      high: { maxTokens: 24000, thinkingMultiplier: 1.0 },
    };
    const config = effortConfig[effort] ?? effortConfig.medium;
    const adjustedThinkingBudget = Math.round(thinkingBudget * config.thinkingMultiplier);

    // Build beta headers
    const betas: string[] = [];
    if (enableContextCompaction) {
      betas.push('context-management-2025-06-27');
    }
    if (enableInterleavedThinking) {
      betas.push('interleaved-thinking-2025-05-14');
    }
    if (toolExecutionMode !== 'direct') {
      betas.push('advanced-tool-use-2025-11-20');
    }

    // Build system blocks with prompt caching for BOTH system prompt and code context
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

    const requestParams: Anthropic.MessageCreateParams = {
      model: this.model,
      max_tokens: config.maxTokens,
      stream: true,
      system: systemBlocks.length > 0 ? systemBlocks : undefined,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      tools: tools ?? this.getDefaultTools(toolExecutionMode),
    };

    if (enableThinking && (this.model.includes('opus') || this.model.includes('sonnet'))) {
      (requestParams as unknown as Record<string, unknown>).thinking = {
        type: 'enabled',
        budget_tokens: Math.max(1024, Math.min(adjustedThinkingBudget, 10000)),
      };
    }

    // Use beta streaming if we have beta headers
    let stream;
    try {
      if (betas.length > 0) {
        stream = await this.client.beta.messages.stream({
          ...requestParams,
          betas,
        } as Parameters<typeof this.client.beta.messages.stream>[0]);
      } else {
        stream = await this.client.messages.stream(requestParams);
      }
    } catch (error) {
      throw new Error(`Claude streaming error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    let currentToolCall: { id: string; name: string; input: string } | null = null;

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        
        if ('text' in delta) {
          yield { type: 'text', content: delta.text };
        } else if ('thinking' in delta) {
          yield { type: 'thinking', content: (delta as { thinking: string }).thinking };
        } else if ('partial_json' in delta && currentToolCall) {
          currentToolCall.input += (delta as { partial_json: string }).partial_json;
        }
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolCall = {
            id: event.content_block.id,
            name: event.content_block.name,
            input: '',
          };
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
          } catch (error) {
            console.warn('Failed to parse tool input:', error);
          }
          currentToolCall = null;
        }
      } else if (event.type === 'message_stop') {
        // Get final usage from the accumulated message
        const finalMessage = await stream.finalMessage();
        if (!finalMessage) {
          throw new Error('No final message received from stream');
        }
        const usage: TokenUsage = {
          input: finalMessage.usage.input_tokens,
          output: finalMessage.usage.output_tokens,
          cacheRead: (finalMessage.usage as unknown as Record<string, number>).cache_read_input_tokens || 0,
          cacheWrite: (finalMessage.usage as unknown as Record<string, number>).cache_creation_input_tokens || 0,
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
  }

  // --------------------------------------------------------------------------
  // Default Tools
  // --------------------------------------------------------------------------

  getDefaultTools(toolExecutionMode: ToolExecutionMode = 'direct'): ClaudeTool[] {
    const baseTools: ClaudeTool[] = [
      {
        name: 'read_file',
        description: 'Read the contents of a file from the repository',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string',
              description: 'The path to the file relative to repo root',
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
        description: 'Search for files in the repository that match a query',
        input_schema: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description: 'The search term to look for in file names or content',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'grep_search',
        description: 'Search inside file contents for a specific term. Returns matching lines with file paths and line numbers.',
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

    // Only add allowed_callers for non-direct modes
    if (toolExecutionMode === 'direct') {
      return baseTools;
    }

    const allowedCallers: string[] = toolExecutionMode === 'hybrid' 
      ? ['direct', 'code_execution_20250825']
      : ['code_execution_20250825'];

    return baseTools.map(tool => ({
      ...tool,
      allowed_callers: allowedCallers,
    }));
  }

  // --------------------------------------------------------------------------
  // Code Execution Tool (Beta)
  // --------------------------------------------------------------------------

  getCodeExecutionTool(): { type: string; name: string } {
    return {
      type: 'code_execution_20250825',
      name: 'code_execution',
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
    
    // Match code blocks with language specifier
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    let artifactIndex = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const language = match[1]?.toLowerCase() ?? 'text';
      const code = match[2];

      // Determine artifact type based on language
      let type: ArtifactType = 'code';
      if (language === 'html') type = 'html';
      else if (language === 'svg') type = 'svg';
      else if (language === 'mermaid') type = 'mermaid';
      else if (['jsx', 'tsx', 'react'].includes(language)) type = 'react';
      else if (['md', 'markdown'].includes(language)) type = 'markdown';

      artifacts.push({
        id: `artifact-${artifactIndex++}`,
        name: `Code ${artifactIndex}`,
        type,
        content: code,
        language,
      });
    }

    return artifacts;
  }
}

// ----------------------------------------------------------------------------
// System Prompt (Minimal - Let Claude be Claude)
// ----------------------------------------------------------------------------

export function getSystemPrompt(
  owner: string,
  repo: string,
  branch: string,
  enableWebSearch: boolean = false,
  isLocalMode: boolean = false
): string {
  const tools = ['read_file', 'search_files', 'grep_search', 'run_command'];
  if (enableWebSearch) tools.push('web_search', 'web_fetch');

  const repoInfo = isLocalMode
    ? `## Local Filesystem Mode
You have direct access to the local filesystem. All file operations work on the user's local machine.`
    : `## Repository Context
- Owner: ${owner}
- Repo: ${repo}
- Branch: ${branch}`;

  const editingInstructions = isLocalMode
    ? `## Editing Files (Local Mode)
**CRITICAL: You MUST use run_command with bash for ALL file edits**

1. **To edit files:** Use run_command with sed/perl/awk
   Example: run_command({command: "sed -i 's/old text/new text/' src/file.ts"})

2. **To create files:** Use run_command with echo or cat
   Example: run_command({command: "echo 'content' > newfile.ts"})

3. **To commit changes:** Use run_command with git
   Example: run_command({command: "git add . && git commit -m 'message'"})

4. **To push changes:** Use run_command with git push
   Example: run_command({command: "git push"})

**DO NOT use str_replace or create_file tools - they don't work in local mode!**
Only run_command works for file modifications.`
    : `## Editing Files (GitHub Mode)
1. Use str_replace (preferred)
2. old_str must be UNIQUE and EXACT
3. ALWAYS verify_edit after str_replace
4. Use create_file for new files
5. Use run_command for bash operations (tests, git, npm, etc.)`;

  return `You are Claude, an AI assistant helping with coding.

${repoInfo}

## Available Tools
${tools.join(', ')}

## CRITICAL RULES
1. NEVER read files just to analyze - ONLY read if you need specific content to make an edit
2. MAKE EDITS IMMEDIATELY - don't explain what you'll do, just do it
3. ONLY give status updates ("Editing X...", "Done")
4. NO explanations of what/why/how
5. If task is clear, USE TOOLS IMMEDIATELY

${editingInstructions}

## Response Format
**Done:**
- file.ts:123 - Changed X
- Verified ✓`;
}

// ----------------------------------------------------------------------------
// Generate Code Context for Prompt
// ----------------------------------------------------------------------------

export function generateCodeContext(
  fileTree: string,
  files: Array<{ path: string; content: string }>
): string {
  // Optimized context - only include relevant parts
  let context = '';
  
  // Only include file tree if we have few files loaded
  if (files.length <= 2 && fileTree) {
    const compactTree = fileTree.split('\n').slice(0, 20).join('\n');
    context += `## Repository Structure\n\`\`\`\n${compactTree}\n\`\`\`\n\n`;
  }
  
  context += `## Loaded Files\n\n`;

  for (const file of files) {
    const ext = file.path.split('.').pop() ?? '';
    // Truncate large files to save tokens
    const content = file.content.length > 3000 
      ? file.content.slice(0, 3000) + '\n\n// ... (truncated, use read_file for full content)'
      : file.content;
    context += `### ${file.path}\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
  }

  context += `\nUse read_file, search_files, or grep_search to explore more.\n`;

  return context;
}

// ----------------------------------------------------------------------------
// Extract Keywords from User Message (for Smart File Loading)
// ----------------------------------------------------------------------------

export function extractKeywords(message: string): string[] {
  // Optimized keyword extraction - focus on code identifiers
  const commonWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use',
    'fix', 'add', 'create', 'update', 'change', 'modify', 'edit', 'help', 'please', 'want', 'need', 'make', 'file', 'code', 'function', 'component', 'error', 'bug', 'issue'
  ]);

  // Extract identifiers and file-like patterns
  const patterns = [
    /[A-Z][a-z]+(?:[A-Z][a-z]+)*/g, // PascalCase
    /[a-z]+(?:[A-Z][a-z]+)+/g, // camelCase
    /[a-z_]+\.[a-z]{2,4}/g, // filenames
    /[a-z_][a-z0-9_]{2,}/g // snake_case/identifiers
  ];
  
  const words = new Set<string>();
  for (const pattern of patterns) {
    const matches = message.match(pattern) ?? [];
    matches.forEach(word => {
      const lower = word.toLowerCase();
      if (!commonWords.has(lower) && word.length > 2) {
        words.add(word);
      }
    });
  }
  
  return Array.from(words).slice(0, 5); // Reduced to 5 keywords
}



