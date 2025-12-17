// ============================================================================
// LOCAL FILESYSTEM CLIENT - Direct file access (fast!)
// ============================================================================

import path from 'path';

export class LocalFileSystem {
  constructor(private workspaceRoot: string) {}

  // Read file from local disk
  async readFile(filePath: string): Promise<string> {
    try {
      const fs = await import('fs/promises');
      const fullPath = path.resolve(this.workspaceRoot, filePath);
      
      // Security check: ensure path is within workspace
      if (!fullPath.startsWith(path.resolve(this.workspaceRoot))) {
        throw new Error('Path outside workspace not allowed');
      }
      
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Write file to local disk
  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const fullPath = path.resolve(this.workspaceRoot, filePath);
      
      // Security check: ensure path is within workspace
      if (!fullPath.startsWith(path.resolve(this.workspaceRoot))) {
        throw new Error('Path outside workspace not allowed');
      }
      
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // List all files (like file tree)
  async listFiles(dir: string = ''): Promise<string[]> {
    try {
      const fs = await import('fs/promises');
      const fullPath = path.resolve(this.workspaceRoot, dir);
      
      // Security check: ensure path is within workspace
      if (!fullPath.startsWith(path.resolve(this.workspaceRoot))) {
        throw new Error('Path outside workspace not allowed');
      }
      
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
    
    const files: string[] = [];
    for (const entry of entries) {
      const relativePath = path.join(dir, entry.name);
      
      // Skip node_modules, .git, etc
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      
      if (entry.isDirectory()) {
        const subFiles = await this.listFiles(relativePath);
        files.push(...subFiles);
      } else {
        files.push(relativePath);
      }
    }
    
    return files;
    } catch (error) {
      throw new Error(`Failed to list files in ${dir}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Grep search (fast!)
  async grepSearch(query: string, extensions?: string[]): Promise<Array<{ path: string; line: number; content: string }>> {
    try {
      // Input validation
      if (!query || query.trim() === '') {
        throw new Error('Search query cannot be empty');
      }
      
      const { execSync } = await import('child_process');
      const extFlag = extensions ? `--include="*.{${extensions.join(',')}}"` : '';
      const escapedQuery = query.replace(/"/g, '\\"'); // Escape quotes
      const cmd = `grep -rn ${extFlag} "${escapedQuery}" ${this.workspaceRoot} 2>/dev/null || true`;
      
      const output = execSync(cmd, { 
        encoding: 'utf-8', 
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000 // 30 second timeout
      });
      
      const results: Array<{ path: string; line: number; content: string }> = [];
      const lines = output.split('\n').filter(Boolean);
      
      for (const line of lines.slice(0, 50)) { // Limit to 50 results
        const match = line.match(/^(.+?):(\d+):(.+)$/);
        if (match) {
          const [, filePath, lineNum, content] = match;
          const lineNumber = parseInt(lineNum, 10);
          if (!isNaN(lineNumber)) {
            results.push({
              path: path.relative(this.workspaceRoot, filePath),
              line: lineNumber,
              content: content.trim(),
            });
          }
        }
      }
      
      return results;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown grep error';
      throw new Error(`Grep search failed for "${query}": ${errorMsg}`);
    }
  }

  // Search files by name
  async searchFiles(query: string): Promise<string[]> {
    try {
      const allFiles = await this.listFiles();
      return allFiles.filter(f => f.toLowerCase().includes(query.toLowerCase()));
    } catch (error) {
      throw new Error(`Failed to search files for "${query}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
