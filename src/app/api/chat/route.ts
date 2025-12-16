// ============================================================================
// CHAT API ROUTE - Main endpoint for Claude interactions
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { ClaudeClient, getSystemPrompt, generateCodeContext, extractKeywords } from '@/lib/claude';
import { GitHubClient, formatFileTree } from '@/lib/github';
import { ChatRequest, Settings, RepoFile, FileChange, TokenUsage } from '@/types';

// Enhanced caching for cost optimization
const fileTreeCache = new Map<string, { tree: string; timestamp: number }>();
const fileContentCache = new Map<string, { content: string; timestamp: number }>();
const searchCache = new Map<string, { results: string[]; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour for real sessions
const CONTENT_CACHE_TTL = 30 * 60 * 1000; // 30 min for file contents

export async function POST(request: NextRequest) {
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

    // Optimized file loading - only when context changes
    let loadedFiles: RepoFile[] = repoContext.loadedFiles || [];
    
    if (loadedFiles.length === 0 && messages.length > 0) {
      const lastUserMessage = messages[messages.length - 1];
      if (lastUserMessage.role === 'user') {
        const keywords = extractKeywords(lastUserMessage.content);
        
        if (keywords.length > 0) {
          // Use cached search results
          const searchKey = keywords.slice(0, 2).join('|');
          const cached = searchCache.get(searchKey);
          let uniquePaths: string[] = [];
          
          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            uniquePaths = cached.results;
          } else {
            const results = await github.searchFiles(keywords[0]).catch(() => []);
            uniquePaths = results.slice(0, 3); // Reduced from 5
            searchCache.set(searchKey, { results: uniquePaths, timestamp: Date.now() });
          }
          
          if (uniquePaths.length > 0) {
            // Load files with content caching
            const cachedFiles: RepoFile[] = [];
            const uncachedPaths: string[] = [];
            
            for (const path of uniquePaths) {
              const contentKey = `${cacheKey}:${path}`;
              const cachedContent = fileContentCache.get(contentKey);
              
              if (cachedContent && Date.now() - cachedContent.timestamp < CONTENT_CACHE_TTL) {
                cachedFiles.push({ path, content: cachedContent.content });
              } else {
                uncachedPaths.push(path);
              }
            }
            
            // Only fetch uncached files
            if (uncachedPaths.length > 0) {
              const newFiles = await github.getFilesWithImports(uncachedPaths, repoContext.branch, 1); // Reduced depth
              
              // Cache new content
              for (const file of newFiles) {
                const contentKey = `${cacheKey}:${file.path}`;
                fileContentCache.set(contentKey, { content: file.content, timestamp: Date.now() });
              }
              
              loadedFiles = [...cachedFiles, ...newFiles];
            } else {
              loadedFiles = cachedFiles;
            }
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

    // Build tools array - only add web search if explicitly needed
    const tools = claude['getDefaultTools']();
    const needsWebSearch = settings.enableWebSearch && 
      messages.some(m => /\b(search|latest|current|2024|2025|news|price)\b/i.test(m.content));
    
    if (needsWebSearch) {
      tools.push(claude.getWebSearchTool());
      tools.push(claude.getWebFetchTool());
    }

    // Prepare messages with file uploads if any
    const apiMessages = messages.map(m => {
      if (m.role === 'user' && files && files.length > 0) {
        // Include file content in the message
        const fileContent = files.map(f => 
          `\n\n[Attached file: ${f.name}]\n${atob(f.base64)}`
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

      // Optimized file loading with caching
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'user') {
        const keywords = extractKeywords(lastMessage.content);
        if (keywords.length > 0) {
          const searchKey = keywords[0];
          const cached = searchCache.get(searchKey);
          let paths: string[] = [];
          
          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            paths = cached.results;
          } else {
            paths = await github.searchFiles(keywords[0]).catch(() => []);
            searchCache.set(searchKey, { results: paths, timestamp: Date.now() });
          }
          
          if (paths.length > 0) {
            // Use cached file contents
            const cachedFiles: RepoFile[] = [];
            const uncachedPaths = paths.slice(0, 2); // Reduced
            
            for (const path of uncachedPaths) {
              const contentKey = `${cacheKey}:${path}`;
              const cachedContent = fileContentCache.get(contentKey);
              
              if (cachedContent && Date.now() - cachedContent.timestamp < CONTENT_CACHE_TTL) {
                cachedFiles.push({ path, content: cachedContent.content });
              }
            }
            
            if (cachedFiles.length > 0) {
              loadedFiles = cachedFiles;
            } else {
              loadedFiles = await github.getFilesWithImports(uncachedPaths, repoContext.branch, 1);
              // Cache results
              for (const file of loadedFiles) {
                const contentKey = `${cacheKey}:${file.path}`;
                fileContentCache.set(contentKey, { content: file.content, timestamp: Date.now() });
              }
            }
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
    const tools = hasRepoContext ? claude.getDefaultTools() : [];
    const needsWebSearch = settings.enableWebSearch && 
      messages.some(m => /\b(search|latest|current|2024|2025|news|price)\b/i.test(m.content));
    
    if (needsWebSearch) {
      tools.push(claude.getWebSearchTool());
      tools.push(claude.getWebFetchTool());
    }

    // Create streaming response - SINGLE PASS, NO LOOP!
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

          // Stream Claude's response (SINGLE API CALL)
          const streamGenerator = claude.streamChat(
            messages,
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

          let totalCost = 0;
          let totalSavedPercent = 0;

          for await (const chunk of streamGenerator) {
            // Forward all chunks to client for real-time display
            controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));

            // Collect tool calls for execution AFTER streaming
            if (chunk.type === 'tool_use' && chunk.toolCall) {
              pendingToolCalls.push({
                id: chunk.toolCall.id,
                name: chunk.toolCall.name,
                input: chunk.toolCall.input,
              });
            } else if (chunk.type === 'done') {
              totalCost = chunk.cost || 0;
              totalSavedPercent = chunk.savedPercent || 0;
            }
          }

          // Execute tools ONCE after streaming (NOT in a loop!)
          // User sends next message if they need Claude to continue
          const fileChanges: FileChange[] = [];

          for (const toolCall of pendingToolCalls) {
            let result = '';

            try {
              if (toolCall.name === 'read_file' && github) {
                const input = toolCall.input as { path: string };
                const file = await github.getFileContent(input.path, repoContext.branch);
                result = `File content loaded (${file.content.length} chars)`;
              } else if (toolCall.name === 'search_files' && github) {
                const input = toolCall.input as { query: string };
                const paths = await github.searchFiles(input.query);
                result = paths.length > 0
                  ? `Found ${paths.length} files:\n${paths.join('\n')}`
                  : 'No files found matching the query.';
              } else if (toolCall.name === 'grep_search' && github) {
                const input = toolCall.input as { pattern: string };
                const matches = await github.grepSearch(input.pattern, repoContext.branch, {});
                result = matches.length > 0
                  ? matches.map(m => `${m.path}:${m.line}: ${m.content}`).join('\n')
                  : 'No matches found.';
              } else if (toolCall.name === 'str_replace' && github) {
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
              } else if (toolCall.name === 'create_file' && github) {
                const input = toolCall.input as { path: string; content: string };
                const createResult = await github.createFile(
                  input.path,
                  input.content,
                  repoContext.branch
                );
                if (createResult.success) {
                  result = `Successfully created ${input.path}`;
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

            // Stream tool result to client
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'tool_result',
              toolUseId: toolCall.id,
              name: toolCall.name,
              result: result.slice(0, 1000) + (result.length > 1000 ? '...(truncated)' : ''),
            }) + '\n'));
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
