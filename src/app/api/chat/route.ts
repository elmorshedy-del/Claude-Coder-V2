// ============================================================================
// CHAT API ROUTE - Main endpoint for Claude interactions
// FIXED: No auto-loading, line ranges for read_file, web search works
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { ClaudeClient, getSystemPrompt, generateCodeContext } from '@/lib/claude';
import { GitHubClient, formatFileTree } from '@/lib/github';
import { LocalFileSystem } from '@/lib/filesystem';
import { ChatRequest, Settings, RepoFile, FileChange, TokenUsage } from '@/types';

// Enhanced caching for cost optimization
const fileTreeCache = new Map<string, { tree: string; timestamp: number }>();
const fileContentCache = new Map<string, { content: string; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour for optimal performance
const CONTENT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes for file contents
const MAX_CACHE_SIZE = 100;

function cleanupCache(): void {
  const now = Date.now();
  
  if (fileTreeCache.size < MAX_CACHE_SIZE && fileContentCache.size < MAX_CACHE_SIZE) {
    return;
  }
  
  for (const [key, value] of fileTreeCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) fileTreeCache.delete(key);
  }
  for (const [key, value] of fileContentCache.entries()) {
    if (now - value.timestamp > CONTENT_CACHE_TTL) fileContentCache.delete(key);
  }
}

let lastCleanup = 0;
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// ============================================================================
// POST - Simple single-turn chat (kept for backward compatibility)
// ============================================================================
export async function POST(request: NextRequest) {
  const now = Date.now();
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    cleanupCache();
    lastCleanup = now;
  }

  try {
    const body = await request.json() as ChatRequest;
    const { settings, repoContext, files } = body;
    const messages = body.messages.filter(m => m.content?.trim());

    const anthropicKey = request.headers.get('x-anthropic-key');
    const githubToken = request.headers.get('x-github-token');

    if (!anthropicKey) {
      return NextResponse.json({ error: 'Anthropic API key required' }, { status: 401 });
    }

    const claude = new ClaudeClient(anthropicKey, settings.model);
    const isLocalMode = settings.fileAccessMode === 'local' && !!settings.localWorkspacePath;
    const hasRepoContext = Boolean(repoContext && repoContext.owner && repoContext.repo);
    const branch = repoContext?.branch || 'main';

    if (!isLocalMode && !githubToken) {
      return NextResponse.json({ error: 'GitHub token required for GitHub API mode' }, { status: 401 });
    }

    if (!isLocalMode && !hasRepoContext) {
      return NextResponse.json({ error: 'Repository context required for GitHub API mode' }, { status: 400 });
    }

    const github = !isLocalMode && hasRepoContext && githubToken
      ? new GitHubClient(githubToken, repoContext.owner, repoContext.repo)
      : null;

    // Get or cache file tree - NO AUTO-LOADING OF FILES
    const cacheKey = hasRepoContext ? `${repoContext.owner}/${repoContext.repo}/${branch}` : '';
    let fileTree = hasRepoContext ? repoContext.fileTree || '' : '';

    if (!fileTree && github && hasRepoContext) {
      const cached = fileTreeCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        fileTree = cached.tree;
      } else {
        const tree = await github.getFileTree(branch);
        fileTree = formatFileTree(tree);
        fileTreeCache.set(cacheKey, { tree: fileTree, timestamp: Date.now() });
      }
    }

    // NO AUTO-LOADING - Claude will use tools to explore
    const loadedFiles: RepoFile[] = [];

    const codeContext = hasRepoContext ? generateCodeContext(fileTree, loadedFiles) : '';

    const systemPrompt = hasRepoContext || isLocalMode
      ? getSystemPrompt(repoContext?.owner || '', repoContext?.repo || '', branch, settings.enableWebSearch, !!isLocalMode)
      : getChatOnlySystemPrompt(settings.enableWebSearch);

    // Build tools - ALWAYS include web search if enabled
    const tools = claude.getDefaultTools(settings.toolExecutionMode);
    if (settings.enableWebSearch) {
      tools.push(claude.getWebSearchTool());
      tools.push(claude.getWebFetchTool());
    }
    if (settings.toolExecutionMode !== 'direct') {
      tools.push(claude.getCodeExecutionTool() as any);
    }

    // Prepare messages with file uploads
    const apiMessages = messages.map(m => {
      if (m.role === 'user' && files && files.length > 0) {
        const fileContent = files.map(f => {
          try {
            if (!f.name || !f.base64) throw new Error('Invalid file object');
            const base64Data = f.base64.replace(/^data:[^;]+;base64,/, '');
            const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
            return `\n\n[Attached file: ${f.name}]\n${decoded}`;
          } catch (error) {
            return `\n\n[Attached file: ${f.name}] (failed to decode)`;
          }
        }).join('');
        return { role: m.role, content: m.content + fileContent };
      }
      return { role: m.role, content: m.content };
    });

    const response = await claude.chat(apiMessages, systemPrompt, codeContext, {
      tools,
      enableThinking: settings.enableExtendedThinking,
      thinkingBudget: settings.thinkingBudget,
      effort: settings.effort,
      enableCodeExecution: settings.enableCodeExecution,
      enableMemory: settings.enableMemory,
      enableContextCompaction: settings.enableContextCompaction,
      enableInterleavedThinking: settings.enableInterleavedThinking,
      toolExecutionMode: settings.toolExecutionMode,
    });

    return NextResponse.json({
      content: response.content,
      toolCalls: response.toolCalls,
      usage: response.usage,
      cost: response.cost,
      savedPercent: response.savedPercent,
      thinkingContent: response.thinkingContent,
      artifacts: response.artifacts,
      citations: response.citations,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// PUT - AGENTIC STREAMING ENDPOINT
// Claude decides when it's done. No auto-loading.
// ============================================================================
export async function PUT(request: NextRequest) {
  const now = Date.now();
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    cleanupCache();
    lastCleanup = now;
  }

  try {
    const body = await request.json() as ChatRequest;
    const { settings, repoContext } = body;
    const messages = body.messages.filter(m => m.content?.trim());

    const anthropicKey = request.headers.get('x-anthropic-key');
    const githubToken = request.headers.get('x-github-token');

    if (!anthropicKey) {
      return NextResponse.json({ error: 'Anthropic API key required' }, { status: 401 });
    }

    const claude = new ClaudeClient(anthropicKey, settings.model);
    const isLocalMode = settings.fileAccessMode === 'local' && settings.localWorkspacePath;
    const hasRepoContext = Boolean(repoContext && repoContext.owner && repoContext.repo);
    
    const github = !isLocalMode && hasRepoContext && githubToken
      ? new GitHubClient(githubToken, repoContext.owner, repoContext.repo)
      : null;
    const localFs = isLocalMode ? new LocalFileSystem(settings.localWorkspacePath!) : null;

    // Get file tree only - NO AUTO-LOADING OF FILES
    let fileTree = '';

    if (github && hasRepoContext) {
      const cacheKey = `${repoContext.owner}/${repoContext.repo}/${repoContext.branch}`;
      const cached = fileTreeCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        fileTree = cached.tree;
      } else {
        const tree = await github.getFileTree(repoContext.branch);
        fileTree = formatFileTree(tree);
        fileTreeCache.set(cacheKey, { tree: fileTree, timestamp: Date.now() });
      }
    }

    // NO AUTO-LOADING - Claude explores with tools
    const loadedFiles: RepoFile[] = [];

    const codeContext = hasRepoContext ? generateCodeContext(fileTree, loadedFiles) : '';

    const systemPrompt = hasRepoContext || isLocalMode
      ? getSystemPrompt(repoContext?.owner || '', repoContext?.repo || '', repoContext?.branch || 'main', settings.enableWebSearch, !!isLocalMode)
      : getChatOnlySystemPrompt(settings.enableWebSearch);

    // Build tools - ALWAYS include web search if enabled (not just when keywords match)
    const tools = hasRepoContext || isLocalMode ? claude.getDefaultTools(settings.toolExecutionMode) : [];
    if (settings.enableWebSearch) {
      tools.push(claude.getWebSearchTool());
      tools.push(claude.getWebFetchTool());
    }
    if (settings.toolExecutionMode !== 'direct') {
      tools.push(claude.getCodeExecutionTool() as any);
    }

    // ========================================================================
    // AGENTIC LOOP
    // ========================================================================
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const fileChanges: FileChange[] = [];
          const MAX_ROUNDS = settings.effort === 'high' ? 18 : settings.effort === 'medium' ? 12 : 8;
          let totalCost = 0;
          let totalSavedPercent = 0;
          const COST_LIMIT = settings.tokenBudget?.enabled ? settings.tokenBudget.perMessage : 1.0;

          const seenFiles = new Set<string>();
          let lastToolCallsSignature = '';
          let repeatCount = 0;
          const MAX_REPEATS = 2;

          type ContentBlock =
            | { type: 'text'; text: string }
            | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
            | { type: 'tool_result'; tool_use_id: string; content: string };

          const convo: Array<{ role: 'user' | 'assistant'; content: string | ContentBlock[] }> = messages.map(m => ({
            role: m.role,
            content: m.content,
          }));

          for (let round = 0; round < MAX_ROUNDS; round++) {
            const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
            const assistantBlocks: ContentBlock[] = [];

            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'round_start',
              round: round + 1,
              message: round === 0 ? 'Working...' : `Round ${round + 1}...`,
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

            const streamGenerator = claude.streamChat(convo, systemPrompt, codeContext, {
              tools: tools.length > 0 ? tools : undefined,
              enableThinking: settings.enableExtendedThinking,
              thinkingBudget: settings.thinkingBudget,
              effort: settings.effort,
              enableContextCompaction: settings.enableContextCompaction,
              enableInterleavedThinking: settings.enableInterleavedThinking,
              toolExecutionMode: settings.toolExecutionMode,
            });

            for await (const chunk of streamGenerator) {
              if (chunk.type === 'text') {
                controller.enqueue(encoder.encode(JSON.stringify({ ...chunk, round: round + 1 }) + '\n'));
                pushTextBlock(chunk.content || '');
              } else if (chunk.type === 'thinking') {
                controller.enqueue(encoder.encode(JSON.stringify({ ...chunk, round: round + 1 }) + '\n'));
              } else if (chunk.type === 'tool_use' && chunk.toolCall) {
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
                
                if (totalCost > COST_LIMIT) {
                  controller.enqueue(encoder.encode(JSON.stringify({
                    type: 'text',
                    content: `\n\n⚠️ Cost limit reached ($${totalCost.toFixed(2)}). Stopping.`,
                  }) + '\n'));
                  break;
                }
              }
            }

            // Stop if no tools requested
            if (pendingToolCalls.length === 0) {
              break;
            }

            // Stop if already made edits and has text response
            if (fileChanges.length > 0 && assistantBlocks.some(b => b.type === 'text' && b.text.length > 50)) {
              break;
            }

            // No filesystem access
            if (!github && !localFs) {
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'text',
                content: '\n\n[No file system available. Please connect a repo or set local path.]',
              }) + '\n'));
              break;
            }

            // Stuck detection
            const currentSignature = pendingToolCalls.map(t => `${t.name}:${JSON.stringify(t.input)}`).sort().join('|');
            const onlyAnalysis = pendingToolCalls.every(t => ['read_file', 'search_files', 'grep_search'].includes(t.name));

            if (currentSignature === lastToolCallsSignature) {
              repeatCount++;
              if (repeatCount >= MAX_REPEATS) {
                controller.enqueue(encoder.encode(JSON.stringify({
                  type: 'stuck_warning',
                  message: 'Repeated actions detected. Nudging...',
                }) + '\n'));

                const nudge: ContentBlock[] = pendingToolCalls.map(tc => ({
                  type: 'tool_result',
                  tool_use_id: tc.id,
                  content: 'STOP REPEATING. Make the actual edit NOW with str_replace or create_file.'
                }));
                convo.push({ role: 'assistant', content: assistantBlocks.length > 0 ? assistantBlocks : [{ type: 'text', text: '' }] });
                convo.push({ role: 'user', content: nudge });
                lastToolCallsSignature = '';
                repeatCount = 0;
                continue;
              }
            } else if (onlyAnalysis && round >= 2 && fileChanges.length === 0) {
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'stuck_warning',
                message: 'Too much analysis. Nudging to edit...',
              }) + '\n'));

              const nudge: ContentBlock[] = pendingToolCalls.map(tc => ({
                type: 'tool_result',
                tool_use_id: tc.id,
                content: 'STOP ANALYZING. You have enough info. Make the edit NOW.'
              }));
              convo.push({ role: 'assistant', content: assistantBlocks.length > 0 ? assistantBlocks : [{ type: 'text', text: '' }] });
              convo.push({ role: 'user', content: nudge });
              lastToolCallsSignature = '';
              continue;
            } else {
              lastToolCallsSignature = currentSignature;
              repeatCount = 0;
            }

            // Execute tools
            const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

            for (const toolCall of pendingToolCalls) {
              let result = '';
              try {
                result = await executeToolCall(toolCall, { localFs, github, repoContext, seenFiles, fileChanges, settings });
              } catch (error) {
                result = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
              }

              const cap = toolCall.name === 'read_file' ? 20000 : 6000;
              const clipped = result.length > cap ? result.slice(0, cap) + '...(truncated)' : result;
              
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'tool_result',
                round: round + 1,
                toolUseId: toolCall.id,
                name: toolCall.name,
                result: clipped,
              }) + '\n'));

              toolResults.push({ type: 'tool_result', tool_use_id: toolCall.id, content: clipped });
            }

            convo.push({ role: 'assistant', content: assistantBlocks.length > 0 ? assistantBlocks : [{ type: 'text', text: '' }] });
            convo.push({ role: 'user', content: toolResults });
          }

          // Auto-create PR
          const { prUrl, prNumber } = await handlePullRequestCreation(fileChanges, github, !!hasRepoContext, repoContext, controller, encoder);

          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'done',
            cost: totalCost,
            savedPercent: totalSavedPercent,
            fileChanges: fileChanges.length > 0 ? fileChanges : undefined,
            seenFiles: [...seenFiles],
            prUrl,
            prNumber,
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

// ============================================================================
// TOOL EXECUTION - With line range support for read_file
// ============================================================================
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

  // READ FILE - With line range support
  if (toolCall.name === 'read_file') {
    const input = toolCall.input as { path: string; start_line?: number; end_line?: number };
    let content: string;
    
    if (localFs) {
      content = await localFs.readFile(input.path);
    } else if (github) {
      const file = await github.getFileContent(input.path, repoContext.branch);
      content = file.content;
    } else {
      throw new Error('No file system available');
    }
    
    // Apply line range if specified
    const lines = content.split('\n');
    const startLine = input.start_line ? Math.max(1, input.start_line) : 1;
    const endLine = input.end_line ? Math.min(lines.length, input.end_line) : lines.length;
    
    let result: string;
    if (input.start_line || input.end_line) {
      // Line range requested - return specific lines with line numbers
      const selectedLines = lines.slice(startLine - 1, endLine);
      result = selectedLines.map((line, i) => `${startLine + i}: ${line}`).join('\n');
      result = `--- ${input.path} (lines ${startLine}-${endLine} of ${lines.length}) ---\n${result}`;
    } else {
      // Full file - truncate if too long
      const MAX = 15000;
      result = content.slice(0, MAX);
      if (content.length > MAX) {
        result += `\n\n...[truncated at ${MAX} chars, use start_line/end_line to read specific sections]`;
      }
      result = `--- ${input.path} (${lines.length} lines, ${content.length} chars) ---\n${result}`;
    }
    
    seenFiles.add(input.path);
    return result;
  }

  // SEARCH FILES
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
      ? `Found ${paths.length} files:\n${paths.slice(0, 30).join('\n')}${paths.length > 30 ? '\n...(truncated)' : ''}`
      : 'No files found.';
  }

  // GREP SEARCH
  if (toolCall.name === 'grep_search') {
    const input = toolCall.input as { query: string; file_extensions?: string };
    
    if (localFs) {
      // localFs expects array
      const extensions = input.file_extensions ? input.file_extensions.split(',').map(e => e.trim()) : undefined;
      const results = await localFs.grepSearch(input.query, extensions);
      return results.length > 0 
        ? `Found ${results.length} matches:\n${results.slice(0, 50).join('\n')}`
        : 'No matches found.';
    } else if (github) {
      // github expects string
      const results = await github.grepSearch(input.query, input.file_extensions);
      return results.length > 0
        ? `Found ${results.length} matches:\n${results.slice(0, 50).join('\n')}`
        : 'No matches found.';
    }
    return 'Grep search not available.';
  }

  // STR_REPLACE
  if (toolCall.name === 'str_replace') {
    const input = toolCall.input as { path: string; old_str: string; new_str: string };
    
    if (localFs) {
      const result = await localFs.strReplace(input.path, input.old_str, input.new_str);
      if (result.success) {
        fileChanges.push({ path: input.path, action: 'edit', additions: result.additions, deletions: result.deletions });
        return `✓ Edited ${input.path}`;
      }
      return `Error: ${result.error}`;
    } else if (github) {
      const result = await github.applyStrReplace(input.path, input.old_str, input.new_str, repoContext.branch);
      if (result.success) {
        fileChanges.push({ path: input.path, action: 'edit', additions: result.additions, deletions: result.deletions });
        return `✓ Edited ${input.path}`;
      }
      return `Error: ${result.error}`;
    }
    return 'No file system available.';
  }

  // CREATE FILE
  if (toolCall.name === 'create_file') {
    const input = toolCall.input as { path: string; content: string };
    
    if (localFs) {
      const result = await localFs.createFile(input.path, input.content);
      if (result.success) {
        fileChanges.push({ path: input.path, action: 'create', additions: input.content.split('\n').length });
        return `✓ Created ${input.path}`;
      }
      return `Error: ${result.error}`;
    } else if (github) {
      const result = await github.createFile(input.path, input.content, repoContext.branch);
      if (result.success) {
        fileChanges.push({ path: input.path, action: 'create', additions: result.additions });
        return `✓ Created ${input.path}`;
      }
      return `Error: ${result.error}`;
    }
    return 'No file system available.';
  }

  // VERIFY EDIT
  if (toolCall.name === 'verify_edit') {
    const input = toolCall.input as { path: string; expected_content: string };
    
    let content: string;
    if (localFs) {
      content = await localFs.readFile(input.path);
    } else if (github) {
      const file = await github.getFileContent(input.path, repoContext.branch);
      content = file.content;
    } else {
      return 'No file system available.';
    }
    
    const found = content.includes(input.expected_content);
    return found ? `✓ Verified: "${input.expected_content.slice(0, 50)}..." found in ${input.path}` : `✗ NOT FOUND: "${input.expected_content.slice(0, 50)}..." not in ${input.path}`;
  }

  // RUN COMMAND
  if (toolCall.name === 'run_command') {
    const input = toolCall.input as { command: string };
    
    if (localFs) {
      const result = await localFs.runCommand(input.command);
      return `$ ${input.command}\n\n${result.stdout}${result.stderr ? `\nSTDERR: ${result.stderr}` : ''}${result.exitCode !== 0 ? `\nExit code: ${result.exitCode}` : ''}`;
    }
    return 'run_command only works in local mode.';
  }

  // WEB SEARCH
  if (toolCall.name === 'web_search') {
    const input = toolCall.input as { query: string };
    // This would call actual web search API - placeholder for now
    return `Web search for "${input.query}" - results would appear here. (Web search integration pending)`;
  }

  // WEB FETCH
  if (toolCall.name === 'web_fetch') {
    const input = toolCall.input as { url: string };
    try {
      const response = await fetch(input.url);
      const text = await response.text();
      return text.slice(0, 10000) + (text.length > 10000 ? '...(truncated)' : '');
    } catch (error) {
      return `Failed to fetch ${input.url}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  return `Unknown tool: ${toolCall.name}`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
      content: `\n\n✅ **PR created:** [#${pr.number}](${pr.url})`,
    }) + '\n'));

    return { prUrl: pr.url, prNumber: pr.number };
  } catch (prError) {
    const errorMsg = prError instanceof Error ? prError.message : 'Unknown error';
    controller.enqueue(encoder.encode(JSON.stringify({
      type: 'text',
      content: errorMsg.includes('already exists') 
        ? '\n\n⚠️ PR already exists for this branch.'
        : `\n\n⚠️ Could not create PR: ${errorMsg}`,
    }) + '\n'));
    return {};
  }
}

function getToolStartMessage(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'read_file':
      const rf = input as { path: string; start_line?: number; end_line?: number };
      return rf.start_line || rf.end_line 
        ? `📖 Reading ${rf.path} (lines ${rf.start_line || 1}-${rf.end_line || 'end'})...`
        : `📖 Reading ${rf.path}...`;
    case 'search_files':
      return `🔍 Searching for "${input.query}"...`;
    case 'grep_search':
      return `🔎 Grep: "${input.query}"...`;
    case 'str_replace':
      return `✏️ Editing ${input.path}...`;
    case 'create_file':
      return `📝 Creating ${input.path}...`;
    case 'verify_edit':
      return `✅ Verifying ${input.path}...`;
    case 'run_command':
      return `💻 $ ${input.command}`;
    case 'web_search':
      return `🌐 Searching: "${input.query}"...`;
    case 'web_fetch':
      return `🌐 Fetching ${input.url}...`;
    default:
      return `⚙️ ${toolName}...`;
  }
}

function getChatOnlySystemPrompt(enableWebSearch: boolean): string {
  const tools = enableWebSearch ? ['web_search', 'web_fetch'] : [];
  return `You are Claude, an AI assistant.
${tools.length > 0 ? `\nTools: ${tools.join(', ')}` : ''}

Help with coding, analysis, writing, and more.
To edit code, connect a GitHub repo from the dropdown.`;
}
