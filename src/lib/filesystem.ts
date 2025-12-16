// ============================================================================
// LOCAL FILESYSTEM CLIENT - Direct file access (fast!)
// ============================================================================

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

export class LocalFileSystem {
  constructor(private workspaceRoot: string) {}

  // Read file from local disk
  async readFile(filePath: string): Promise<string> {
    const fullPath = path.join(this.workspaceRoot, filePath);
    return fs.readFile(fullPath, 'utf-8');
  }

  // Write file to local disk
  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.workspaceRoot, filePath);
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  // List all files (like file tree)
  async listFiles(dir: string = ''): Promise<string[]> {
    const fullPath = path.join(this.workspaceRoot, dir);
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
  }

  // Grep search (fast!)
  async grepSearch(query: string, extensions?: string[]): Promise<Array<{ path: string; line: number; content: string }>> {
    try {
      const extFlag = extensions ? `--include="*.{${extensions.join(',')}}"` : '';
      const cmd = `grep -rn ${extFlag} "${query}" ${this.workspaceRoot} 2>/dev/null || true`;
      const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      
      const results: Array<{ path: string; line: number; content: string }> = [];
      const lines = output.split('\n').filter(Boolean);
      
      for (const line of lines.slice(0, 50)) { // Limit to 50 results
        const match = line.match(/^(.+?):(\d+):(.+)$/);
        if (match) {
          const [, filePath, lineNum, content] = match;
          results.push({
            path: path.relative(this.workspaceRoot, filePath),
            line: parseInt(lineNum),
            content: content.trim(),
          });
        }
      }
      
      return results;
    } catch (error) {
      console.error('Grep search failed:', error);
      return [];
    }
  }

  // Search files by name
  async searchFiles(query: string): Promise<string[]> {
    const allFiles = await this.listFiles();
    return allFiles.filter(f => f.toLowerCase().includes(query.toLowerCase()));
  }
}
