import { getCountryInfo, getAllCountries } from '../utils/countryData.js';
import { getDb } from '../db/database.js';
import { formatDateAsGmt3 } from '../utils/dateUtils.js';

function getDateRange(params) {
  const now = new Date();
  const today = formatDateAsGmt3(now);
  
  if (params.startDate && params.endDate) {
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    const days = Math.ceil((end - start) / (24 * 60 * 60 * 1000)) + 1;
    return { startDate: params.startDate, endDate: params.endDate, days };
  }
  
  if (params.yesterday) {
    const yesterday = formatDateAsGmt3(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    return { startDate: yesterday, endDate: yesterday, days: 1 };
  }
  
  let days = 7;
  if (params.days) days = parseInt(params.days);
  else if (params.weeks) days = parseInt(params.weeks) * 7;
  else if (params.months) days = parseInt(params.months) * 30;
  
  const endDate = today;
  const startMs = now.getTime() - (days - 1) * 24 * 60 * 60 * 1000;
  const startDate = formatDateAsGmt3(new Date(startMs));
  
  return { startDate, endDate, days };
}

export function getDashboard(store, params) {
  const db = getDb();
  const { startDate, endDate } = getDateRange(params);

  // 1. META CAMPAIGN DATA (Always needed for Spend/Funnel)
  const campaignData = db.prepare(`
    SELECT 
      campaign_id as campaignId,
      campaign_name as campaignName,
      SUM(spend) as spend,
      SUM(impressions) as impressions,
      SUM(reach) as reach,
      SUM(clicks) as clicks,
      SUM(landing_page_views) as lpv,
      SUM(add_to_cart) as atc,
      SUM(checkouts_initiated) as checkout,
      SUM(conversions) as conversions,
      SUM(conversion_value) as conversionValue
    FROM meta_daily_metrics
    WHERE store = ? AND date BETWEEN ? AND ?
    GROUP BY campaign_name
    ORDER BY spend DESC
  `).all(store, startDate, endDate);

  const campaigns = campaignData.map(c => ({
    ...c,
    cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    cr: c.clicks > 0 ? (c.conversions / c.clicks) * 100 : 0,
    metaRoas: c.spend > 0 ? c.conversionValue / c.spend : 0,
    metaAov: c.conversions > 0 ? c.conversionValue / c.conversions : 0,
    metaCac: c.conversions > 0 ? c.spend / c.conversions : 0,
    cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
    frequency: c.reach > 0 ? c.impressions / c.reach : 0
  }));

  // 2. META TOTALS
  const metaTotals = db.prepare(`
    SELECT
      SUM(spend) as metaSpendTotal,
      SUM(conversion_value) as metaRevenueTotal,
      SUM(impressions) as impressions_total,
      SUM(reach) as reach_total,
      SUM(clicks) as clicks_total,
      SUM(landing_page_views) as lpv_total,
      SUM(add_to_cart) as atc_total,
      SUM(checkouts_initiated) as checkout_total,
      SUM(conversions) as conversions_total,
      COUNT(DISTINCT campaign_name) as campaign_count
    FROM meta_daily_metrics
    WHERE store = ? AND date BETWEEN ? AND ?
  `).get(store, startDate, endDate) || {};

  // 3. E-COMMERCE DATA (Only fetched for Shawq)
  let ecomOrders = [];
  let ecomCityOrders = [];

  // --- LOGIC SWITCH ---
  // Shawq = Shopify Data
  // Virona = Pure Meta (until Salla is ready)
  if (store === 'shawq') {
    ecomOrders = db.prepare(`
      SELECT country_code as countryCode, COUNT(*) as orders, SUM(subtotal) as revenue
      FROM shopify_orders
      WHERE store = ? AND date BETWEEN ? AND ? AND country_code IS NOT NULL
      GROUP BY country_code
    `).all(store, startDate, endDate);

    ecomCityOrders = db.prepare(`
      SELECT country_code as countryCode, COALESCE(NULLIF(city, ''), 'Unknown') as city, COALESCE(NULLIF(state, ''), '') as state, COUNT(*) as orders, SUM(subtotal) as revenue
      FROM shopify_orders
      WHERE store = ? AND date BETWEEN ? AND ? AND country_code IS NOT NULL
      GROUP BY country_code, city, state
    `).all(store, startDate, endDate);
  }
  // Virona stays empty for ecomOrders (uses Meta below)

  const manualOrders = db.prepare(`
    SELECT country as countryCode, SUM(spend) as spend, SUM(orders_count) as orders, SUM(revenue) as revenue
    FROM manual_orders WHERE store = ? AND date BETWEEN ? AND ? GROUP BY country
  `).all(store, startDate, endDate);

  const manualSpendOverrides = db.prepare(`
    SELECT country as countryCode, SUM(amount) as amount
    FROM manual_spend_overrides WHERE store = ? AND date BETWEEN ? AND ? GROUP BY country
  `).all(store, startDate, endDate);

  // 4. META BY COUNTRY
  const metaByCountry = db.prepare(`
    SELECT 
      country as countryCode, 
      SUM(spend) as spend, 
      SUM(conversions) as conversions, 
      SUM(conversion_value) as conversionValue,
      SUM(impressions) as impressions,
      SUM(clicks) as clicks
    FROM meta_daily_metrics
    WHERE store = ? AND date BETWEEN ? AND ? AND country != 'ALL'
    GROUP BY country
  `).all(store, startDate, endDate);

  // 5. MERGE DATA INTO COUNTRY MAP
  const countryMap = new Map();
  
  // A. Load Ecom Data (Shawq only)
  for (const e of ecomOrders) {
    const info = getCountryInfo(e.countryCode);
    countryMap.set(e.countryCode, {
      code: e.countryCode, name: info.name, flag: info.flag,
      spend: 0, manualSpend: 0, metaOrders: 0, metaRevenue: 0,
      impressions: 0, clicks: 0,
      ecomOrders: e.orders || 0, manualOrders: 0, revenue: e.revenue || 0, cities: []
    });
  }

  // B. Load Meta Data
  for (const m of metaByCountry) {
    if (!m.spend && !m.conversions) continue; // Skip empty rows

    if (!countryMap.has(m.countryCode)) {
      const info = getCountryInfo(m.countryCode);
      countryMap.set(m.countryCode, {
        code: m.countryCode, name: info.name, flag: info.flag,
        spend: 0, manualSpend: 0, metaOrders: 0, metaRevenue: 0,
        impressions: 0, clicks: 0,
        ecomOrders: 0, manualOrders: 0, revenue: 0, cities: []
      });
    }
    const country = countryMap.get(m.countryCode);
    country.spend = (country.spend || 0) + (m.spend || 0);
    country.metaOrders = (country.metaOrders || 0) + (m.conversions || 0);
    country.metaRevenue = (country.metaRevenue || 0) + (m.conversionValue || 0);
    country.impressions = (country.impressions || 0) + (m.impressions || 0);
    country.clicks = (country.clicks || 0) + (m.clicks || 0);

    // --- HYBRID LOGIC FOR COUNTRY ROWS ---
    if (store === 'vironax') {
        // Virona: Revenue comes from Meta Pixel
        country.revenue = country.metaRevenue;
        country.totalOrders = country.metaOrders; // Will be added to manual later
    } else {
        // Shawq: Revenue comes from Shopify (already in ecomOrders)
        // We don't overwrite country.revenue here, it was set in Step A
    }
  }

  // C. Load Manual Orders
  for (const m of manualOrders) {
    if (!countryMap.has(m.countryCode)) {
      const info = getCountryInfo(m.countryCode);
      countryMap.set(m.countryCode, {
        code: m.countryCode, name: info.name, flag: info.flag,
        spend: 0, manualSpend: 0, metaOrders: 0, metaRevenue: 0,
        impressions: 0, clicks: 0,
        ecomOrders: 0, manualOrders: 0, revenue: 0, cities: []
      });
    }
    const country = countryMap.get(m.countryCode);
    country.manualOrders = (country.manualOrders || 0) + (m.orders || 0);
    country.spend = (country.spend || 0) + (m.spend || 0);
    
    // Manual always ADDS to whatever source we used
    country.revenue += m.revenue || 0;
  }

  // D. Apply Spend Overrides
  const overrideMap = new Map(manualSpendOverrides.map(o => [o.countryCode || 'ALL', o.amount || 0]));
  for (const [countryCode, amount] of overrideMap.entries()) {
    if (countryCode === 'ALL') continue;
    if (countryMap.has(countryCode)) {
      countryMap.get(countryCode).spend = amount || 0;
    }
  }

  const countries = Array.from(countryMap.values())
    .map(c => {
      // For Shawq: Orders = Shopify + Manual
      // For Virona: Orders = Meta + Manual
      const totalOrders = store === 'vironax' 
        ? (c.metaOrders + c.manualOrders) 
        : (c.ecomOrders + c.manualOrders);

      return {
        ...c,
        totalOrders,
        aov: totalOrders > 0 ? c.revenue / totalOrders : 0,
        cac: totalOrders > 0 ? c.spend / totalOrders : 0,
        roas: c.spend > 0 ? c.revenue / c.spend : 0
      };
    })
    .filter(c => (c.ecomOrders > 0 || c.revenue > 0 || c.spend > 0 || c.metaOrders > 0))
    .sort((a, b) => b.spend - a.spend);

  // 6. CALCULATE FINAL OVERVIEW TOTALS
  const overallOverride = overrideMap.get('ALL');
  const totalSpend = overallOverride != null ? overallOverride : countries.reduce((s, c) => s + (c.spend || 0), 0);
  
  // Summing from the country list ensures logic consistency
  const totalRevenue = countries.reduce((s, c) => s + c.revenue, 0);
  const totalOrders = countries.reduce((s, c) => s + c.totalOrders, 0);
  const totalManualOrders = manualOrders.reduce((s, m) => s + m.orders, 0);
  const totalEcomOrders = ecomOrders.reduce((s, e) => s + e.orders, 0);

  const overview = {
    revenue: totalRevenue,
    spend: totalSpend,
    orders: totalOrders,
    sallaOrders: 0, // Not used for Virona yet
    shopifyOrders: store === 'shawq' ? totalEcomOrders : 0,
    manualOrders: totalManualOrders,
    aov: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    cac: totalOrders > 0 ? totalSpend / totalOrders : 0,
    roas: totalSpend > 0 ? totalRevenue / totalSpend : 0
  };

  const trends = getTrends(store, startDate, endDate);
  const diagnostics = generateDiagnostics(campaigns, overview);

  return {
    overview,
    campaigns,
    countries,
    trends,
    diagnostics,
    dateRange: { startDate, endDate },
    metaCampaignCount: metaTotals.campaign_count || 0,
    metaSpendTotal: metaTotals.metaSpendTotal || 0,
    metaRevenueTotal: metaTotals.metaRevenueTotal || 0,
    metaRoasTotal: metaTotals.metaSpendTotal > 0 ? metaTotals.metaRevenueTotal / metaTotals.metaSpendTotal : 0,
    metaImpressionsTotal: metaTotals.impressions_total || 0,
    metaReachTotal: metaTotals.reach_total || 0,
    metaClicksTotal: metaTotals.clicks_total || 0,
    metaCtrTotal: (metaTotals.impressions_total > 0 ? metaTotals.clicks_total / metaTotals.impressions_total : 0),
    metaLpvTotal: metaTotals.lpv_total || 0,
    metaAtcTotal: metaTotals.atc_total || 0,
    metaCheckoutTotal: metaTotals.checkout_total || 0,
    metaConversionsTotal: metaTotals.conversions_total || 0,
    metaCacTotal: metaTotals.conversions_total > 0 ? metaTotals.metaSpendTotal / metaTotals.conversions_total : 0
  };
}

// 7. TRENDS (Hybrid Logic)
function getTrends(store, startDate, endDate) {
  const db = getDb();
  const allDates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    allDates.push(formatDateAsGmt3(d));
  }
  
  const metaDaily = db.prepare(`
    SELECT date, SUM(spend) as spend, SUM(conversions) as metaConversions, SUM(conversion_value) as metaRevenue
    FROM meta_daily_metrics WHERE store = ? AND date BETWEEN ? AND ? GROUP BY date
  `).all(store, startDate, endDate);

  let ecomDaily = [];
  if (store === 'shawq') {
    ecomDaily = db.prepare(`
      SELECT date, COUNT(*) as orders, SUM(subtotal) as revenue
      FROM shopify_orders WHERE store = ? AND date BETWEEN ? AND ? GROUP BY date
    `).all(store, startDate, endDate);
  }

  const manualDaily = db.prepare(`
    SELECT date, SUM(spend) as spend, SUM(orders_count) as orders, SUM(revenue) as revenue
    FROM manual_orders WHERE store = ? AND date BETWEEN ? AND ? GROUP BY date
  `).all(store, startDate, endDate);

  const dateMap = new Map();
  for (const date of allDates) {
    dateMap.set(date, { date, spend: 0, orders: 0, revenue: 0 });
  }
  
  // Fill Meta Spend (Always)
  for (const m of metaDaily) {
    if (dateMap.has(m.date)) {
      dateMap.get(m.date).spend = m.spend || 0;
      // If Virona, use Meta for Revenue/Orders too
      if (store === 'vironax') {
        dateMap.get(m.date).orders = m.metaConversions || 0;
        dateMap.get(m.date).revenue = m.metaRevenue || 0;
      }
    }
  }

  // Fill Ecom Revenue (Shawq Only)
  if (store === 'shawq') {
    for (const e of ecomDaily) {
      if (dateMap.has(e.date)) {
        dateMap.get(e.date).orders += e.orders || 0;
        dateMap.get(e.date).revenue += e.revenue || 0;
      }
    }
  }

  // Fill Manual
  for (const m of manualDaily) {
    if (dateMap.has(m.date)) {
      dateMap.get(m.date).spend += m.spend || 0;
      dateMap.get(m.date).orders += m.orders || 0;
      dateMap.get(m.date).revenue += m.revenue || 0;
    }
  }

  return Array.from(dateMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      ...d,
      aov: d.orders > 0 ? d.revenue / d.orders : 0,
      cac: d.orders > 0 ? d.spend / d.orders : 0,
      roas: d.spend > 0 ? d.revenue / d.spend : 0
    }));
}

function generateDiagnostics(campaigns, overview) {
  const diagnostics = [];
  if (overview.roas < 2) {
    diagnostics.push({ type: 'warning', icon: '⚠️', title: 'Low ROAS', detail: `Overall ROAS is ${overview.roas.toFixed(2)}×`, action: 'Review low performers' });
  } else if (overview.roas > 4) {
    diagnostics.push({ type: 'success', icon: '✅', title: 'Strong ROAS', detail: `Overall ROAS is ${overview.roas.toFixed(2)}×`, action: 'Scale top performers' });
  }
  const avgCAC = overview.cac;
  if (avgCAC > 100) {
    diagnostics.push({ type: 'warning', icon: '💰', title: 'High CAC', detail: `Average CAC is $${avgCAC.toFixed(0)}`, action: 'Check creative performance' });
  }
  return diagnostics;
}

export function getAvailableCountries(store) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT country as code FROM meta_daily_metrics WHERE store = ? AND country != 'ALL' AND spend > 0
    UNION
    SELECT DISTINCT country_code as code FROM shopify_orders WHERE store = ?
    UNION
    SELECT DISTINCT country_code as code FROM salla_orders WHERE store = ?
  `).all(store, store, store);

  return rows.map(r => getCountryInfo(r.code)).filter(c => c && c.name);
}

export function getEfficiency(store, params) {
  const dashboard = getDashboard(store, params);
  return {
    status: 'green',
    spendChange: 0,
    roasChange: 0,
    efficiencyRatio: 1,
    averageCac: dashboard.overview.cac,
    marginalCac: 0,
    marginalPremium: 0,
    campaigns: [],
    countries: []
  };
}

export function getEfficiencyTrends(store, params) {
  return getTrends(store, params.startDate || '2024-01-01', params.endDate || '2024-12-31');
}

export function getRecommendations(store, params) { return []; }

export function getCampaignsByCountry(store, params) {
  const db = getDb();
  const { startDate, endDate } = getDateRange(params);
  return db.prepare(`SELECT * FROM meta_daily_metrics WHERE store = ? AND date BETWEEN ? AND ? AND country != 'ALL'`).all(store, startDate, endDate);
}

export function getCampaignsByAge(store, params) { return []; }
export function getCampaignsByGender(store, params) { return []; }
export function getCampaignsByPlacement(store, params) { return []; }
export function getCampaignsByAgeGender(store, params) { return []; }
export function getCountryTrends(store, params) { return []; }
export function getShopifyTimeOfDay(store, params) { return { data: [], timezone: 'UTC', sampleTimestamps: [] }; }
export function getMetaBreakdowns(store, params) { return []; }
