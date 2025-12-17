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

  // Run validations in parallel
  const validations = await Promise.allSettled([
    anthropicKey ? (async () => {
      const client = new Anthropic({ apiKey: anthropicKey });
      await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return { valid: true };
    })() : Promise.resolve({ valid: false }),
    
    githubToken ? (async () => {
      const octokit = new Octokit({ auth: githubToken });
      const { data } = await octokit.rest.users.getAuthenticated();
      return { valid: true, user: data.login };
    })() : Promise.resolve({ valid: false })
  ]);

  // Process results
  const [anthropicResult, githubResult] = validations;
  
  if (anthropicResult.status === 'fulfilled') {
    results.anthropic = anthropicResult.value;
  } else {
    results.anthropic.error = anthropicResult.reason instanceof Error ? anthropicResult.reason.message : 'Invalid key';
  }
  
  if (githubResult.status === 'fulfilled') {
    results.github = githubResult.value;
  } else {
    results.github.error = githubResult.reason instanceof Error ? githubResult.reason.message : 'Invalid token';
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

      try {
        const crypto = await import('crypto');
        const isValid = crypto.timingSafeEqual(
          Buffer.from(password || ''),
          Buffer.from(appPassword)
        );
        
        if (isValid) {
          return NextResponse.json({ success: true });
        } else {
          return NextResponse.json({
            success: false,
            error: 'Invalid password'
          }, { status: 401 });
        }
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: 'Authentication error'
        }, { status: 500 });
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
    const perPageParam = searchParams.get('per_page') || '30';
    const perPage = Math.min(Math.max(parseInt(perPageParam) || 30, 1), 100);

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
