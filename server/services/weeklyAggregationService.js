const aiBudgetDataAdapter = require('./aiBudgetDataAdapter');

/**
 * Weekly Aggregation Service
 * Provides efficient weekly data aggregation for AIBudget
 * Supports flexible lookback periods
 */

class WeeklyAggregationService {

  /**
   * Get weekly summary for AIBudget
   * @param {string} lookback - '1week', '2weeks', '4weeks', 'alltime'
   * @returns {Object} Weekly summary with trends
   */
  async getWeeklySummary(lookback = '4weeks') {
    try {
      const data = await aiBudgetDataAdapter.getDataByLookback(lookback);
      
      if (!data || data.length === 0) {
        return this.getEmptyResponse();
      }

      // Group by week
      const weeklyData = this.groupByWeek(data);
      
      // Calculate week-over-week trends
      const trends = this.calculateTrends(weeklyData);
      
      // Aggregate by campaign
      const campaignSummary = this.aggregateByCampaign(data);

      return {
        summary: {
          totalSpend: this.sumField(data, 'spend'),
          totalRevenue: this.sumField(data, 'purchase_value'),
          totalPurchases: this.sumField(data, 'purchases'),
          totalImpressions: this.sumField(data, 'impressions'),
          totalClicks: this.sumField(data, 'clicks'),
          avgFrequency: this.avgField(data, 'frequency'),
          lookbackPeriod: lookback
        },
        weeklyBreakdown: weeklyData,
        trends: trends,
        campaigns: campaignSummary,
        rawData: data
      };
    } catch (error) {
      console.error('❌ Error in weekly aggregation:', error);
      throw error;
    }
  }

  /**
   * Group data by week
   */
  groupByWeek(data) {
    const weeks = {};

    data.forEach(row => {
      const weekKey = row.date;
      
      if (!weeks[weekKey]) {
        weeks[weekKey] = {
          week: weekKey,
          spend: 0,
          purchase_value: 0,
          purchases: 0,
          impressions: 0,
          clicks: 0,
          atc: 0,
          ic: 0,
          campaigns: new Set()
        };
      }

      weeks[weekKey].spend += row.spend;
      weeks[weekKey].purchase_value += row.purchase_value;
      weeks[weekKey].purchases += row.purchases;
      weeks[weekKey].impressions += row.impressions;
      weeks[weekKey].clicks += row.clicks;
      weeks[weekKey].atc += row.atc;
      weeks[weekKey].ic += row.ic;
      weeks[weekKey].campaigns.add(row.campaign_id);
    });

    // Convert to array and calculate metrics
    return Object.values(weeks)
      .map(week => ({
        ...week,
        campaigns: week.campaigns.size,
        roi: week.spend > 0 ? ((week.purchase_value - week.spend) / week.spend * 100) : 0,
        ctr: week.impressions > 0 ? (week.clicks / week.impressions * 100) : 0,
        conversionRate: week.clicks > 0 ? (week.purchases / week.clicks * 100) : 0,
        cpc: week.clicks > 0 ? (week.spend / week.clicks) : 0,
        cpa: week.purchases > 0 ? (week.spend / week.purchases) : 0,
        atcRate: week.clicks > 0 ? (week.atc / week.clicks * 100) : 0,
        icRate: week.atc > 0 ? (week.ic / week.atc * 100) : 0
      }))
      .sort((a, b) => new Date(b.week) - new Date(a.week));
  }

  /**
   * Calculate week-over-week trends
   */
  calculateTrends(weeklyData) {
    if (weeklyData.length < 2) {
      return null;
    }

    const latest = weeklyData[0];
    const previous = weeklyData[1];

    return {
      spend: this.calculateChange(previous.spend, latest.spend),
      revenue: this.calculateChange(previous.purchase_value, latest.purchase_value),
      purchases: this.calculateChange(previous.purchases, latest.purchases),
      roi: this.calculateChange(previous.roi, latest.roi),
      ctr: this.calculateChange(previous.ctr, latest.ctr),
      conversionRate: this.calculateChange(previous.conversionRate, latest.conversionRate),
      cpc: this.calculateChange(previous.cpc, latest.cpc),
      cpa: this.calculateChange(previous.cpa, latest.cpa)
    };
  }

  /**
   * Calculate percentage change
   */
  calculateChange(oldValue, newValue) {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue * 100);
  }

  /**
   * Aggregate data by campaign
   */
  aggregateByCampaign(data) {
    const campaigns = {};

    data.forEach(row => {
      const key = row.campaign_id;
      
      if (!campaigns[key]) {
        campaigns[key] = {
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          status: row.status,
          effective_status: row.effective_status,
          spend: 0,
          purchase_value: 0,
          purchases: 0,
          impressions: 0,
          clicks: 0,
          atc: 0,
          ic: 0,
          frequency: []
        };
      }

      campaigns[key].spend += row.spend;
      campaigns[key].purchase_value += row.purchase_value;
      campaigns[key].purchases += row.purchases;
      campaigns[key].impressions += row.impressions;
      campaigns[key].clicks += row.clicks;
      campaigns[key].atc += row.atc;
      campaigns[key].ic += row.ic;
      if (row.frequency > 0) campaigns[key].frequency.push(row.frequency);
    });

    // Calculate campaign-level metrics
    return Object.values(campaigns).map(camp => ({
      ...camp,
      avgFrequency: camp.frequency.length > 0 
        ? camp.frequency.reduce((a, b) => a + b, 0) / camp.frequency.length 
        : 0,
      roi: camp.spend > 0 ? ((camp.purchase_value - camp.spend) / camp.spend * 100) : 0,
      ctr: camp.impressions > 0 ? (camp.clicks / camp.impressions * 100) : 0,
      conversionRate: camp.clicks > 0 ? (camp.purchases / camp.clicks * 100) : 0,
      cpc: camp.clicks > 0 ? (camp.spend / camp.clicks) : 0,
      cpa: camp.purchases > 0 ? (camp.spend / camp.purchases) : 0
    }));
  }

  /**
   * Sum a field across all rows
   */
  sumField(data, field) {
    return data.reduce((sum, row) => sum + (row[field] || 0), 0);
  }

  /**
   * Average a field across all rows
   */
  avgField(data, field) {
    const values = data.filter(row => row[field] > 0);
    if (values.length === 0) return 0;
    return values.reduce((sum, row) => sum + row[field], 0) / values.length;
  }

  /**
   * Empty response structure
   */
  getEmptyResponse() {
    return {
      summary: {
        totalSpend: 0,
        totalRevenue: 0,
        totalPurchases: 0,
        totalImpressions: 0,
        totalClicks: 0,
        avgFrequency: 0,
        lookbackPeriod: '4weeks'
      },
      weeklyBreakdown: [],
      trends: null,
      campaigns: [],
      rawData: []
    };
  }
}

module.exports = new WeeklyAggregationService();
