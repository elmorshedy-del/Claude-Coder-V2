// ============================================================================
// AIAnalytics.jsx - FRONTEND COMPONENT
// Place in: client/src/components/AIAnalytics.jsx
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { 
  Brain, Zap, Lightbulb, Send, Loader2, Sparkles, 
  Plus, MessageSquare, Trash2, Sun, Moon, Calendar, 
  FileText, BarChart2, Play
} from 'lucide-react';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AIAnalytics({ store }) {
  const [activeTab, setActiveTab] = useState('chat');

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
            activeTab === 'chat'
              ? 'bg-violet-600 text-white shadow-md'
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          AI Chat
        </button>
        <button
          onClick={() => setActiveTab('daily')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
            activeTab === 'daily'
              ? 'bg-violet-600 text-white shadow-md'
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Daily Summary
        </button>
      </div>

      {activeTab === 'chat' && <ChatTab store={store} />}
      {activeTab === 'daily' && <DailySummaryTab store={store} />}
    </div>
  );
}

// ============================================================================
// FILTER OPTIONS
// ============================================================================

const METRICS = [
  { id: 'spend', label: 'Ad Spend', emoji: '💰' },
  { id: 'roas', label: 'ROAS', emoji: '📈' },
  { id: 'ctr', label: 'CTR', emoji: '👆' },
  { id: 'cvr', label: 'CVR', emoji: '🎯' },
  { id: 'cpc', label: 'CPC', emoji: '💵' },
  { id: 'impressions', label: 'Impressions', emoji: '👀' },
  { id: 'clicks', label: 'Clicks', emoji: '🖱️' },
  { id: 'conversions', label: 'Conversions', emoji: '✅' },
  { id: 'revenue', label: 'Revenue', emoji: '💎' },
];

const DIMENSIONS = [
  { id: 'day', label: 'Day' },
  { id: 'campaign', label: 'Campaign' },
  { id: 'adset', label: 'Ad Set' },
  { id: 'ad', label: 'Ad' },
  { id: 'country', label: 'Country' },
  { id: 'hour', label: 'Hour of Day' },
];

const VIZ_TYPES = [
  { id: 'auto', label: 'Auto' },
  { id: 'metric', label: 'Display metric' },
  { id: 'bar', label: 'Bar chart' },
  { id: 'line', label: 'Line chart' },
  { id: 'pie', label: 'Pie chart' },
  { id: 'table', label: 'Table' },
];

const DATE_RANGES = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7D' },
  { id: '14d', label: '14D' },
  { id: '30d', label: '30D' },
];

// ============================================================================
// CHAT TAB
// ============================================================================

function ChatTab({ store }) {
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  
  const [mode, setMode] = useState('decide');
  const [depth, setDepth] = useState('balanced');
  
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [selectedDimensions, setSelectedDimensions] = useState([]);
  const [vizType, setVizType] = useState('auto');
  const [dateRange, setDateRange] = useState('7d');
  
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadConversations();
  }, [store.id]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingText]);

  useEffect(() => {
    if (messages.length > 0) setShowFilters(true);
  }, [messages]);

  const loadConversations = async () => {
    try {
      const res = await fetch('/api/ai/conversations?store=' + store.id);
      const data = await res.json();
      if (data.success) setConversations(data.conversations);
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  };

  const loadConversation = async (id) => {
    try {
      const res = await fetch('/api/ai/conversations/' + id);
      const data = await res.json();
      if (data.success) {
        setCurrentConversationId(id);
        setMessages(data.messages);
        setShowFilters(true);
      }
    } catch (e) {
      console.error('Failed to load conversation:', e);
    }
  };

  const createNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setShowFilters(false);
    setSelectedMetrics([]);
    setSelectedDimensions([]);
    setVizType('auto');
  };

  const deleteConversation = async (id, e) => {
    e.stopPropagation();
    try {
      await fetch('/api/ai/conversations/' + id, { method: 'DELETE' });
      setConversations(prev => prev.filter(c => c.id !== id));
      if (currentConversationId === id) createNewChat();
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  const toggleMetric = (id) => {
    setSelectedMetrics(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const toggleDimension = (id) => {
    setSelectedDimensions(prev => 
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const buildFilteredQuery = (baseQuery) => {
    let parts = [baseQuery];
    if (selectedMetrics.length > 0) {
      const labels = selectedMetrics.map(id => METRICS.find(m => m.id === id)?.label).filter(Boolean);
      parts.push('Focus on: ' + labels.join(', '));
    }
    if (selectedDimensions.length > 0) {
      const labels = selectedDimensions.map(id => DIMENSIONS.find(d => d.id === id)?.label).filter(Boolean);
      parts.push('Break down by: ' + labels.join(', '));
    }
    if (vizType !== 'auto') {
      const label = VIZ_TYPES.find(v => v.id === vizType)?.label;
      if (label) parts.push('Show as: ' + label);
    }
    if (dateRange !== '7d') {
      const label = DATE_RANGES.find(d => d.id === dateRange)?.label;
      if (label) parts.push('Time period: ' + label);
    }
    return parts.join('. ');
  };

  const handleSubmit = async (e, customQuery) => {
    if (e) e.preventDefault();
    const baseQuery = customQuery || question.trim();
    if (!baseQuery || loading) return;

    const finalQuery = buildFilteredQuery(baseQuery);
    setLastQuery(baseQuery);
    setQuestion('');
    setLoading(true);
    setStreamingText('');
    setMessages(prev => [...prev, { role: 'user', content: baseQuery }]);

    try {
      const historyForAPI = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await fetch('/api/ai/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: store.id,
          question: finalQuery,
          mode: mode,
          depth: mode === 'decide' ? depth : 'balanced',
          history: historyForAPI,
          conversationId: currentConversationId
        })
      });

      if (!response.ok) throw new Error('Request failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let convId = currentConversationId;
      let modelUsed = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.conversationId && !convId) {
                convId = parsed.conversationId;
                setCurrentConversationId(convId);
              }
              if (parsed.model) modelUsed = parsed.model;
              if (parsed.text) {
                fullText += parsed.text;
                setStreamingText(fullText);
              }
            } catch (err) {}
          }
        }
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: fullText,
        model: modelUsed,
        mode: mode,
        depth: mode === 'decide' ? depth : null
      }]);
      setStreamingText('');
      setShowFilters(true);
      loadConversations();
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + error.message }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRerun = () => {
    if (lastQuery) handleSubmit(null, lastQuery);
  };

  const MODES = [
    { id: 'analyze', label: 'Analyze', icon: Zap, color: 'blue' },
    { id: 'summarize', label: 'Summarize', icon: BarChart2, color: 'purple' },
    { id: 'decide', label: 'Decide', icon: Lightbulb, color: 'orange' }
  ];

  const DEPTHS = [
    { id: 'instant', label: 'Instant', emoji: '⚡' },
    { id: 'fast', label: 'Fast', emoji: '🚀' },
    { id: 'balanced', label: 'Balanced', emoji: '⚖️' },
    { id: 'deep', label: 'Deep', emoji: '🧠' }
  ];

  return (
    <div className="flex gap-4">
      <div className={'flex rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm transition-all ' + (showFilters ? 'flex-1' : 'w-full')} style={{ height: '650px' }}>
        
        {/* Sidebar */}
        <div className="w-56 border-r border-gray-200 flex flex-col bg-gray-50">
          <div className="p-3 border-b border-gray-200">
            <button
              onClick={createNewChat}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 rounded-lg text-white font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">No conversations yet</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ' + 
                    (currentConversationId === conv.id ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:bg-gray-100')}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 truncate text-sm">{conv.title}</span>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-3 border-b border-gray-200 bg-white">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                {MODES.map((m) => {
                  const Icon = m.icon;
                  const isActive = mode === m.id;
                  const colorClass = isActive 
                    ? (m.color === 'blue' ? 'bg-blue-500 text-white' : m.color === 'purple' ? 'bg-purple-500 text-white' : 'bg-orange-500 text-white')
                    : 'text-gray-600 hover:bg-gray-200';
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ' + colorClass}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {m.label}
                    </button>
                  );
                })}
              </div>

              {mode === 'decide' && (
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                  {DEPTHS.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDepth(d.id)}
                      className={'px-3 py-1.5 rounded-md text-sm transition-all ' + 
                        (depth === d.id ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700')}
                    >
                      {d.emoji} {d.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.length === 0 && !streamingText ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-3 shadow-lg">
                  <Brain className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">AI Analytics for {store.name}</h2>
                <p className="text-gray-500 text-sm max-w-md mb-4">Ask questions, get insights.</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {['How are we doing today?', 'Compare today vs yesterday', 'Best campaigns?', 'Show revenue trend'].map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setQuestion(q)}
                      className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:bg-gray-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div key={i} className={'flex ' + (msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={'max-w-[85%] rounded-xl px-4 py-3 ' + 
                      (msg.role === 'user' ? 'bg-violet-600 text-white' : 'bg-white border border-gray-200 shadow-sm')}>
                      {msg.role === 'assistant' && msg.model && (
                        <div className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {msg.model}
                        </div>
                      )}
                      <div className={msg.role === 'user' ? '' : 'text-gray-700 text-sm'}>
                        {msg.role === 'assistant' ? <FormattedMessage text={msg.content} /> : msg.content}
                      </div>
                    </div>
                  </div>
                ))}

                {streamingText && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl px-4 py-3 bg-white border border-gray-200 shadow-sm">
                      <div className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 animate-pulse" />
                        Thinking...
                      </div>
                      <div className="text-gray-700 text-sm">
                        <FormattedMessage text={streamingText} />
                        <span className="inline-block w-2 h-4 bg-violet-500 animate-pulse ml-1" />
                      </div>
                    </div>
                  </div>
                )}

                {loading && !streamingText && (
                  <div className="flex justify-start">
                    <div className="rounded-xl px-4 py-3 bg-white border border-gray-200">
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Thinking...
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-200 bg-white">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about your data..."
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-gray-800 text-sm"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className={'px-4 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ' + 
                  (loading || !question.trim() ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-violet-600 text-white hover:bg-violet-700')}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      {showFilters && (
        <div className="w-64 bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-5" style={{ height: '650px', overflowY: 'auto' }}>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Metrics</h3>
            <div className="space-y-1.5">
              {METRICS.map((m) => (
                <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(m.id)}
                    onChange={() => toggleMetric(m.id)}
                    className="w-4 h-4 rounded border-gray-300 text-violet-600"
                  />
                  <span className="text-sm text-gray-600">{m.emoji} {m.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Dimensions</h3>
            <div className="space-y-1.5">
              {DIMENSIONS.map((d) => (
                <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedDimensions.includes(d.id)}
                    onChange={() => toggleDimension(d.id)}
                    className="w-4 h-4 rounded border-gray-300 text-violet-600"
                  />
                  <span className="text-sm text-gray-600">{d.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Visualization</h3>
            <select
              value={vizType}
              onChange={(e) => setVizType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              {VIZ_TYPES.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Date range</h3>
            <div className="flex gap-1">
              {DATE_RANGES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDateRange(d.id)}
                  className={'flex-1 py-1.5 text-sm rounded-lg transition-all ' + 
                    (dateRange === d.id ? 'bg-violet-100 text-violet-700 font-medium' : 'bg-gray-50 text-gray-600 hover:bg-gray-100')}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleRerun}
            disabled={loading || !lastQuery}
            className={'w-full py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ' + 
              (loading || !lastQuery ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-violet-600 text-white hover:bg-violet-700')}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {loading ? 'Running...' : 'Run'}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DAILY SUMMARY TAB
// ============================================================================

function DailySummaryTab({ store }) {
  const [reportType, setReportType] = useState('am');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState('');
  const [streamingText, setStreamingText] = useState('');

  const generateReport = async () => {
    setLoading(true);
    setStreamingText('');
    setReport('');

    try {
      const response = await fetch('/api/ai/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: store.id,
          question: '',
          mode: 'daily-summary',
          reportType: reportType
        })
      });

      if (!response.ok) throw new Error('Request failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                fullText += parsed.text;
                setStreamingText(fullText);
              }
            } catch (e) {}
          }
        }
      }

      setReport(fullText);
      setStreamingText('');
    } catch (error) {
      setReport('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const displayText = streamingText || report;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-600" />
              Daily Performance Summary
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">GPT-5.1 Deep analysis</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-white rounded-lg p-1 border border-gray-200">
              <button
                onClick={() => setReportType('am')}
                className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ' + 
                  (reportType === 'am' ? 'bg-amber-500 text-white' : 'text-gray-600 hover:bg-gray-50')}
              >
                <Sun className="w-4 h-4" /> AM
              </button>
              <button
                onClick={() => setReportType('pm')}
                className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ' + 
                  (reportType === 'pm' ? 'bg-indigo-500 text-white' : 'text-gray-600 hover:bg-gray-50')}
              >
                <Moon className="w-4 h-4" /> PM
              </button>
            </div>

            <button
              onClick={generateReport}
              disabled={loading}
              className={'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ' + 
                (loading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-violet-600 text-white hover:bg-violet-700')}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              {loading ? 'Generating...' : 'Generate ' + reportType.toUpperCase()}
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 min-h-[400px] max-h-[500px] overflow-y-auto">
        {!displayText && !loading ? (
          <div className="flex flex-col items-center justify-center h-80 text-center">
            <div className={'w-16 h-16 rounded-xl flex items-center justify-center mb-3 ' + 
              (reportType === 'am' ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-indigo-500 to-purple-600')}>
              {reportType === 'am' ? <Sun className="w-8 h-8 text-white" /> : <Moon className="w-8 h-8 text-white" />}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {reportType === 'am' ? 'Morning Review' : 'Evening Review'}
            </h3>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none">
            {loading && !streamingText ? (
              <div className="flex items-center justify-center h-40 gap-2 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Analyzing data...</span>
              </div>
            ) : (
              <FormattedMessage text={displayText} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// FORMATTED MESSAGE
// ============================================================================

function FormattedMessage({ text }) {
  if (!text) return null;
  
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) {
      return <h3 key={i} className="text-base font-bold text-gray-900 mt-3 mb-1">{line.slice(3)}</h3>;
    }
    if (line.startsWith('### ')) {
      return <h4 key={i} className="text-sm font-semibold text-gray-800 mt-2 mb-1">{line.slice(4)}</h4>;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-violet-500">•</span>
          <span>{line.slice(2)}</span>
        </div>
      );
    }
    if (line.startsWith('---')) {
      return <hr key={i} className="my-3 border-gray-200" />;
    }
    if (line.trim() === '') {
      return <div key={i} className="h-2" />;
    }
    return <p key={i} className="my-0.5">{line}</p>;
  });
}
