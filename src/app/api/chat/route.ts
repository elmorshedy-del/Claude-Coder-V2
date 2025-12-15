// ============================================================================
// CHAT API ROUTE - Main endpoint for Claude interactions
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { ClaudeClient, getSystemPrompt, generateCodeContext, extractKeywords } from '@/lib/claude';
import { GitHubClient, formatFileTree } from '@/lib/github';
import { ChatRequest, Settings, RepoFile, FileChange, TokenUsage } from '@/types';

// Store for session-based file tree caching with automatic cleanup
const fileTreeCache = new Map<string, { tree: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100; // Maximum number of cached entries

// Clean up expired entries periodically
function cleanupFileTreeCache(): void {
  const now = Date.now();
  const entriesToDelete: string[] = [];

  for (const [key, value] of fileTreeCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      entriesToDelete.push(key);
    }
  }

  for (const key of entriesToDelete) {
    fileTreeCache.delete(key);
  }

  // If still over limit, remove oldest entries
  if (fileTreeCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(fileTreeCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = entries.slice(0, fileTreeCache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      fileTreeCache.delete(key);
    }
  }
}

export async function POST(request: NextRequest) {
  // Clean up stale cache entries on each request
  cleanupFileTreeCache();

  try {
    const body = await request.json() as ChatRequest;
    const { settings, repoContext, files } = body;

    // Filter out any empty messages to satisfy Anthropic API validation
    const messages = body.messages.filter(m => m.content?.trim());

    // Validate required API keys
    const anthropicKey = request.headers.get('x-anthropic-key');
    const githubToken = request.headers.get('x-github-token');

    if (!anthropicKey) {
      return NextResponse.json(
        { error: 'Anthropic API key required' },
        { status: 401 }
      );
    }

    if (!githubToken) {
      return NextResponse.json(
        { error: 'GitHub token required' },
        { status: 401 }
      );
    }

    // Initialize clients
    const claude = new ClaudeClient(anthropicKey, settings.model);
    const github = new GitHubClient(githubToken, repoContext.owner, repoContext.repo);

    // Get or cache file tree
    const cacheKey = `${repoContext.owner}/${repoContext.repo}/${repoContext.branch}`;
    let fileTree = repoContext.fileTree || '';

    if (!fileTree) {
      const cached = fileTreeCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        fileTree = cached.tree;
      } else {
        const tree = await github.getFileTree(repoContext.branch);
        fileTree = formatFileTree(tree);
        fileTreeCache.set(cacheKey, { tree: fileTree, timestamp: Date.now() });
      }
    }

    // Smart file loading based on keywords
    let loadedFiles: RepoFile[] = repoContext.loadedFiles || [];
    
    if (loadedFiles.length === 0 && messages.length > 0) {
      const lastUserMessage = messages[messages.length - 1];
      if (lastUserMessage.role === 'user') {
        const keywords = extractKeywords(lastUserMessage.content);
        
        if (keywords.length > 0) {
          // Try to find relevant files
          const searchPromises = keywords.slice(0, 3).map(kw => 
            github.searchFiles(kw).catch(() => [])
          );
          const searchResults = await Promise.all(searchPromises);
          const uniquePaths = [...new Set(searchResults.flat())].slice(0, 5);
          
          if (uniquePaths.length > 0) {
            loadedFiles = await github.getFilesWithImports(uniquePaths, repoContext.branch, 2);
          }
        }
      }
    }

    // Generate code context
    const codeContext = generateCodeContext(fileTree, loadedFiles);

    // Get system prompt
    const systemPrompt = getSystemPrompt(
      repoContext.owner,
      repoContext.repo,
      repoContext.branch,
      settings.enableWebSearch
    );

    // Build tools array
    const tools = claude['getDefaultTools']();
    if (settings.enableWebSearch) {
      tools.push(claude.getWebSearchTool());
      tools.push(claude.getWebFetchTool());
    }

    // Prepare messages with file uploads if any
    const apiMessages = messages.map(m => {
      if (m.role === 'user' && files && files.length > 0) {
        // Include file content in the message
        const fileContent = files.map(f => 
          `\n\n[Attached file: ${f.name}]\n${Buffer.from(f.base64, 'base64').toString('utf8')}`
        ).join('');
        return { role: m.role, content: m.content + fileContent };
      }
      return { role: m.role, content: m.content };
    });

    // Call Claude
    const response = await claude.chat(
      apiMessages,
      systemPrompt,
      codeContext,
      {
        tools,
        enableThinking: settings.enableExtendedThinking,
        thinkingBudget: settings.thinkingBudget,
        effort: settings.effort,
        enableCodeExecution: settings.enableCodeExecution,
        enableMemory: settings.enableMemory,
        enableContextCompaction: settings.enableContextCompaction,
        enableInterleavedThinking: settings.enableInterleavedThinking,
      }
    );

    // Process tool calls if any
    let fileChanges: FileChange[] = [];
    
    if (response.toolCalls) {
      for (const toolCall of response.toolCalls) {
        if (toolCall.name === 'str_replace') {
          const input = toolCall.input as { path: string; old_str: string; new_str: string };
          const result = await github.applyStrReplace(
            input.path,
            input.old_str,
            input.new_str,
            repoContext.branch
          );
          
          if (result.success) {
            fileChanges.push({
              path: input.path,
              action: 'edit',
              additions: result.additions,
              deletions: result.deletions,
            });
          }
        } else if (toolCall.name === 'create_file') {
          const input = toolCall.input as { path: string; content: string };
          const result = await github.createFile(
            input.path,
            input.content,
            repoContext.branch
          );
          
          if (result.success) {
            fileChanges.push({
              path: input.path,
              action: 'create',
              additions: result.additions,
            });
          }
        } else if (toolCall.name === 'read_file') {
          const input = toolCall.input as { path: string };
          try {
            const file = await github.getFileContent(input.path, repoContext.branch);
            loadedFiles.push(file);
          } catch {
            // File not found
          }
        }
      }
    }

    return NextResponse.json({
      content: response.content,
      toolCalls: response.toolCalls,
      usage: response.usage,
      cost: response.cost,
      savedPercent: response.savedPercent,
      thinkingContent: response.thinkingContent,
      artifacts: response.artifacts,
      citations: response.citations,
      fileChanges: fileChanges.length > 0 ? fileChanges : undefined,
      loadedFiles: loadedFiles.map(f => f.path),
    });

  } catch (error) {
    console.error('Chat API error:', error);
    
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// Streaming endpoint - FIXED: Execute tools ONCE per message (NO LOOP!)
// This reduces cost from $1+ to ~$0.03 per message
export async function PUT(request: NextRequest) {
  // Clean up stale cache entries on each request
  cleanupFileTreeCache();

  try {
    const body = await request.json() as ChatRequest;
    const { settings, repoContext } = body;

    // Filter out any empty messages to avoid Anthropic validation errors
    const messages = body.messages.filter(m => m.content?.trim());

    const anthropicKey = request.headers.get('x-anthropic-key');
    const githubToken = request.headers.get('x-github-token');

    if (!anthropicKey) {
      return NextResponse.json(
        { error: 'Anthropic API key required' },
        { status: 401 }
      );
    }

    const claude = new ClaudeClient(anthropicKey, settings.model);

    // GitHub client is optional - only create if we have context
    const hasRepoContext = repoContext && repoContext.owner && repoContext.repo;
    const github = hasRepoContext && githubToken
      ? new GitHubClient(githubToken, repoContext.owner, repoContext.repo)
      : null;

    // Only load file context if we have a repo
    let fileTree = '';
    let loadedFiles: RepoFile[] = [];

    if (github && hasRepoContext) {
      // Check cache first
      const cacheKey = `${repoContext.owner}/${repoContext.repo}/${repoContext.branch}`;
      const cached = fileTreeCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        fileTree = cached.tree;
      } else {
        const tree = await github.getFileTree(repoContext.branch);
        fileTree = formatFileTree(tree);
        fileTreeCache.set(cacheKey, { tree: fileTree, timestamp: Date.now() });
      }

      // Smart file loading based on keywords
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'user') {
        const keywords = extractKeywords(lastMessage.content);
        if (keywords.length > 0) {
          const paths = await github.searchFiles(keywords[0]).catch(() => []);
          if (paths.length > 0) {
            loadedFiles = await github.getFilesWithImports(paths.slice(0, 3), repoContext.branch, 2);
          }
        }
      }
    }

    // Generate context (empty string if no repo)
    const codeContext = hasRepoContext
      ? generateCodeContext(fileTree, loadedFiles)
      : '';

    const systemPrompt = hasRepoContext
      ? getSystemPrompt(
          repoContext.owner,
          repoContext.repo,
          repoContext.branch,
          settings.enableWebSearch
        )
      : getChatOnlySystemPrompt(settings.enableWebSearch);

    // Build tools array - only include repo tools if we have a repo
    const tools = github ? claude.getDefaultTools() : [];
    if (settings.enableWebSearch) {
      tools.push(claude.getWebSearchTool());
      tools.push(claude.getWebFetchTool());
    }

    // Create streaming response - tool loop (bounded) for reliable continuations
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const fileChanges: FileChange[] = [];
          const maxToolRounds = 2; // cost safety: at most 2 tool→continue cycles
          let totalCost = 0;
          let totalSavedPercent = 0;

          // Content block types for conversation messages
          type ContentBlock =
            | { type: 'text'; text: string }
            | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
            | { type: 'tool_result'; tool_use_id: string; content: string };

          // Local conversation buffer in the format Anthropic accepts (string or block arrays).
          const convo: Array<{ role: 'user' | 'assistant'; content: string | ContentBlock[] }> = messages.map(m => ({
            role: m.role,
            content: m.content,
          }));

          for (let round = 0; round <= maxToolRounds; round++) {
            const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
            const assistantBlocks: ContentBlock[] = [];

            const pushTextBlock = (delta: string) => {
              if (!delta) return;
              const last = assistantBlocks[assistantBlocks.length - 1];
              if (last && last.type === 'text') {
                last.text += delta;
              } else {
                assistantBlocks.push({ type: 'text', text: delta });
              }
            };

            // Stream Claude's response for this round
            const streamGenerator = claude.streamChat(
              convo,
              systemPrompt,
              codeContext,
              {
                tools: tools.length > 0 ? tools : undefined,
                enableThinking: settings.enableExtendedThinking,
                thinkingBudget: settings.thinkingBudget,
                effort: settings.effort,
                enableContextCompaction: settings.enableContextCompaction,
                enableInterleavedThinking: settings.enableInterleavedThinking,
              }
            );

            for await (const chunk of streamGenerator) {
              // Forward chunks (but suppress intermediate 'done' chunks)
              if (chunk.type !== 'done') {
                controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));
              }

              if (chunk.type === 'text') {
                pushTextBlock(chunk.content || '');
              } else if (chunk.type === 'tool_use' && chunk.toolCall) {
                pendingToolCalls.push({
                  id: chunk.toolCall.id,
                  name: chunk.toolCall.name,
                  input: chunk.toolCall.input,
                });
                assistantBlocks.push({
                  type: 'tool_use',
                  id: chunk.toolCall.id,
                  name: chunk.toolCall.name,
                  input: chunk.toolCall.input,
                });
              } else if (chunk.type === 'done') {
                totalCost += chunk.cost || 0;
                totalSavedPercent = chunk.savedPercent || 0;
              }
            }

            // No tools requested => we're finished
            if (pendingToolCalls.length === 0) break;

            // If tools were requested but we have no GitHub client, stop gracefully
            if (!github) {
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'text',
                content: '\n\n[Repo tools requested, but GitHub token is missing/invalid. Please reconnect GitHub and try again.]'
              }) + '\n'));
              break;
            }

            // Execute requested tools and build tool_result blocks for the continuation call
            const toolResultBlocks: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

            for (const toolCall of pendingToolCalls) {
              let result = '';

              try {
                if (toolCall.name === 'read_file') {
                  const input = toolCall.input as { path: string };
                  const file = await github.getFileContent(input.path, repoContext.branch);
                  const MAX = 20000; // chars
                  const snippet = file.content.slice(0, MAX);
                  result =
                    `--- ${input.path} (${file.content.length} chars) ---\n` +
                    snippet +
                    (file.content.length > MAX ? '\n\n...[truncated]' : '');
                } else if (toolCall.name === 'search_files') {
                  const input = toolCall.input as { query: string };
                  const paths = await github.searchFiles(input.query);
                  result = paths.length > 0
                    ? `Found ${paths.length} files:\n${paths.join('\n')}`
                    : 'No files found matching the query.';
                } else if (toolCall.name === 'grep_search') {
                  const input = toolCall.input as { query: string; file_extensions?: string; max_results?: number };
                  const fileExtensions = input.file_extensions
                    ? input.file_extensions.split(',').map(s => s.trim()).filter(Boolean)
                    : undefined;
                  const matches = await github.grepSearch(input.query, repoContext.branch, {
                    maxResults: input.max_results || 50,
                    fileExtensions,
                  });
                  result = matches.length > 0
                    ? matches.map(m => `${m.path}:${m.line}: ${m.content}`).join('\n')
                    : 'No matches found.';
                } else if (toolCall.name === 'str_replace') {
                  const input = toolCall.input as { path: string; old_str: string; new_str: string };
                  const replaceResult = await github.applyStrReplace(
                    input.path,
                    input.old_str,
                    input.new_str,
                    repoContext.branch
                  );
                  if (replaceResult.success) {
                    result = `Successfully replaced text in ${input.path}. Changes: +${replaceResult.additions} -${replaceResult.deletions}`;
                    fileChanges.push({
                      path: input.path,
                      action: 'edit',
                      additions: replaceResult.additions,
                      deletions: replaceResult.deletions,
                    });
                  } else {
                    result = `Failed to replace: ${replaceResult.error || 'Unknown error'}`;
                  }
                } else if (toolCall.name === 'create_file') {
                  const input = toolCall.input as { path: string; content: string };
                  const createResult = await github.createFile(
                    input.path,
                    input.content,
                    repoContext.branch
                  );
                  if (createResult.success) {
                    result = `Successfully created file ${input.path}.`;
                    fileChanges.push({
                      path: input.path,
                      action: 'create',
                      additions: createResult.additions,
                    });
                  } else {
                    result = `Failed to create file: ${createResult.error || 'Unknown error'}`;
                  }
                } else {
                  result = `Tool ${toolCall.name} executed`;
                }
              } catch (error) {
                result = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
              }

              // Stream tool result to client (slightly larger caps for useful debugging)
              const cap = toolCall.name === 'read_file' ? 20000 : 6000;
              const clipped = result.slice(0, cap) + (result.length > cap ? '...(truncated)' : '');
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'tool_result',
                toolUseId: toolCall.id,
                name: toolCall.name,
                result: clipped,
              }) + '\n'));

              toolResultBlocks.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: clipped,
              });
            }

            // Append the assistant tool-use message + the user tool results, then continue.
            convo.push({
              role: 'assistant',
              content: assistantBlocks.length > 0 ? assistantBlocks : [{ type: 'text', text: '' }],
            });
            convo.push({
              role: 'user',
              content: toolResultBlocks,
            });
          }
// Send final done event with cost info
          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'done',
            cost: totalCost,
            savedPercent: totalSavedPercent,
            fileChanges: fileChanges.length > 0 ? fileChanges : undefined,
          }) + '\n'));

          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Stream error';
          controller.enqueue(encoder.encode(JSON.stringify({ error: message }) + '\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Stream API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// System prompt for chat-only mode (no repo)
function getChatOnlySystemPrompt(enableWebSearch: boolean): string {
  const tools = enableWebSearch ? ['web_search', 'web_fetch'] : [];
  return `You are Claude, an AI assistant by Anthropic.
${tools.length > 0 ? `\nAvailable tools: ${tools.join(', ')}` : ''}

You can help with:
- Answering questions
- Writing and explaining code
- Analysis and reasoning
- Creative writing
- And much more

If the user wants to connect a GitHub repository for code editing, let them know they can select one from the repository dropdown.`;
}



