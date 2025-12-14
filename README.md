# Claude Coder v2.0

AI-powered coding assistant with GitHub integration. Built with Next.js 15, Tailwind CSS v4, and Claude API.

## Features

### Core Features (from old version)
- ✅ Smart file loading (3-5 files via keyword extraction)
- ✅ Import tracing (2 levels deep via `getFilesWithImports()`)
- ✅ Prompt caching (90% cost savings)
- ✅ Surgical edits with str_replace
- ✅ Tools: read_file, search_files, str_replace, create_file

### 8 Fixes (v2.0 Final)

| # | Fix | Description |
|---|-----|-------------|
| 1 | ✅ **Wire Streaming** | PUT endpoint with real-time text/thinking display |
| 2 | ✅ **Wire PostEditActions** | Shows after file changes with View PR / Discard |
| 3 | ✅ **Context Compaction** | Auto-summarize old messages (beta) |
| 4 | ✅ **Effort Parameter** | Low/Medium/High slider in Settings |
| 5 | ✅ **Files API** | Upload once, reference across messages |
| 6 | ✅ **Citations** | Display sources from web search |
| 7 | ✅ **Web Fetch** | Fetch full page content from URLs |
| 8 | ✅ **Interleaved Thinking** | Think between tool calls (toggle) |

### New Features (24 total)

**3 Upgrades:**
1. ✅ Grep Search - Search INSIDE file contents
2. ✅ Error Parsing - Auto-extract file path + line number
3. ✅ Session Cache - File tree cached per conversation

**UI/UX Features:**
4. ✅ Natural streaming responses
5. ✅ Extended thinking toggle
6. ✅ Collapsible thinking UI block
7. ✅ Claude loading spinner
8. ✅ Code snippets with copy button
9. ✅ Artifact panel (Preview/Code toggle)
10. ✅ Renderable artifacts (HTML, SVG, React, Mermaid)
11. ✅ File upload (actually works!)
12. ✅ Artifact download
13. ✅ Web search toggle + auto-detect
14. ✅ Cost per message display

**API Features:**
15. ✅ Effort parameter (low/medium/high)
16. ✅ 1-hour prompt caching (extended TTL)
17. ✅ Model selection (Sonnet/Opus/Haiku)

**Navigation:**
18. ✅ Artifacts list sidebar
19. ✅ Sessions view with stats
20. ✅ Collapsible sidebar
21. ✅ Post-edit actions (View PR / Discard)

**Deploy Modes:**
22. ✅ Safe Mode - Creates branch + PR
23. ✅ Direct Mode - Push to main with confirm
24. ✅ Dark/Light mode

## Deployment to Railway

### Quick Deploy

1. Push to GitHub:
```bash
git init
git add .
git commit -m "Claude Coder v2.0"
git remote add origin https://github.com/YOUR_USERNAME/claude-coder.git
git push -u origin main
```

2. Connect to Railway:
   - Go to [railway.app](https://railway.app)
   - New Project → Deploy from GitHub
   - Select your repo

3. Environment Variables (none required - keys entered in UI)

4. Enable PR Environments (for Safe Mode previews):
   - Railway Settings → PR Environments → Enable

### Environment Variables (Optional)

If you want to pre-configure:
```
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
```

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- Next.js 15.5
- React 19
- Tailwind CSS v4
- TypeScript
- Anthropic Claude API
- GitHub REST API (via Octokit)

## Cost Savings

Smart file loading + prompt caching = **~90% cost reduction**

Example: $0.03 vs $0.60 for 10 messages

## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/route.ts      # Auth validation
│   │   ├── chat/route.ts      # Claude API
│   │   └── github/route.ts    # GitHub operations
│   ├── globals.css            # Tailwind + Claude styling
│   ├── layout.tsx
│   └── page.tsx               # Main app
├── components/
│   ├── ArtifactPanel.tsx      # Right panel viewer
│   ├── ArtifactsList.tsx      # Artifacts sidebar
│   ├── BranchManager.tsx      # Branch operations
│   ├── ChatMessage.tsx        # Message rendering
│   ├── Citations.tsx          # Web search sources
│   ├── CodeBlock.tsx          # Syntax highlighting
│   ├── CostTracker.tsx        # Cost display
│   ├── FileUpload.tsx         # File attachments
│   ├── LoadingSpinner.tsx     # Claude spinner
│   ├── PostEditActions.tsx    # PR/commit actions
│   ├── SettingsPanel.tsx      # Settings drawer
│   ├── Sidebar.tsx            # Conversation list
│   ├── ThinkingBlock.tsx      # Extended thinking
│   └── WelcomeScreen.tsx      # Initial view
├── lib/
│   ├── claude.ts              # Claude client + tools
│   └── github.ts              # GitHub client
└── types/
    └── index.ts               # TypeScript types
```

## License

MIT
