'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Settings as SettingsIcon,
  Plus,
  GitBranch,
  ChevronDown,
  Moon,
  Sun,
  Square,
  Search,
  Brain,
  Lock,
  Box,
} from 'lucide-react';
import {
  Message,
  Conversation,
  Settings,
  Repository,
  UploadedFile,
  Artifact,
  FileChange,
  DEFAULT_SETTINGS,
  ModelType,
  MODEL_DISPLAY_NAMES,
  WebSearchMode,
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
import QuickSettings from '@/components/QuickSettings';

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function Home() {
  // --------------------------------------------------------------------------
  // STATE - Auth
  // --------------------------------------------------------------------------
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // STATE - API Keys
  // --------------------------------------------------------------------------
  const [anthropicKey, setAnthropicKey] = useState<string>('');
  const [githubToken, setGithubToken] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [githubUser, setGithubUser] = useState<string>('');

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
  const [quickSettingsOpen, setQuickSettingsOpen] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [showRepoDropdown, setShowRepoDropdown] = useState<boolean>(false);
  const [showModelDropdown, setShowModelDropdown] = useState<boolean>(false);

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
  const abortControllerRef = useRef<AbortController | null>(null);
  const repoDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // --------------------------------------------------------------------------
  // STATE - Repo Cache
  // --------------------------------------------------------------------------
  const [repoCache, setRepoCache] = useState<{
    fileTree: string;
    loadedFiles: Array<{ path: string; content: string }>;
    timestamp: number;
  } | null>(null);

  // --------------------------------------------------------------------------
  // EFFECTS - Initialize from localStorage
  // --------------------------------------------------------------------------
  useEffect(() => {
    // Check if already unlocked (remembered)
    const savedUnlocked = localStorage.getItem('isUnlocked');
    if (savedUnlocked === 'true') {
      setIsUnlocked(true);
    }

    // Load saved state
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
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      // Migrate old settings: ensure webSearchMode exists
      if (!parsed.webSearchMode) {
        parsed.webSearchMode = parsed.enableWebSearch ? 'auto' : 'off';
      }
      // Remove deprecated fields if they exist
      delete parsed.webSearchAutoDetect;
      setSettings(parsed);
    }
    if (savedDarkMode) setDarkMode(savedDarkMode === 'true');
    if (savedCurrentConvId) setCurrentConversationId(savedCurrentConvId);
    if (savedTotalCost) setTotalCost(parseFloat(savedTotalCost));

    // Check if API key is valid
    if (savedAnthropicKey) {
      setIsAuthenticated(true);
      // Only fetch repos if we have a GitHub token
      if (savedGithubToken) {
        fetchRepos(savedGithubToken);
      }
    }
  }, []);

  // --------------------------------------------------------------------------
  // EFFECTS - Load repo cache when repo/branch changes
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!currentRepo) {
      setRepoCache(null);
      return;
    }

    const cacheKey = `repo_cache_${currentRepo.owner}_${currentRepo.name}_${currentBranch}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;
        const TTL = 24 * 60 * 60 * 1000; // 24 hours
        
        if (age < TTL) {
          setRepoCache(parsed);
          console.log(`✅ Loaded repo cache (${Math.round(age / 1000 / 60)}min old)`);
        } else {
          localStorage.removeItem(cacheKey);
          setRepoCache(null);
        }
      } catch {
        setRepoCache(null);
      }
    } else {
      setRepoCache(null);
    }
  }, [currentRepo, currentBranch]);

  // --------------------------------------------------------------------------
  // EFFECTS - Save to localStorage (debounced)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      if (anthropicKey) localStorage.setItem('anthropicKey', anthropicKey);
      if (githubToken) localStorage.setItem('githubToken', githubToken);
      if (currentRepo) localStorage.setItem('currentRepo', JSON.stringify(currentRepo));
      if (currentBranch) localStorage.setItem('currentBranch', currentBranch);
      if (conversations.length > 0) localStorage.setItem('conversations', JSON.stringify(conversations));
      localStorage.setItem('settings', JSON.stringify(settings));
      localStorage.setItem('darkMode', String(darkMode));
      if (currentConversationId) localStorage.setItem('currentConversationId', currentConversationId);
      localStorage.setItem('totalCost', String(totalCost));
    }, 500); // Debounce 500ms
    
    return () => clearTimeout(timer);
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
  // EFFECTS - Click outside to close dropdowns
  // --------------------------------------------------------------------------
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close repo dropdown if clicking outside
      if (
        showRepoDropdown &&
        repoDropdownRef.current &&
        !repoDropdownRef.current.contains(event.target as Node)
      ) {
        setShowRepoDropdown(false);
      }

      // Close model dropdown if clicking outside
      if (
        showModelDropdown &&
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(event.target as Node)
      ) {
        setShowModelDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRepoDropdown, showModelDropdown]);

  // --------------------------------------------------------------------------
  // EFFECTS - Scroll to bottom on new messages (debounced)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
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
  // FUNCTIONS - Login with password
  // --------------------------------------------------------------------------
  const handleLogin = async () => {
    setIsLoading(true);
    setLoginError('');

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', password }),
      });
      const data = await response.json();

      if (data.success) {
        setIsUnlocked(true);
        if (rememberMe) {
          localStorage.setItem('isUnlocked', 'true');
        }
      } else {
        setLoginError(data.error || 'Invalid password');
      }
    } catch {
      setLoginError('Connection error');
    } finally {
      setIsLoading(false);
    }
  };

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
  // FUNCTIONS - Authenticate API keys
  // --------------------------------------------------------------------------
  const handleAuthenticate = async () => {
    if (!anthropicKey) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate',
          anthropicKey,
          githubToken: githubToken || undefined
        }),
      });
      const data = await response.json();

      if (data.anthropic?.valid) {
        setIsAuthenticated(true);
        if (data.github?.valid) {
          setGithubUser(data.github.user);
          await fetchRepos(githubToken);
        }
      } else {
        alert('Invalid Anthropic API key. Please check your credentials.');
      }
    } catch (error) {
      console.error('Auth error:', error);
      alert('Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - Fetch branches for a repo
  // --------------------------------------------------------------------------
  const fetchBranches = async (owner: string, repoName: string) => {
    if (!githubToken) return;

    try {
      const response = await fetch(
        `/api/github?action=branches&owner=${owner}&repo=${repoName}`,
        {
          headers: { 'x-github-token': githubToken },
        }
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
  // FUNCTIONS - Select repo
  // --------------------------------------------------------------------------
  const handleSelectRepo = (repo: Repository | null) => {
    setCurrentRepo(repo);
    if (repo) {
      setCurrentBranch(repo.defaultBranch);
      setBranches([repo.defaultBranch]); // Set default immediately
      // Fetch all branches asynchronously
      fetchBranches(repo.owner, repo.name);
    } else {
      setCurrentBranch('main');
      setBranches(['main']);
    }
    setShowRepoDropdown(false);
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
  // FUNCTIONS - Stop streaming
  // --------------------------------------------------------------------------
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - Refresh repo cache
  // --------------------------------------------------------------------------
  const handleRefreshRepo = async () => {
    if (!currentRepo || !githubToken) return;
    
    const cacheKey = `repo_cache_${currentRepo.owner}_${currentRepo.name}_${currentBranch}`;
    localStorage.removeItem(cacheKey);
    setRepoCache(null);
    alert('Repo cache cleared. It will reload on next message.');
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - Send message
  // --------------------------------------------------------------------------
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isStreaming) return;

    // Create or get conversation
    let convId = currentConversationId;
    if (!convId) {
      const newConv: Conversation = {
        id: `conv-${Date.now()}`,
        title: inputValue.slice(0, 50),
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        repoOwner: currentRepo?.owner,
        repoName: currentRepo?.name,
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

    // Save input value for conversation title before clearing
    const savedInputValue = inputValue;

    // Update UI
    const newMessages = [...messages, userMessage, assistantMessage];
    setMessages(newMessages);
    setInputValue('');
    setUploadedFiles([]);
    setIsStreaming(true);

    // Create abort controller for stop button
    abortControllerRef.current = new AbortController();

    try {
      // Prepare API request - repo context is optional
      const apiMessages = newMessages
        .filter(m => !m.isStreaming)
        .map(m => ({ role: m.role, content: m.content }));

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-anthropic-key': anthropicKey,
      };
      // Only add GitHub token if NOT in local mode or if we have a token
      if (githubToken && settings.fileAccessMode !== 'local') {
        headers['x-github-token'] = githubToken;
      }

      // Determine if web search should be enabled based on mode
      const webSearchEnabled = settings.webSearchMode !== 'off';
      const effectiveSettings = {
        ...settings,
        enableWebSearch: webSearchEnabled,
      };

      // Use PUT for streaming
      const response = await fetch('/api/chat', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          messages: apiMessages,
          settings: effectiveSettings,
          repoContext: (settings.fileAccessMode === 'local' || currentRepo) ? {
            owner: currentRepo?.owner || '',
            repo: currentRepo?.name || '',
            branch: currentBranch || 'main',
            fileTree: repoCache?.fileTree,
            loadedFiles: repoCache?.loadedFiles,
          } : undefined,
          files: userMessage.files,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      // Process stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';
      let accumulatedThinking = '';
      let finalCost = 0;
      let finalSavedPercent = 0;
      let finalPrUrl: string | undefined;
      const allArtifacts: Artifact[] = [];
      const allFileChanges: FileChange[] = [];
      let newFileTree: string | undefined;
      let newLoadedFiles: Array<{ path: string; content: string }> | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete JSONL lines; keep any partial line in `buffer`.
        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const line of parts) {
          if (!line.trim()) continue;

          try {
            const chunk = JSON.parse(line);

            if (chunk.type === 'text') {
              accumulatedContent += chunk.content || '';
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
              if (chunk.toolCall?.name === 'str_replace' || chunk.toolCall?.name === 'create_file') {
                const input = chunk.toolCall.input;
                allFileChanges.push({
                  path: input.path,
                  action: chunk.toolCall.name === 'create_file' ? 'create' : 'edit',
                });
              }
            } else if (chunk.type === 'tool_result') {
              // Tool result received - could display to user if needed
              // Currently we just track file changes from the done event
            } else if (chunk.type === 'done') {
              finalCost = chunk.cost || 0;
              finalSavedPercent = chunk.savedPercent || 0;
              if (chunk.fileChanges) {
                allFileChanges.push(...chunk.fileChanges);
              }
              if (chunk.prUrl) {
                finalPrUrl = chunk.prUrl;
              }
              if (chunk.fileTree) {
                newFileTree = chunk.fileTree;
              }
              if (chunk.loadedFiles) {
                newLoadedFiles = chunk.loadedFiles;
              }
            } else if (chunk.error) {
              throw new Error(chunk.error);
            }
          } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
            // In case we accidentally got a partial line, re-append and wait for more data.
            buffer = line + '\n' + buffer;
            break;
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
        prUrl: finalPrUrl,
      };

      const finalMessages = [...messages, userMessage, updatedAssistant];
      setMessages(finalMessages);

      if (allArtifacts.length > 0) {
        setArtifacts(prev => [...prev, ...allArtifacts]);
      }

      setSessionCost(prev => prev + finalCost);
      setTotalCost(prev => prev + finalCost);

      // Save repo cache if we got new data
      if (currentRepo && (newFileTree || newLoadedFiles)) {
        const cacheKey = `repo_cache_${currentRepo.owner}_${currentRepo.name}_${currentBranch}`;
        const cacheData = {
          fileTree: newFileTree || repoCache?.fileTree || '',
          loadedFiles: newLoadedFiles || repoCache?.loadedFiles || [],
          timestamp: Date.now(),
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        setRepoCache(cacheData);
        console.log('✅ Saved repo cache');
      }

      setConversations(prev => prev.map(c =>
        c.id === convId
          ? {
              ...c,
              // Use savedInputValue and check original messages length (before this turn)
              title: c.title === 'New conversation' || c.messages.length === 0 ? savedInputValue.slice(0, 50) : c.title,
              messages: finalMessages,
              updatedAt: new Date(),
              totalCost: (c.totalCost || 0) + finalCost,
              filesChanged: allFileChanges.length > 0 ? [...(c.filesChanged || []), ...allFileChanges] : c.filesChanged,
            }
          : c
      ));

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // User cancelled - update message to show partial content
        setMessages(prev => prev.map(m =>
          m.id === assistantMessage.id
            ? { ...m, isStreaming: false, content: m.content || '(Cancelled)' }
            : m
        ));
      } else {
        console.error('Chat error:', error);
        const errorMessage: Message = {
          ...assistantMessage,
          content: 'Sorry, an error occurred. Please try again.',
          isStreaming: false,
        };
        setMessages([...messages, userMessage, errorMessage]);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
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
  // FUNCTIONS - Cycle web search mode
  // --------------------------------------------------------------------------
  const cycleWebSearchMode = () => {
    const modes: WebSearchMode[] = ['off', 'manual', 'auto'];
    const currentIndex = modes.indexOf(settings.webSearchMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setSettings(prev => ({
      ...prev,
      webSearchMode: modes[nextIndex],
      enableWebSearch: modes[nextIndex] !== 'off',
    }));
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - Toggle extended thinking
  // --------------------------------------------------------------------------
  const toggleExtendedThinking = () => {
    setSettings(prev => ({
      ...prev,
      enableExtendedThinking: !prev.enableExtendedThinking,
    }));
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - View PR
  // --------------------------------------------------------------------------
  const handleViewPR = async (prUrl?: string) => {
    if (prUrl) {
      window.open(prUrl, '_blank');
      return;
    }

    if (!currentRepo) {
      alert('Connect a GitHub repository to create a pull request.');
      return;
    }

    if (!githubToken) {
      alert('Add a GitHub token in Settings to create a pull request.');
      return;
    }

    if (!currentBranch || currentBranch === currentRepo.defaultBranch) {
      alert('Switch to a feature branch before creating a pull request.');
      return;
    }

    const latestChangeMessage = [...messages].reverse().find(m =>
      m.role === 'assistant' && m.filesChanged && m.filesChanged.length > 0
    );

    const filesChanged = latestChangeMessage?.filesChanged || [];
    const changeSummary = filesChanged
      .map(f =>
        `- **${f.action}** \`${f.path}\`${f.additions ? ` (+${f.additions})` : ''}${
          f.deletions ? ` (-${f.deletions})` : ''
        }`
      )
      .join('\n');

    const prTitle = filesChanged.length
      ? `Claude: ${filesChanged.length} file${filesChanged.length === 1 ? '' : 's'} changed`
      : `Claude: Updates from ${currentBranch}`;

    const prBody = filesChanged.length
      ? `## Changes\n\n${changeSummary}\n\n---\nPull request created from Claude Coder's View PR action.`
      : `Pull request created from branch ${currentBranch} via Claude Coder's View PR action.`;

    try {
      const response = await fetch('/api/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-github-token': githubToken,
        },
        body: JSON.stringify({
          action: 'createPR',
          owner: currentRepo.owner,
          repo: currentRepo.name,
          title: prTitle,
          body: prBody,
          head: currentBranch,
          base: currentRepo.defaultBranch,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create pull request');
      }

      const createdPrUrl: string | undefined = data.pr?.url;
      const createdPrNumber: number | undefined = data.pr?.number;

      if (createdPrUrl) {
        setMessages(prev => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            const message = updated[i];
            if (message.role === 'assistant' && message.filesChanged && message.filesChanged.length > 0) {
              updated[i] = { ...message, prUrl: createdPrUrl, prNumber: createdPrNumber };
              break;
            }
          }

          if (currentConversationId) {
            setConversations(curr =>
              curr.map(conv =>
                conv.id === currentConversationId
                  ? { ...conv, messages: updated }
                  : conv
              )
            );
          }

          return updated;
        });

        window.open(createdPrUrl, '_blank');
      }
    } catch (error) {
      console.error('View PR failed:', error);
      const fallbackUrl = `https://github.com/${currentRepo.owner}/${currentRepo.name}/pulls`;
      alert(`Could not create a pull request: ${(error as Error).message}. Opening GitHub pulls page instead.`);
      window.open(fallbackUrl, '_blank');
    }
  };

  // --------------------------------------------------------------------------
  // FUNCTIONS - Discard changes (delete working branch)
  // --------------------------------------------------------------------------
  const handleDiscard = async (branchToDelete?: string) => {
    const targetBranch = branchToDelete || currentBranch;

    // Don't delete the default branch
    if (!currentRepo || targetBranch === currentRepo.defaultBranch) {
      console.warn('Cannot discard default branch');
      return;
    }

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
          branch: targetBranch,
        }),
      });

      // Switch back to default branch after discarding
      setCurrentBranch(currentRepo.defaultBranch);
      // Refresh branches list
      fetchBranches(currentRepo.owner, currentRepo.name);
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
  // FUNCTIONS - Logout
  // --------------------------------------------------------------------------
  const handleLogout = () => {
    setIsUnlocked(false);
    localStorage.removeItem('isUnlocked');
  };

  // --------------------------------------------------------------------------
  // RENDER - Login Screen
  // --------------------------------------------------------------------------
  if (!isUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-[var(--claude-bg)]">
        <div className="w-full max-w-sm space-y-6 animate-fade-in-up">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--claude-terracotta-subtle)] flex items-center justify-center">
              <Lock className="w-8 h-8 text-[var(--claude-terracotta)]" />
            </div>
            <h1 className="text-2xl font-serif text-[var(--claude-text)]">🚀 Claude Coder</h1>
            <p className="text-[var(--claude-text-secondary)] mt-1">Enter password to continue</p>
          </div>

          <div className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Password"
              className="w-full px-4 py-3 rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] text-[var(--claude-text)] placeholder:text-[var(--claude-text-muted)] focus:outline-none focus:border-[var(--claude-terracotta)]"
              autoFocus
            />

            {loginError && (
              <p className="text-sm text-[var(--claude-error)]">{loginError}</p>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--claude-border)] text-[var(--claude-terracotta)] focus:ring-[var(--claude-terracotta)]"
              />
              <span className="text-sm text-[var(--claude-text-secondary)]">Remember me</span>
            </label>

            <button
              onClick={handleLogin}
              disabled={!password || isLoading}
              className="w-full px-4 py-3 rounded-xl bg-[var(--claude-terracotta)] text-white font-medium hover:bg-[var(--claude-terracotta-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? <LoadingSpinner size="sm" /> : null}
              {isLoading ? 'Unlocking...' : 'Unlock'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER - Setup Screen (No API Key)
  // --------------------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-[var(--claude-bg)]">
        <div className="w-full max-w-md space-y-6 animate-fade-in-up">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-serif text-[var(--claude-text)] mb-2">🚀 Claude Coder</h1>
            <p className="text-[var(--claude-text-secondary)]">Setup required - add your API keys</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--claude-text-secondary)] mb-2">
                Anthropic API Key <span className="text-[var(--claude-error)]">*</span>
              </label>
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full px-4 py-3 rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] text-[var(--claude-text)] placeholder:text-[var(--claude-text-muted)] focus:outline-none focus:border-[var(--claude-terracotta)]"
              />
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--claude-terracotta)] hover:underline mt-1 inline-block"
              >
                Get API key →
              </a>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--claude-text-secondary)] mb-2">
                GitHub Token <span className="text-[var(--claude-text-muted)]">(optional)</span>
              </label>
              <input
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_... (needed for code editing)"
                className="w-full px-4 py-3 rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] text-[var(--claude-text)] placeholder:text-[var(--claude-text-muted)] focus:outline-none focus:border-[var(--claude-terracotta)]"
              />
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--claude-terracotta)] hover:underline mt-1 inline-block"
              >
                Get token →
              </a>
            </div>

            <button
              onClick={handleAuthenticate}
              disabled={!anthropicKey || isLoading}
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
  const currentModel = MODEL_DISPLAY_NAMES[settings.model] || MODEL_DISPLAY_NAMES['claude-sonnet-4-5-20250929'];

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
            <h1 className="text-lg font-serif text-[var(--claude-text)]">🚀 Claude Coder</h1>

            {/* Repo selector */}
            <div className="relative" ref={repoDropdownRef}>
              <button
                onClick={() => setShowRepoDropdown(!showRepoDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] text-sm text-[var(--claude-text)] hover:border-[var(--claude-border-strong)] transition-colors"
              >
                <GitBranch className="w-4 h-4 text-[var(--claude-text-muted)]" />
                {currentRepo ? currentRepo.fullName : 'No Repo'}
                <ChevronDown className="w-3 h-3 text-[var(--claude-text-muted)]" />
              </button>

              {showRepoDropdown && (
                <div className="absolute top-full left-0 mt-1 w-72 max-h-80 overflow-y-auto rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] shadow-lg z-20">
                  {/* No Repo option */}
                  <button
                    onClick={() => handleSelectRepo(null)}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-[var(--claude-sand-light)] transition-colors ${
                      !currentRepo ? 'bg-[var(--claude-terracotta-subtle)]' : ''
                    }`}
                  >
                    <p className="font-medium text-[var(--claude-text)]">No Repo</p>
                    <p className="text-xs text-[var(--claude-text-muted)]">Just chat with Claude</p>
                  </button>
                  <div className="border-t border-[var(--claude-border)]" />
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
                  {repos.length === 0 && githubToken && (
                    <p className="px-4 py-2 text-sm text-[var(--claude-text-muted)]">Loading repos...</p>
                  )}
                  {!githubToken && (
                    <p className="px-4 py-2 text-sm text-[var(--claude-text-muted)]">
                      Add GitHub token in settings to connect repos
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Branch selector (only if repo selected) */}
            {currentRepo && (
              <>
                <select
                  value={currentBranch}
                  onChange={(e) => setCurrentBranch(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] text-sm text-[var(--claude-text)] focus:outline-none"
                >
                  {branches.map((branch) => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </select>
                
                {/* Repo cache indicator */}
                {repoCache && (
                  <button
                    onClick={handleRefreshRepo}
                    className="text-xs px-2 py-1 rounded bg-[var(--claude-success)]/10 text-[var(--claude-success)] hover:bg-[var(--claude-success)]/20 transition-colors"
                    title={`Cached ${Math.round((Date.now() - repoCache.timestamp) / 1000 / 60)}min ago. Click to refresh.`}
                  >
                    ⚡ Cached
                  </button>
                )}
              </>
            )}

            {/* Mode badge */}
            {currentRepo && (
              <span className={`badge ${settings.deployMode === 'safe' ? 'badge-success' : 'badge-warning'}`}>
                {settings.deployMode === 'safe' ? '🛡 Safe' : '⚡ Direct'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Cost display */}
            <CostTracker
              cost={sessionCost}
              sessionTotal={totalCost}
              compact
            />

            {/* Artifacts toggle - only show if there are artifacts */}
            {artifacts.length > 0 && (
              <button
                onClick={() => setShowArtifactsList(!showArtifactsList)}
                className={`p-2 rounded-lg transition-colors ${
                  showArtifactsList
                    ? 'bg-[var(--claude-terracotta-subtle)] text-[var(--claude-terracotta)]'
                    : 'hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-secondary)]'
                }`}
                title={`${showArtifactsList ? 'Hide' : 'Show'} Artifacts (${artifacts.length})`}
              >
                <Box className="w-5 h-5" />
              </button>
            )}

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
                onViewPR={(prUrl?: string) => handleViewPR(prUrl)}
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
            <div className="flex items-end gap-2">
              {/* Attach button */}
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

              {/* Quick settings */}
              <div className="relative">
                <button
                  onClick={() => setQuickSettingsOpen(!quickSettingsOpen)}
                  className="p-3 rounded-xl hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-secondary)] transition-colors"
                  title="Quick settings"
                >
                  <SettingsIcon className="w-5 h-5" />
                </button>
                <QuickSettings
                  isOpen={quickSettingsOpen}
                  onClose={() => setQuickSettingsOpen(false)}
                  settings={settings}
                  onSettingsChange={setSettings}
                  onOpenFullSettings={() => {
                    setQuickSettingsOpen(false);
                    setSettingsOpen(true);
                  }}
                />
              </div>

              {/* Input */}
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask Claude anything..."
                disabled={isStreaming}
                rows={1}
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] text-[var(--claude-text)] placeholder:text-[var(--claude-text-muted)] focus:outline-none focus:border-[var(--claude-terracotta)] resize-none disabled:opacity-50"
                style={{ minHeight: '48px', maxHeight: '200px' }}
              />

              {/* Model dropdown */}
              <div className="relative" ref={modelDropdownRef}>
                <button
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="flex items-center gap-1 px-3 py-3 rounded-xl bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)] text-sm text-[var(--claude-text)] hover:border-[var(--claude-border-strong)] transition-colors"
                  title="Select model"
                >
                  <span>{currentModel.name}</span>
                  <span className="text-xs">{currentModel.cost}</span>
                  <ChevronDown className="w-3 h-3 text-[var(--claude-text-muted)]" />
                </button>
                {showModelDropdown && (
                  <div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl bg-[var(--claude-surface)] border border-[var(--claude-border)] shadow-lg z-50">
                    {(Object.entries(MODEL_DISPLAY_NAMES) as [ModelType, typeof MODEL_DISPLAY_NAMES[ModelType]][]).map(([modelId, info]) => (
                      <button
                        key={modelId}
                        onClick={() => {
                          setSettings(prev => ({ ...prev, model: modelId }));
                          setShowModelDropdown(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-[var(--claude-sand-light)] transition-colors first:rounded-t-xl last:rounded-b-xl ${
                          settings.model === modelId ? 'bg-[var(--claude-terracotta-subtle)]' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[var(--claude-text)]">{info.name}</span>
                          <span className="text-xs">{info.cost}</span>
                        </div>
                        <p className="text-xs text-[var(--claude-text-muted)]">{info.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Web search toggle */}
              <button
                onClick={cycleWebSearchMode}
                className={`p-3 rounded-xl transition-colors ${
                  settings.webSearchMode !== 'off'
                    ? 'bg-[var(--claude-terracotta-subtle)] text-[var(--claude-terracotta)]'
                    : 'hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-muted)]'
                }`}
                title={`Web Search: ${settings.webSearchMode}`}
              >
                <div className="relative">
                  <Search className="w-5 h-5" />
                  {settings.webSearchMode === 'auto' && (
                    <span className="absolute -top-1 -right-1 text-[8px] font-bold bg-[var(--claude-terracotta)] text-white rounded px-0.5">
                      A
                    </span>
                  )}
                </div>
              </button>

              {/* Extended thinking toggle */}
              <button
                onClick={toggleExtendedThinking}
                className={`p-3 rounded-xl transition-colors ${
                  settings.enableExtendedThinking
                    ? 'bg-[var(--claude-terracotta-subtle)] text-[var(--claude-terracotta)]'
                    : 'hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-muted)]'
                }`}
                title={`Extended Thinking: ${settings.enableExtendedThinking ? 'ON' : 'OFF'}`}
              >
                <Brain className="w-5 h-5" />
              </button>

              {/* Send/Stop button */}
              {isStreaming ? (
                <button
                  onClick={handleStop}
                  className="p-3 rounded-xl bg-[var(--claude-error)] text-white hover:bg-[var(--claude-error)]/80 transition-colors"
                  title="Stop"
                >
                  <Square className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim()}
                  className="p-3 rounded-xl bg-[var(--claude-terracotta)] text-white hover:bg-[var(--claude-terracotta-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Send"
                >
                  <Send className="w-5 h-5" />
                </button>
              )}
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

      {/* Artifacts List Sidebar */}
      {showArtifactsList && artifacts.length > 0 && (
        <div className="flex flex-col">
          <ArtifactsList
            artifacts={artifacts}
            onSelect={(artifact) => {
              setSelectedArtifact(artifact);
              setShowArtifactsList(false); // Close list when selecting an artifact
            }}
            onDownloadAll={handleDownloadAllArtifacts}
          />
        </div>
      )}

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
        darkMode={darkMode}
        onDarkModeChange={setDarkMode}
        anthropicKey={anthropicKey}
        githubToken={githubToken}
        githubUser={githubUser}
        onAnthropicKeyChange={setAnthropicKey}
        onGithubTokenChange={setGithubToken}
        onLogout={handleLogout}
      />
    </div>
  );
}



