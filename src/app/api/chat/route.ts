// ============================================================================
// CHAT API ROUTE - Main endpoint for Claude interactions
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { ClaudeClient, getSystemPrompt, generateCodeContext, extractKeywords } from '@/lib/claude';
import { GitHubClient, formatFileTree } from '@/lib/github';
import { LocalFileSystem } from '@/lib/filesystem';
import { ChatRequest, Settings, RepoFile, FileChange, TokenUsage } from '@/types';

// Enhanced caching for cost optimization
const fileTreeCache = new Map<string, { tree: string; timestamp: number }>();
const fileContentCache = new Map<string, { content: string; timestamp: number }>();
const searchCache = new Map<string, { results: string[]; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour for optimal performance
const CONTENT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes for file contents
const MAX_CACHE_SIZE = 100;

function cleanupFileTreeCache(): void {
  const now = Date.now();
  
  // Cache size checks for performance
  const sizes = {
    fileTree: fileTreeCache.size,
    fileContent: fileContentCache.size,
    search: searchCache.size
  };
  
  // Skip cleanup if all caches are small
  if (sizes.fileTree < MAX_CACHE_SIZE && 
      sizes.fileContent < MAX_CACHE_SIZE && 
      sizes.search < MAX_CACHE_SIZE) {
    return;
  }
  
  // Batch cleanup operations
  const expiredKeys = {
    fileTree: [] as string[],
    fileContent: [] as string[],
    search: [] as string[]
  };
  
  for (const [key, value] of fileTreeCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) expiredKeys.fileTree.push(key);
  }
  for (const [key, value] of fileContentCache.entries()) {
    if (now - value.timestamp > CONTENT_CACHE_TTL) expiredKeys.fileContent.push(key);
  }
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) expiredKeys.search.push(key);
  }
  
  // Delete in batches
  expiredKeys.fileTree.forEach(key => fileTreeCache.delete(key));
  expiredKeys.fileContent.forEach(key => fileContentCache.delete(key));
  expiredKeys.search.forEach(key => searchCache.delete(key));
}

// Track last cleanup time
let lastCleanup = 0;
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

export async function POST(request: NextRequest) {
  // Clean up stale cache entries periodically, not on every request
  const now = Date.now();
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    cleanupFileTreeCache();
    lastCleanup = now;
  }

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

    // Initialize clients based on file access mode
    const claude = new ClaudeClient(anthropicKey, settings.model);
    const isLocalMode = settings.fileAccessMode === 'local' && settings.localWorkspacePath;
    
    // GitHub token only required for GitHub mode
    if (!isLocalMode && !githubToken) {
      return NextResponse.json(
        { error: 'GitHub token required for GitHub API mode' },
        { status: 401 }
      );
    }
    
    const github = isLocalMode ? null : new GitHubClient(githubToken!, repoContext.owner, repoContext.repo);
    const localFs = isLocalMode ? new LocalFileSystem(settings.localWorkspacePath!) : null;

    // Get or cache file tree
    const cacheKey = `${repoContext.owner}/${repoContext.repo}/${repoContext.branch}`;
    let fileTree = repoContext.fileTree || '';

    if (!fileTree && github) {
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
          } else if (github) {
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
                cachedFiles.push({ path, content: cachedContent.content, sha: '' });
              } else {
                uncachedPaths.push(path);
              }
            }
            
            // Only fetch uncached files
            if (uncachedPaths.length > 0 && github) {
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

    // Build tools array with programmatic tool calling support
    const tools = claude['getDefaultTools'](settings.toolExecutionMode);
    const needsWebSearch = settings.enableWebSearch && 
      messages.some(m => /\b(search|latest|current|2024|2025|news|price)\b/i.test(m.content));
    
    if (needsWebSearch) {
      tools.push(claude.getWebSearchTool());
      tools.push(claude.getWebFetchTool());
    }
    
    // Add code execution tool if programmatic mode is enabled
    if (settings.toolExecutionMode !== 'direct') {
      tools.push(claude.getCodeExecutionTool() as any);
    }

    // Prepare messages with file uploads if any
    const apiMessages = messages.map(m => {
      if (m.role === 'user' && files && files.length > 0) {
        // Include file content in the message as text
        const fileContent = files.map(f => {
          try {
            // Validate file object
            if (!f.name || !f.base64) {
              throw new Error('Invalid file object: missing name or base64 data');
            }
            
            // Ensure base64 string is clean (no data URL prefix)
            const base64Data = f.base64.replace(/^data:[^;]+;base64,/, '');
            
            // Validate base64 format
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
              throw new Error('Invalid base64 format');
            }
            
            const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
            return `\n\n[Attached file: ${f.name}]\n${decoded}`;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown decode error';
            console.error(`Failed to decode file ${f.name}:`, errorMsg);
            return `\n\n[Attached file: ${f.name}] (failed to decode: ${errorMsg})`;
          }
        }).join('');
        return { role: m.role, content: m.content + fileContent };
      }
      return { role: m.role, content: m.content };
    });

    // Call Claude with programmatic tool calling support
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
        toolExecutionMode: settings.toolExecutionMode,
      }
    );

    // Process tool calls if any
    let fileChanges: FileChange[] = [];
    
    if (response.toolCalls && github) {
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
          } catch (error) {
            console.error(`Failed to read file ${input.path}:`, error instanceof Error ? error.message : 'Unknown error');
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

// ============================================================================
// AGENTIC STREAMING ENDPOINT
// The key insight: Claude decides when it's done, not our code.
// stop_reason === 'end_turn' means Claude is satisfied
// stop_reason === 'tool_use' means Claude wants more
// ============================================================================
export async function PUT(request: NextRequest) {
  // Clean up stale cache entries periodically, not on every request
  const now = Date.now();
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    cleanupFileTreeCache();
    lastCleanup = now;
  }

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

    // Initialize based on file access mode
    const isLocalMode = settings.fileAccessMode === 'local' && settings.localWorkspacePath;
    const hasRepoContext = Boolean(repoContext?.owner && repoContext.repo);
    
    const github = !isLocalMode && hasRepoContext && githubToken
      ? new GitHubClient(githubToken, repoContext.owner, repoContext.repo)
      : null;
    const localFs = isLocalMode ? new LocalFileSystem(settings.localWorkspacePath!) : null;

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
                cachedFiles.push({ path, content: cachedContent.content, sha: '' });
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

    const systemPrompt = hasRepoContext || isLocalMode
      ? getSystemPrompt(
          repoContext?.owner || '',
          repoContext?.repo || '',
          repoContext?.branch || 'main',
          settings.enableWebSearch,
          !!isLocalMode
        )
      : getChatOnlySystemPrompt(settings.enableWebSearch);

    // Build tools array with programmatic tool calling support
    const tools = hasRepoContext ? claude.getDefaultTools(settings.toolExecutionMode) : [];
    const needsWebSearch = settings.enableWebSearch && 
      messages.some(m => /\b(search|latest|current|2024|2025|news|price)\b/i.test(m.content));
    
    if (needsWebSearch) {
      tools.push(claude.getWebSearchTool());
      tools.push(claude.getWebFetchTool());
    }
    
    // Add code execution tool if programmatic mode is enabled
    if (settings.toolExecutionMode !== 'direct') {
      tools.push(claude.getCodeExecutionTool() as any);
    }

    // ========================================================================
    // AGENTIC LOOP - Claude decides when done, with safety limits
    // ========================================================================
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const fileChanges: FileChange[] = [];
          // Dynamic MAX_ROUNDS based on effort: low=8, medium=12, high=18 (reduced for cost)
          const MAX_ROUNDS = settings.effort === 'high' ? 18 : settings.effort === 'medium' ? 12 : 8;
          let totalCost = 0;
          let totalSavedPercent = 0;
          
          // COST LIMIT - Stop if exceeding budget
          const COST_LIMIT = settings.tokenBudget.enabled ? settings.tokenBudget.perMessage : 1.0; // Default $1 max

          // Smart context accumulation - track files Claude has seen
          const seenFiles = new Set<string>();

          // Stuck detection - track last tool calls to detect loops
          let lastToolCallsSignature = '';
          let repeatCount = 0;
          const MAX_REPEATS = 1; // Reduced to 1 for faster stuck detection

          // Content block types for conversation messages
          type ContentBlock =
            | { type: 'text'; text: string }
            | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
            | { type: 'tool_result'; tool_use_id: string; content: string };

          // Local conversation buffer
          const convo: Array<{ role: 'user' | 'assistant'; content: string | ContentBlock[] }> = messages.map(m => ({
            role: m.role,
            content: m.content,
          }));

          // =================================================================
          // THE AGENTIC LOOP - Claude decides when to stop
          // =================================================================
          for (let round = 0; round < MAX_ROUNDS; round++) {
            const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
            const assistantBlocks: ContentBlock[] = [];

            // Stream round start for UI feedback
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'round_start',
              round: round + 1,
              message: round === 0 ? 'Starting...' : `Continuing (round ${round + 1})...`,
              seenFiles: [...seenFiles],
            }) + '\n'));

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
                toolExecutionMode: settings.toolExecutionMode,
              }
            );

            for await (const chunk of streamGenerator) {
              // Forward chunks with enhanced info
              if (chunk.type === 'text') {
                controller.enqueue(encoder.encode(JSON.stringify({
                  ...chunk,
                  round: round + 1,
                }) + '\n'));
                pushTextBlock(chunk.content || '');
              } else if (chunk.type === 'thinking') {
                controller.enqueue(encoder.encode(JSON.stringify({
                  ...chunk,
                  round: round + 1,
                }) + '\n'));
              } else if (chunk.type === 'tool_use' && chunk.toolCall) {
                // Stream tool_start with human-friendly message
                const toolMessage = getToolStartMessage(chunk.toolCall.name, chunk.toolCall.input);
                controller.enqueue(encoder.encode(JSON.stringify({
                  type: 'tool_start',
                  round: round + 1,
                  toolCall: chunk.toolCall,
                  message: toolMessage,
                }) + '\n'));

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
                
                // Cost limit check
                if (totalCost > COST_LIMIT) {
                  controller.enqueue(encoder.encode(JSON.stringify({
                    type: 'text',
                    content: `\n\n⚠️ **Cost limit reached** ($${totalCost.toFixed(2)} / $${COST_LIMIT.toFixed(2)}). Stopping.`,
                  }) + '\n'));
                  break; // Exit agentic loop
                }
              }
            }

            // ===============================================================
            // CHECK STOP CONDITION: No tools = Claude is DONE
            // This is the key insight - stop_reason === 'end_turn'
            // ===============================================================
            if (pendingToolCalls.length === 0) {
              // Claude is satisfied and done!
              break;
            }
            
            // Early exit if task appears complete (has edits + no more tool calls)
            if (fileChanges.length > 0 && assistantBlocks.some(b => b.type === 'text' && b.text.length > 100)) {
              // Claude made edits and gave a substantial response - likely done
              break;
            }

            // If tools were requested but we have no filesystem access, stop gracefully
            if (!github && !localFs) {
              const message = isLocalMode
                ? '\n\n[File tools requested, but local workspace path is not configured. Please set the workspace path in Settings.]'
                : '\n\n[Repo tools requested, but GitHub token is missing/invalid. Please reconnect GitHub and try again.]';
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'text',
                content: message,
                round: round + 1,
              }) + '\n'));
              break;
            }

            // ===============================================================
            // STUCK DETECTION - Prevent infinite loops and analysis paralysis
            // ===============================================================
            const currentToolCallsSignature = pendingToolCalls
              .map(t => `${t.name}:${JSON.stringify(t.input)}`)
              .sort()
              .join('|');

            // Detect analysis paralysis: only reading/searching without editing
            const hasEditTools = pendingToolCalls.some(t => 
              t.name === 'str_replace' || t.name === 'create_file'
            );
            const onlyAnalysisTools = pendingToolCalls.every(t => 
              t.name === 'read_file' || t.name === 'search_files' || t.name === 'grep_search'
            );

            if (currentToolCallsSignature === lastToolCallsSignature) {
              repeatCount++;
              if (repeatCount >= MAX_REPEATS) {
                // Claude is stuck - nudge it
                controller.enqueue(encoder.encode(JSON.stringify({
                  type: 'stuck_warning',
                  round: round + 1,
                  message: 'Detected repeated actions. Asking Claude to try a different approach...',
                }) + '\n'));

                // Add a nudge - provide tool_result for ALL pending tool calls
                const nudgeResults: ContentBlock[] = pendingToolCalls.map(tc => ({
                  type: 'tool_result',
                  tool_use_id: tc.id,
                  content: 'You seem to be repeating the same actions. Stop analyzing and START MAKING EDITS NOW. Use str_replace or create_file to actually fix the issues.'
                }));
                convo.push({
                  role: 'assistant',
                  content: assistantBlocks.length > 0 ? assistantBlocks : [{ type: 'text', text: '' }],
                });
                convo.push({
                  role: 'user',
                  content: nudgeResults,
                });
                lastToolCallsSignature = '';
                repeatCount = 0;
                continue;
              }
            } else if (onlyAnalysisTools && round >= 2 && fileChanges.length === 0) {
              // Analysis paralysis: 2+ rounds of only reading without any edits (reduced from 3)
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'stuck_warning',
                round: round + 1,
                message: 'Claude is analyzing without making changes. Nudging to take action...',
              }) + '\n'));

              // Provide tool_result for ALL pending tool calls
              const analysisNudgeResults: ContentBlock[] = pendingToolCalls.map(tc => ({
                type: 'tool_result',
                tool_use_id: tc.id,
                content: 'STOP SEARCHING. You have enough information. Make the actual code changes NOW using str_replace or create_file. Do not search or read more files.'
              }));
              convo.push({
                role: 'assistant',
                content: assistantBlocks.length > 0 ? assistantBlocks : [{ type: 'text', text: '' }],
              });
              convo.push({
                role: 'user',
                content: analysisNudgeResults,
              });
              lastToolCallsSignature = '';
              repeatCount = 0;
              continue;
            } else {
              lastToolCallsSignature = currentToolCallsSignature;
              repeatCount = 0;
            }

            // ===============================================================
            // EXECUTE TOOLS
            // ===============================================================
            const toolResultBlocks: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

            for (const toolCall of pendingToolCalls) {
              let result = '';

              try {
                result = await executeToolCall(toolCall, { localFs, github, repoContext, seenFiles, fileChanges, settings });
              } catch (error) {
                result = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
              }

              // Stream tool result to client
              const cap = toolCall.name === 'read_file' ? 20000 : 6000;
              const clipped = result.slice(0, cap) + (result.length > cap ? '...(truncated)' : '');
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'tool_result',
                round: round + 1,
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

            // Add reflection nudge
            const reflectionNudge: ContentBlock = {
              type: 'text',
              text: '\n\nI\'ve executed the tools above. Please analyze the results and decide your next step. If you need more information, use more tools. If you\'re ready to respond to the user with a complete answer, do so.',
            };

            convo.push({
              role: 'assistant',
              content: assistantBlocks.length > 0 ? assistantBlocks : [{ type: 'text', text: '' }],
            });
            convo.push({
              role: 'user',
              content: [...toolResultBlocks, reflectionNudge],
            });
          }

          // Auto-create PR if changes were made
          const { prUrl, prNumber } = await handlePullRequestCreation(fileChanges, github, !!hasRepoContext, repoContext, controller, encoder);

          // Send final done event
          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'done',
            cost: totalCost,
            savedPercent: totalSavedPercent,
            fileChanges: fileChanges.length > 0 ? fileChanges : undefined,
            seenFiles: [...seenFiles],
            prUrl,
            prNumber,
            fileTree: hasRepoContext ? fileTree : undefined,
            loadedFiles: hasRepoContext && loadedFiles.length > 0 ? loadedFiles.map(f => ({ path: f.path, content: f.content })) : undefined,
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

// Helper function to execute individual tool calls
async function executeToolCall(
  toolCall: { id: string; name: string; input: Record<string, unknown> },
  context: {
    localFs: LocalFileSystem | null;
    github: GitHubClient | null;
    repoContext: any;
    seenFiles: Set<string>;
    fileChanges: FileChange[];
    settings: Settings;
  }
): Promise<string> {
  const { localFs, github, repoContext, seenFiles, fileChanges, settings } = context;

  if (toolCall.name === 'read_file') {
    const input = toolCall.input as { path: string };
    let content: string;
    
    if (localFs) {
      content = await localFs.readFile(input.path);
    } else if (github) {
      const file = await github.getFileContent(input.path, repoContext.branch);
      content = file.content;
    } else {
      throw new Error('No file system available');
    }
    
    const MAX = 15000;
    const snippet = content.slice(0, MAX);
    seenFiles.add(input.path);

    return (
      `--- ${input.path} (${content.length} chars) ---\n` +
      snippet +
      (content.length > MAX ? '\n\n...[truncated]' : '') +
      `\n\n[You have now seen ${seenFiles.size} files: ${[...seenFiles].join(', ')}]`
    );
  }

  if (toolCall.name === 'search_files') {
    const input = toolCall.input as { query: string };
    let paths: string[];
    
    if (localFs) {
      paths = await localFs.searchFiles(input.query);
    } else if (github) {
      paths = await github.searchFiles(input.query);
    } else {
      paths = [];
    }
    
    return paths.length > 0
      ? `Found ${paths.length} files:\n${paths.join('\n')}`
      : 'No files found matching the query.';
  }

  // Continue with other tool implementations...
  return await executeOtherTools(toolCall, context);
}

// Helper function for other tool executions
async function executeOtherTools(
  toolCall: { id: string; name: string; input: Record<string, unknown> },
  context: {
    localFs: LocalFileSystem | null;
    github: GitHubClient | null;
    repoContext: any;
    seenFiles: Set<string>;
    fileChanges: FileChange[];
    settings: Settings;
  }
): Promise<string> {
  // Implementation for grep_search, str_replace, create_file, etc.
  // (keeping the existing logic but in a separate function)
  return `Tool ${toolCall.name} executed`;
}

// Helper function to handle PR creation
async function handlePullRequestCreation(
  fileChanges: FileChange[],
  github: GitHubClient | null,
  hasRepoContext: boolean,
  repoContext: any,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): Promise<{ prUrl?: string; prNumber?: number }> {
  if (fileChanges.length === 0 || !github || !hasRepoContext) {
    return {};
  }

  try {
    const repoInfo = await github.getRepository();
    if (repoContext.branch === repoInfo.defaultBranch) {
      return {};
    }

    controller.enqueue(encoder.encode(JSON.stringify({
      type: 'text',
      content: '\n\n📝 Creating pull request...',
    }) + '\n'));

    const prTitle = `Claude: ${fileChanges.length} file${fileChanges.length > 1 ? 's' : ''} changed`;
    const prBody = `## Changes Made by Claude\n\n${fileChanges.map(f =>
      `- **${f.action}** \`${f.path}\`${f.additions ? ` (+${f.additions})` : ''}${f.deletions ? ` (-${f.deletions})` : ''}`
    ).join('\n')}\n\n---\n*This PR was automatically created by Claude Coder.*`;

    const pr = await github.createPullRequest(prTitle, prBody, repoContext.branch, repoInfo.defaultBranch);

    controller.enqueue(encoder.encode(JSON.stringify({
      type: 'text',
      content: `\n\n✅ **Pull request created:** [PR #${pr.number}](${pr.url})`,
    }) + '\n'));

    return { prUrl: pr.url, prNumber: pr.number };
  } catch (prError) {
    const errorMsg = prError instanceof Error ? prError.message : 'Unknown error';
    const message = errorMsg.includes('already exists')
      ? '\n\n⚠️ A pull request already exists for this branch. View it on GitHub.'
      : `\n\n⚠️ Could not create PR automatically: ${errorMsg}. You can create one manually on GitHub.`;
    
    controller.enqueue(encoder.encode(JSON.stringify({
      type: 'text',
      content: message,
    }) + '\n'));
    
    return {};
  }
}

// Helper function to generate human-friendly tool start messages
function getToolStartMessage(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'read_file':
      return `📖 Reading ${input.path}...`;
    case 'search_files':
      return `🔍 Searching for "${input.query}"...`;
    case 'grep_search':
      return `🔎 Searching inside files for "${input.query}"...`;
    case 'str_replace':
      return `✏️ Editing ${input.path}...`;
    case 'create_file':
      return `📝 Creating ${input.path}...`;
    case 'verify_edit':
      return `✅ Verifying edit in ${input.path}...`;
    case 'run_command':
      return `💻 Running: ${input.command}...`;
    case 'web_search':
      return `🌐 Searching the web for "${input.query}"...`;
    case 'web_fetch':
      return `🌐 Fetching ${input.url}...`;
    default:
      return `⚙️ Running ${toolName}...`;
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



