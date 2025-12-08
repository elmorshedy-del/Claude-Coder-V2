import OpenAI from 'openai';
import { getDb } from '../db/database.js';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODELS = {
  NANO: 'gpt-5-nano',
  MINI: 'gpt-5-mini',
  STRATEGIST: 'gpt-5.1'
};

const FALLBACK_MODELS = {
  NANO: 'gpt-4o-mini',
  MINI: 'gpt-4o',
  STRATEGIST: 'gpt-4o'
};

const TOKEN_LIMITS = {
  nano: 2000,
  mini: 4000,
  instant: 4000,
  fast: 8000,
  balanced: 16000,
  deep: 32000
};

const DEPTH_TO_EFFORT = {
  instant: 'none',
  fast: 'low',
  balanced: 'medium',
  deep: 'high'
};

function getRelevantData(store, question) {
  const db = getDb();
  const data = {};
  const q = question.toLowerCase();

  // Normalize store name - handle case sensitivity
  const storeNormalized = store.toLowerCase();

  const today = new Date().toISOString().split('T')[0];
  const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    // Overview - try both exact and lowercase
    data.overview = db.prepare(`
      SELECT 
        SUM(spend) as totalSpend,
        SUM(conversion_value) as totalRevenue,
        SUM(conversions) as totalOrders,
        SUM(impressions) as totalImpressions,
        SUM(clicks) as totalClicks,
        ROUND(SUM(conversion_value) / NULLIF(SUM(spend), 0), 2) as roas,
        ROUND(SUM(spend) / NULLIF(SUM(conversions), 0), 2) as cpa
      FROM meta_daily_metrics 
      WHERE LOWER(store) = ? AND date >= ?
    `).get(storeNormalized, last7Days);

    data.today = db.prepare(`
      SELECT SUM(spend) as spend, SUM(conversion_value) as revenue, SUM(conversions) as orders
      FROM meta_daily_metrics WHERE LOWER(store) = ? AND date = ?
    `).get(storeNormalized, today);

    data.yesterday = db.prepare(`
      SELECT SUM(spend) as spend, SUM(conversion_value) as revenue, SUM(conversions) as orders
      FROM meta_daily_metrics WHERE LOWER(store) = ? AND date = ?
    `).get(storeNormalized, yesterday);

    // Always fetch campaigns
    data.campaigns = db.prepare(`
      SELECT 
        campaign_name, campaign_id,
        SUM(spend) as spend, SUM(conversion_value) as revenue, SUM(conversions) as orders,
        SUM(impressions) as impressions, SUM(clicks) as clicks,
        ROUND(SUM(conversion_value) / NULLIF(SUM(spend), 0), 2) as roas,
        ROUND(SUM(spend) / NULLIF(SUM(conversions), 0), 2) as cpa,
        ROUND(SUM(clicks) * 100.0 / NULLIF(SUM(impressions), 0), 2) as ctr
      FROM meta_daily_metrics 
      WHERE LOWER(store) = ? AND date >= ? AND campaign_name IS NOT NULL
      GROUP BY campaign_id, campaign_name
      ORDER BY spend DESC LIMIT 20
    `).all(storeNormalized, last7Days);

    // Always fetch ad sets
    try {
      data.adsets = db.prepare(`
        SELECT 
          campaign_name, adset_name, adset_id,
          SUM(spend) as spend, SUM(conversion_value) as revenue, SUM(conversions) as orders,
          ROUND(SUM(conversion_value) / NULLIF(SUM(spend), 0), 2) as roas,
          ROUND(SUM(spend) / NULLIF(SUM(conversions), 0), 2) as cpa
        FROM meta_adset_metrics 
        WHERE LOWER(store) = ? AND date >= ?
        GROUP BY adset_id, adset_name, campaign_name
        ORDER BY spend DESC LIMIT 20
      `).all(storeNormalized, last7Days);
    } catch (e) {
      console.log('[getRelevantData] Adset query failed:', e.message);
    }

    // Always fetch ads
    try {
      data.ads = db.prepare(`
        SELECT 
          campaign_name, adset_name, ad_name, ad_id,
          SUM(spend) as spend, SUM(conversion_value) as revenue, SUM(conversions) as orders,
          SUM(clicks) as clicks, SUM(impressions) as impressions,
          ROUND(SUM(conversion_value) / NULLIF(SUM(spend), 0), 2) as roas,
          ROUND(SUM(clicks) * 100.0 / NULLIF(SUM(impressions), 0), 2) as ctr
        FROM meta_ad_metrics 
        WHERE LOWER(store) = ? AND date >= ?
        GROUP BY ad_id, ad_name, adset_name, campaign_name
        ORDER BY spend DESC LIMIT 30
      `).all(storeNormalized, last7Days);
    } catch (e) {
      console.log('[getRelevantData] Ads query failed:', e.message);
    }

    if (q.includes('country') || q.includes('countr') || q.includes('saudi') || q.includes('uae') || q.includes('geo') || q.includes('region')) {
      data.countries = db.prepare(`
        SELECT 
          country,
          SUM(spend) as spend, SUM(conversion_value) as revenue, SUM(conversions) as orders,
          ROUND(SUM(conversion_value) / NULLIF(SUM(spend), 0), 2) as roas,
          ROUND(SUM(spend) / NULLIF(SUM(conversions), 0), 2) as cpa
        FROM meta_daily_metrics 
        WHERE LOWER(store) = ? AND date >= ? AND country != 'ALL' AND country IS NOT NULL AND country != ''
        GROUP BY country
        ORDER BY spend DESC
      `).all(storeNormalized, last7Days);
    }

    if (q.includes('trend') || q.includes('daily') || q.includes('week') || q.includes('over time') || q.includes('history')) {
      data.dailyTrends = db.prepare(`
        SELECT 
          date,
          SUM(spend) as spend, SUM(conversion_value) as revenue, SUM(conversions) as orders,
          ROUND(SUM(conversion_value) / NULLIF(SUM(spend), 0), 2) as roas
        FROM meta_daily_metrics 
        WHERE LOWER(store) = ? AND date >= ?
        GROUP BY date
        ORDER BY date DESC LIMIT 14
      `).all(storeNormalized, last30Days);
    }

    if (q.includes('order') || q.includes('sale') || q.includes('revenue')) {
      const orderTable = storeNormalized === 'vironax' ? 'salla_orders' : 'shopify_orders';
      try {
        data.recentOrders = db.prepare(`
          SELECT date, COUNT(*) as order_count, SUM(order_total) as revenue, country_code
          FROM ${orderTable}
          WHERE LOWER(store) = ? AND date >= ?
          GROUP BY date ORDER BY date DESC LIMIT 7
        `).all(storeNormalized, last7Days);
      } catch (e) {
        console.log('[getRelevantData] Order table query failed:', e.message);
      }
    }

    if (q.includes('funnel') || q.includes('conversion') || q.includes('drop')) {
      data.funnel = db.prepare(`
        SELECT 
          SUM(impressions) as impressions, SUM(clicks) as clicks,
          SUM(landing_page_views) as landing_page_views, SUM(add_to_cart) as add_to_cart,
          SUM(checkouts_initiated) as checkouts, SUM(conversions) as purchases
        FROM meta_daily_metrics 
        WHERE LOWER(store) = ? AND date >= ?
      `).get(storeNormalized, last7Days);
    }

  } catch (error) {
    console.error('[getRelevantData] Error:', error.message);
  }

  return data;
}

function buildSystemPrompt(store, mode, data) {
  const storeLower = store.toLowerCase();
  const storeContext = storeLower === 'vironax'
    ? 'VironaX (Saudi Arabia, SAR currency, Salla e-commerce, mens jewelry)'
    : 'Shawq (Turkey/US, USD currency, Shopify, Palestinian & Syrian apparel)';

  const currency = storeLower === 'vironax' ? 'SAR' : 'USD';

  const basePrompt = `You are an AI analytics assistant for ${storeContext}.
Currency: ${currency}

ACTUAL DATA FROM DATABASE:
${JSON.stringify(data, null, 2)}

RULES:
1. Use ONLY the data above - never make up numbers
2. Format currency nicely (e.g., 1,234.56 ${currency})
3. ROAS = revenue/spend, CPA = spend/orders, CTR = clicks/impressions * 100
4. If data is missing, say so
5. Be specific with real numbers from the data`;

  if (mode === 'analyze') {
    return basePrompt + `\n\nMODE: Quick Analysis - Give concise, direct answers in 2-3 sentences max.`;
  }
  if (mode === 'summarize') {
    return basePrompt + `\n\nMODE: Trends & Patterns - Summarize data, compare periods, flag anomalies. Use bullet points.`;
  }
  return basePrompt + `\n\nMODE: Strategic Decisions
- Give DETAILED actionable recommendations with specific numbers
- Analyze EACH campaign individually - don't just summarize
- For each campaign, state: performance verdict, why, and specific action
- Include specific budget recommendations with dollar/SAR amounts
- Prioritize by impact
- Be thorough - this is a deep analysis, not a summary
- Format with clear sections and bullet points`;
}

async function callResponsesAPI(model, systemPrompt, userMessage, maxTokens, reasoningEffort = null) {
  const input = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];

  const requestBody = {
    model: model,
    input: input,
    max_output_tokens: maxTokens
  };

  if (reasoningEffort && model.includes('5.1')) {
    requestBody.reasoning = { effort: reasoningEffort };
  }

  console.log(`[AI] Calling ${model} via Responses API (effort: ${reasoningEffort || 'n/a'})...`);
  const response = await client.responses.create(requestBody);
  return response.output_text;
}

async function callChatCompletionsAPI(model, systemPrompt, userMessage, maxTokens) {
  console.log(`[AI] Calling ${model} via Chat Completions API (fallback)...`);
  const response = await client.chat.completions.create({
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    max_tokens: maxTokens,
    temperature: 0.7
  });
  return response.choices[0].message.content;
}

export async function analyzeQuestion(question, store) {
  console.log(`\n[AI Analyze] Question: "${question}" | Store: ${store}`);

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const data = getRelevantData(store, question);
  console.log(`[AI Analyze] Data keys:`, Object.keys(data));

  const systemPrompt = buildSystemPrompt(store, 'analyze', data);

  try {
    const text = await callResponsesAPI(MODELS.NANO, systemPrompt, question, TOKEN_LIMITS.nano);
    console.log(`[AI Analyze] Success with ${MODELS.NANO}`);
    return { text, model: MODELS.NANO };
  } catch (error) {
    console.error(`[AI Analyze] ${MODELS.NANO} failed:`, error.message);
  }

  try {
    const text = await callChatCompletionsAPI(FALLBACK_MODELS.NANO, systemPrompt, question, TOKEN_LIMITS.nano);
    console.log(`[AI Analyze] Success with ${FALLBACK_MODELS.NANO} (fallback)`);
    return { text, model: `${FALLBACK_MODELS.NANO} (fallback)` };
  } catch (error) {
    console.error(`[AI Analyze] Fallback failed:`, error.message);
    throw new Error(`AI request failed: ${error.message}`);
  }
}

export async function summarizeData(question, store) {
  console.log(`\n[AI Summarize] Question: "${question}" | Store: ${store}`);

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const data = getRelevantData(store, question);
  console.log(`[AI Summarize] Data keys:`, Object.keys(data));

  const systemPrompt = buildSystemPrompt(store, 'summarize', data);

  try {
    const text = await callResponsesAPI(MODELS.MINI, systemPrompt, question, TOKEN_LIMITS.mini);
    console.log(`[AI Summarize] Success with ${MODELS.MINI}`);
    return { text, model: MODELS.MINI };
  } catch (error) {
    console.error(`[AI Summarize] ${MODELS.MINI} failed:`, error.message);
  }

  try {
    const text = await callChatCompletionsAPI(FALLBACK_MODELS.MINI, systemPrompt, question, TOKEN_LIMITS.mini);
    console.log(`[AI Summarize] Success with ${FALLBACK_MODELS.MINI} (fallback)`);
    return { text, model: `${FALLBACK_MODELS.MINI} (fallback)` };
  } catch (error) {
    console.error(`[AI Summarize] Fallback failed:`, error.message);
    throw new Error(`AI request failed: ${error.message}`);
  }
}

export async function decideQuestion(question, store, depth = 'balanced') {
  console.log(`\n[AI Decide] Question: "${question}" | Store: ${store} | Depth: ${depth}`);

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const reasoningEffort = DEPTH_TO_EFFORT[depth] || 'medium';
  const maxTokens = TOKEN_LIMITS[depth] || TOKEN_LIMITS.balanced;

  const data = getRelevantData(store, question);
  console.log(`[AI Decide] Data keys:`, Object.keys(data));

  const systemPrompt = buildSystemPrompt(store, 'decide', data);

  try {
    const text = await callResponsesAPI(MODELS.STRATEGIST, systemPrompt, question, maxTokens, reasoningEffort);
    console.log(`[AI Decide] Success with ${MODELS.STRATEGIST}`);
    return { text, model: MODELS.STRATEGIST, reasoning: reasoningEffort };
  } catch (error) {
    console.error(`[AI Decide] ${MODELS.STRATEGIST} failed:`, error.message);
  }

  try {
    const text = await callChatCompletionsAPI(FALLBACK_MODELS.STRATEGIST, systemPrompt, question, maxTokens);
    console.log(`[AI Decide] Success with ${FALLBACK_MODELS.STRATEGIST} (fallback)`);
    return { text, model: `${FALLBACK_MODELS.STRATEGIST} (fallback)`, reasoning: null };
  } catch (error) {
    console.error(`[AI Decide] Fallback failed:`, error.message);
    throw new Error(`AI request failed: ${error.message}`);
  }
}

export async function decideQuestionStream(question, store, depth = 'balanced', onText) {
  console.log(`\n[AI Stream] Question: "${question}" | Store: ${store} | Depth: ${depth}`);

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const reasoningEffort = DEPTH_TO_EFFORT[depth] || 'medium';
  const maxTokens = TOKEN_LIMITS[depth] || TOKEN_LIMITS.balanced;

  const data = getRelevantData(store, question);
  console.log(`[AI Stream] Data keys:`, Object.keys(data));

  const systemPrompt = buildSystemPrompt(store, 'decide', data);

  const input = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question }
  ];

  const requestBody = {
    model: MODELS.STRATEGIST,
    input: input,
    max_output_tokens: maxTokens,
    reasoning: { effort: reasoningEffort }
  };

  try {
    console.log(`[AI Stream] Calling ${MODELS.STRATEGIST} with streaming...`);
    const stream = await client.responses.stream(requestBody);

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        onText?.(event.delta);
      }
    }

    const final = await stream.finalResponse();
    console.log(`[AI Stream] Success with ${MODELS.STRATEGIST}`);
    return { text: final.output_text, model: MODELS.STRATEGIST, reasoning: reasoningEffort };
  } catch (error) {
    console.error(`[AI Stream] ${MODELS.STRATEGIST} failed:`, error.message);
  }

  try {
    console.log(`[AI Stream] Falling back to ${FALLBACK_MODELS.STRATEGIST}...`);
    const text = await callChatCompletionsAPI(FALLBACK_MODELS.STRATEGIST, systemPrompt, question, maxTokens);
    onText?.(text);
    console.log(`[AI Stream] Success with ${FALLBACK_MODELS.STRATEGIST} (fallback)`);
    return { text, model: `${FALLBACK_MODELS.STRATEGIST} (fallback)`, reasoning: null };
  } catch (error) {
    console.error(`[AI Stream] Fallback failed:`, error.message);
    throw new Error(`AI request failed: ${error.message}`);
  }
}

export function runQuery(sql, params = []) {
  const db = getDb();
  try {
    if (!sql.trim().toUpperCase().startsWith('SELECT')) {
      return { success: false, error: 'Only SELECT queries allowed', data: [] };
    }
    const results = db.prepare(sql).all(...params);
    return { success: true, data: results, rowCount: results.length };
  } catch (error) {
    return { success: false, error: error.message, data: [] };
  }
}

export async function askAnalyticsQuestion(question, dashboardData, store, reasoningEffort) {
  const result = await decideQuestion(question, store, reasoningEffort || 'balanced');
  return result.text;
}
