// ============================================================================
// GITHUB CLIENT - Smart File Loading & Operations
// From old version with upgrades: grep search, import tracing
// ============================================================================

import { Octokit } from 'octokit';
import { RepoFile, RepoTree, Branch, Repository, PullRequest, FileChange } from '@/types';

// Module-level cache that persists across GitHubClient instances
// This is critical because a new GitHubClient is created on every request
const FILE_TREE_CACHE = new Map<string, { tree: RepoTree[]; timestamp: number }>();
const FILE_CONTENT_CACHE = new Map<string, { file: RepoFile; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour (extended from 5 minutes)
const MAX_CACHE_ENTRIES = 200;

// Cleanup old cache entries
function cleanupCache<T>(cache: Map<string, { timestamp: number } & T>, maxEntries: number = MAX_CACHE_ENTRIES): void {
  const now = Date.now();
  const toDelete: string[] = [];

  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      toDelete.push(key);
    }
  }

  for (const key of toDelete) {
    cache.delete(key);
  }

  // If still over limit, remove oldest
  if (cache.size > maxEntries) {
    const entries = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const removeCount = cache.size - maxEntries;
    for (let i = 0; i < removeCount; i++) {
      cache.delete(entries[i][0]);
    }
  }
}

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private fileContentCache: Map<string, { content: RepoFile; timestamp: number }> = new Map();
  private searchCache: Map<string, { results: string[]; timestamp: number }> = new Map();
  private readonly CONTENT_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours (extended from 30 min)
  private readonly SEARCH_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours (extended from 1 hour)

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    // Cleanup caches on instantiation
    cleanupCache(FILE_TREE_CACHE);
    cleanupCache(FILE_CONTENT_CACHE);
  }

  // --------------------------------------------------------------------------
  // Repository Info
  // --------------------------------------------------------------------------

  async getRepository(): Promise<Repository> {
    const { data } = await this.octokit.rest.repos.get({
      owner: this.owner,
      repo: this.repo,
    });

    return {
      owner: data.owner.login,
      name: data.name,
      fullName: data.full_name,
      defaultBranch: data.default_branch,
      isPrivate: data.private,
    };
  }

  // --------------------------------------------------------------------------
  // File Tree (with Session Cache)
  // --------------------------------------------------------------------------

  async getFileTree(branch: string = 'main', useCache: boolean = true): Promise<RepoTree[]> {
    const cacheKey = `${this.owner}/${this.repo}/${branch}`;

    // Return cached tree if available and not expired
    if (useCache) {
      const cached = FILE_TREE_CACHE.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[CACHE HIT] File tree for ${cacheKey}`);
        return cached.tree;
      }
    }

    console.log(`[CACHE MISS] Fetching file tree for ${cacheKey}`);
    const sha = await this.getBranchSHA(branch);

    const { data } = await this.octokit.rest.git.getTree({
      owner: this.owner,
      repo: this.repo,
      tree_sha: sha,
      recursive: 'true',
    });

    const tree = this.buildTree(data.tree);

    // Cache the tree with timestamp
    FILE_TREE_CACHE.set(cacheKey, { tree, timestamp: Date.now() });

    return tree;
  }

  clearTreeCache(): void {
    FILE_TREE_CACHE.clear();
  }

  clearAllCaches(): void {
    FILE_TREE_CACHE.clear();
    FILE_CONTENT_CACHE.clear();
    this.fileContentCache.clear();
    this.searchCache.clear();
  }

  // Clean expired cache entries
  cleanupCaches(): void {
    const now = Date.now();
    
    for (const [key, value] of this.fileContentCache.entries()) {
      if (now - value.timestamp > this.CONTENT_CACHE_TTL) {
        this.fileContentCache.delete(key);
      }
    }
    
    for (const [key, value] of this.searchCache.entries()) {
      if (now - value.timestamp > this.SEARCH_CACHE_TTL) {
        this.searchCache.delete(key);
      }
    }
  }

  private async getBranchSHA(branch: string): Promise<string> {
    const { data } = await this.octokit.rest.repos.getBranch({
      owner: this.owner,
      repo: this.repo,
      branch,
    });
    return data.commit.sha;
  }

  private buildTree(flatTree: Array<{ path: string; type: string }>): RepoTree[] {
    const tree: RepoTree[] = [];
    const pathMap = new Map<string, RepoTree>();

    flatTree.sort((a, b) => a.path.localeCompare(b.path));

    for (const item of flatTree) {
      // Skip common non-essential directories
      if (this.shouldSkipPath(item.path)) continue;

      const node: RepoTree = {
        path: item.path,
        type: item.type === 'tree' ? 'dir' : 'file',
        children: item.type === 'tree' ? [] : undefined,
      };
      pathMap.set(item.path, node);

      const parentPath = item.path.split('/').slice(0, -1).join('/');
      if (parentPath && pathMap.has(parentPath)) {
        pathMap.get(parentPath)!.children!.push(node);
      } else {
        tree.push(node);
      }
    }

    return tree;
  }

  private shouldSkipPath(path: string): boolean {
    const skipPatterns = [
      'node_modules',
      '.git',
      '.next',
      'dist',
      'build',
      '.cache',
      'coverage',
      '__pycache__',
      '.venv',
      'venv',
    ];
    return skipPatterns.some(pattern => path.includes(pattern));
  }

  // --------------------------------------------------------------------------
  // File Content
  // --------------------------------------------------------------------------

  async getFileContent(path: string, branch: string = 'main', useCache: boolean = true): Promise<RepoFile> {
    const cacheKey = `${this.owner}/${this.repo}/${branch}:${path}`;
    const MAX_FILE_SIZE = 500000; // 500KB limit
    
    if (useCache) {
      const cached = this.fileContentCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CONTENT_CACHE_TTL) {
        return cached.content;
      }
    }
    const { data } = await this.octokit.rest.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
      ref: branch,
    });

    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error(`Path ${path} is not a file`);
    }

    // Check file size before decoding
    if (data.size > MAX_FILE_SIZE) {
      throw new Error(`File ${path} is too large (${data.size} bytes). Maximum size is ${MAX_FILE_SIZE} bytes.`);
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    const file: RepoFile = { path, content, sha: data.sha };
    
    // Cache the result
    this.fileContentCache.set(cacheKey, { content: file, timestamp: Date.now() });
    
    return file;
  }

  // Invalidate file cache after edits
  invalidateFileCache(path: string, branch: string = 'main'): void {
    const cacheKey = `${this.owner}/${this.repo}/${branch}:${path}`;
    this.fileContentCache.delete(cacheKey);
  }

  // Force refresh all caches (for external updates)
  forceRefresh(): void {
    this.clearAllCaches();
    FILE_TREE_CACHE.clear();
    FILE_CONTENT_CACHE.clear();
    console.log('🔄 All caches cleared - will fetch fresh data');
  }

  async getFiles(paths: string[], branch: string = 'main'): Promise<RepoFile[]> {
    const files = await Promise.all(
      paths.map(path => this.getFileContent(path, branch).catch(() => null))
    );
    return files.filter((f): f is RepoFile => f !== null);
  }

  // --------------------------------------------------------------------------
  // Smart File Loading with Import Tracing
  // --------------------------------------------------------------------------

  async getFilesWithImports(
    entryPaths: string[],
    branch: string = 'main',
    maxDepth: number = 2 // Increased to 2 for better context
  ): Promise<RepoFile[]> {
    const loaded = new Set<string>();
    const files: RepoFile[] = [];
    const maxFiles = 8; // Limit total files loaded

    const loadFile = async (path: string, depth: number): Promise<void> => {
      if (files.length >= maxFiles) return; // Stop if we have enough files
      
      const possiblePaths = [
        path,
        `${path}.ts`,
        `${path}.tsx`,
        `${path}.js`,
        `${path}.jsx`,
      ]; // Removed index file variants to reduce API calls

      for (const p of possiblePaths) {
        if (loaded.has(p) || files.length >= maxFiles) return;

        try {
          const file = await this.getFileContent(p, branch);
          loaded.add(p);
          files.push(file);

          // Only follow imports for first level and if file is small
          if (depth < maxDepth && file.content.length < 5000) {
            const imports = this.parseImports(file.content, p).slice(0, 3); // Limit imports
            await Promise.all(imports.map(imp => loadFile(imp, depth + 1)));
          }
          return;
        } catch {
          // File doesn't exist with this extension, try next
        }
      }
    };

    await Promise.all(entryPaths.slice(0, 3).map(p => loadFile(p, 0))); // Limit entry paths
    return files;
  }

  private parseImports(content: string, currentPath: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(this.resolveImportPath(match[1], currentPath));
    }
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(this.resolveImportPath(match[1], currentPath));
    }

    // Filter out node_modules imports and @/ aliases
    return imports.filter(i => 
      (i.startsWith('./') || i.startsWith('../')) && 
      !i.includes('node_modules')
    );
  }

  private resolveImportPath(importPath: string, currentPath: string): string {
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const currentDir = currentPath.split('/').slice(0, -1).join('/');
      const parts = [...currentDir.split('/'), ...importPath.split('/')];
      const resolved: string[] = [];

      for (const part of parts) {
        if (part === '..') resolved.pop();
        else if (part !== '.' && part !== '') resolved.push(part);
      }

      return resolved.join('/');
    }
    return importPath;
  }

  // --------------------------------------------------------------------------
  // Grep Search - Search INSIDE file contents
  // --------------------------------------------------------------------------

  async grepSearch(
    query: string,
    branch: string = 'main',
    options: { maxResults?: number; fileExtensions?: string[] } = {}
  ): Promise<Array<{ path: string; line: number; content: string }>> {
    const { maxResults = 30, fileExtensions } = options;
    const results: Array<{ path: string; line: number; content: string }> = [];
    const MAX_FILE_SIZE = 100000; // 100KB limit

    try {
      // Use GitHub's code search API - returns snippets, not full files
      const searchQuery = fileExtensions
        ? `${query} repo:${this.owner}/${this.repo} extension:${fileExtensions.join(',')}`
        : `${query} repo:${this.owner}/${this.repo}`;

      const { data } = await this.octokit.rest.search.code({
        q: searchQuery,
        per_page: Math.min(maxResults, 30),
      });

      // GitHub search API returns text_matches with snippets - use those instead of fetching full files
      for (const item of data.items.slice(0, maxResults)) {
        const itemWithMatches = item as typeof item & { text_matches?: Array<{ fragment?: string }> };
        if (itemWithMatches.text_matches && itemWithMatches.text_matches.length > 0) {
          // Use GitHub's provided snippets
          itemWithMatches.text_matches.forEach((match, idx) => {
            if (match.fragment && results.length < maxResults) {
              results.push({
                path: item.path,
                line: idx + 1, // Approximate line number
                content: match.fragment.trim(),
              });
            }
          });
        }
      }
    } catch (error) {
      console.error('Grep search error:', error);
    }

    return results.slice(0, maxResults);
  }

  // --------------------------------------------------------------------------
  // File Search (by filename)
  // --------------------------------------------------------------------------

  async searchFiles(query: string): Promise<string[]> {
    const cacheKey = `${this.owner}/${this.repo}:${query}`;
    const cached = this.searchCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.SEARCH_CACHE_TTL) {
      return cached.results;
    }

    const { data } = await this.octokit.rest.search.code({
      q: `${query} repo:${this.owner}/${this.repo}`,
      per_page: 15, // Reduced from 20
    });

    const results = data.items.map(item => item.path);
    this.searchCache.set(cacheKey, { results, timestamp: Date.now() });
    
    return results;
  }

  // --------------------------------------------------------------------------
  // Branch Operations
  // --------------------------------------------------------------------------

  async listBranches(): Promise<Branch[]> {
    const { data } = await this.octokit.rest.repos.listBranches({
      owner: this.owner,
      repo: this.repo,
    });

    const { data: repoData } = await this.octokit.rest.repos.get({
      owner: this.owner,
      repo: this.repo,
    });

    return data.map(b => ({
      name: b.name,
      sha: b.commit.sha,
      isDefault: b.name === repoData.default_branch,
    }));
  }

  async createBranch(branchName: string, fromBranch: string = 'main'): Promise<Branch> {
    const { data: refData } = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${fromBranch}`,
    });

    await this.octokit.rest.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    });

    return {
      name: branchName,
      sha: refData.object.sha,
      isDefault: false,
    };
  }

  async deleteBranch(branch: string): Promise<void> {
    await this.octokit.rest.git.deleteRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branch}`,
    });
  }

  // --------------------------------------------------------------------------
  // File Operations
  // --------------------------------------------------------------------------

  async updateFile(
    path: string,
    content: string,
    message: string,
    branch: string,
    sha?: string
  ): Promise<void> {
    const contentStr = String(content || '');
    const base64Content = Buffer.from(contentStr, 'utf-8').toString('base64');
    const result = await this.octokit.rest.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path,
      message,
      content: base64Content,
      branch,
      sha,
    });
    
    // Force Railway deployment by triggering repository dispatch event
    try {
      await this.octokit.rest.repos.createDispatchEvent({
        owner: this.owner,
        repo: this.repo,
        event_type: 'claude-coder-deploy',
        client_payload: {
          branch,
          path,
          commit_sha: result.data.commit.sha,
          message: `Claude Coder: ${message}`,
        },
      });
      console.log(`✅ Triggered Railway deployment for ${path}`);
    } catch (error) {
      console.warn('Failed to trigger deployment event:', error);
      // Don't fail the whole operation if dispatch fails
    }
  }

  async applyStrReplace(
    path: string,
    oldStr: string,
    newStr: string,
    branch: string
  ): Promise<{ success: boolean; error?: string; additions?: number; deletions?: number }> {
    try {
      const file = await this.getFileContent(path, branch, false);

      if (!file.content.includes(oldStr)) {
        return {
          success: false,
          error: `String not found in ${path}. Make sure the string is unique and exact.`,
        };
      }

      const occurrences = file.content.split(oldStr).length - 1;
      if (occurrences > 1) {
        return {
          success: false,
          error: `String found ${occurrences} times in ${path}. It must be unique for safe replacement.`,
        };
      }

      const newContent = file.content.replace(oldStr, newStr);
      await this.updateFile(path, newContent, `Edit ${path}`, branch, file.sha);

      // Invalidate cache after successful edit
      this.invalidateFileCache(path, branch);

      // Calculate line changes
      const oldLines = oldStr.split('\n').length;
      const newLines = newStr.split('\n').length;

      return {
        success: true,
        additions: Math.max(0, newLines - oldLines) + 1,
        deletions: Math.max(0, oldLines - newLines) + 1,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  async createFile(
    path: string,
    content: string,
    branch: string
  ): Promise<{ success: boolean; error?: string; additions?: number }> {
    try {
      const contentStr = String(content || '');
      const base64Content = Buffer.from(contentStr, 'utf-8').toString('base64');
      const result = await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message: `Create ${path}`,
        content: base64Content,
        branch,
      });

      // Invalidate tree cache since we added a new file
      this.clearTreeCache();

      // Force Railway deployment by triggering repository dispatch event
      try {
        await this.octokit.rest.repos.createDispatchEvent({
          owner: this.owner,
          repo: this.repo,
          event_type: 'claude-coder-deploy',
          client_payload: {
            branch,
            path,
            commit_sha: result.data.commit.sha,
            message: `Claude Coder: Create ${path}`,
          },
        });
        console.log(`✅ Triggered Railway deployment for ${path}`);
      } catch (error) {
        console.warn('Failed to trigger deployment event:', error);
        // Don't fail the whole operation if dispatch fails
      }

      return {
        success: true,
        additions: content.split('\n').length,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  // --------------------------------------------------------------------------
  // Pull Request Operations
  // --------------------------------------------------------------------------

  async createPullRequest(
    title: string,
    body: string,
    head: string,
    base: string = 'main'
  ): Promise<PullRequest> {
    const { data } = await this.octokit.rest.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      head,
      base,
    });

    return {
      number: data.number,
      url: data.html_url,
      title: data.title,
      state: data.state as 'open' | 'closed' | 'merged',
      branch: head,
    };
  }

  async getPullRequest(prNumber: number): Promise<PullRequest> {
    const { data } = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });

    return {
      number: data.number,
      url: data.html_url,
      title: data.title,
      state: data.merged ? 'merged' : (data.state as 'open' | 'closed'),
      branch: data.head.ref,
    };
  }

  // --------------------------------------------------------------------------
  // Recent Commits (for Sessions view)
  // --------------------------------------------------------------------------

  async getRecentCommits(branch: string = 'main', count: number = 10): Promise<Array<{
    sha: string;
    message: string;
    date: Date;
    author: string;
    filesChanged: number;
  }>> {
    const { data } = await this.octokit.rest.repos.listCommits({
      owner: this.owner,
      repo: this.repo,
      sha: branch,
      per_page: count,
    });

    return data.map(commit => ({
      sha: commit.sha,
      message: commit.commit.message,
      date: new Date(commit.commit.author?.date || Date.now()),
      author: commit.commit.author?.name || 'Unknown',
      filesChanged: 0, // Would need additional API call per commit
    }));
  }
}

// --------------------------------------------------------------------------
// Utility Functions
// --------------------------------------------------------------------------

export function formatFileTree(tree: RepoTree[], indent: string = ''): string {
  let result = '';
  for (const node of tree) {
    const icon = node.type === 'dir' ? '📁' : '📄';
    const name = node.path.split('/').pop();
    result += `${indent}${icon} ${name}\n`;
    if (node.children) {
      result += formatFileTree(node.children, indent + '  ');
    }
  }
  return result;
}

export function formatFilesForContext(files: RepoFile[]): string {
  return files.map(f => `
### ${f.path}
\`\`\`${getFileExtension(f.path)}
${f.content}
\`\`\`
`).join('\n');
}

function getFileExtension(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    json: 'json',
    css: 'css',
    html: 'html',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return langMap[ext] || ext;
}

// --------------------------------------------------------------------------
// Error Parsing - Extract file path and line number from error messages
// --------------------------------------------------------------------------

export function parseErrorMessage(errorText: string): {
  filePath?: string;
  lineNumber?: number;
  columnNumber?: number;
  errorMessage: string;
} {
  // Common error patterns
  const patterns = [
    // TypeScript/JavaScript: "src/app/page.tsx(15,3): error TS..."
    /([^\s:]+\.[jt]sx?)\((\d+),(\d+)\):\s*(.+)/,
    // ESLint/Standard: "src/app/page.tsx:15:3: ..."
    /([^\s:]+\.[jt]sx?):(\d+):(\d+):\s*(.+)/,
    // Python: 'File "path.py", line 15'
    /File\s+"([^"]+)",\s+line\s+(\d+)/,
    // Go: "path.go:15:3: ..."
    /([^\s:]+\.go):(\d+):(\d+):\s*(.+)/,
    // Rust: "--> src/main.rs:15:3"
    /-->\s*([^\s:]+):(\d+):(\d+)/,
    // Generic: "at path:line:col" or "in path on line X"
    /at\s+([^\s:]+):(\d+)(?::(\d+))?/,
    /in\s+([^\s]+)\s+on\s+line\s+(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = errorText.match(pattern);
    if (match) {
      return {
        filePath: match[1],
        lineNumber: parseInt(match[2], 10),
        columnNumber: match[3] ? parseInt(match[3], 10) : undefined,
        errorMessage: match[4] || errorText,
      };
    }
  }

  return { errorMessage: errorText };
}
