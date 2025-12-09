import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Sparkles, AlertCircle, TrendingUp, Calendar, DollarSign, Target } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function AIAnalytics({ selectedStore, startDate, endDate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeMode, setActiveMode] = useState('analyze');
  const messagesEndRef = useRef(null);

  // Right panel filters
  const [showActiveCampaignsOnly, setShowActiveCampaignsOnly] = useState(true);
  const [selectedDimension, setSelectedDimension] = useState('campaign');
  const [dayRange, setDayRange] = useState(14);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: input,
          mode: activeMode,
          context: {
            store: selectedStore,
            startDate,
            endDate,
            showActiveCampaignsOnly,
            dimension: selectedDimension,
            dayRange
          },
          conversationHistory: messages.slice(-5)
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const assistantMessage = {
        role: 'assistant',
        content: data.response || data.message || 'No response received',
        timestamp: new Date().toISOString(),
        metadata: data.metadata
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        role: 'assistant',
        content: `Error: ${error.message}. Please try again.`,
        timestamp: new Date().toISOString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    const isError = message.isError;

    return (
      <div
        key={index}
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
      >
        <div
          className={`max-w-[80%] rounded-lg p-4 ${
            isUser
              ? 'bg-blue-600 text-white'
              : isError
              ? 'bg-red-50 border border-red-200 text-red-900'
              : 'bg-gray-100 text-gray-900'
          }`}
        >
          <div className="flex items-start gap-2">
            {!isUser && (
              <Sparkles className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isError ? 'text-red-500' : 'text-blue-500'}`} />
            )}
            <div className="flex-1">
              <div className="whitespace-pre-wrap break-words">{message.content}</div>
              {message.metadata && (
                <div className="mt-3 pt-3 border-t border-gray-300 text-sm opacity-75">
                  <div>Mode: {message.metadata.mode}</div>
                  {message.metadata.tokensUsed && (
                    <div>Tokens: {message.metadata.tokensUsed}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-200px)] gap-4">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white rounded-lg shadow-lg">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-blue-500" />
              AI Analytics Assistant
            </h2>
            <div className="text-sm text-gray-500">
              {selectedStore === 'all' ? 'All Stores' : (selectedStore || '').toUpperCase()}
            </div>
          </div>
          
          {/* Mode Selection */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveMode('analyze')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeMode === 'analyze'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <TrendingUp className="w-4 h-4 inline mr-1" />
              Analyze
            </button>
            <button
              onClick={() => setActiveMode('decide')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeMode === 'decide'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Target className="w-4 h-4 inline mr-1" />
              Decide
            </button>
            <button
              onClick={() => setActiveMode('research')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeMode === 'research'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Sparkles className="w-4 h-4 inline mr-1" />
              Deep Research
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Sparkles className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium mb-2">AI Analytics Assistant</p>
                <p className="text-sm">Ask me anything about your campaign performance, trends, or get recommendations.</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => renderMessage(message, index))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask about campaign performance, trends, or get recommendations..."
              className="flex-1 p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Filters */}
      <div className="w-80 bg-white rounded-lg shadow-lg p-4 space-y-4">
        <h3 className="font-semibold text-lg mb-4">Context Filters</h3>
        
        {/* Active Campaigns Only */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showActiveCampaignsOnly}
              onChange={(e) => setShowActiveCampaignsOnly(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm font-medium">Active Campaigns Only</span>
          </label>
          <p className="text-xs text-gray-500 ml-6">
            Show only campaigns with activity in the last {dayRange} days
          </p>
        </div>

        {/* Day Range */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Activity Window
          </label>
          <select
            value={dayRange}
            onChange={(e) => setDayRange(Number(e.target.value))}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {/* Dimension Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Analysis Dimension
          </label>
          <select
            value={selectedDimension}
            onChange={(e) => setSelectedDimension(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="campaign">Campaign Level</option>
            <option value="adset">Ad Set Level</option>
            <option value="ad">Ad Level</option>
          </select>
        </div>

        {/* Info Panel */}
        <div className="mt-6 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900">
              <p className="font-medium mb-1">Active Mode: {activeMode.charAt(0).toUpperCase() + activeMode.slice(1)}</p>
              <p className="text-blue-700">
                {activeMode === 'analyze' && 'Quick insights from your data'}
                {activeMode === 'decide' && 'Get recommendations and next steps'}
                {activeMode === 'research' && 'Deep analysis with multiple queries'}
              </p>
            </div>
          </div>
        </div>

        {/* Date Range Display */}
        <div className="pt-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 space-y-1">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Date Range</span>
            </div>
            <div className="ml-6">
              <div>{new Date(startDate).toLocaleDateString()}</div>
              <div>to</div>
              <div>{new Date(endDate).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
