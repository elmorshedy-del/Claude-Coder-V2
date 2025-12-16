# Claude Coder v2.0 - Development Guidelines

## Code Quality Standards

### TypeScript Configuration
- **Strict Mode**: All TypeScript files use strict type checking with `"strict": true`
- **Path Mapping**: Use `@/*` imports for src directory (`"@/*": ["./src/*"]`)
- **Target ES2017**: Compilation target for broad browser compatibility
- **JSX Preserve**: React components use `"jsx": "preserve"` for Next.js optimization

### File Organization Patterns
- **Barrel Exports**: Centralized type definitions in `src/types/index.ts`
- **Feature Grouping**: Components grouped by functionality (UI, GitHub, Settings)
- **API Route Structure**: RESTful endpoints with clear action parameters
- **Configuration Files**: Root-level config files (tsconfig.json, next.config.ts, postcss.config.mjs)

### Import Conventions
```typescript
// External libraries first
import React, { useState, useEffect, useRef } from 'react';
import { NextRequest, NextResponse } from 'next/server';

// Internal types and utilities
import { Message, Settings, Repository } from '@/types';

// Component imports (grouped by category)
import Sidebar from '@/components/Sidebar';
import ChatMessage from '@/components/ChatMessage';
```

### Naming Standards
- **Components**: PascalCase with descriptive names (`SettingsPanel`, `ChatMessage`)
- **Files**: Match component names exactly (`SettingsPanel.tsx`)
- **Variables**: camelCase with clear intent (`currentConversationId`, `isStreaming`)
- **Constants**: SCREAMING_SNAKE_CASE for app constants (`MAX_CACHE_SIZE`, `CACHE_TTL`)
- **Types**: PascalCase interfaces with descriptive suffixes (`ChatRequest`, `ToolAction`)

## Architectural Patterns

### State Management
- **Local State**: React useState for component-specific state
- **Persistent State**: localStorage for user preferences and session data
- **State Lifting**: Shared state managed at appropriate parent component level
- **Effect Dependencies**: Comprehensive dependency arrays in useEffect hooks

### Component Structure
```typescript
export default function ComponentName() {
  // --------------------------------------------------------------------------
  // STATE - Grouped by category with comments
  // --------------------------------------------------------------------------
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // --------------------------------------------------------------------------
  // REFS
  // --------------------------------------------------------------------------
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // --------------------------------------------------------------------------
  // EFFECTS - Documented purpose
  // --------------------------------------------------------------------------
  useEffect(() => {
    // Clear documentation of effect purpose
  }, [dependencies]);
  
  // --------------------------------------------------------------------------
  // FUNCTIONS - Descriptive names with clear purpose
  // --------------------------------------------------------------------------
  const handleSendMessage = async () => {
    // Implementation
  };
  
  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------
  return (
    // JSX implementation
  );
}
```

### Error Handling Patterns
- **Try-Catch Blocks**: Comprehensive error handling in async functions
- **Error Boundaries**: Graceful degradation for component failures
- **User Feedback**: Clear error messages with actionable guidance
- **Fallback States**: Default values and loading states for all async operations

### API Design Patterns
- **RESTful Routes**: Standard HTTP methods (GET, POST, PUT) with clear semantics
- **Action Parameters**: Consistent action-based routing in API endpoints
- **Response Structure**: Standardized JSON responses with error handling
- **Header Authentication**: Token-based auth via request headers

## React & Next.js Patterns

### Component Patterns
- **Client Components**: Explicit `'use client'` directive for interactive components
- **Server Components**: Default server-side rendering for static content
- **Conditional Rendering**: Early returns for loading and error states
- **Event Handlers**: Descriptive handler names (`handleSendMessage`, `handleSelectRepo`)

### Hook Usage
- **useState**: Typed state with explicit initial values
- **useEffect**: Documented dependencies and cleanup functions
- **useRef**: DOM references and mutable values that don't trigger re-renders
- **Custom Hooks**: Extracted for reusable stateful logic

### Performance Optimizations
- **Memoization**: Strategic use of useMemo and useCallback for expensive operations
- **Lazy Loading**: Dynamic imports for large components
- **Debouncing**: Input debouncing for search and API calls
- **Caching**: Intelligent caching with TTL for API responses

## Styling Guidelines

### Tailwind CSS v4 Usage
- **CSS Variables**: Custom properties for theme consistency (`var(--claude-bg)`)
- **Utility Classes**: Comprehensive utility-first approach
- **Responsive Design**: Mobile-first responsive patterns
- **Dark Mode**: CSS variable-based theme switching

### Component Styling Patterns
```typescript
// Conditional classes with template literals
className={`
  flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors
  ${active 
    ? 'bg-[var(--claude-terracotta)] text-white' 
    : 'hover:bg-[var(--claude-sand-light)] text-[var(--claude-text)]'
  }
`}
```

### Animation Classes
- **Fade Animations**: `animate-fade-in-up` for smooth entry transitions
- **Slide Animations**: `animate-slide-in-right` for panel transitions
- **Loading States**: Custom spinner components with consistent styling

## API Integration Patterns

### Claude API Integration
- **Streaming Responses**: Real-time text streaming with ReadableStream
- **Tool Calling**: Structured tool execution with result handling
- **Cost Tracking**: Token usage monitoring and cost calculation
- **Prompt Caching**: Intelligent caching for cost optimization

### GitHub API Integration
- **Octokit Client**: Centralized GitHub operations through GitHubClient class
- **Branch Management**: Safe branch creation and deletion patterns
- **File Operations**: Atomic file updates with conflict resolution
- **Pull Request Automation**: Automated PR creation with descriptive content

### Error Recovery
- **Retry Logic**: Exponential backoff for transient failures
- **Graceful Degradation**: Fallback behavior when services unavailable
- **User Communication**: Clear error messages with recovery suggestions

## Security Practices

### Authentication
- **API Key Management**: Secure storage in localStorage with validation
- **Token Scoping**: Minimal required permissions for GitHub tokens
- **Environment Variables**: Sensitive data via environment configuration

### Input Validation
- **Type Safety**: Comprehensive TypeScript typing for all inputs
- **Sanitization**: Input cleaning for user-generated content
- **Parameter Validation**: Required field checking in API routes

### Data Protection
- **Local Storage**: Encrypted sensitive data storage
- **HTTPS Only**: Secure communication for all API calls
- **Token Rotation**: Support for API key updates without data loss

## Testing & Quality Assurance

### Code Quality Tools
- **TypeScript**: Strict type checking prevents runtime errors
- **ESLint**: Code quality and consistency enforcement
- **Next.js Lint**: Framework-specific linting rules

### Error Monitoring
- **Console Logging**: Structured logging for debugging
- **Error Boundaries**: Component-level error isolation
- **User Feedback**: Clear error states with recovery options

### Performance Monitoring
- **Bundle Analysis**: Regular bundle size monitoring
- **Cache Effectiveness**: Cache hit rate tracking
- **API Response Times**: Performance metric collection

## Deployment Guidelines

### Build Configuration
- **Next.js Optimization**: Production build optimizations enabled
- **Static Generation**: ISR for appropriate content
- **Environment Variables**: Proper env var configuration for deployment

### Railway Deployment
- **GitHub Integration**: Automated deployments from repository
- **Environment Configuration**: Secure credential management
- **Preview Environments**: PR-based preview deployments

### Monitoring
- **Health Checks**: Application health monitoring
- **Error Tracking**: Production error monitoring
- **Performance Metrics**: Real-time performance tracking