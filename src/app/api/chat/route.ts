// ============================================================================
// CHAT API ROUTE - Main endpoint for Claude interactions
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { ClaudeClient, getSystemPrompt, generateCodeContext, extractKeywords } from '@/lib/claude';
import { GitHubClient, formatFileTree } from '@/lib/github';
import { ChatRequest, Settings, RepoFile, FileChange, TokenUsage } from '@/types';

// Store for session-based file tree caching
const fileTreeCache = new Map<string, { tree: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
    
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// Streaming endpoint
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as ChatRequest;
    const { settings, repoContext } = body;

    // Filter out any empty messages to avoid Anthropic validation errors
    const messages = body.messages.filter(m => m.content?.trim());

    const anthropicKey = request.headers.get('x-anthropic-key');
    const githubToken = request.headers.get('x-github-token');

    if (!anthropicKey || !githubToken) {
      return NextResponse.json(
        { error: 'API keys required' },
        { status: 401 }
      );
    }

    const claude = new ClaudeClient(anthropicKey, settings.model);
    const github = new GitHubClient(githubToken, repoContext.owner, repoContext.repo);

    // Get file tree
    const tree = await github.getFileTree(repoContext.branch);
    const fileTree = formatFileTree(tree);

    // Smart file loading
    let loadedFiles: RepoFile[] = [];
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

    const codeContext = generateCodeContext(fileTree, loadedFiles);
    const systemPrompt = getSystemPrompt(
      repoContext.owner,
      repoContext.repo,
      repoContext.branch,
      settings.enableWebSearch
    );

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const streamGenerator = claude.streamChat(
            messages,
            systemPrompt,
            codeContext,
            {
              enableThinking: settings.enableExtendedThinking,
              thinkingBudget: settings.thinkingBudget,
              effort: settings.effort,
              enableContextCompaction: settings.enableContextCompaction,
              enableInterleavedThinking: settings.enableInterleavedThinking,
            }
          );

          for await (const chunk of streamGenerator) {
            const data = JSON.stringify(chunk) + '\n';
            controller.enqueue(encoder.encode(data));
          }

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
