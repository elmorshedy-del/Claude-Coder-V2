# Claude Coder v2.0 - Product Overview

## Purpose & Value Proposition

Claude Coder v2.0 is an AI-powered coding assistant that integrates with GitHub to provide intelligent code analysis, editing, and project management capabilities. It leverages Claude's advanced language model to understand codebases, make surgical edits, and maintain development workflows with significant cost optimizations.

## Key Features & Capabilities

### Core AI Features
- **Smart File Loading**: Intelligently loads 3-5 relevant files using keyword extraction
- **Import Tracing**: Analyzes dependencies 2 levels deep via `getFilesWithImports()`
- **Prompt Caching**: Achieves 90% cost savings through intelligent caching (1-hour TTL)
- **Surgical Edits**: Precise code modifications using str_replace functionality
- **Context Compaction**: Auto-summarizes old messages to maintain conversation efficiency

### Advanced Tools
- **File Operations**: read_file, search_files, str_replace, create_file
- **Grep Search**: Search inside file contents for precise code location
- **Error Parsing**: Auto-extracts file paths and line numbers from error messages
- **Session Cache**: File tree cached per conversation for performance

### GitHub Integration
- **Safe Mode**: Creates branches and pull requests for code changes
- **Direct Mode**: Push directly to main branch with confirmation
- **Branch Management**: Automated branch creation and PR workflows
- **Post-Edit Actions**: View PR or discard changes after modifications

### User Experience
- **Real-time Streaming**: PUT endpoint with live text and thinking display
- **Artifact System**: Preview/Code toggle with downloadable artifacts
- **File Upload**: Functional file attachment system
- **Web Integration**: Fetch full page content from URLs with citations
- **Cost Tracking**: Display cost per message for transparency

### Rendering Capabilities
- **Multi-format Artifacts**: HTML, SVG, React components, Mermaid diagrams
- **Code Highlighting**: Syntax highlighting with copy functionality
- **Collapsible UI**: Thinking blocks and sidebar management
- **Dark/Light Mode**: Theme switching support

## Target Users & Use Cases

### Primary Users
- **Software Developers**: Individual developers seeking AI-assisted coding
- **Development Teams**: Teams needing collaborative code review and editing
- **Project Maintainers**: Open source maintainers managing contributions

### Key Use Cases
- **Code Analysis**: Understanding large codebases quickly
- **Refactoring**: Making systematic changes across multiple files
- **Bug Fixing**: Identifying and resolving issues with context awareness
- **Feature Development**: Adding new functionality with proper integration
- **Code Review**: Automated analysis of changes and suggestions
- **Documentation**: Generating and maintaining project documentation

### Deployment Scenarios
- **Local Development**: Running on developer machines for personal use
- **Railway Deployment**: Cloud hosting with GitHub integration
- **Team Environments**: Shared instances for collaborative development

## Value Metrics

### Cost Efficiency
- **90% Cost Reduction**: Smart file loading + prompt caching
- **Example Savings**: $0.03 vs $0.60 for 10 messages
- **Extended Caching**: 1-hour prompt cache TTL for sustained sessions

### Performance Benefits
- **Intelligent Context**: Only loads relevant files, reducing token usage
- **Session Persistence**: Cached file trees eliminate redundant operations
- **Streaming Responses**: Real-time feedback improves user experience

### Development Velocity
- **Surgical Precision**: Targeted edits without breaking existing code
- **Automated Workflows**: GitHub integration reduces manual deployment steps
- **Multi-model Support**: Sonnet/Opus/Haiku selection for different complexity needs