// ============================================================================
// AUTH API ROUTE - Password auth + API key validation
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Octokit } from 'octokit';

// Type for validation results
interface ValidationResults {
  anthropic: { valid: boolean; error?: string };
  github: { valid: boolean; user?: string; error?: string };
}

// Helper function to validate API keys - eliminates code duplication
async function validateApiKeys(
  anthropicKey?: string,
  githubToken?: string
): Promise<ValidationResults> {
  const results: ValidationResults = {
    anthropic: { valid: false },
    github: { valid: false },
  };

  // Validate Anthropic key
  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
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

  return results;
}

// Password authentication endpoint
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, password, anthropicKey, githubToken } = body;

    // Handle password login
    if (action === 'login') {
      const appPassword = process.env.APP_PASSWORD;

      // If no APP_PASSWORD is set, allow access (for development)
      if (!appPassword) {
        return NextResponse.json({
          success: true,
          message: 'No password configured - access granted',
          noPasswordSet: true,
        });
      }

      if (password === appPassword) {
        return NextResponse.json({ success: true });
      } else {
        return NextResponse.json({
          success: false,
          error: 'Invalid password'
        }, { status: 401 });
      }
    }

    // Handle API key validation (both explicit action and legacy format)
    if (action === 'validate' || anthropicKey || githubToken) {
      const results = await validateApiKeys(anthropicKey, githubToken);
      return NextResponse.json(results);
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  } catch (error) {
    console.error('Auth error:', error);
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
