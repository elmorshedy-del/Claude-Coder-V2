# Claude Coder v2.0 - Technology Stack

## Programming Languages & Versions

### Primary Languages
- **TypeScript 5.7.2**: Main development language with strict type checking
- **JavaScript (ES2017+)**: Target compilation for broad browser support
- **CSS**: Tailwind CSS v4 utility classes with custom properties
- **JSON**: Configuration and data exchange format

### Runtime Environment
- **Node.js**: Server-side JavaScript runtime (compatible with Next.js 15)
- **React 19**: Latest React with concurrent features and server components
- **Next.js 15.1.0**: Full-stack React framework with App Router

## Core Dependencies

### Frontend Framework
```json
{
  "next": "^15.1.0",
  "react": "^19.0.0", 
  "react-dom": "^19.0.0"
}
```

### AI & API Integration
```json
{
  "@anthropic-ai/sdk": "^0.52.0",
  "octokit": "^4.0.2"
}
```

### UI & Rendering
```json
{
  "lucide-react": "^0.468.0",
  "react-markdown": "^9.0.1",
  "react-syntax-highlighter": "^15.6.1"
}
```

### Styling & Build Tools
```json
{
  "tailwindcss": "^4.0.0",
  "@tailwindcss/postcss": "^4.0.0"
}
```

## Development Dependencies

### TypeScript Support
```json
{
  "typescript": "^5.7.2",
  "@types/node": "^22.10.2",
  "@types/react": "^19.0.1",
  "@types/react-dom": "^19.0.1",
  "@types/react-syntax-highlighter": "^15.5.13"
}
```

## Build System & Configuration

### Next.js Configuration (`next.config.ts`)
- **App Router**: Modern routing system with server/client components
- **TypeScript Integration**: Native TypeScript support
- **API Routes**: Built-in API endpoint handling
- **Static Generation**: Optimized builds with ISR support

### TypeScript Configuration (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### PostCSS Configuration (`postcss.config.mjs`)
- **Tailwind CSS v4**: Latest utility-first CSS framework
- **Modern CSS Features**: CSS custom properties and modern selectors
- **Build Optimization**: Automatic purging and minification

## Development Commands

### Local Development
```bash
npm run dev          # Start development server (localhost:3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint code quality checks
```

### Package Management
```bash
npm install          # Install all dependencies
npm ci              # Clean install from package-lock.json
npm update          # Update dependencies to latest compatible versions
```

## External APIs & Services

### Anthropic Claude API
- **Models**: Sonnet, Opus, Haiku model selection
- **Features**: Streaming responses, prompt caching, tool calling
- **Authentication**: API key-based authentication
- **Rate Limiting**: Built-in request throttling

### GitHub API (via Octokit)
- **Operations**: Repository management, branch creation, PR handling
- **Authentication**: Personal access token or GitHub App
- **Permissions**: Repository read/write access required

### Web Scraping
- **URL Fetching**: Full page content retrieval
- **Content Processing**: HTML parsing and text extraction
- **Citation Generation**: Source link management

## Deployment Platforms

### Railway (Recommended)
- **GitHub Integration**: Automatic deployments from repository
- **Environment Variables**: Secure API key management
- **PR Environments**: Preview deployments for Safe Mode
- **Zero Configuration**: No additional setup required

### Local Development
- **Hot Reloading**: Instant updates during development
- **TypeScript Checking**: Real-time type validation
- **API Proxy**: Local API routes for testing

## Performance Optimizations

### Caching Strategy
- **Prompt Caching**: 1-hour TTL for Claude API responses
- **Session Cache**: File tree caching per conversation
- **Static Assets**: Next.js automatic static optimization

### Bundle Optimization
- **Code Splitting**: Automatic route-based splitting
- **Tree Shaking**: Dead code elimination
- **Minification**: Production build optimization

### Memory Management
- **Context Compaction**: Automatic old message summarization
- **Smart Loading**: Selective file loading (3-5 files max)
- **Streaming**: Real-time response processing

## Security Considerations

### API Security
- **Environment Variables**: Secure credential storage
- **CORS Configuration**: Controlled cross-origin requests
- **Input Validation**: Request sanitization and validation

### GitHub Integration
- **Token Scoping**: Minimal required permissions
- **Branch Protection**: Safe Mode with PR workflows
- **Audit Trail**: All changes tracked through Git history

## Browser Compatibility

### Target Browsers
- **Modern Browsers**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **JavaScript Features**: ES2017+ support required
- **CSS Features**: CSS Grid, Flexbox, Custom Properties

### Progressive Enhancement
- **Core Functionality**: Works without JavaScript for basic features
- **Enhanced Experience**: Full interactivity with JavaScript enabled
- **Responsive Design**: Mobile-first responsive layout