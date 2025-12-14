// ============================================================================
// AUTH API ROUTE - Validate API keys and GitHub token
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Octokit } from 'octokit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { anthropicKey, githubToken } = body;

    const results: {
      anthropic: { valid: boolean; error?: string };
      github: { valid: boolean; user?: string; error?: string };
    } = {
      anthropic: { valid: false },
      github: { valid: false },
    };

    // Validate Anthropic key
    if (anthropicKey) {
      try {
        const client = new Anthropic({ apiKey: anthropicKey });
        // Make a minimal API call to verify
        await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        });
        results.anthropic.valid = true;
      } catch (error) {
        results.anthropic.error = error instanceof Error ? error.message : 'Invalid key';
      }
    }

    // Validate GitHub token
    if (githubToken) {
      try {
        const octokit = new Octokit({ auth: githubToken });
        const { data } = await octokit.rest.users.getAuthenticated();
        results.github.valid = true;
        results.github.user = data.login;
      } catch (error) {
        results.github.error = error instanceof Error ? error.message : 'Invalid token';
      }
    }

    return NextResponse.json(results);

  } catch (error) {
    console.error('Auth validation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET - List user's repositories
export async function GET(request: NextRequest) {
  try {
    const githubToken = request.headers.get('x-github-token');
    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub token required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';
    const sort = searchParams.get('sort') || 'updated';
    const perPage = parseInt(searchParams.get('per_page') || '30');

    const octokit = new Octokit({ auth: githubToken });
    
    const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
      type: type as 'all' | 'owner' | 'public' | 'private' | 'member',
      sort: sort as 'created' | 'updated' | 'pushed' | 'full_name',
      per_page: perPage,
    });

    return NextResponse.json({
      repos: repos.map(repo => ({
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        isPrivate: repo.private,
        updatedAt: repo.updated_at,
        language: repo.language,
      })),
    });

  } catch (error) {
    console.error('List repos error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
