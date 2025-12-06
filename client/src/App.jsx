// client/src/App.jsx
import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react';

import { 
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import {
  RefreshCw, TrendingUp, TrendingDown, Plus, Trash2,
  Store, ChevronDown, ChevronUp, ArrowUpDown, Calendar, Bell
} from 'lucide-react';
import { COUNTRIES as MASTER_COUNTRIES } from './data/countries';

const API_BASE = '/api';

const getLocalDateString = (date = new Date()) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(date.getTime() - offsetMs);
  return localDate.toISOString().split('T')[0];
};

const countryCodeToFlag = (code) => {
  if (!code || !/^[A-Z]{2}$/i.test(code)) return '🏳️';
  return String.fromCodePoint(...code.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0)));
};

const MASTER_COUNTRIES_WITH_FLAGS = MASTER_COUNTRIES.map(country => ({
  ...country,
  flag: countryCodeToFlag(country.code)
}));

const STORES = {
  vironax: {
    id: 'vironax',
    name: 'VironaX',
    tagline: "Men's Jewelry",
    currency: 'SAR',
    currencySymbol: 'SAR',
    ecommerce: 'Salla',
    defaultAOV: 280
  },
  shawq: {
    id: 'shawq',
    name: 'Shawq',
    tagline: 'Palestinian & Syrian Apparel',
    currency: 'USD',
    currencySymbol: '$',
    ecommerce: 'Shopify',
    defaultAOV: 75
  }
};

const TABS = ['Dashboard', 'Budget Efficiency', 'Budget Intelligence', 'Manual Data'];

export default function App() {
  const [currentStore, setCurrentStore] = useState('vironax');
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  const [dateRange, setDateRange] = useState({ type: 'days', value: 7 });
  const [customRange, setCustomRange] = useState({
    start: getLocalDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)),
    end: getLocalDateString()
  });
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  
  const [dashboard, setDashboard] = useState(null);
  const [efficiency, setEfficiency] = useState(null);
  const [efficiencyTrends, setEfficiencyTrends] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [budgetIntelligence, setBudgetIntelligence] = useState(null);
  const [manualOrders, setManualOrders] = useState([]);
  const [manualSpendOverrides, setManualSpendOverrides] = useState([]);
  const [availableCountries, setAvailableCountries] = useState([]);
  const [metaBreakdownData, setMetaBreakdownData] = useState([]);
  const [shopifyTimeOfDay, setShopifyTimeOfDay] = useState({ data: [], timezone: 'America/Chicago', sampleTimestamps: [] });
  const [selectedShopifyRegion, setSelectedShopifyRegion] = useState('us');
  const [notifications, setNotifications] = useState([]);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  
  // KPI charts
  const [expandedKpis, setExpandedKpis] = useState([]);
  // Section 2 breakdown (pure meta)
  const [metaBreakdown, setMetaBreakdown] = useState('none');
  // Country trends
  const [countryTrends, setCountryTrends] = useState([]);

  const store = STORES[currentStore];
  const [orderForm, setOrderForm] = useState({
    date: getLocalDateString(),
    country: 'SA',
    campaign: '',
    spend: 0,
    orders_count: 1,
    revenue: 280,
    source: 'whatsapp',
    notes: ''
  });
  const [spendOverrideForm, setSpendOverrideForm] = useState({
    date: getLocalDateString(),
    country: 'ALL',
    amount: 0,
    notes: ''
  });

  // Load store from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('selectedStore');
      if (saved && STORES[saved]) {
        setCurrentStore(saved);
      }
    } catch (e) {
      console.error('Error reading localStorage:', e);
    }
    setStoreLoaded(true);
  }, []);

  // Save store selection to localStorage whenever it changes
  useEffect(() => {
    if (!storeLoaded) return;
    try {
      localStorage.setItem('selectedStore', currentStore);
    } catch (e) {
      console.error('Error writing localStorage:', e);
    }
  }, [currentStore, storeLoaded]);

  useEffect(() => {
    const newStore = STORES[currentStore];
    setOrderForm(prev => ({
      ...prev,
      country: currentStore === 'vironax' ? 'SA' : 'US',
      revenue: newStore.defaultAOV
    }));
  }, [currentStore]);


  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ store: currentStore });
      const countryTrendParams = new URLSearchParams({ store: currentStore, days: 7 });
      
      if (dateRange.type === 'custom') {
        params.set('startDate', dateRange.start);
        params.set('endDate', dateRange.end);
      } else if (dateRange.type === 'yesterday') {
        params.set('yesterday', '1');
      } else {
        params.set(dateRange.type, dateRange.value);
      }

      const shopifyRegion = selectedShopifyRegion ?? 'us';
      const timeOfDayParams = new URLSearchParams({ store: currentStore, days: 7, region: shopifyRegion });

      const [
        dashData,
        effData,
        effTrends,
        recs,
        intel,
        orders,
        spendOverrides,
        countries,
        cTrends,
        timeOfDay
      ] = await Promise.all([
        fetch(`${API_BASE}/analytics/dashboard?${params}`).then(r => r.json()),
        fetch(`${API_BASE}/analytics/efficiency?${params}`).then(r => r.json()),
        fetch(`${API_BASE}/analytics/efficiency/trends?${params}`).then(r => r.json()),
        fetch(`${API_BASE}/analytics/recommendations?${params}`).then(r => r.json()),
        fetch(`${API_BASE}/budget-intelligence?${params}`).then(r => r.json()),
        fetch(`${API_BASE}/manual?${params}`).then(r => r.json()),
        fetch(`${API_BASE}/manual/spend?${params}`).then(r => r.json()),
        fetch(`${API_BASE}/analytics/countries?store=${currentStore}`).then(r => r.json()),
        fetch(`${API_BASE}/analytics/countries/trends?${countryTrendParams}`).then(r => r.json()),
        currentStore === 'shawq'
          ? fetch(`${API_BASE}/analytics/shopify/time-of-day?${timeOfDayParams}`).then(r => r.json())
          : Promise.resolve({ data: [], timezone: shopifyRegion === 'europe' ? 'Europe/London' : shopifyRegion === 'all' ? 'UTC' : 'America/Chicago', sampleTimestamps: [] })
      ]);

      setDashboard(dashData);
      setEfficiency(effData);
      setEfficiencyTrends(effTrends);
      setRecommendations(recs);
      setBudgetIntelligence(intel);
      setManualOrders(orders);
      setManualSpendOverrides(spendOverrides);

      const safeCountries = (Array.isArray(countries) && countries.length > 0)
        ? countries.map(country => ({ ...country, flag: country.flag || countryCodeToFlag(country.code) }))
        : MASTER_COUNTRIES_WITH_FLAGS;

      setAvailableCountries(safeCountries);
      setOrderForm(prev =>
        safeCountries.some(c => c.code === prev.country)
          ? prev
          : { ...prev, country: safeCountries[0]?.code || prev.country }
      );

      setSpendOverrideForm(prev => {
        if (prev.country === 'ALL') return prev;
        return safeCountries.some(c => c.code === prev.country)
          ? prev
          : { ...prev, country: safeCountries[0]?.code || prev.country };
      });

      setCountryTrends(cTrends);
      const timeOfDayData = Array.isArray(timeOfDay?.data) ? timeOfDay.data : [];
      const timeOfDayZone = typeof timeOfDay?.timezone === 'string' ? timeOfDay.timezone : null;
      const timeOfDaySamples = Array.isArray(timeOfDay?.sampleTimestamps) ? timeOfDay.sampleTimestamps.slice(0, 5) : [];
      const fallbackTimezone = shopifyRegion === 'europe' ? 'Europe/London' : shopifyRegion === 'all' ? 'UTC' : 'America/Chicago';
      const safeTimezone = timeOfDayZone || fallbackTimezone;
      setShopifyTimeOfDay({ data: timeOfDayData, timezone: safeTimezone, sampleTimestamps: timeOfDaySamples });
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  }, [currentStore, dateRange, selectedShopifyRegion]);

  useEffect(() => {
    if (storeLoaded) {
      loadData();
    }
  }, [loadData, storeLoaded]);

  // Load breakdown data for Section 2 (pure meta)
  useEffect(() => {
    if (!storeLoaded) return;

    async function loadBreakdown() {
      if (metaBreakdown === 'none') {
        setMetaBreakdownData([]);
        return;
      }

      try {
        const params = new URLSearchParams({ store: currentStore });

        if (dateRange.type === 'custom') {
          params.set('startDate', dateRange.start);
          params.set('endDate', dateRange.end);
        } else if (dateRange.type === 'yesterday') {
          params.set('yesterday', '1');
        } else {
          params.set(dateRange.type, dateRange.value);
        }

        const endpoint = metaBreakdown === 'age_gender'
          ? `${API_BASE}/analytics/campaigns/by-age-gender?${params}`
          : `${API_BASE}/analytics/campaigns/by-${metaBreakdown}?${params}`;
        const data = await fetch(endpoint).then(r => r.json());
        setMetaBreakdownData(data);
      } catch (error) {
        console.error('Error loading breakdown:', error);
        setMetaBreakdownData([]);
      }
    }

    loadBreakdown();
  }, [metaBreakdown, currentStore, dateRange, storeLoaded]);

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch(`${API_BASE}/sync?store=${currentStore}`, { method: 'POST' });
      await loadData();
    } catch (error) {
      console.error('Sync error:', error);
    }
    setSyncing(false);
  }

  async function handleAddOrder(e) {
    e.preventDefault();
    try {
      await fetch(`${API_BASE}/manual?store=${currentStore}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderForm)
      });
      setOrderForm(prev => ({
        ...prev,
        spend: 0,
        orders_count: 1,
        revenue: STORES[currentStore].defaultAOV,
        notes: ''
      }));
      try {
        const newNotification = {
          id: Date.now(),
          type: 'order',
          message: `New order added: ${orderForm.orders_count || 1} order(s) for ${formatCurrency(orderForm.revenue || 0)}`,
          timestamp: new Date().toISOString(),
          country: orderForm.country || '',
          source: orderForm.source || ''
        };
        setNotifications(prev => Array.isArray(prev) ? [newNotification, ...prev].slice(0, 10) : [newNotification]);
      } catch (e) {
        console.error('Notification error:', e);
      }
      loadData();
    } catch (error) {
      console.error('Error adding order:', error);
    }
  }

  async function handleAddSpendOverride(e) {
    e.preventDefault();
    try {
      await fetch(`${API_BASE}/manual/spend?store=${currentStore}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spendOverrideForm)
      });
      setSpendOverrideForm(prev => ({
        ...prev,
        amount: 0,
        notes: ''
      }));
      loadData();
    } catch (error) {
      console.error('Error adding spend override:', error);
    }
  }

  async function handleDeleteOrder(id) {
    if (!confirm('Delete this order?')) return;
    try {
      await fetch(`${API_BASE}/manual/${id}`, { method: 'DELETE' });
      loadData();
    } catch (error) {
      console.error('Error deleting order:', error);
    }
  }

  async function handleDeleteSpendOverride(id) {
    if (!confirm('Delete this manual spend entry?')) return;
    try {
      await fetch(`${API_BASE}/manual/spend/${id}`, { method: 'DELETE' });
      loadData();
    } catch (error) {
      console.error('Error deleting manual spend:', error);
    }
  }

  async function handleBulkDelete(scope, date) {
    if (!confirm(`Delete all manual data for ${scope}?`)) return;
    try {
      await fetch(`${API_BASE}/manual/delete-bulk?store=${currentStore}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, date })
      });
      loadData();
    } catch (error) {
      console.error('Bulk delete error:', error);
    }
  }

  const formatCurrency = (value, decimals = 0) => {
    const symbol = store.currencySymbol;
    if (symbol === '$') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value || 0);
    }
    return `${Math.round(value || 0).toLocaleString()} ${symbol}`;
  };

  const formatNumber = (value) => {
    const v = value || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return Math.round(v).toString();
  };

  const formatNotificationTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      return new Date(timestamp).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const getDateRangeLabel = () => {
    if (dateRange.type === 'custom') {
      const formatDate = (d) => {
        const date = new Date(d);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };
      return `${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`;
    }
    if (dateRange.type === 'yesterday') return 'Yesterday';
    if (dateRange.type === 'days' && dateRange.value === 1) return 'Today';
    if (dateRange.type === 'days') return `Last ${dateRange.value} days`;
    if (dateRange.type === 'weeks') return `Last ${dateRange.value} weeks`;
    if (dateRange.type === 'months') return `Last ${dateRange.value} months`;
    return 'Custom';
  };

  if (!storeLoaded || (loading && !dashboard)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-indigo-500" />
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <button
                  onClick={() => setStoreDropdownOpen(!storeDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <Store className="w-4 h-4 text-gray-600" />
                  <span className="font-bold text-gray-900">{store.name}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-500 transition-transform ${
                      storeDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                
                {storeDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    {Object.values(STORES).map(s => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setCurrentStore(s.id);
                          setStoreDropdownOpen(false);
                          setExpandedKpis([]);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                          currentStore === s.id ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <div className="font-semibold text-gray-900">{s.name}</div>
                        <div className="text-sm text-gray-500">
                          {s.tagline} • {s.ecommerce}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded">
                Dashboard
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                {dashboard?.dateRange &&
                  `${dashboard.dateRange.startDate} to ${dashboard.dateRange.endDate}`}
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotificationPanel(prev => !prev)}
                  className={`relative p-2 rounded-lg border text-sm font-medium transition-colors ${
                    showNotificationPanel ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                  aria-label="Order notifications"
                >
                  <Bell className="w-4 h-4" />
                  {Array.isArray(notifications) && notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                      {notifications.length > 9 ? '9+' : notifications.length}
                    </span>
                  )}
                </button>
                {showNotificationPanel && (
                  <div className="absolute right-0 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg z-50">
                    <div className="flex items-center justify-between p-3 border-b border-gray-100">
                      <span className="text-sm font-semibold text-gray-900">Notifications</span>
                      {Array.isArray(notifications) && notifications.length > 0 && (
                        <button
                          onClick={() => setNotifications([])}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {Array.isArray(notifications) && notifications.length > 0 ? (
                        notifications.map((notif) => (
                          <div key={notif?.id || Math.random()} className="p-3 border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
                            <p className="text-sm text-gray-900">{notif?.message || 'New order'}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {notif?.source && <span className="capitalize">{notif.source}</span>}
                              {notif?.country && <span> • {notif.country}</span>}
                              {notif?.timestamp && <span> • {formatNotificationTime(notif.timestamp)}</span>}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="p-4 text-sm text-gray-500 text-center">No notifications yet</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-1 bg-white p-1.5 rounded-xl shadow-sm mb-6 w-fit">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === i 
                  ? 'bg-gray-900 text-white' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Date Range Picker */}
        <div className="flex items-center gap-3 bg-white p-4 rounded-xl shadow-sm mb-6 flex-wrap">
          <span className="text-sm font-medium text-gray-700">Period:</span>
          
          {/* Today */}
          <button
            onClick={() => { setDateRange({ type: 'days', value: 1 }); setShowCustomPicker(false); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              dateRange.type === 'days' && dateRange.value === 1
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            Today
          </button>
          
          {/* Yesterday */}
          <button
            onClick={() => { setDateRange({ type: 'yesterday', value: 1 }); setShowCustomPicker(false); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              dateRange.type === 'yesterday'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            Yesterday
          </button>
          
          {[3, 7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => { setDateRange({ type: 'days', value: d }); setShowCustomPicker(false); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRange.type === 'days' && dateRange.value === d
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              {d}D
            </button>
          ))}

          {/* Custom Range */}
          <div className="relative">
            <button
              onClick={() => setShowCustomPicker(!showCustomPicker)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                dateRange.type === 'custom'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Custom
            </button>
            
            {showCustomPicker && (
              <div className="absolute top-full mt-2 left-0 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-50 min-w-[280px]">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={customRange.start}
                      onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                      max={customRange.end || getLocalDateString()}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={customRange.end}
                      onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
                      min={customRange.start}
                      max={getLocalDateString()}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => {
                        if (customRange.start && customRange.end) {
                          setDateRange({ type: 'custom', start: customRange.start, end: customRange.end });
                          setShowCustomPicker(false);
                        }
                      }}
                      disabled={!customRange.start || !customRange.end}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => setShowCustomPicker(false)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="ml-auto text-sm text-gray-500">
            Showing: <strong>{getDateRangeLabel()}</strong>
          </div>
        </div>

        {activeTab === 0 && dashboard && (
          <DashboardTab
            dashboard={dashboard}
            expandedKpis={expandedKpis}
            setExpandedKpis={setExpandedKpis}
            formatCurrency={formatCurrency}
            formatNumber={formatNumber}
            metaBreakdown={metaBreakdown}
            setMetaBreakdown={setMetaBreakdown}
            metaBreakdownData={metaBreakdownData}
            store={store}
            countryTrends={countryTrends}
            shopifyTimeOfDay={shopifyTimeOfDay}
            selectedShopifyRegion={selectedShopifyRegion}
            setSelectedShopifyRegion={setSelectedShopifyRegion}
          />
          )}
        
        {activeTab === 1 && efficiency && (
          <EfficiencyTab
            efficiency={efficiency}
            trends={efficiencyTrends}
            recommendations={recommendations}
            formatCurrency={formatCurrency}
          />
        )}

        {activeTab === 2 && budgetIntelligence && (
          <BudgetIntelligenceTab
            data={budgetIntelligence}
            formatCurrency={formatCurrency}
            store={store}
          />
        )}

        {activeTab === 3 && (
          <ManualDataTab
            orders={manualOrders}
            form={orderForm}
            setForm={setOrderForm}
            onSubmit={handleAddOrder}
            onDelete={handleDeleteOrder}
            manualSpendOverrides={manualSpendOverrides}
            spendOverrideForm={spendOverrideForm}
            setSpendOverrideForm={setSpendOverrideForm}
            onAddSpendOverride={handleAddSpendOverride}
            onDeleteSpendOverride={handleDeleteSpendOverride}
            onBulkDelete={handleBulkDelete}
            formatCurrency={formatCurrency}
            store={store}
            availableCountries={availableCountries}
          />
        )}
      </div>
      
      {storeDropdownOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setStoreDropdownOpen(false)} />
      )}
    </div>
  );
}

function SortableHeader({ label, field, sortConfig, onSort, className = '' }) {
  const isActive = sortConfig.field === field;
  const isAsc = isActive && sortConfig.direction === 'asc';
  
  return (
    <th 
      className={`cursor-pointer hover:bg-gray-100 select-none ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1 justify-center">
        {label}
        {isActive ? (
          isAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </div>
    </th>
  );
}

function DashboardTab({ dashboard, expandedKpis, setExpandedKpis, formatCurrency, formatNumber, store, countryTrends }) {
  const { overview, campaigns, countries } = dashboard;
  const [metaView, setMetaView] = useState('campaign');
  const [countrySortConfig, setCountrySortConfig] = useState({ field: 'spend', direction: 'desc' });
  const [campaignSortConfig, setCampaignSortConfig] = useState({ field: 'spend', direction: 'desc' });
  
  // RESTORED: Collapsible States
  const [expandedCountries, setExpandedCountries] = useState(new Set());
  const [showCountryTrends, setShowCountryTrends] = useState(false);

  const kpis = [
    { key: 'revenue', label: 'Revenue', value: overview.revenue, change: overview.revenueChange, format: 'currency', color: '#8b5cf6' },
    { key: 'spend', label: 'Ad Spend', value: overview.spend, change: overview.spendChange, format: 'currency', color: '#6366f1' },
    { key: 'orders', label: 'Orders', value: overview.orders, change: overview.ordersChange, format: 'number', color: '#22c55e' },
    { key: 'aov', label: 'AOV', value: overview.aov, change: overview.aovChange, format: 'currency', color: '#f59e0b' },
    { key: 'cac', label: 'CAC', value: overview.cac, change: overview.cacChange, format: 'currency', color: '#ef4444' },
    { key: 'roas', label: 'ROAS', value: overview.roas, change: overview.roasChange, format: 'roas', color: '#10b981' },
  ];

  const toggleKpi = (key) => setExpandedKpis(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  // RESTORED: Toggle Country Logic
  const toggleCountryRow = (code) => {
    setExpandedCountries(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSort = (config, setConfig, field) => {
    setConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const sortData = (data, config) => {
    return [...data].sort((a, b) => {
      const aVal = a[config.field] || 0;
      const bVal = b[config.field] || 0;
      return config.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  };

  const sortedCampaigns = sortData(campaigns, campaignSortConfig);
  const sortedCountries = sortData(countries, countrySortConfig);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-6 gap-4">
        {kpis.map((kpi) => <KPICard key={kpi.key} kpi={kpi} expanded={expandedKpis.includes(kpi.key)} onToggle={() => toggleKpi(kpi.key)} formatCurrency={formatCurrency} />)}
      </div>
      
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Campaign Performance</h2>
          <div className="flex gap-2">
             <button onClick={() => setMetaView('campaign')} className={`px-3 py-1 text-xs rounded ${metaView === 'campaign' ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}>Campaigns</button>
             <button onClick={() => setMetaView('country')} className={`px-3 py-1 text-xs rounded ${metaView === 'country' ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}>By Country</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <SortableHeader label={metaView === 'campaign' ? 'Name' : 'Country'} field={metaView === 'campaign' ? 'campaignName' : 'name'} config={metaView === 'campaign' ? campaignSortConfig : countrySortConfig} onSort={(f) => handleSort(metaView === 'campaign' ? campaignSortConfig : countrySortConfig, metaView === 'campaign' ? setCampaignSortConfig : setCountrySortConfig, f)} />
                <SortableHeader label="Spend" field="spend" config={metaView === 'campaign' ? campaignSortConfig : countrySortConfig} onSort={(f) => handleSort(metaView === 'campaign' ? campaignSortConfig : countrySortConfig, metaView === 'campaign' ? setCampaignSortConfig : setCountrySortConfig, f)} />
                <th className="text-xs text-gray-400">Share</th>
                <SortableHeader label="Revenue" field={metaView === 'campaign' ? 'conversionValue' : 'revenue'} config={metaView === 'campaign' ? campaignSortConfig : countrySortConfig} onSort={(f) => handleSort(metaView === 'campaign' ? campaignSortConfig : countrySortConfig, metaView === 'campaign' ? setCampaignSortConfig : setCountrySortConfig, f)} />
                <th className="text-xs text-gray-400">Share</th>
                <SortableHeader label="ROAS" field={metaView === 'campaign' ? 'metaRoas' : 'roas'} config={metaView === 'campaign' ? campaignSortConfig : countrySortConfig} onSort={(f) => handleSort(metaView === 'campaign' ? campaignSortConfig : countrySortConfig, metaView === 'campaign' ? setCampaignSortConfig : setCountrySortConfig, f)} />
                <SortableHeader label="Orders" field={metaView === 'campaign' ? 'conversions' : 'totalOrders'} config={metaView === 'campaign' ? campaignSortConfig : countrySortConfig} onSort={(f) => handleSort(metaView === 'campaign' ? campaignSortConfig : countrySortConfig, metaView === 'campaign' ? setCampaignSortConfig : setCountrySortConfig, f)} />
                <th>CAC</th>
                <th>Impr</th>
                <th>Clicks</th>
                <th>CTR</th>
              </tr>
            </thead>
            <tbody>
              {(metaView === 'campaign' ? sortedCampaigns : sortedCountries).map((row, i) => {
                const shareSpend = overview.spend > 0 ? ((row.spend || 0) / overview.spend) * 100 : 0;
                const shareRev = overview.revenue > 0 ? ((row.revenue || row.conversionValue || 0) / overview.revenue) * 100 : 0;
                const isExpanded = expandedCountries.has(row.code);
                // RESTORED: Check for nested cities
                const hasCities = row.cities && row.cities.length > 0;

                return (
                  <Fragment key={i}>
                  <tr 
                    className={`border-t border-gray-50 hover:bg-gray-50 ${hasCities ? 'cursor-pointer' : ''}`} 
                    onClick={() => hasCities && toggleCountryRow(row.code)}
                  >
                    <td className="px-4 py-2 font-medium flex items-center gap-2">
                      {/* RESTORED: Chevron for expansion */}
                      {hasCities && (isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>)}
                      {row.campaignName || row.name}
                    </td>
                    <td className="text-indigo-600 font-medium">{formatCurrency(row.spend)}</td>
                    <td className="text-xs text-gray-400">{shareSpend.toFixed(1)}%</td>
                    <td className="text-green-600 font-medium">{formatCurrency(row.revenue || row.conversionValue)}</td>
                    <td className="text-xs text-gray-400">{shareRev.toFixed(1)}%</td>
                    <td className="text-green-600">{(row.metaRoas || row.roas || 0).toFixed(2)}x</td>
                    <td>{row.conversions || row.totalOrders || 0}</td>
                    <td>{formatCurrency(row.metaCac || row.cac)}</td>
                    <td>{formatNumber(row.impressions)}</td>
                    <td>{formatNumber(row.clicks)}</td>
                    <td>{(row.ctr || 0).toFixed(2)}%</td>
                  </tr>
                  
                  {/* RESTORED: Nested City Table */}
                  {isExpanded && hasCities && (
                    <tr className="bg-gray-50 animate-fade-in">
                      <td colSpan={11} className="p-4 shadow-inner">
                        <div className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Top Cities / Regions</div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 border-b border-gray-200">
                              <th className="text-left py-1">City/State</th>
                              <th className="text-left py-1">Orders</th>
                              <th className="text-left py-1">Revenue</th>
                              <th className="text-left py-1">AOV</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.cities.map((city, cIdx) => (
                              <tr key={cIdx} className="hover:bg-gray-100">
                                <td className="py-1 font-medium">{city.city}</td>
                                <td className="py-1">{city.orders}</td>
                                <td className="py-1 text-green-600">{formatCurrency(city.revenue)}</td>
                                <td className="py-1">{formatCurrency(city.aov)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RESTORED: Country Order Trends (Charts) */}
      {countryTrends && countryTrends.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <button onClick={() => setShowCountryTrends(!showCountryTrends)} className="w-full p-6 flex justify-between hover:bg-gray-50 transition-colors">
            <h2 className="text-lg font-semibold">Order Trends by Country</h2>
            <ChevronDown className={`w-5 h-5 transition-transform ${showCountryTrends ? 'rotate-180' : ''}`} />
          </button>
          {showCountryTrends && (
            <div className="p-6 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
              {countryTrends.map(c => (
                <div key={c.countryCode} className="border p-4 rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex justify-between mb-2 items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{c.flag}</span>
                      <span className="font-bold">{c.country}</span>
                    </div>
                    <span className="text-xs font-medium bg-green-100 text-green-800 px-2 py-1 rounded-full">{c.totalOrders} Orders</span>
                  </div>
                  <div className="h-32">
                    <ResponsiveContainer>
                      <AreaChart data={c.trends}>
                        <XAxis dataKey="date" hide />
                        <Tooltip formatter={(val) => [val, 'Orders']} />
                        <Area type="monotone" dataKey="orders" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function KPICard({ kpi, trends, expanded, onToggle, formatCurrency }) {
  const trendData = trends && trends.length > 0
    ? trends.slice(-7).map(t => ({ value: t[kpi.key] || 0 }))
    : [];
  
  const calculateChange = () => {
    if (!trends || trends.length < 2) return { value: 0, isPositive: true };
    
    const midPoint = Math.floor(trends.length / 2);
    const firstHalf = trends.slice(0, midPoint);
    const secondHalf = trends.slice(midPoint);
    
    const firstSum = firstHalf.reduce((sum, t) => sum + (t[kpi.key] || 0), 0);
    const secondSum = secondHalf.reduce((sum, t) => sum + (t[kpi.key] || 0), 0);
    
    const firstAvg = firstHalf.length > 0 ? firstSum / firstHalf.length : 0;
    const secondAvg = secondHalf.length > 0 ? secondSum / secondHalf.length : 0;
    
    if (firstAvg === 0) return { value: 0, isPositive: true };
    
    const change = ((secondAvg - firstAvg) / firstAvg) * 100;
    
    const isGoodChange = kpi.key === 'cac' || kpi.key === 'spend' 
      ? change < 0 
      : change > 0;
    
    return { value: Math.abs(change), isPositive: change >= 0, isGood: isGoodChange };
  };
  
  const change = calculateChange();
  
  const formatValue = () => {
    if (kpi.format === 'currency') return formatCurrency(kpi.value);
    if (kpi.format === 'roas') return (kpi.value || 0).toFixed(2) + '×';
    return Math.round(kpi.value || 0);
  };

  return (
    <div 
      onClick={onToggle}
      className={`bg-white rounded-xl p-5 shadow-sm cursor-pointer card-hover ${
        expanded ? 'ring-2 ring-indigo-500' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {kpi.label}
        </span>
        {change.value > 0 && (
          <span
            className={`flex items-center gap-1 text-xs font-medium ${
              change.isGood ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {change.isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {change.value.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">
        {formatValue()}
      </div>
      {kpi.subtitle && (
        <div className="text-xs text-gray-400">{kpi.subtitle}</div>
      )}
      
      {trendData.length > 0 && (
        <div className="h-10 mt-3">
          <ResponsiveContainer>
            <LineChart data={trendData}>
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke={kpi.color} 
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="text-xs text-gray-400 mt-1 text-center">
        {expanded ? 'Click to hide chart' : 'Click to expand'}
      </div>
    </div>
  );
}

function BudgetIntelligenceTab({ data, formatCurrency, store }) {
  const [selectedCountry, setSelectedCountry] = useState('');
  const [objective, setObjective] = useState('purchases');
  const [brandSelection, setBrandSelection] = useState(store.id);

  const countryCodeToFlag = useCallback((code) => {
    if (!code || !/^[A-Z]{2}$/.test(code)) return '🏳️';
    return String.fromCodePoint(...code.split('').map(char => 127397 + char.charCodeAt(0)));
  }, []);

  const countriesWithData = useMemo(
    () => new Set((data?.availableCountries || []).map(c => c.code)),
    [data]
  );

  const masterCountries = useMemo(() => {
    return MASTER_COUNTRIES.map(country => {
      const dataCountry = data?.availableCountries?.find(c => c.code === country.code);
      return {
        ...country,
        flag: dataCountry?.flag || countryCodeToFlag(country.code)
      };
    });
  }, [countryCodeToFlag, data]);

  const countryOptions = useMemo(() => {
    const apiCountries = Array.isArray(data?.availableCountries) ? data.availableCountries : [];
    if (apiCountries.length > 0) return apiCountries;
    return masterCountries;
  }, [data?.availableCountries, masterCountries]);

  useEffect(() => {
    if (!selectedCountry) {
      if (countryOptions.length) {
        setSelectedCountry(countryOptions[0].code);
      }
    }
    setBrandSelection(store.id);
  }, [store.id, selectedCountry, countryOptions]);

  const planningDefaults = data?.planningDefaults || {};
  const priors = data?.priors || {};

  const hasSelectedCountryData = countriesWithData.has(selectedCountry);

  const buildPlanFromPriors = (countryCode) => {
    const targetRange = planningDefaults.targetPurchasesRange || { min: 8, max: 15 };
    const targetPurchases = (targetRange.min + targetRange.max) / 2;
    const testDays = planningDefaults.testDays || 4;
    const baseCac = priors.meanCAC || priors.targetCAC || 1;
    let daily = (baseCac * targetPurchases) / testDays;

    const comparables = planningDefaults.comparableDailySpends || [];
    if (comparables.length > 0) {
      let nearest = comparables[0];
      let minDiff = Math.abs(daily - nearest);
      for (const val of comparables) {
        const diff = Math.abs(daily - val);
        if (diff < minDiff) {
          minDiff = diff;
          nearest = val;
        }
      }
      daily = Math.max(nearest * 0.7, Math.min(nearest * 1.3, daily));
    }

    if (planningDefaults.minDaily) {
      daily = Math.max(daily, planningDefaults.minDaily);
    }
    if (planningDefaults.maxDaily) {
      daily = Math.min(daily, planningDefaults.maxDaily);
    }

    const expectedPurchases = (daily * testDays) / Math.max(baseCac, 1);

    return {
      country: countryCode,
      name: countryCode,
      flag: '🏳️',
      recommendedDaily: daily,
      recommendedTotal: daily * testDays,
      testDays,
      posteriorCAC: baseCac,
      posteriorROAS: priors.meanROAS || priors.targetROAS || 0,
      expectedPurchases,
      expectedRange: {
        low: Math.max(targetRange.min * 0.8, expectedPurchases * 0.8),
        high: Math.min(targetRange.max * 1.2, expectedPurchases * 1.2)
      },
      confidence: 'Low',
      confidenceBand: {
        low: (priors.meanROAS || 0) * 0.8,
        high: (priors.meanROAS || 0) * 1.2
      },
      rationale: 'Brand priors applied because no geo history',
      effectiveN: 1
    };
  };

  const startPlan = useMemo(() => {
    if (!data) return null;
    const fromServer = data.startPlans?.find(p => p.country === selectedCountry);
    if (fromServer) return fromServer;
    if (selectedCountry) return buildPlanFromPriors(selectedCountry);
    return data.startPlans?.[0] || null;
  }, [data, selectedCountry]);

  const formatMetric = (value, decimals = 2) =>
    value === null || value === undefined || Number.isNaN(value)
      ? '—'
      : Number(value).toFixed(decimals);

  const formatCurrencySafe = (value, decimals = 0) =>
    value === null || value === undefined || Number.isNaN(value)
      ? '—'
      : formatCurrency(value, decimals);

  const guidance = data?.liveGuidance || [];
  const learningMap = data?.learningMap || {};

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Start Budget Planner (New Geo)</h2>
            <p className="text-sm text-gray-600">Disciplined starting budgets grounded in brand priors and nearby performance.</p>
          </div>
          <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            Prior window: {data?.priorRange?.startDate || '—'} to {data?.priorRange?.endDate || '—'}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-700">Country</label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="mt-2 w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {countryOptions.map(c => (
                <option key={c.code} value={c.code}>
                  {`${c.flag || countryCodeToFlag(c.code)} ${c.name} (${c.code})`}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span
                className={`px-2 py-0.5 rounded-full font-semibold ${
                  hasSelectedCountryData ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {hasSelectedCountryData ? 'data' : 'new'}
              </span>
              {!hasSelectedCountryData && (
                <span className="text-amber-700">No historical data yet — using global baseline.</span>
              )}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Brand</label>
            <select
              value={brandSelection}
              onChange={(e) => setBrandSelection(e.target.value)}
              className="mt-2 w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
              disabled
            >
              <option value="vironax">VironaX</option>
              <option value="shawq">Shawq</option>
            </select>
            <p className="text-[11px] text-gray-500 mt-1">Use the store switcher above to change brand.</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Objective</label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="mt-2 w-full px-4 py-2 border border-gray-200 rounded-lg"
            >
              <option value="purchases">Purchases (default)</option>
              <option value="atc">Add To Cart (fallback)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
            <p className="text-sm text-gray-500">Recommended starting daily</p>
            <div className="text-3xl font-bold text-gray-900 mt-1">
              {startPlan ? formatCurrencySafe(startPlan.recommendedDaily, 0) : '—'}
            </div>
            <p className="text-xs text-gray-500 mt-1">Test for {startPlan?.testDays || planningDefaults.testDays || 4} days • Objective: {objective === 'atc' ? 'ATC' : 'Purchases'}</p>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
            <p className="text-sm text-gray-500">Expected purchases (range)</p>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {startPlan ? `${formatMetric(startPlan.expectedRange.low, 1)} - ${formatMetric(startPlan.expectedRange.high, 1)}` : '—'}
            </div>
            <p className="text-xs text-gray-500 mt-1">Posterior CAC {formatCurrencySafe(startPlan?.posteriorCAC || priors.meanCAC, 0)} | ROAS {formatMetric(startPlan?.posteriorROAS || priors.meanROAS, 2)}</p>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
            <p className="text-sm text-gray-500">Confidence band</p>
            <div className="text-xl font-semibold text-gray-900 mt-1">
              {startPlan ? `${formatMetric(startPlan.confidenceBand.low, 2)} - ${formatMetric(startPlan.confidenceBand.high, 2)}` : '—'}
            </div>
            <p className="text-xs text-gray-500 mt-1">Signal strength: {startPlan?.confidence || 'Low'} • {startPlan?.rationale || 'Using priors'}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Live Scale/Hold/Cut Guidance</h2>
            <p className="text-sm text-gray-600">Posterior performance with uncertainty-aware probabilities.</p>
          </div>
          <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            Targets — ROAS ≥ {priors.targetROAS || '—'} | CAC ≤ {formatCurrencySafe(priors.targetCAC, 0)}
          </div>
        </div>

        {guidance.length === 0 ? (
          <div className="text-center py-10 text-gray-500">No Meta campaigns found for this window.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="py-3 px-4 text-left">Campaign × Country</th>
                  <th className="py-3 px-4 text-right">Spend</th>
                  <th className="py-3 px-4 text-right">Purchases</th>
                  <th className="py-3 px-4 text-right">Revenue</th>
                  <th className="py-3 px-4 text-right">AOV</th>
                  <th className="py-3 px-4 text-right">CAC</th>
                  <th className="py-3 px-4 text-right">ROAS</th>
                  <th className="py-3 px-4 text-right">Posterior CAC</th>
                  <th className="py-3 px-4 text-right">Posterior ROAS</th>
                  <th className="py-3 px-4 text-left">Action</th>
                  <th className="py-3 px-4 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {guidance.map((row) => {
                  const badgeStyles = row.action === 'Scale'
                    ? 'bg-green-100 text-green-700'
                    : row.action === 'Cut'
                      ? 'bg-red-100 text-red-700'
                      : row.action === 'Insufficient Data'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-700';
                  return (
                    <tr key={`${row.campaignId}-${row.country}`} className="border-t border-gray-100">
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">{row.campaignName || 'Unnamed Campaign'}</div>
                        <div className="text-xs text-gray-500">{row.country || '—'}</div>
                      </td>
                      <td className="py-3 px-4 text-right">{formatCurrency(row.spend, 0)}</td>
                      <td className="py-3 px-4 text-right">{formatMetric(row.purchases, 0)}</td>
                      <td className="py-3 px-4 text-right">{formatCurrencySafe(row.revenue, 0)}</td>
                      <td className="py-3 px-4 text-right">{formatMetric(row.aov, 0)}</td>
                      <td className="py-3 px-4 text-right">{formatCurrencySafe(row.cac, 0)}</td>
                      <td className="py-3 px-4 text-right">{formatMetric(row.roas, 2)}</td>
                      <td className="py-3 px-4 text-right">{formatCurrencySafe(row.posteriorCAC, 0)}</td>
                      <td className="py-3 px-4 text-right">{formatMetric(row.posteriorROAS, 2)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${badgeStyles}`}>
                          {row.action}
                        </span>
                        {row.action === 'Scale' && <div className="text-[11px] text-gray-500">Suggest +15% to +25% daily</div>}
                        {row.action === 'Cut' && <div className="text-[11px] text-gray-500">Suggest -20% to -35% daily</div>}
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-sm max-w-xs">{row.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-3">These are probabilistic recommendations using smoothed performance to avoid overreacting to noise.</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Learning Health &amp; Expansion Map</h2>
            <p className="text-sm text-gray-600">Ranked by smoothed ROAS minus CAC with signal strength bonus.</p>
          </div>
          <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Signal bonus grows with purchases/orders</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <LearningColumn title="High priority to test" data={learningMap.highPriority} accent="border-green-500" />
          <LearningColumn title="Promising but noisy" data={learningMap.noisy} accent="border-amber-500" />
          <LearningColumn title="Likely poor fit" data={learningMap.poorFit} accent="border-red-500" />
          <LearningColumn title="Not enough signal" data={learningMap.lowSignal} accent="border-gray-300" />
        </div>
      </div>
    </div>
  );
}

function LearningColumn({ title, data, accent }) {
  return (
    <div className={`border rounded-xl p-4 ${accent} bg-gray-50`}>
      <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
      {(!data || data.length === 0) && (
        <p className="text-sm text-gray-500">—</p>
      )}
      <div className="space-y-3">
        {(data || []).map((item) => (
          <div key={item.country} className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{item.flag}</span>
                <div>
                  <div className="font-medium text-gray-900 text-sm">{item.name || item.country}</div>
                  <div className="text-xs text-gray-500">Posterior ROAS {item.posteriorROAS ? item.posteriorROAS.toFixed(2) : '—'} | CAC {item.posteriorCAC ? Math.round(item.posteriorCAC) : '—'}</div>
                </div>
              </div>
              <div className="text-xs text-gray-500">N={item.effectiveN}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EfficiencyTab({ efficiency, trends, recommendations, formatCurrency }) {
  const statusColors = {
    green: { bg: 'bg-green-100', text: 'text-green-700', label: 'Healthy' },
    yellow: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Moderate Pressure' },
    red: { bg: 'bg-red-100', text: 'text-red-700', label: 'High Pressure' }
  };
  
  const status = statusColors[efficiency.status] || statusColors.yellow;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${status.bg}`}>
              {efficiency.status === 'green' ? '✅' : efficiency.status === 'red' ? '🔴' : '⚠️'}
            </div>
            <div>
              <h3 className="font-semibold text-lg">{status.label}</h3>
              <p className="text-sm text-gray-500">Overall efficiency status</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4">Average vs Marginal CAC</h3>
          <div className="space-y-3">
            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Average CAC</span>
              <span className="font-semibold text-green-600">
                {formatCurrency(efficiency.averageCac, 2)}
              </span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Marginal CAC</span>
              <span className="font-semibold">
                {formatCurrency(efficiency.marginalCac, 2)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4">Scaling Headroom</h3>
          <div className="space-y-2">
            {efficiency.countries && efficiency.countries.map(c => (
              <div
                key={c.code}
                className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
              >
                <span className="text-sm">
                  {c.scaling === 'green' ? '🟢' : c.scaling === 'yellow' ? '🟡' : '🔴'}{' '}
                  {c.name}
                </span>
                <span
                  className={`text-sm font-medium ${
                    c.scaling === 'green'
                      ? 'text-green-600'
                      : c.scaling === 'yellow'
                      ? 'text-amber-600'
                      : 'text-red-600'
                  }`}
                >
                  {c.headroom}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {trends && trends.length > 0 && (
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-semibold mb-4">CAC Trend</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="cac"
                    name="Daily CAC"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-semibold mb-4">ROAS Trend</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="roas"
                    name="Daily ROAS"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">💡 Recommendations</h3>
        <div className="space-y-3">
          {recommendations.map((r, i) => (
            <div 
              key={i}
              className={`flex gap-4 p-4 rounded-xl border-l-4 ${
                r.type === 'urgent'
                  ? 'bg-red-50 border-red-500'
                  : r.type === 'positive'
                  ? 'bg-green-50 border-green-500'
                  : 'bg-gray-50 border-indigo-500'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                  r.type === 'urgent'
                    ? 'bg-red-500'
                    : r.type === 'positive'
                    ? 'bg-green-500'
                    : 'bg-indigo-500'
                }`}
              >
                {i + 1}
              </div>
              <div className="flex-1">
                <h4 className="font-semibold">{r.title}</h4>
                <p className="text-sm text-gray-600 mt-1">{r.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ManualDataTab({
  orders,
  form,
  setForm,
  onSubmit,
  onDelete,
  manualSpendOverrides,
  spendOverrideForm,
  setSpendOverrideForm,
  onAddSpendOverride,
  onDeleteSpendOverride,
  onBulkDelete,
  formatCurrency,
  store,
  availableCountries
}) {
  const [deleteScope, setDeleteScope] = useState('day');
  const [deleteDate, setDeleteDate] = useState(getLocalDateString());

  // --- CSV Import State & Logic ---
  const [metaImportLoading, setMetaImportLoading] = useState(false);
  const [metaImportError, setMetaImportError] = useState('');
  const [metaImportResult, setMetaImportResult] = useState(null);
  const [metaCsvText, setMetaCsvText] = useState('');

  function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];
      if (ch === '"' && inQuotes && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  function parseCsvToRows(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = cols[idx] !== undefined ? cols[idx].replace(/^"|"$/g, '') : '';
      });
      rows.push(obj);
    }
    return rows;
  }

  async function handleMetaCsvFile(file) {
    setMetaImportError('');
    setMetaImportResult(null);
    if (!file) return;
    const text = await file.text();
    setMetaCsvText(text);
  }

  async function submitMetaImport() {
    try {
      setMetaImportLoading(true);
      setMetaImportError('');
      setMetaImportResult(null);

      const rows = parseCsvToRows(metaCsvText);
      if (!rows.length) {
        setMetaImportError('CSV looks empty or unreadable. Export a daily Meta report as CSV and try again.');
        return;
      }

      const res = await fetch(`/api/analytics/meta/import?store=${store.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store: store.id, rows })
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Meta import failed');
      }

      setMetaImportResult(json);
    } catch (e) {
      setMetaImportError(e?.message || 'Meta import failed');
    } finally {
      setMetaImportLoading(false);
    }
  }

  const overrideLabel = (code) => {
    if (code === 'ALL') return 'All Countries (override total spend)';
    const country = availableCountries.find(c => c.code === code);
    return country ? `${country.flag} ${country.name}` : code;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* 1. Manual Order Form */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Add Manual Order
        </h3>
        <form onSubmit={onSubmit}>
          <div className="grid grid-cols-7 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <select
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              >
                {availableCountries.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Campaign</label>
              <input
                type="text"
                value={form.campaign}
                onChange={(e) => setForm({ ...form, campaign: e.target.value })}
                placeholder="Campaign name"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"># Orders</label>
              <input
                type="number"
                min="1"
                value={form.orders_count}
                onChange={(e) => setForm({ ...form, orders_count: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Revenue ({store.currencySymbol})</label>
              <input
                type="number"
                min="0"
                value={form.revenue}
                onChange={(e) => setForm({ ...form, revenue: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Spend ({store.currencySymbol})</label>
              <input
                type="number"
                min="0"
                value={form.spend}
                onChange={(e) => setForm({ ...form, spend: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="correction">Meta Correction</option>
                <option value="phone">Phone Call</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="px-6 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            Add Order
          </button>
        </form>
      </div>

      {/* 2. Meta CSV Import (NEW SECTION) */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Temporary Meta Import (CSV)</h3>
        <p className="text-sm text-gray-500 mb-4">
          Export a daily report from Meta Ads Manager as CSV (campaign + country or breakdowns),
          then upload it here. We will ingest it into the dashboard as a temporary replacement
          until the token sync is fixed.
        </p>

        <div className="flex flex-col gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleMetaCsvFile(e.target.files?.[0])}
            className="text-sm"
          />

          <textarea
            className="w-full border rounded-lg p-3 text-xs font-mono min-h-[120px]"
            placeholder="Optional: paste CSV content here"
            value={metaCsvText}
            onChange={(e) => setMetaCsvText(e.target.value)}
          />

          <div className="flex items-center gap-2">
            <button
              onClick={submitMetaImport}
              disabled={metaImportLoading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {metaImportLoading ? 'Importing…' : 'Import Meta CSV'}
            </button>

            <button
              onClick={async () => {
                if(!confirm('Are you sure? This deletes ALL Meta data for this store. Use this if your data looks inflated or wrong.')) return;
                try {
                  const res = await fetch(`/api/analytics/meta/clear?store=${store.id}`, { method: 'DELETE' });
                  const json = await res.json();
                  if(json.success) {
                    alert('Data cleared! You can now re-upload your clean CSV.');
                    window.location.reload();
                  } else {
                    alert('Error: ' + (json.error || 'Failed to clear'));
                  }
                } catch(e) {
                  alert('Error: ' + e.message);
                }
              }}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200"
            >
              Reset Data
            </button>
            {metaImportError && (
              <span className="text-sm text-red-600">{metaImportError}</span>
            )}
            {metaImportResult && (
              <span className="text-sm text-green-700">
                Imported: {metaImportResult.inserted} • Updated: {metaImportResult.updated} • Skipped: {metaImportResult.skipped}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Manual Spend Overrides */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Manual Spend Overrides
        </h3>
        <form onSubmit={onAddSpendOverride} className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={spendOverrideForm.date}
                onChange={(e) => setSpendOverrideForm({ ...spendOverrideForm, date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
              <select
                value={spendOverrideForm.country}
                onChange={(e) => setSpendOverrideForm({ ...spendOverrideForm, country: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              >
                <option value="ALL">All Countries (override total)</option>
                {availableCountries.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Spend ({store.currencySymbol})</label>
              <input
                type="number"
                min="0"
                value={spendOverrideForm.amount}
                onChange={(e) => setSpendOverrideForm({ ...spendOverrideForm, amount: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={spendOverrideForm.notes}
                onChange={(e) => setSpendOverrideForm({ ...spendOverrideForm, notes: e.target.value })}
                placeholder="Reason or details"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
          </div>
          <button
            type="submit"
            className="px-6 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            Save Manual Spend
          </button>
        </form>

        <div className="mt-6 space-y-3">
          {manualSpendOverrides.length === 0 ? (
            <div className="text-gray-500 text-sm">No manual spend overrides added for this period.</div>
          ) : (
            manualSpendOverrides.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="space-y-1">
                  <div className="font-medium text-gray-900">{overrideLabel(entry.country)}</div>
                  <div className="text-sm text-gray-600">{entry.date}</div>
                  <div className="text-sm text-indigo-700 font-semibold">{formatCurrency(entry.amount || 0)}</div>
                  {entry.notes && <div className="text-sm text-gray-500">{entry.notes}</div>}
                </div>
                <button
                  onClick={() => onDeleteSpendOverride(entry.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 4. Orders History */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Manual Orders History</h3>
        {orders.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-3">📋</p>
            <p>No manual orders added yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border-l-4 border-indigo-500">
                <div className="flex items-center gap-6">
                  <span className="font-medium">{order.date}</span>
                  <span className="px-2 py-1 bg-gray-200 rounded text-sm">{order.country}</span>
                  <span className="px-2 py-1 bg-gray-200 rounded text-sm capitalize">{order.source}</span>
                  <span>
                    <strong>{order.orders_count}</strong> orders •{' '}
                    <span className="text-green-600 font-medium">{formatCurrency(order.revenue)}</span>
                    {order.spend ? <span className="ml-2 text-indigo-600 font-medium">Spend: {formatCurrency(order.spend)}</span> : null}
                  </span>
                </div>
                <button
                  onClick={() => onDelete(order.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Delete Manual Data */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-red-700 mb-4 flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          Delete Manual Data
        </h3>
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Delete data for</label>
            <select
              value={deleteScope}
              onChange={(e) => setDeleteScope(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg"
            >
              <option value="day">Specific Day</option>
              <option value="week">Specific Week</option>
              <option value="month">Specific Month</option>
              <option value="all">All Manual Data</option>
            </select>
          </div>
          {deleteScope !== 'all' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={deleteDate}
                onChange={(e) => setDeleteDate(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
          )}
          <button
            onClick={() => onBulkDelete(deleteScope, deleteDate)}
            className="px-6 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
