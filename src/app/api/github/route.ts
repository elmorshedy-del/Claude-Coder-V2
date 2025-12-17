// ============================================================================
// GITHUB API ROUTE - Branch, PR, and file operations
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { GitHubClient } from '@/lib/github';

// Helper function for parameter validation
function validateRequired(params: Record<string, any>, required: string[]) {
  const missing = required.filter(key => params[key] === undefined || params[key] === '');
  if (missing.length > 0) {
    return NextResponse.json({ error: `${missing.join(', ')} required` }, { status: 400 });
  }
  return null;
}

// GET - List repos, branches, files, etc.
export async function GET(request: NextRequest) {
  try {
    const githubToken = request.headers.get('x-github-token');
    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub token required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const owner = searchParams.get('owner') || '';
    const repo = searchParams.get('repo') || '';
    const branch = searchParams.get('branch') || 'main';
    const path = searchParams.get('path') || '';

    if (!owner || !repo) {
      return NextResponse.json({ error: 'Owner and repo required' }, { status: 400 });
    }

    const github = new GitHubClient(githubToken, owner, repo);

    switch (action) {
      case 'branches': {
        const branches = await github.listBranches();
        return NextResponse.json({ branches });
      }

      case 'tree': {
        const tree = await github.getFileTree(branch);
        return NextResponse.json({ tree });
      }

      case 'file': {
        if (!path) {
          return NextResponse.json({ error: 'Path required' }, { status: 400 });
        }
        const file = await github.getFileContent(path, branch);
        return NextResponse.json({ file });
      }

      case 'search': {
        const query = searchParams.get('query') || '';
        if (!query) {
          return NextResponse.json({ error: 'Query required' }, { status: 400 });
        }
        const results = await github.searchFiles(query);
        return NextResponse.json({ results });
      }

      case 'grep': {
        const query = searchParams.get('query') || '';
        if (!query) {
          return NextResponse.json({ error: 'Query required' }, { status: 400 });
        }
        const extensions = searchParams.get('extensions')?.split(',');
        const results = await github.grepSearch(query, branch, { fileExtensions: extensions });
        return NextResponse.json({ results });
      }

      case 'repo': {
        const repoInfo = await github.getRepository();
        return NextResponse.json({ repo: repoInfo });
      }

      case 'commits': {
        const count = parseInt(searchParams.get('count') || '10');
        const commits = await github.getRecentCommits(branch, count);
        return NextResponse.json({ commits });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('GitHub GET error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - Create branches, PRs, files
export async function POST(request: NextRequest) {
  try {
    const githubToken = request.headers.get('x-github-token');
    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub token required' }, { status: 401 });
    }

    const body = await request.json();
    const { action, owner, repo, ...params } = body;

    if (!owner || !repo) {
      return NextResponse.json({ error: 'Owner and repo required' }, { status: 400 });
    }

    const github = new GitHubClient(githubToken, owner, repo);

    switch (action) {
      case 'createBranch': {
        const { branchName, fromBranch } = params;
        if (!branchName) {
          return NextResponse.json({ error: 'Branch name required' }, { status: 400 });
        }
        const branch = await github.createBranch(branchName, fromBranch || 'main');
        return NextResponse.json({ branch });
      }

      case 'deleteBranch': {
        const { branch } = params;
        if (!branch) {
          return NextResponse.json({ error: 'Branch required' }, { status: 400 });
        }
        await github.deleteBranch(branch);
        return NextResponse.json({ success: true });
      }

      case 'createFile': {
        const { path, content, branch } = params;
        if (!path || content === undefined) {
          return NextResponse.json({ error: 'Path and content required' }, { status: 400 });
        }
        const result = await github.createFile(path, content, branch || 'main');
        return NextResponse.json(result);
      }

      case 'updateFile': {
        const { path, content, message, branch, sha } = params;
        if (!path || content === undefined) {
          return NextResponse.json({ error: 'Path and content required' }, { status: 400 });
        }
        await github.updateFile(path, content, message || `Update ${path}`, branch || 'main', sha);
        return NextResponse.json({ success: true });
      }

      case 'strReplace': {
        const { path, oldStr, newStr, branch } = params;
        const validation = validateRequired({ path, oldStr, newStr }, ['path', 'oldStr', 'newStr']);
        if (validation) return validation;
        
        const result = await github.applyStrReplace(path, oldStr, newStr, branch || 'main');
        return NextResponse.json(result);
      }

      case 'createPR': {
        const { title, body, head, base } = params;
        if (!title || !head) {
          return NextResponse.json({ error: 'Title and head branch required' }, { status: 400 });
        }
        const pr = await github.createPullRequest(title, body || '', head, base || 'main');
        return NextResponse.json({ pr });
      }

      case 'getPR': {
        const { prNumber } = params;
        if (!prNumber) {
          return NextResponse.json({ error: 'PR number required' }, { status: 400 });
        }
        const pr = await github.getPullRequest(prNumber);
        return NextResponse.json({ pr });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('GitHub POST error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
