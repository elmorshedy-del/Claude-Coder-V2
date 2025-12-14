'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Settings as SettingsIcon, Plus, GitBranch, ChevronDown, Moon, Sun } from 'lucide-react';
import { 
  Message, 
  Conversation, 
  Settings, 
  Repository, 
  UploadedFile,
  Artifact,
  FileChange,
  DEFAULT_SETTINGS,
} from '@/types';

// Component imports
import Sidebar from '@/components/Sidebar';
import ChatMessage from '@/components/ChatMessage';
import WelcomeScreen from '@/components/WelcomeScreen';
import SettingsPanel from '@/components/SettingsPanel';
import ArtifactPanel from '@/components/ArtifactPanel';
import ArtifactsList from '@/components/ArtifactsList';
import FileUpload from '@/components/FileUpload';
import LoadingSpinner from '@/components/LoadingSpinner';
import CostTracker from '@/components/CostTracker';

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function Home() {
  // --------------------------------------------------------------------------
  // STATE - Auth & Keys
  // --------------------------------------------------------------------------
  const [anthropicKey, setAnthropicKey] = useState<string>('');
  const [githubToken, setGithubToken] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // STATE - Repository
  // --------------------------------------------------------------------------
  const [repos, setRepos] = useState<Repository[]>([]);
  const [currentRepo, setCurrentRepo] = useState<Repository | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [branches, setBranches] = useState<string[]>(['main']);

  // --------------------------------------------------------------------------
  // STATE - Conversations & Messages
  // --------------------------------------------------------------------------
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // --------------------------------------------------------------------------
  // STATE - UI
  // --------------------------------------------------------------------------
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [showRepoDropdown, setShowRepoDropdown] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // STATE - Settings
  // --------------------------------------------------------------------------
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // --------------------------------------------------------------------------
  // STATE - Artifacts
  // --------------------------------------------------------------------------
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [showArtifactsList, setShowArtifactsList] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // STATE - Cost Tracking
  // --------------------------------------------------------------------------
  const [sessionCost, setSessionCost] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);

  // --------------------------------------------------------------------------
  // REFS
  // --------------------------------------------------------------------------
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // --------------------------------------------------------------------------
  // EFFECTS - Initialize from localStorage
  // --------------------------------------------------------------------------
  useEffect(() => {
    // Load saved state from localStorage
    const savedAnthropicKey = localStorage.getItem('anthropicKey');
    const savedGithubToken = localStorage.getItem('githubToken');
    const savedRepo = localStorage.getItem('currentRepo');
    const savedBranch = localStorage.getItem('currentBranch');
    const savedConversations = localStorage.getItem('conversations');
    const savedSettings = localStorage.getItem('settings');
    const savedDarkMode = localStorage.getItem('darkMode');
    const savedCurrentConvId = localStorage.getItem('currentConversationId');
    const savedTotalCost = localStorage.getItem('totalCost');

    if (savedAnthropicKey) setAnthropicKey(savedAnthropicKey);
    if (savedGithubToken) setGithubToken(savedGithubToken);
    if (savedRepo) setCurrentRepo(JSON.parse(savedRepo));
    if (savedBranch) setCurrentBranch(savedBranch);
    if (savedConversations) setConversations(JSON.parse(savedConversations));
    if (savedSettings) setSettings(JSON.parse(savedSettings));
    if (savedDarkMode) setDarkMode(savedDarkMode === 'true');
    if (savedCurrentConvId) setCurrentConversationId(savedCurrentConvId);
    if (savedTotalCost) setTotalCost(parseFloat(savedTotalCost));

    // Check if authenticated
    if (savedAnthropicKey && savedGithubToken) {
      setIsAuthenticated(true);
      fetchRepos(savedGithubToken);
    }
  }, []);

  // --------------------------------------------------------------------------
  // EFFECTS - Save to localStorage
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (anthropicKey) localStorage.setItem('anthropicKey', anthropicKey);
    if (githubToken) localStorage.setItem('githubToken', githubToken);
    if (currentRepo) localStorage.setItem('currentRepo', JSON.stringify(currentRepo));
    if (currentBranch) localStorage.setItem('currentBranch', currentBranch);
    if (conversations.length > 0) localStorage.setItem('conversations', JSON.stringify(conversations));
    localStorage.setItem('settings', JSON.stringify(settings));
    localStorage.setItem('darkMode', String(darkMode));
    if (currentConversationId) localStorage.setItem('currentConversationId', currentConversationId);
    localStorage.setItem('totalCost', String(totalCost));
  }, [anthropicKey, githubToken, currentRepo, currentBranch, conversations, settings, darkMode, currentConversationId, totalCost]);

  // --------------------------------------------------------------------------
  // EFFECTS - Dark mode class
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // --------------------------------------------------------------------------
  // EFFECTS - Scroll to bottom on new messages
  // --------------------------------------------------------------------------
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --------------------------------------------------------------------------
  // EFFECTS - Load messages when conversation changes
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (currentConversationId) {
      const conv = conversations.find(c => c.id === currentConversationId);
      if (conv) {
        setMessages(conv.messages);
        setArtifacts(conv.messages.flatMap(m => m.artifacts || []));
      }
    } else {
      setMessages([]);
      setArtifacts([]);
    }
  }, [currentConversationId, conversations]);

  // --------------------------------------------------------------------------
  // FUNCTIONS - Fetch repos
  // --------------------------------------------------------------------------
  const fetchRepos = async (token: string) => {
    try {
      const response = await fetch('/api/auth', {
        headers: { 'x-github-token': token },
      });
      const data = await response.json();
      if (data.repos) {
        setRepos(data.repos);
      }
    } catch (error) {
      console.error('Failed to fetch repos:', error);
    }
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - Authenticate
  // --------------------------------------------------------------------------
  const handleAuthenticate = async () => {
    if (!anthropicKey || !githubToken) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anthropicKey, githubToken }),
      });
      const data = await response.json();

      if (data.anthropic?.valid && data.github?.valid) {
        setIsAuthenticated(true);
        await fetchRepos(githubToken);
      } else {
        alert('Invalid API keys. Please check your credentials.');
      }
    } catch (error) {
      console.error('Auth error:', error);
      alert('Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - Select repo
  // --------------------------------------------------------------------------
  const handleSelectRepo = async (repo: Repository) => {
    setCurrentRepo(repo);
    setCurrentBranch(repo.defaultBranch);
    setShowRepoDropdown(false);

    // Fetch branches
    try {
      const response = await fetch(
        `/api/github?action=branches&owner=${repo.owner}&repo=${repo.name}`,
        { headers: { 'x-github-token': githubToken } }
      );
      const data = await response.json();
      if (data.branches) {
        setBranches(data.branches.map((b: { name: string }) => b.name));
      }
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    }
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - New chat
  // --------------------------------------------------------------------------
  const handleNewChat = () => {
    const newConv: Conversation = {
      id: `conv-${Date.now()}`,
      title: 'New conversation',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      repoOwner: currentRepo?.owner,
      repoName: currentRepo?.name,
      branch: currentBranch,
    };
    setConversations(prev => [newConv, ...prev]);
    setCurrentConversationId(newConv.id);
    setMessages([]);
    setArtifacts([]);
    setSessionCost(0);
    setUploadedFiles([]);
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - Send message
  // --------------------------------------------------------------------------
  const handleSendMessage = async () => {
    if (!inputValue.trim() || !currentRepo || isStreaming) return;

    // Create or get conversation
    let convId = currentConversationId;
    if (!convId) {
      const newConv: Conversation = {
        id: `conv-${Date.now()}`,
        title: inputValue.slice(0, 50),
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        repoOwner: currentRepo.owner,
        repoName: currentRepo.name,
        branch: currentBranch,
      };
      setConversations(prev => [newConv, ...prev]);
      convId = newConv.id;
      setCurrentConversationId(convId);
    }

    // Create user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
      files: uploadedFiles.length > 0 ? [...uploadedFiles] : undefined,
    };

    // Create placeholder assistant message
    const assistantMessage: Message = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    // Update UI
    const newMessages = [...messages, userMessage, assistantMessage];
    setMessages(newMessages);
    setInputValue('');
    setUploadedFiles([]);
    setIsStreaming(true);

    try {
      // Prepare API request
      const apiMessages = newMessages
        .filter(m => !m.isStreaming)
        .map(m => ({ role: m.role, content: m.content }));

      // Use PUT for streaming
      const response = await fetch('/api/chat', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-anthropic-key': anthropicKey,
          'x-github-token': githubToken,
        },
        body: JSON.stringify({
          messages: apiMessages,
          settings,
          repoContext: {
            owner: currentRepo.owner,
            repo: currentRepo.name,
            branch: currentBranch,
          },
          files: userMessage.files,
        }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      // Process stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let accumulatedThinking = '';
      let finalCost = 0;
      let finalSavedPercent = 0;
      const allArtifacts: Artifact[] = [];
      const allFileChanges: FileChange[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const chunk = JSON.parse(line);

            if (chunk.type === 'text') {
              accumulatedContent += chunk.content || '';
              // Update message in real-time
              setMessages(prev => prev.map(m => 
                m.id === assistantMessage.id 
                  ? { ...m, content: accumulatedContent }
                  : m
              ));
            } else if (chunk.type === 'thinking') {
              accumulatedThinking += chunk.content || '';
              setMessages(prev => prev.map(m => 
                m.id === assistantMessage.id 
                  ? { ...m, thinkingContent: accumulatedThinking }
                  : m
              ));
            } else if (chunk.type === 'tool_use') {
              // Handle tool calls (for file changes display)
              if (chunk.toolCall?.name === 'str_replace' || chunk.toolCall?.name === 'create_file') {
                const input = chunk.toolCall.input;
                allFileChanges.push({
                  path: input.path,
                  action: chunk.toolCall.name === 'create_file' ? 'create' : 'edit',
                });
              }
            } else if (chunk.type === 'done') {
              finalCost = chunk.cost || 0;
              finalSavedPercent = chunk.savedPercent || 0;
            } else if (chunk.error) {
              throw new Error(chunk.error);
            }
          } catch (e) {
            // Skip invalid JSON lines
            if (!(e instanceof SyntaxError)) throw e;
          }
        }
      }

      // Parse artifacts from content
      const artifactRegex = /```(\w+)?\n([\s\S]*?)```/g;
      let match;
      let idx = 0;
      while ((match = artifactRegex.exec(accumulatedContent)) !== null) {
        const language = match[1]?.toLowerCase() || 'text';
        allArtifacts.push({
          id: `artifact-${idx++}`,
          name: `Code ${idx}`,
          type: language === 'html' ? 'html' : language === 'svg' ? 'svg' : 'code',
          content: match[2],
          language,
        });
      }

      // Final update
      const updatedAssistant: Message = {
        ...assistantMessage,
        content: accumulatedContent,
        isStreaming: false,
        cost: finalCost,
        savedPercent: finalSavedPercent,
        thinkingContent: accumulatedThinking || undefined,
        artifacts: allArtifacts.length > 0 ? allArtifacts : undefined,
        filesChanged: allFileChanges.length > 0 ? allFileChanges : undefined,
      };

      const finalMessages = [...messages, userMessage, updatedAssistant];
      setMessages(finalMessages);

      // Update artifacts
      if (allArtifacts.length > 0) {
        setArtifacts(prev => [...prev, ...allArtifacts]);
      }

      // Update costs
      setSessionCost(prev => prev + finalCost);
      setTotalCost(prev => prev + finalCost);

      // Update conversation
      setConversations(prev => prev.map(c => 
        c.id === convId
          ? {
              ...c,
              title: c.messages.length === 0 ? inputValue.slice(0, 50) : c.title,
              messages: finalMessages,
              updatedAt: new Date(),
              totalCost: (c.totalCost || 0) + finalCost,
              filesChanged: allFileChanges.length > 0 ? [...(c.filesChanged || []), ...allFileChanges] : c.filesChanged,
            }
          : c
      ));

    } catch (error) {
      console.error('Chat error:', error);
      // Update message with error
      const errorMessage: Message = {
        ...assistantMessage,
        content: 'Sorry, an error occurred. Please try again.',
        isStreaming: false,
      };
      setMessages([...messages, userMessage, errorMessage]);
    } finally {
      setIsStreaming(false);
    }
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - Handle key press
  // --------------------------------------------------------------------------
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - View PR
  // --------------------------------------------------------------------------
  const handleViewPR = (prUrl?: string) => {
    if (prUrl) {
      window.open(prUrl, '_blank');
    }
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - Discard changes
  // --------------------------------------------------------------------------
  const handleDiscard = async (branch?: string) => {
    if (!branch || !currentRepo) return;
    
    try {
      await fetch('/api/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-github-token': githubToken,
        },
        body: JSON.stringify({
          action: 'deleteBranch',
          owner: currentRepo.owner,
          repo: currentRepo.name,
          branch,
        }),
      });
    } catch (error) {
      console.error('Failed to discard:', error);
    }
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - Download all artifacts
  // --------------------------------------------------------------------------
  const handleDownloadAllArtifacts = () => {
    artifacts.forEach(artifact => {
      const ext = artifact.language || artifact.type;
      const blob = new Blob([artifact.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${artifact.name || 'artifact'}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  // --------------------------------------------------------------------------
  // RENDER - Auth Screen
  // --------------------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-[var(--claude-bg)]">
        <div className="w-full max-w-md space-y-6 animate-fade-in-up">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-serif text-[var(--claude-text)] mb-2">Claude Coder</h1>
            <p className="text-[var(--claude-text-secondary)]">Enter your API keys to get started</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--claude-text-secondary)] mb-2">
                Anthropic API Key
              </label>
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full px-4 py-3 rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] text-[var(--claude-text)] placeholder:text-[var(--claude-text-muted)] focus:outline-none focus:border-[var(--claude-terracotta)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--claude-text-secondary)] mb-2">
                GitHub Personal Access Token
              </label>
              <input
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_..."
                className="w-full px-4 py-3 rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] text-[var(--claude-text)] placeholder:text-[var(--claude-text-muted)] focus:outline-none focus:border-[var(--claude-terracotta)]"
              />
            </div>

            <button
              onClick={handleAuthenticate}
              disabled={!anthropicKey || !githubToken || isLoading}
              className="w-full px-4 py-3 rounded-xl bg-[var(--claude-terracotta)] text-white font-medium hover:bg-[var(--claude-terracotta-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? <LoadingSpinner size="sm" /> : null}
              {isLoading ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER - Main App
  // --------------------------------------------------------------------------
  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark' : ''}`}>
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        conversations={conversations}
        currentConversationId={currentConversationId}
        onNewChat={handleNewChat}
        onSelectConversation={setCurrentConversationId}
        totalCost={totalCost}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--claude-bg)]">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[var(--claude-border)] bg-[var(--claude-surface)]">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-serif text-[var(--claude-text)]">Claude Coder</h1>

            {/* Repo selector */}
            <div className="relative">
              <button
                onClick={() => setShowRepoDropdown(!showRepoDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] text-sm text-[var(--claude-text)] hover:border-[var(--claude-border-strong)] transition-colors"
              >
                <GitBranch className="w-4 h-4 text-[var(--claude-text-muted)]" />
                {currentRepo ? currentRepo.fullName : 'Select repository'}
                <ChevronDown className="w-3 h-3 text-[var(--claude-text-muted)]" />
              </button>

              {showRepoDropdown && (
                <div className="absolute top-full left-0 mt-1 w-72 max-h-80 overflow-y-auto rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] shadow-lg z-20">
                  {repos.map((repo) => (
                    <button
                      key={repo.fullName}
                      onClick={() => handleSelectRepo(repo)}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-[var(--claude-sand-light)] transition-colors ${
                        currentRepo?.fullName === repo.fullName ? 'bg-[var(--claude-terracotta-subtle)]' : ''
                      }`}
                    >
                      <p className="font-medium text-[var(--claude-text)]">{repo.fullName}</p>
                      <p className="text-xs text-[var(--claude-text-muted)]">{repo.defaultBranch}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Branch selector */}
            {currentRepo && (
              <select
                value={currentBranch}
                onChange={(e) => setCurrentBranch(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] text-sm text-[var(--claude-text)] focus:outline-none"
              >
                {branches.map((branch) => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
            )}

            {/* Mode badge */}
            <span className={`badge ${settings.deployMode === 'safe' ? 'badge-success' : 'badge-warning'}`}>
              {settings.deployMode === 'safe' ? '🛡 Safe' : '⚡ Direct'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Cost display */}
            <CostTracker
              cost={sessionCost}
              sessionTotal={totalCost}
              compact
            />

            {/* Dark mode toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-secondary)] transition-colors"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Settings button */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-lg hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-secondary)] transition-colors"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <WelcomeScreen repo={currentRepo} branch={currentBranch} />
          ) : (
            <div className="pb-32">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  onViewPR={() => window.open(`https://github.com/${currentRepo?.owner}/${currentRepo?.repo}/pulls`, '_blank')}
                  onDiscard={() => handleDiscard()}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 border-t border-[var(--claude-border)] bg-[var(--claude-surface)] p-4">
          <div className="max-w-3xl mx-auto">
            {/* File upload */}
            {uploadedFiles.length > 0 && (
              <div className="mb-3">
                <FileUpload
                  files={uploadedFiles}
                  onFilesChange={setUploadedFiles}
                />
              </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-3">
              <button
                onClick={() => document.getElementById('file-input')?.click()}
                className="p-3 rounded-xl hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-secondary)] transition-colors"
                title="Attach files"
              >
                <Plus className="w-5 h-5" />
              </button>
              <input
                id="file-input"
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    const newFiles = Array.from(e.target.files);
                    // Convert to UploadedFile format
                    Promise.all(newFiles.map(async (file) => {
                      const base64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve((reader.result as string).split(',')[1]);
                        reader.readAsDataURL(file);
                      });
                      return {
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        base64,
                      };
                    })).then(files => setUploadedFiles(prev => [...prev, ...files]));
                  }
                }}
              />

              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={currentRepo ? "Ask Claude about your code..." : "Select a repository first..."}
                disabled={!currentRepo}
                rows={1}
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] text-[var(--claude-text)] placeholder:text-[var(--claude-text-muted)] focus:outline-none focus:border-[var(--claude-terracotta)] resize-none disabled:opacity-50"
                style={{ minHeight: '48px', maxHeight: '200px' }}
              />

              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || !currentRepo || isStreaming}
                className="p-3 rounded-xl bg-[var(--claude-terracotta)] text-white hover:bg-[var(--claude-terracotta-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isStreaming ? <LoadingSpinner size="sm" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Artifacts Panel */}
      {selectedArtifact && (
        <div className="w-96">
          <ArtifactPanel
            artifact={selectedArtifact}
            onClose={() => setSelectedArtifact(null)}
          />
        </div>
      )}

      {/* Artifacts List */}
      {showArtifactsList && artifacts.length > 0 && (
        <ArtifactsList
          artifacts={artifacts}
          onSelect={setSelectedArtifact}
          onDownloadAll={handleDownloadAllArtifacts}
        />
      )}

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
        darkMode={darkMode}
        onDarkModeChange={setDarkMode}
      />
    </div>
  );
}
