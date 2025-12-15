// ============================================================================
// CHAT API ROUTE - Main endpoint for Claude interactions
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { APIError } from '@anthropic-ai/sdk';
import { ClaudeClient, getSystemPrompt, generateCodeContext, extractKeywords } from '@/lib/claude';
import { GitHubClient, formatFileTree } from '@/lib/github';
import { ChatRequest, Settings, RepoFile, FileChange, TokenUsage } from '@/types';

// Store for session-based file tree caching
const fileTreeCache = new Map<string, { tree: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function hasStatusCode(error: unknown): error is { status: number } {
  return typeof (error as { status?: unknown }).status === 'number';
}

function mapClaudeError(error: unknown): { status: number; message: string } {
  if (error instanceof APIError) {
    if (error.status === 429 || (error.error && (error.error as { type?: string }).type === 'rate_limit_error')) {
      return {
        status: 429,
        message: 'Anthropic rate limit exceeded. Please wait a moment and try again.',
      };
    }

    if (error.status) {
      return {
        status: error.status,
        message: error.message,
      };
    }
  }

  if (error instanceof Error && hasStatusCode(error)) {
    return {
      status: error.status,
      message: error.message,
    };
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return { status: 500, message };
}

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

    const mapped = mapClaudeError(error);
    return NextResponse.json(
      { error: mapped.message },
      { status: mapped.status }
    );
  }
}

// Streaming endpoint - FIXED: Execute tools ONCE per message (NO LOOP!)
// This reduces cost from $1+ to ~$0.03 per message
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as ChatRequest;
    const { settings, repoContext, files } = body;

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
    const tools = hasRepoContext ? claude.getDefaultTools() : [];
    if (settings.enableWebSearch) {
      tools.push(claude.getWebSearchTool());
      tools.push(claude.getWebFetchTool());
    }

    // Process files into proper format for Claude API
    // Files must be included in the last user message for Claude to see them
    type MessageContent = string | Array<{ type: string; [key: string]: unknown }>;
    const processedMessages: Array<{ role: 'user' | 'assistant'; content: MessageContent }> = messages.map((m, index) => {
      // Only add files to the last user message
      if (m.role === 'user' && files && files.length > 0 && index === messages.length - 1) {
        const content: Array<{ type: string; [key: string]: unknown }> = [
          { type: 'text', text: m.content }
        ];

        for (const file of files) {
          if (file.type.startsWith('image/')) {
            // Images - send as image block
            content.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: file.type,
                data: file.base64,
              }
            });
          } else if (file.type === 'application/pdf') {
            // PDFs - send as document block
            content.push({
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: file.base64,
              }
            });
          } else {
            // Text/code files - decode and include as text
            try {
              const textContent = Buffer.from(file.base64, 'base64').toString('utf-8');
              content.push({
                type: 'text',
                text: `\n\n📎 File: ${file.name}\n\`\`\`\n${textContent}\n\`\`\``
              });
            } catch {
              content.push({
                type: 'text',
                text: `\n\n📎 File: ${file.name} (binary file, ${file.size} bytes)`
              });
            }
          }
        }

        return { role: m.role, content };
      }
      return { role: m.role, content: m.content };
    });

    // Create streaming response - SINGLE PASS, NO LOOP!
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

          // Stream Claude's response (SINGLE API CALL)
          const streamGenerator = claude.streamChat(
            processedMessages,
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

          // Safe Mode: Create PR after file changes
          let prUrl: string | undefined;
          let previewUrl: string | undefined;

          if (settings.deployMode === 'safe' && fileChanges.length > 0 && github && hasRepoContext) {
            try {
              // Generate PR title and body from file changes
              const changedPaths = fileChanges.map(f => f.path.split('/').pop()).join(', ');
              const prTitle = `Claude: ${changedPaths}`;
              const prBody = `## Changes made by Claude\n\n${fileChanges.map(f =>
                `- ${f.action === 'create' ? '➕ Created' : '✏️ Edited'} \`${f.path}\` (+${f.additions || 0} -${f.deletions || 0})`
              ).join('\n')}`;

              // Create the PR using the current branch (changes were pushed there)
              const pr = await github.createPullRequest(
                prTitle,
                prBody,
                repoContext.branch, // head branch where changes were pushed
                'main' // base branch
              );

              prUrl = pr.url;

              // Build preview URL if Railway service name is configured
              if (settings.railwayServiceName) {
                previewUrl = `https://${settings.railwayServiceName}-pr-${pr.number}.up.railway.app`;
              }
            } catch (error) {
              console.error('Failed to create PR:', error);
              // Don't fail the whole request, just log it
            }
          }

          // Send final done event with cost info and PR URLs
          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'done',
            cost: totalCost,
            savedPercent: totalSavedPercent,
            fileChanges: fileChanges.length > 0 ? fileChanges : undefined,
            prUrl,
            previewUrl,
          }) + '\n'));

          controller.close();
        } catch (error) {
          const mapped = mapClaudeError(error);
          controller.enqueue(encoder.encode(JSON.stringify({ error: mapped.message }) + '\n'));
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
    const mapped = mapClaudeError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
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
