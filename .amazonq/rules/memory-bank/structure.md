# Claude Coder v2.0 - Project Structure

## Directory Organization

### Root Structure
```
/workspaces/Claude-Coder-V2/
├── src/                    # Main application source code
├── .amazonq/              # Amazon Q configuration and rules
├── .next/                 # Next.js build artifacts (auto-generated)
├── package.json           # Project dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── next.config.ts         # Next.js configuration
├── postcss.config.mjs     # PostCSS configuration for Tailwind
└── README.md              # Project documentation
```

### Source Code Structure (`src/`)

#### Application Layer (`src/app/`)
- **`page.tsx`**: Main application entry point and UI
- **`layout.tsx`**: Root layout with global providers
- **`globals.css`**: Global styles including Tailwind CSS v4

#### API Routes (`src/app/api/`)
- **`auth/route.ts`**: Authentication validation endpoints
- **`chat/route.ts`**: Claude API integration and conversation handling
- **`github/route.ts`**: GitHub operations (branches, PRs, commits)

#### Components Layer (`src/components/`)

**Core UI Components:**
- **`ChatMessage.tsx`**: Message rendering with markdown support
- **`CodeBlock.tsx`**: Syntax highlighting with copy functionality
- **`LoadingSpinner.tsx`**: Claude-branded loading animations
- **`ThinkingBlock.tsx`**: Collapsible AI reasoning display

**Feature Components:**
- **`ArtifactPanel.tsx`**: Right panel for artifact preview/code toggle
- **`ArtifactsList.tsx`**: Sidebar listing all conversation artifacts
- **`FileUpload.tsx`**: File attachment handling
- **`Citations.tsx`**: Web search source display

**Settings & Configuration:**
- **`SettingsPanel.tsx`**: Main settings drawer with API keys
- **`QuickSettings.tsx`**: Inline settings for effort/model selection
- **`CostTracker.tsx`**: Per-message cost display

**GitHub Integration:**
- **`BranchManager.tsx`**: Branch creation and management
- **`PostEditActions.tsx`**: Post-edit PR/commit actions
- **`ActionBlock.tsx`**: Action button groupings

**Navigation:**
- **`Sidebar.tsx`**: Conversation list and navigation
- **`WelcomeScreen.tsx`**: Initial landing experience

#### Business Logic (`src/lib/`)
- **`claude.ts`**: Claude API client, tools, and conversation management
- **`github.ts`**: GitHub API client using Octokit

#### Type Definitions (`src/types/`)
- **`index.ts`**: Comprehensive TypeScript type definitions

### Configuration Files

#### Amazon Q Rules (`/.amazonq/rules/`)
- **`memory-bank/`**: Project documentation and guidelines
- **`CVB.md`**: Custom validation and behavior rules

#### Build Configuration
- **`next.config.ts`**: Next.js 15 configuration
- **`tsconfig.json`**: TypeScript compiler options with path mapping
- **`postcss.config.mjs`**: Tailwind CSS v4 PostCSS integration
- **`package.json`**: Dependencies and build scripts

## Architectural Patterns

### Frontend Architecture
- **Next.js App Router**: Modern routing with server/client components
- **React 19**: Latest React features with concurrent rendering
- **Tailwind CSS v4**: Utility-first styling with modern CSS features
- **TypeScript**: Full type safety across the application

### API Design
- **RESTful Routes**: Standard HTTP methods for different operations
- **Streaming Responses**: Real-time data flow for chat interactions
- **Error Handling**: Consistent error responses across endpoints

### State Management
- **React State**: Local component state for UI interactions
- **Session Storage**: Conversation persistence across page reloads
- **Cache Management**: Intelligent caching for file operations

### Integration Patterns
- **Claude API**: Direct integration with Anthropic's Claude models
- **GitHub API**: Octokit-based GitHub operations
- **File System**: Server-side file operations for code analysis

## Component Relationships

### Core Flow
1. **User Input** → `page.tsx` → **Chat Interface**
2. **Message Processing** → `api/chat/route.ts` → **Claude API**
3. **Tool Execution** → `lib/claude.ts` → **File Operations**
4. **GitHub Actions** → `api/github/route.ts` → **Repository Management**

### UI Component Hierarchy
```
page.tsx (Main App)
├── Sidebar.tsx (Navigation)
├── ChatMessage.tsx (Message Display)
│   ├── CodeBlock.tsx (Code Rendering)
│   ├── ThinkingBlock.tsx (AI Reasoning)
│   └── Citations.tsx (Source Links)
├── ArtifactPanel.tsx (Preview Panel)
├── SettingsPanel.tsx (Configuration)
└── PostEditActions.tsx (GitHub Actions)
```

### Data Flow Architecture
- **Unidirectional Flow**: Props down, events up pattern
- **Event-Driven**: User actions trigger API calls and state updates
- **Reactive Updates**: Real-time streaming updates UI components
- **Persistent State**: Session and settings maintained across interactions