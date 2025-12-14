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
} from '@/types';

// ----------------------------------------------------------------------------
// Claude Client Class
// ----------------------------------------------------------------------------

export class ClaudeClient {
  private client: Anthropic;
  private model: ModelType;
  private costTracker: CostTracker;

  constructor(apiKey: string, model: ModelType = 'claude-sonnet-4-5-20250929') {
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
  // Cost Calculation
  // --------------------------------------------------------------------------

  private calculateCost(usage: TokenUsage): MessageCost {
    const pricing = MODEL_PRICING[this.model];
    
    const inputCost = (usage.input || 0) * pricing.input / 1_000_000;
    const outputCost = (usage.output || 0) * pricing.output / 1_000_000;
    const cacheReadCost = (usage.cacheRead || 0) * pricing.cacheRead / 1_000_000;
    const cacheWriteCost = (usage.cacheWrite || 0) * pricing.cacheWrite / 1_000_000;
    
    const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;
    
    // Calculate savings from cache (compared to if all tokens were regular input)
    const withoutCache = ((usage.input || 0) + (usage.cacheRead || 0)) * pricing.input / 1_000_000;
    const withCache = inputCost + cacheReadCost;
    const savedPercent = withoutCache > 0 ? Math.round((1 - withCache / withoutCache) * 100) : 0;

    return {
      inputCost,
      outputCost,
      cacheReadCost,
      cacheWriteCost,
      totalCost,
      savedPercent: Math.max(0, savedPercent),
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
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
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
    } = options;

    // Map effort to max_tokens and thinking budget
    const effortConfig = {
      low: { maxTokens: 4000, thinkingMultiplier: 0.5 },
      medium: { maxTokens: 16000, thinkingMultiplier: 1.0 },
      high: { maxTokens: 32000, thinkingMultiplier: 2.0 },
    };
    const config = effortConfig[effort] || effortConfig.medium;
    const adjustedThinkingBudget = Math.round(thinkingBudget * config.thinkingMultiplier);

    // Build tools array with special tools
    const allTools: Array<ClaudeTool | { type: string; name: string }> = [...(tools || this.getDefaultTools())];
    
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

    // Build request parameters
    const requestParams: Anthropic.MessageCreateParams = {
      model: this.model,
      max_tokens: config.maxTokens,
      system: [
        {
          type: 'text',
          text: systemPrompt,
        },
        {
          type: 'text',
          text: codeContext,
          // Enable prompt caching for code context (1-hour extended TTL)
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      tools: allTools as Anthropic.MessageCreateParams['tools'],
    };

    // Add extended thinking if enabled
    if (enableThinking && (this.model.includes('opus') || this.model.includes('sonnet'))) {
      (requestParams as unknown as Record<string, unknown>).thinking = {
        type: 'enabled',
        budget_tokens: Math.max(1024, Math.min(adjustedThinkingBudget, 32000)),
      };
    }

    // Make API call with beta headers if needed
    let response: Anthropic.Message;
    if (betas.length > 0) {
      response = await this.client.beta.messages.create({
        ...requestParams,
        betas,
      } as Parameters<typeof this.client.beta.messages.create>[0]) as unknown as Anthropic.Message;
    } else {
      response = await this.client.messages.create(requestParams);
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
        const parsedArtifacts = this.parseArtifacts(block.text);
        artifacts.push(...parsedArtifacts);
        // Parse citations if present (from web search tool results)
        const blockAny = block as unknown as { text: string; citations?: Array<{ url?: string; cited_text?: string; start_char_index?: number; end_char_index?: number; title?: string }> };
        if (blockAny.citations && Array.isArray(blockAny.citations)) {
          for (const cite of blockAny.citations) {
            if (cite.url) {
              citations.push({
                url: cite.url,
                title: cite.title,
                snippet: cite.cited_text,
                startIndex: cite.start_char_index || 0,
                endIndex: cite.end_char_index || 0,
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
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string,
    codeContext: string,
    options: {
      tools?: ClaudeTool[];
      enableThinking?: boolean;
      thinkingBudget?: number;
      effort?: EffortLevel;
      enableContextCompaction?: boolean;
      enableInterleavedThinking?: boolean;
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
    } = options;

    // Map effort to max_tokens and thinking budget
    const effortConfig = {
      low: { maxTokens: 4000, thinkingMultiplier: 0.5 },
      medium: { maxTokens: 16000, thinkingMultiplier: 1.0 },
      high: { maxTokens: 32000, thinkingMultiplier: 2.0 },
    };
    const config = effortConfig[effort] || effortConfig.medium;
    const adjustedThinkingBudget = Math.round(thinkingBudget * config.thinkingMultiplier);

    // Build beta headers
    const betas: string[] = [];
    if (enableContextCompaction) {
      betas.push('context-management-2025-06-27');
    }
    if (enableInterleavedThinking) {
      betas.push('interleaved-thinking-2025-05-14');
    }

    const requestParams: Anthropic.MessageCreateParams = {
      model: this.model,
      max_tokens: config.maxTokens,
      stream: true,
      system: [
        {
          type: 'text',
          text: systemPrompt,
        },
        {
          type: 'text',
          text: codeContext,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      tools: tools || this.getDefaultTools(),
    };

    if (enableThinking && (this.model.includes('opus') || this.model.includes('sonnet'))) {
      (requestParams as unknown as Record<string, unknown>).thinking = {
        type: 'enabled',
        budget_tokens: Math.max(1024, Math.min(adjustedThinkingBudget, 32000)),
      };
    }

    // Use beta streaming if we have beta headers
    let stream;
    if (betas.length > 0) {
      stream = await this.client.beta.messages.stream({
        ...requestParams,
        betas,
      } as Parameters<typeof this.client.beta.messages.stream>[0]);
    } else {
      stream = await this.client.messages.stream(requestParams);
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
          } catch {
            // Invalid JSON, skip
          }
          currentToolCall = null;
        }
      } else if (event.type === 'message_stop') {
        // Get final usage from the accumulated message
        const finalMessage = await stream.finalMessage();
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

  private getDefaultTools(): ClaudeTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file from the repository',
        input_schema: {
          type: 'object',
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
          type: 'object',
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
          type: 'object',
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
          type: 'object',
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
          type: 'object',
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
    ];
  }

  // --------------------------------------------------------------------------
  // Code Execution Tool (Beta)
  // --------------------------------------------------------------------------

  getCodeExecutionTool(): { type: string; name: string } {
    return {
      type: 'code_execution_20250522',
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
        type: 'object',
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
        type: 'object',
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
  // --------------------------------------------------------------------------

  private parseArtifacts(content: string): Artifact[] {
    const artifacts: Artifact[] = [];
    
    // Match code blocks with language specifier
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    let artifactIndex = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const language = match[1]?.toLowerCase() || 'text';
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
  enableWebSearch: boolean = false
): string {
  const tools = ['read_file', 'search_files', 'str_replace', 'create_file', 'grep_search'];
  if (enableWebSearch) tools.push('web_search');

  return `You are Claude, an AI assistant helping with coding.
You have access to the following repository:
- Owner: ${owner}
- Repo: ${repo}
- Branch: ${branch}

Available tools: ${tools.join(', ')}

When making edits:
1. Use str_replace for small changes (preferred - more efficient)
2. The old_str must be UNIQUE and EXACT
3. Use create_file only for new files
4. Always explain what you're doing

If a str_replace fails, try using more context around the string to make it unique.`;
}

// ----------------------------------------------------------------------------
// Generate Code Context for Prompt
// ----------------------------------------------------------------------------

export function generateCodeContext(
  fileTree: string,
  files: Array<{ path: string; content: string }>
): string {
  let context = `## Repository Structure\n\`\`\`\n${fileTree}\n\`\`\`\n\n`;
  context += `## Loaded Files\n\n`;

  for (const file of files) {
    const ext = file.path.split('.').pop() || '';
    context += `### ${file.path}\n\`\`\`${ext}\n${file.content}\n\`\`\`\n\n`;
  }

  context += `\nIf you need to see other files, use the read_file tool.\n`;

  return context;
}

// ----------------------------------------------------------------------------
// Extract Keywords from User Message (for Smart File Loading)
// ----------------------------------------------------------------------------

export function extractKeywords(message: string): string[] {
  // Remove common words and extract potential file/function names
  const commonWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
    'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
    'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'but', 'and',
    'or', 'if', 'because', 'as', 'until', 'while', 'of', 'at', 'by',
    'for', 'with', 'about', 'against', 'between', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up',
    'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further',
    'then', 'once', 'here', 'there', 'all', 'any', 'both', 'each',
    'fix', 'add', 'create', 'update', 'change', 'modify', 'edit',
    'help', 'please', 'want', 'need', 'make', 'get', 'put', 'new',
    'file', 'code', 'function', 'component', 'error', 'bug', 'issue',
  ]);

  // Extract words that look like identifiers (camelCase, PascalCase, snake_case, filenames)
  const words = message.match(/[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z]+)?/g) || [];
  
  return words
    .filter(word => {
      const lower = word.toLowerCase();
      // Keep if it's not a common word and has some length
      return !commonWords.has(lower) && word.length > 2;
    })
    .slice(0, 10); // Limit to 10 keywords
}
