/* ============================================
   Empire Flippers Scout - Frontend Application
   ============================================ */

(function () {
  'use strict';

  // --------------- State ---------------
  const state = {
    listings: [],
    config: { niches: [], monetizations: [] },
    filters: {
      status: 'for_sale',
      priceMin: null, priceMax: null,
      profitMin: null, profitMax: null,
      niches: [], monetizations: [],
      sortBy: 'listing_number', sortOrder: 'DESC',
      sba: false, trademark: false,
    },
    pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
    expandedRow: null,
    // Dashboard data
    dashboardData: null, // { forSale: [], sold: [], fetchedAt }
    marketData: null,     // computed from dashboardData
    // Favorites (persisted in localStorage)
    favorites: loadFavorites(),
    // Comparison (session only)
    compareIds: new Set(),
    // Chart instances
    charts: {},
  };

  // --------------- DOM refs ---------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    // Stats
    statsTotal: $('#stat-total'),
    statsAvgPrice: $('#stat-avg-price'),
    statsAvgProfit: $('#stat-avg-profit'),
    statsAvgMultiple: $('#stat-avg-multiple'),
    // Table
    listingsBody: $('#listings-body'),
    tableContainer: $('#table-container'),
    loadingOverlay: $('#loading-overlay'),
    loadingText: $('#loading-text'),
    emptyState: $('#empty-state'),
    pagination: $('#pagination'),
    selectAllCompare: $('#select-all-compare'),
    // Filters
    filterPriceMin: $('#filter-price-min'),
    filterPriceMax: $('#filter-price-max'),
    filterProfitMin: $('#filter-profit-min'),
    filterProfitMax: $('#filter-profit-max'),
    filterSortBy: $('#filter-sort-by'),
    filterSortOrder: $('#filter-sort-order'),
    filterSba: $('#filter-sba'),
    filterTrademark: $('#filter-trademark'),
    nicheTrigger: $('#niche-trigger'),
    nicheDropdown: $('#niche-dropdown'),
    monetizationTrigger: $('#monetization-trigger'),
    monetizationDropdown: $('#monetization-dropdown'),
    btnApply: $('#btn-apply-filters'),
    btnReset: $('#btn-reset-filters'),
    btnToggleFilters: $('#btn-toggle-filters'),
    filterBody: $('#filter-body'),
    // Header
    btnLoadDashboard: $('#btn-load-dashboard'),
    btnLoadDashboard2: $('#btn-load-dashboard-2'),
    btnExportCsv: $('#btn-export-csv'),
    favCountBadge: $('#fav-count-badge'),
    compareCountBadge: $('#compare-count-badge'),
    // Dashboard
    dashboardPrompt: $('#dashboard-prompt'),
    dashboard: $('#dashboard'),
    dashboardLoading: $('#dashboard-loading'),
    dashboardLoadingText: $('#dashboard-loading-text'),
    dashActiveCount: $('#dash-active-count'),
    dashSoldCount: $('#dash-sold-count'),
    dashAvgMultiple: $('#dash-avg-multiple'),
    dashAvgSoldMultiple: $('#dash-avg-sold-multiple'),
    dashBestScore: $('#dash-best-score'),
    opportunitiesGrid: $('#opportunities-grid'),
    trendsGrid: $('#trends-grid'),
    wealthPicks: $('#wealth-picks'),
    // Forecasting
    flipOpportunities: $('#flip-opportunities'),
    roiProjectionsTable: $('#roi-projections-table'),
    saleProbabilityGrid: $('#sale-probability-grid'),
    nicheGrowthGrid: $('#niche-growth-grid'),
    riskAssessmentTable: $('#risk-assessment-table'),
    passiveIncomeGrid: $('#passive-income-grid'),
    undervaluedTable: $('#undervalued-table'),
    arbitrageGrid: $('#arbitrage-grid'),
    compsGrid: $('#comps-grid'),
    daysOnMarketTable: $('#days-on-market-table'),
    budgetTiers: $('#budget-tiers'),
    buildVsBuyGrid: $('#build-vs-buy-grid'),
    moatTable: $('#moat-table'),
    replicableTable: $('#replicable-table'),
    // New analysis
    marketSignalContainer: $('#market-signal-container'),
    negotiationContainer: $('#negotiation-container'),
    motivatedSellersTable: $('#motivated-sellers-table'),
    portfolioDiversification: $('#portfolio-diversification'),
    // Deep dive
    deepDiveOverlay: $('#deep-dive-overlay'),
    deepDiveBody: $('#deep-dive-body'),
    deepDiveSearch: $('#deep-dive-search'),
    deepDiveSelect: $('#deep-dive-select'),
    deepDiveClose: $('#deep-dive-close'),
    tocOpenDeepDive: $('#toc-open-deep-dive'),
    // Favorites
    favoritesGrid: $('#favorites-grid'),
    favoritesEmpty: $('#favorites-empty'),
    btnExportFavorites: $('#btn-export-favorites'),
    btnClearFavorites: $('#btn-clear-favorites'),
    // Compare
    compareContainer: $('#compare-container'),
    compareEmpty: $('#compare-empty'),
    compareChartContainer: $('#compare-chart-container'),
    btnClearCompare: $('#btn-clear-compare'),
    // Modal
    modalBackdrop: $('#modal-backdrop'),
    modalTitle: $('#modal-title'),
    modalBody: $('#modal-body'),
    modalClose: $('#modal-close'),
    // Toast
    toastContainer: $('#toast-container'),
  };

  // =====================================================================
  //  INDEXEDDB PERSISTENCE
  // =====================================================================
  const DB_NAME = 'ef-scout-db';
  const DB_VERSION = 1;
  const STORE_NAME = 'dashboard';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(key, value) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });
    } catch (err) {
      console.warn('IndexedDB put failed:', err);
    }
  }

  async function dbGet(key) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => { db.close(); resolve(req.result); };
        req.onerror = () => { db.close(); reject(req.error); };
      });
    } catch (err) {
      console.warn('IndexedDB get failed:', err);
      return null;
    }
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // =====================================================================
  //  FORMATTERS
  // =====================================================================
  function formatUSD(n) {
    if (n == null || isNaN(n)) return '--';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  }

  function formatUSDFull(n) {
    if (n == null || isNaN(n)) return '--';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  function formatMultiple(n) {
    if (n == null || isNaN(n) || !isFinite(n)) return '--';
    return n.toFixed(1) + 'x';
  }

  function formatPercent(n) {
    if (n == null || isNaN(n) || !isFinite(n)) return '--';
    return n.toFixed(1) + '%';
  }

  function formatDate(d) {
    if (!d) return '--';
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // =====================================================================
  //  STATISTICAL HELPERS (outlier-resistant)
  // =====================================================================

  function removeOutliers(arr) {
    if (arr.length < 4) return arr;
    const sorted = [...arr].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    return arr.filter(v => v >= lower && v <= upper);
  }

  function robustAvg(arr) {
    const cleaned = removeOutliers(arr);
    if (!cleaned.length) return 0;
    return cleaned.reduce((a, b) => a + b, 0) / cleaned.length;
  }

  function median(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // =====================================================================
  //  HELPERS
  // =====================================================================
  function getNicheNames(listing) {
    const raw = listing.niches || [];
    if (Array.isArray(raw)) return raw.map(n => typeof n === 'object' ? n.niche : n).filter(Boolean);
    if (typeof raw === 'string') return raw.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  }

  function getMonetizationNames(listing) {
    const raw = listing.monetizations || [];
    if (Array.isArray(raw)) return raw.map(m => typeof m === 'object' ? m.monetization : m).filter(Boolean);
    return [String(raw || '')].filter(Boolean);
  }

  function getAgeMonths(listing) {
    if (!listing.first_made_money_at) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(listing.first_made_money_at).getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  }

  function getBusinessAge(listing) {
    const months = getAgeMonths(listing);
    if (months === 0) return '--';
    return months >= 12 ? `${(months / 12).toFixed(1)}y` : `${months}mo`;
  }

  // =====================================================================
  //  TOAST
  // =====================================================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // =====================================================================
  //  API
  // =====================================================================
  async function apiGet(url) {
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`API error ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  async function fetchConfig() {
    try {
      const raw = await apiGet('/api/config');
      const data = raw.data || raw;
      state.config.niches = data.listing_niches || data.niches || [];
      state.config.monetizations = data.listing_monetizations || data.monetizations || [];
      populateMultiSelect(dom.nicheDropdown, dom.nicheTrigger, state.config.niches, 'niche', 'All Niches');
      populateMultiSelect(dom.monetizationDropdown, dom.monetizationTrigger, state.config.monetizations, 'monetization', 'All Types');
    } catch (err) {
      console.warn('Could not load config:', err);
    }
  }

  function buildQueryString() {
    const f = state.filters;
    const p = state.pagination;
    const params = new URLSearchParams();
    params.set('page', p.page);
    params.set('limit', p.limit);
    if (f.status === 'for_sale') params.set('listing_status', 'For Sale');
    else if (f.status === 'sold') params.set('listing_status', 'Sold');
    if (f.priceMin) params.set('listing_price_from', f.priceMin);
    if (f.priceMax) params.set('listing_price_to', f.priceMax);
    if (f.profitMin) params.set('average_monthly_net_profit_from', f.profitMin);
    if (f.profitMax) params.set('average_monthly_net_profit_to', f.profitMax);
    if (f.niches.length) params.set('niches', f.niches.join('||'));
    if (f.monetizations.length) params.set('monetizations', f.monetizations.join('||'));
    if (f.sortBy) params.set('sort', f.sortBy);
    if (f.sortOrder) params.set('order', f.sortOrder);
    if (f.sba) params.set('sba_financing_approved', '1');
    if (f.trademark) params.set('has_trademark', '1');
    return params.toString();
  }

  async function fetchListings() {
    showLoading('Loading listings...');
    try {
      const qs = buildQueryString();
      const raw = await apiGet(`/api/listings?${qs}`);
      const data = raw.data || raw;
      state.listings = data.listings || [];
      state.pagination.total = data.count || data.total || state.listings.length;
      state.pagination.totalPages = data.pages || Math.ceil(state.pagination.total / state.pagination.limit);
      state.pagination.page = data.page || state.pagination.page;
      renderListings();
      renderPagination();
      updateStats();
    } catch (err) {
      console.error('Fetch listings error:', err);
      showToast('Failed to load listings.', 'error');
      state.listings = [];
      renderListings();
    } finally {
      hideLoading();
    }
  }

  // =====================================================================
  //  DEAL SCORING ALGORITHM
  // =====================================================================
  function computeMarketData(forSale, sold) {
    const md = {
      nicheSoldCount: {},
      nicheActiveCount: {},
      nicheAvgMultiple: {},
      nicheAvgProfit: {},
      nicheAvgRevenue: {},
      nicheAvgPrice: {},
      nicheTotalListings: {},
      monetizationAvgMultiple: {},
      monetizationAvgProfit: {},
      monetizationAvgRevenue: {},
      monetizationAvgPrice: {},
      monetizationSoldCount: {},
      monetizationActiveCount: {},
      monetizationTotalListings: {},
      // Full accumulator data for leaderboard
      nicheAcc: {},
      monAcc: {},
    };

    const allListings = [...forSale, ...sold];

    allListings.forEach(l => {
      const niches = getNicheNames(l);
      const mons = getMonetizationNames(l);
      const multiple = parseFloat(l.listing_multiple || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const revenue = parseFloat(l.average_monthly_gross_revenue || 0);
      const price = parseFloat(l.listing_price || 0);
      const isSold = (l.listing_status || '').toLowerCase().includes('sold');
      const hours = l.hours_worked_per_week;

      niches.forEach(n => {
        md.nicheTotalListings[n] = (md.nicheTotalListings[n] || 0) + 1;
        if (isSold) md.nicheSoldCount[n] = (md.nicheSoldCount[n] || 0) + 1;
        else md.nicheActiveCount[n] = (md.nicheActiveCount[n] || 0) + 1;

        if (!md.nicheAcc[n]) md.nicheAcc[n] = { profit: [], revenue: [], multiple: [], price: [], hours: [] };
        if (profit > 0) md.nicheAcc[n].profit.push(profit);
        if (revenue > 0) md.nicheAcc[n].revenue.push(revenue);
        if (multiple > 0) md.nicheAcc[n].multiple.push(multiple);
        if (price > 0) md.nicheAcc[n].price.push(price);
        if (hours != null && hours > 0) md.nicheAcc[n].hours.push(hours);
      });

      mons.forEach(m => {
        md.monetizationTotalListings[m] = (md.monetizationTotalListings[m] || 0) + 1;
        if (isSold) md.monetizationSoldCount[m] = (md.monetizationSoldCount[m] || 0) + 1;
        else md.monetizationActiveCount[m] = (md.monetizationActiveCount[m] || 0) + 1;

        if (!md.monAcc[m]) md.monAcc[m] = { profit: [], revenue: [], multiple: [], price: [], hours: [] };
        if (profit > 0) md.monAcc[m].profit.push(profit);
        if (revenue > 0) md.monAcc[m].revenue.push(revenue);
        if (multiple > 0) md.monAcc[m].multiple.push(multiple);
        if (price > 0) md.monAcc[m].price.push(price);
        if (hours != null && hours > 0) md.monAcc[m].hours.push(hours);
      });
    });

    // Use median for price & multiple (heavily skewed), robustAvg for profit/revenue
    for (const [k, v] of Object.entries(md.nicheAcc)) {
      md.nicheAvgMultiple[k] = median(v.multiple);
      md.nicheAvgProfit[k] = robustAvg(v.profit);
      md.nicheAvgRevenue[k] = robustAvg(v.revenue);
      md.nicheAvgPrice[k] = median(v.price);
    }
    for (const [k, v] of Object.entries(md.monAcc)) {
      md.monetizationAvgMultiple[k] = median(v.multiple);
      md.monetizationAvgProfit[k] = robustAvg(v.profit);
      md.monetizationAvgRevenue[k] = robustAvg(v.revenue);
      md.monetizationAvgPrice[k] = median(v.price);
    }

    return md;
  }

  function calculateDealScore(listing, md) {
    let score = 0;
    const breakdown = {};

    const multiple = parseFloat(listing.listing_multiple || 0);
    const revenue = parseFloat(listing.average_monthly_gross_revenue || 0);
    const profit = parseFloat(listing.average_monthly_net_profit || 0);
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const ageMonths = getAgeMonths(listing);
    const hours = listing.hours_worked_per_week;
    const niches = getNicheNames(listing);

    // 1. ROI Score (0-25): higher annual ROI = better
    if (multiple > 0) {
      const annualROI = (12 / multiple) * 100;
      breakdown.roi = Math.min(25, annualROI * 0.75);
    } else {
      breakdown.roi = 0;
    }
    score += breakdown.roi;

    // 2. Profit Margin (0-20): higher margin = more efficient
    breakdown.margin = Math.min(20, margin * 0.4);
    score += breakdown.margin;

    // 3. Business Age / Maturity (0-15): older = more stable
    breakdown.age = Math.min(15, ageMonths * 0.4);
    score += breakdown.age;

    // 4. Work Efficiency (0-10): lower hours = more passive income
    if (hours != null && hours >= 0) {
      breakdown.efficiency = Math.max(0, 10 - hours * 0.25);
    } else {
      breakdown.efficiency = 5; // neutral if unknown
    }
    score += breakdown.efficiency;

    // 5. SBA Financing (0-5)
    breakdown.sba = listing.sba_financing_approved ? 5 : 0;
    score += breakdown.sba;

    // 6. Trademark (0-3)
    breakdown.trademark = listing.has_trademark ? 3 : 0;
    score += breakdown.trademark;

    // 7. Niche Momentum (0-12): niches with high sold volume = high demand
    if (md && niches.length) {
      const maxSold = Math.max(...Object.values(md.nicheSoldCount), 1);
      const avgMomentum = niches.reduce((sum, n) => sum + ((md.nicheSoldCount[n] || 0) / maxSold), 0) / niches.length;
      breakdown.momentum = avgMomentum * 12;
    } else {
      breakdown.momentum = 0;
    }
    score += breakdown.momentum;

    // 8. Multiple Discount vs Market (0-10): priced below avg for niche
    if (md && multiple > 0 && niches.length) {
      const avgNicheMultiple = niches.reduce((s, n) => s + (md.nicheAvgMultiple[n] || 0), 0) / niches.length;
      if (avgNicheMultiple > 0 && multiple < avgNicheMultiple) {
        const discount = ((avgNicheMultiple - multiple) / avgNicheMultiple) * 100;
        breakdown.discount = Math.min(10, discount * 0.5);
      } else {
        breakdown.discount = 0;
      }
    } else {
      breakdown.discount = 0;
    }
    score += breakdown.discount;

    return { score: Math.min(100, Math.round(score)), breakdown };
  }

  function getScoreClass(score) {
    if (score >= 75) return 'score-excellent';
    if (score >= 55) return 'score-great';
    if (score >= 35) return 'score-good';
    return 'score-fair';
  }

  function getScoreColor(score) {
    if (score >= 75) return '#4ade80';
    if (score >= 55) return '#22c55e';
    if (score >= 35) return '#d29922';
    return '#6a737d';
  }

  // =====================================================================
  //  FAVORITES (localStorage)
  // =====================================================================
  function loadFavorites() {
    try {
      const raw = localStorage.getItem('ef-scout-favorites');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function saveFavorites() {
    localStorage.setItem('ef-scout-favorites', JSON.stringify(state.favorites));
    updateFavBadge();
  }

  function toggleFavorite(listing) {
    const id = String(listing.listing_number || listing.id);
    if (state.favorites[id]) {
      delete state.favorites[id];
    } else {
      state.favorites[id] = {
        id,
        listing_number: listing.listing_number,
        listing_price: listing.listing_price,
        average_monthly_net_profit: listing.average_monthly_net_profit,
        average_monthly_gross_revenue: listing.average_monthly_gross_revenue,
        listing_multiple: listing.listing_multiple,
        niches: listing.niches,
        monetizations: listing.monetizations,
        listing_status: listing.listing_status,
        hours_worked_per_week: listing.hours_worked_per_week,
        first_made_money_at: listing.first_made_money_at,
        first_listed_at: listing.first_listed_at,
        created_at: listing.created_at,
        sba_financing_approved: listing.sba_financing_approved,
        has_trademark: listing.has_trademark,
        profit_margin: listing.profit_margin,
        savedAt: new Date().toISOString(),
      };
    }
    saveFavorites();
  }

  function isFavorited(listing) {
    return !!state.favorites[String(listing.listing_number || listing.id)];
  }

  function updateFavBadge() {
    const count = Object.keys(state.favorites).length;
    dom.favCountBadge.textContent = count;
  }

  // =====================================================================
  //  COMPARISON
  // =====================================================================
  function toggleCompare(listing) {
    const id = String(listing.listing_number || listing.id);
    if (state.compareIds.has(id)) {
      state.compareIds.delete(id);
    } else {
      if (state.compareIds.size >= 5) {
        showToast('Maximum 5 listings for comparison.', 'error');
        return false;
      }
      state.compareIds.add(id);
    }
    updateCompareBadge();
    return true;
  }

  function updateCompareBadge() {
    dom.compareCountBadge.textContent = state.compareIds.size;
  }

  // =====================================================================
  //  LOADING
  // =====================================================================
  function showLoading(text) {
    dom.loadingText.textContent = text || 'Loading...';
    dom.loadingOverlay.classList.remove('hidden');
  }

  function hideLoading() {
    dom.loadingOverlay.classList.add('hidden');
  }

  // =====================================================================
  //  RENDER LISTINGS TABLE
  // =====================================================================
  function renderListings() {
    const listings = state.listings;
    dom.listingsBody.innerHTML = '';
    state.expandedRow = null;

    if (!listings || listings.length === 0) {
      dom.emptyState.classList.remove('hidden');
      return;
    }
    dom.emptyState.classList.add('hidden');

    listings.forEach(listing => {
      const tr = document.createElement('tr');
      const listingNum = listing.listing_number || listing.id;
      tr.dataset.id = listingNum;

      const price = parseFloat(listing.listing_price || 0);
      const monthlyProfit = parseFloat(listing.average_monthly_net_profit || 0);
      const monthlyRevenue = parseFloat(listing.average_monthly_gross_revenue || 0);
      const displayMultiple = listing.listing_multiple || null;
      const profitMargin = listing.profit_margin != null ? listing.profit_margin : (monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue * 100) : null);
      const nicheArr = getNicheNames(listing);
      const monetization = getMonetizationNames(listing).join(', ') || '--';
      const status = (listing.listing_status || '').toLowerCase().replace(/\s+/g, '_');
      const isForSale = status === 'for_sale';
      const age = getBusinessAge(listing);
      const hours = listing.hours_worked_per_week;
      const created = listing.first_listed_at || listing.created_at;

      // Deal score
      const { score } = calculateDealScore(listing, state.marketData);
      const scoreClass = getScoreClass(score);

      const isFav = isFavorited(listing);
      const isCompared = state.compareIds.has(String(listingNum));

      tr.innerHTML = `
        <td class="th-check"><input type="checkbox" class="compare-cb" data-id="${escapeHtml(String(listingNum))}" ${isCompared ? 'checked' : ''}></td>
        <td class="th-fav"><button class="fav-btn ${isFav ? 'favorited' : ''}" data-id="${escapeHtml(String(listingNum))}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">${isFav ? '\u2605' : '\u2606'}</button></td>
        <td class="listing-number">
          <a href="https://empireflippers.com/listing/${escapeHtml(String(listingNum))}" target="_blank" rel="noopener">#${escapeHtml(String(listingNum))}</a>
        </td>
        <td>
          <div class="niche-tags">
            ${nicheArr.length ? nicheArr.map(n => `<span class="niche-tag">${escapeHtml(n)}</span>`).join('') : '<span class="niche-tag">--</span>'}
          </div>
        </td>
        <td><span class="monetization-badge">${escapeHtml(String(monetization))}</span></td>
        <td class="money">${formatUSD(price)}</td>
        <td class="money">${formatUSD(monthlyRevenue)}</td>
        <td class="money money-profit">${formatUSD(monthlyProfit)}</td>
        <td class="multiple">${formatMultiple(displayMultiple)}</td>
        <td class="roi">${profitMargin != null ? formatPercent(profitMargin) : '--'}</td>
        <td>${escapeHtml(String(age))}</td>
        <td>${hours != null ? hours + 'h' : '--'}</td>
        <td class="deal-score-cell"><span class="deal-score-mini ${scoreClass}">${score}</span></td>
        <td><span class="status-badge ${isForSale ? 'status-for-sale' : 'status-sold'}">${isForSale ? 'For Sale' : 'Sold'}</span></td>
        <td class="date-cell">${formatDate(created)}</td>
        <td><button class="btn btn-secondary btn-sm btn-details" data-listing-id="${escapeHtml(String(listingNum))}">Details</button></td>
      `;

      // Event: Details
      tr.querySelector('.btn-details').addEventListener('click', e => {
        e.stopPropagation();
        toggleDetailRow(listing, tr);
      });

      // Event: Favorite
      tr.querySelector('.fav-btn').addEventListener('click', e => {
        e.stopPropagation();
        toggleFavorite(listing);
        const btn = e.currentTarget;
        const nowFav = isFavorited(listing);
        btn.classList.toggle('favorited', nowFav);
        btn.textContent = nowFav ? '\u2605' : '\u2606';
        btn.title = nowFav ? 'Remove from favorites' : 'Add to favorites';
      });

      // Event: Compare checkbox
      tr.querySelector('.compare-cb').addEventListener('change', e => {
        e.stopPropagation();
        const ok = toggleCompare(listing);
        if (!ok) e.target.checked = false;
      });

      dom.listingsBody.appendChild(tr);
    });
  }

  // =====================================================================
  //  DETAIL ROW
  // =====================================================================
  function toggleDetailRow(listing, parentTr) {
    const existingId = parentTr.dataset.id;
    const existing = dom.listingsBody.querySelector('.detail-row');
    if (existing) {
      const wasForSame = existing.dataset.parentId === existingId;
      existing.remove();
      const prevTr = dom.listingsBody.querySelector(`tr[data-id="${existingId}"]`);
      if (prevTr) prevTr.classList.remove('expanded');
      if (wasForSame) { state.expandedRow = null; return; }
    }

    parentTr.classList.add('expanded');
    state.expandedRow = existingId;

    const detailTr = document.createElement('tr');
    detailTr.className = 'detail-row';
    detailTr.dataset.parentId = existingId;

    const td = document.createElement('td');
    td.setAttribute('colspan', '16');
    td.innerHTML = `<div class="detail-content">${buildDetailContent(listing)}</div>`;
    detailTr.appendChild(td);
    parentTr.after(detailTr);

    // Bind deep dive button in detail row
    const ddBtn = detailTr.querySelector('.detail-deep-dive-btn');
    if (ddBtn) {
      ddBtn.addEventListener('click', () => {
        openListingDeepDive(ddBtn.dataset.num);
      });
    }
  }

  function buildDetailContent(listing) {
    const financial = [];
    const business = [];
    const meta = [];
    const other = [];

    const financialKeys = ['price', 'listing_price', 'monthly_net_profit', 'average_monthly_net_profit', 'annual_net_profit', 'monthly_revenue', 'annual_revenue', 'monthly_gross_profit', 'listing_multiple', 'revenue_multiple', 'asking_price', 'sale_price'];
    const businessKeys = ['niche', 'niches', 'monetization', 'monetization_type', 'business_age', 'age', 'months_old', 'url', 'site_url', 'domain', 'page_views', 'monthly_page_views', 'uniques', 'monthly_uniques', 'sba_financing', 'has_trademark', 'trademark'];
    const metaKeys = ['listing_number', 'id', 'status', 'created_at', 'date_listed', 'created', 'updated_at', 'sold_date', 'seller_interview_url'];
    const moneyFields = new Set(financialKeys);
    const skipKeys = new Set(['__v', '_id']);

    for (const [key, value] of Object.entries(listing)) {
      if (skipKeys.has(key) || value === null || value === undefined || value === '') continue;
      const item = { key, value };
      if (financialKeys.includes(key)) financial.push(item);
      else if (businessKeys.includes(key)) business.push(item);
      else if (metaKeys.includes(key)) meta.push(item);
      else other.push(item);
    }

    function renderSection(title, items) {
      if (!items.length) return '';
      return `
        <div class="detail-section">
          <h4>${title}</h4>
          ${items.map(item => {
            const label = item.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            let val = item.value;
            const isMoneyField = moneyFields.has(item.key);
            if (isMoneyField && typeof val === 'number') val = formatUSDFull(val);
            else if (typeof val === 'boolean') val = val ? 'Yes' : 'No';
            else if (item.key.includes('url') && typeof val === 'string' && val.startsWith('http')) {
              return `<div class="detail-row-item"><span class="label">${escapeHtml(label)}</span><span class="value text-value"><a href="${escapeHtml(val)}" target="_blank" rel="noopener">${escapeHtml(val)}</a></span></div>`;
            }
            return `<div class="detail-row-item"><span class="label">${escapeHtml(label)}</span><span class="value${isMoneyField ? '' : ' text-value'}">${escapeHtml(String(val))}</span></div>`;
          }).join('')}
        </div>
      `;
    }

    // Add deal score breakdown
    const { score, breakdown } = calculateDealScore(listing, state.marketData);
    const scoreItems = [
      { key: 'Overall Score', value: `${score} / 100` },
      { key: 'ROI Score', value: `${breakdown.roi.toFixed(1)} / 25` },
      { key: 'Margin Score', value: `${breakdown.margin.toFixed(1)} / 20` },
      { key: 'Age/Maturity', value: `${breakdown.age.toFixed(1)} / 15` },
      { key: 'Work Efficiency', value: `${breakdown.efficiency.toFixed(1)} / 10` },
      { key: 'Niche Momentum', value: `${breakdown.momentum.toFixed(1)} / 12` },
      { key: 'Price Discount', value: `${breakdown.discount.toFixed(1)} / 10` },
      { key: 'SBA Bonus', value: `${breakdown.sba} / 5` },
      { key: 'Trademark Bonus', value: `${breakdown.trademark} / 3` },
    ];

    const listingNum = listing.listing_number || listing.id;
    return `
      <div class="detail-grid">
        <div class="detail-section">
          <h4>Deal Score Breakdown</h4>
          ${scoreItems.map(s => `<div class="detail-row-item"><span class="label">${s.key}</span><span class="value">${s.value}</span></div>`).join('')}
          <div style="margin-top:10px"><button class="btn btn-sm btn-accent detail-deep-dive-btn" data-num="${escapeHtml(String(listingNum))}">Full Deep Dive Analysis</button></div>
        </div>
        ${renderSection('Financial', financial)}
        ${renderSection('Business', business)}
        ${renderSection('Listing Info', meta)}
        ${renderSection('Other', other)}
      </div>
    `;
  }

  // =====================================================================
  //  STATS BAR
  // =====================================================================
  function updateStats() {
    const listings = state.listings;
    dom.statsTotal.textContent = (state.pagination.total || listings.length).toLocaleString();

    if (!listings.length) {
      dom.statsAvgPrice.textContent = '--';
      dom.statsAvgProfit.textContent = '--';
      dom.statsAvgMultiple.textContent = '--';
      return;
    }

    let sumPrice = 0, sumProfit = 0, sumMultiple = 0, countMultiple = 0;
    listings.forEach(l => {
      sumPrice += parseFloat(l.listing_price || 0);
      sumProfit += parseFloat(l.average_monthly_net_profit || 0);
      const m = parseFloat(l.listing_multiple || 0);
      if (m > 0) { sumMultiple += m; countMultiple++; }
    });

    dom.statsAvgPrice.textContent = formatUSD(sumPrice / listings.length);
    dom.statsAvgProfit.textContent = formatUSD(sumProfit / listings.length);
    dom.statsAvgMultiple.textContent = countMultiple > 0 ? formatMultiple(sumMultiple / countMultiple) : '--';
  }

  // =====================================================================
  //  PAGINATION
  // =====================================================================
  function renderPagination() {
    const { page, totalPages, total, limit } = state.pagination;
    dom.pagination.innerHTML = '';
    if (totalPages <= 1) return;

    const prevBtn = createPageBtn('\u2190 Prev', page <= 1);
    prevBtn.addEventListener('click', () => goToPage(page - 1));
    dom.pagination.appendChild(prevBtn);

    computePageRange(page, totalPages).forEach(p => {
      if (p === '...') {
        const dots = document.createElement('span');
        dots.className = 'page-info';
        dots.textContent = '...';
        dom.pagination.appendChild(dots);
      } else {
        const btn = createPageBtn(String(p), false, p === page);
        btn.addEventListener('click', () => goToPage(p));
        dom.pagination.appendChild(btn);
      }
    });

    const nextBtn = createPageBtn('Next \u2192', page >= totalPages);
    nextBtn.addEventListener('click', () => goToPage(page + 1));
    dom.pagination.appendChild(nextBtn);

    const info = document.createElement('span');
    info.className = 'page-info';
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    info.textContent = `${start}-${end} of ${total}`;
    dom.pagination.appendChild(info);
  }

  function createPageBtn(text, disabled, active) {
    const btn = document.createElement('button');
    btn.className = `page-btn${active ? ' active' : ''}`;
    btn.textContent = text;
    btn.disabled = disabled;
    return btn;
  }

  function computePageRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [];
    if (current <= 4) { for (let i = 1; i <= 5; i++) pages.push(i); pages.push('...', total); }
    else if (current >= total - 3) { pages.push(1, '...'); for (let i = total - 4; i <= total; i++) pages.push(i); }
    else { pages.push(1, '...', current - 1, current, current + 1, '...', total); }
    return pages;
  }

  function goToPage(p) {
    if (p < 1 || p > state.pagination.totalPages) return;
    state.pagination.page = p;
    fetchListings();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // =====================================================================
  //  FILTERS
  // =====================================================================
  function readFiltersFromUI() {
    const f = state.filters;
    f.priceMin = dom.filterPriceMin.value ? Number(dom.filterPriceMin.value) : null;
    f.priceMax = dom.filterPriceMax.value ? Number(dom.filterPriceMax.value) : null;
    f.profitMin = dom.filterProfitMin.value ? Number(dom.filterProfitMin.value) : null;
    f.profitMax = dom.filterProfitMax.value ? Number(dom.filterProfitMax.value) : null;
    f.sortBy = dom.filterSortBy.value;
    f.sortOrder = dom.filterSortOrder.value;
    f.sba = dom.filterSba.checked;
    f.trademark = dom.filterTrademark.checked;
    f.niches = getMultiSelectValues('niche');
    f.monetizations = getMultiSelectValues('monetization');
  }

  function resetFilters() {
    state.filters = {
      status: 'for_sale', priceMin: null, priceMax: null,
      profitMin: null, profitMax: null, niches: [], monetizations: [],
      sortBy: 'listing_number', sortOrder: 'DESC', sba: false, trademark: false,
    };
    dom.filterPriceMin.value = '';
    dom.filterPriceMax.value = '';
    dom.filterProfitMin.value = '';
    dom.filterProfitMax.value = '';
    dom.filterSortBy.value = 'listing_number';
    dom.filterSortOrder.value = 'DESC';
    dom.filterSba.checked = false;
    dom.filterTrademark.checked = false;
    $$('.toggle-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.status === 'for_sale'));
    $$('.multi-select-dropdown input[type="checkbox"]').forEach(cb => (cb.checked = false));
    dom.nicheTrigger.querySelector('.multi-select-text').textContent = 'All Niches';
    dom.nicheTrigger.querySelector('.multi-select-text').classList.remove('has-selection');
    dom.monetizationTrigger.querySelector('.multi-select-text').textContent = 'All Types';
    dom.monetizationTrigger.querySelector('.multi-select-text').classList.remove('has-selection');
    state.pagination.page = 1;
    fetchListings();
  }

  // =====================================================================
  //  BROWSE BY NICHE / MONETIZATION (from dashboard)
  // =====================================================================
  function browseByNiche(nicheName) {
    // Reset filters, set niche, switch to listings tab, fetch
    resetFiltersQuiet();
    state.filters.niches = [nicheName];
    state.filters.status = 'all';
    applyFiltersToUI();
    state.pagination.page = 1;
    switchTab('listings');
    fetchListings();
    showToast(`Filtering by niche: ${nicheName}`, 'success');
  }

  function browseByMonetization(monName) {
    resetFiltersQuiet();
    state.filters.monetizations = [monName];
    state.filters.status = 'all';
    applyFiltersToUI();
    state.pagination.page = 1;
    switchTab('listings');
    fetchListings();
    showToast(`Filtering by monetization: ${monName}`, 'success');
  }

  // Reset state without fetching or switching tabs
  function resetFiltersQuiet() {
    state.filters = {
      status: 'for_sale', priceMin: null, priceMax: null,
      profitMin: null, profitMax: null, niches: [], monetizations: [],
      sortBy: 'listing_number', sortOrder: 'DESC', sba: false, trademark: false,
    };
  }

  // Push current filter state into the UI controls
  function applyFiltersToUI() {
    const f = state.filters;
    dom.filterPriceMin.value = f.priceMin || '';
    dom.filterPriceMax.value = f.priceMax || '';
    dom.filterProfitMin.value = f.profitMin || '';
    dom.filterProfitMax.value = f.profitMax || '';
    dom.filterSortBy.value = f.sortBy;
    dom.filterSortOrder.value = f.sortOrder;
    dom.filterSba.checked = f.sba;
    dom.filterTrademark.checked = f.trademark;

    // Status toggles
    $$('.toggle-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.status === f.status));

    // Niche multi-select
    $$('.multi-select-dropdown input[data-prefix="niche"]').forEach(cb => {
      cb.checked = f.niches.includes(cb.value);
    });
    const nicheTxt = dom.nicheTrigger.querySelector('.multi-select-text');
    if (f.niches.length) {
      nicheTxt.textContent = f.niches.length <= 2 ? f.niches.join(', ') : `${f.niches.length} selected`;
      nicheTxt.classList.add('has-selection');
    } else {
      nicheTxt.textContent = 'All Niches';
      nicheTxt.classList.remove('has-selection');
    }

    // Monetization multi-select
    $$('.multi-select-dropdown input[data-prefix="monetization"]').forEach(cb => {
      cb.checked = f.monetizations.includes(cb.value);
    });
    const monTxt = dom.monetizationTrigger.querySelector('.multi-select-text');
    if (f.monetizations.length) {
      monTxt.textContent = f.monetizations.length <= 2 ? f.monetizations.join(', ') : `${f.monetizations.length} selected`;
      monTxt.classList.add('has-selection');
    } else {
      monTxt.textContent = 'All Types';
      monTxt.classList.remove('has-selection');
    }
  }

  // =====================================================================
  //  MULTI-SELECT
  // =====================================================================
  function populateMultiSelect(dropdown, trigger, items, prefix, defaultText) {
    dropdown.innerHTML = '';
    items.forEach(item => {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = item;
      cb.dataset.prefix = prefix;
      const span = document.createElement('span');
      span.textContent = item;
      label.appendChild(cb);
      label.appendChild(span);
      cb.addEventListener('change', () => updateMultiSelectLabel(dropdown, trigger, prefix, defaultText));
      dropdown.appendChild(label);
    });

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = !dropdown.classList.contains('hidden');
      closeAllDropdowns();
      if (!isOpen) dropdown.classList.remove('hidden');
    });
  }

  function updateMultiSelectLabel(dropdown, trigger, prefix, defaultText) {
    const checked = dropdown.querySelectorAll('input:checked');
    const textEl = trigger.querySelector('.multi-select-text');
    if (checked.length === 0) {
      textEl.textContent = defaultText;
      textEl.classList.remove('has-selection');
    } else if (checked.length <= 2) {
      textEl.textContent = Array.from(checked).map(c => c.value).join(', ');
      textEl.classList.add('has-selection');
    } else {
      textEl.textContent = `${checked.length} selected`;
      textEl.classList.add('has-selection');
    }
  }

  function getMultiSelectValues(prefix) {
    return Array.from($$(`.multi-select-dropdown input[data-prefix="${prefix}"]:checked`)).map(c => c.value);
  }

  function closeAllDropdowns() {
    $$('.multi-select-dropdown').forEach(d => d.classList.add('hidden'));
  }

  // =====================================================================
  //  COLUMN SORT
  // =====================================================================
  function setupColumnSort() {
    $$('.th-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (state.filters.sortBy === field) {
          state.filters.sortOrder = state.filters.sortOrder === 'ASC' ? 'DESC' : 'ASC';
        } else {
          state.filters.sortBy = field;
          state.filters.sortOrder = 'DESC';
        }
        dom.filterSortBy.value = state.filters.sortBy;
        dom.filterSortOrder.value = state.filters.sortOrder;
        updateSortIndicators();
        state.pagination.page = 1;
        fetchListings();
      });
    });
  }

  function updateSortIndicators() {
    $$('.th-sortable').forEach(th => {
      th.classList.remove('sort-active', 'sort-asc', 'sort-desc');
      if (th.dataset.sort === state.filters.sortBy) {
        th.classList.add('sort-active');
        th.classList.add(state.filters.sortOrder === 'ASC' ? 'sort-asc' : 'sort-desc');
      }
    });
  }

  // =====================================================================
  //  CSV EXPORT
  // =====================================================================
  function exportCSV(listings, filename) {
    if (!listings || !listings.length) {
      showToast('No listings to export.', 'error');
      return;
    }
    const keySet = new Set();
    listings.forEach(l => Object.keys(l).forEach(k => keySet.add(k)));
    const keys = Array.from(keySet);
    const csvRows = [keys.map(k => `"${k}"`).join(',')];
    listings.forEach(listing => {
      csvRows.push(keys.map(k => {
        let val = listing[k];
        if (val === null || val === undefined) val = '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `empire-flippers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported.', 'success');
  }

  // =====================================================================
  //  TAB NAVIGATION
  // =====================================================================
  function switchTab(tabName) {
    $$('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    $$('.tab-content').forEach(tc => tc.classList.toggle('active', tc.id === `tab-${tabName}`));

    if (tabName === 'favorites') renderFavorites();
    if (tabName === 'compare') renderComparison();
  }

  // =====================================================================
  //  DASHBOARD
  // =====================================================================
  async function loadDashboard(opts = {}) {
    const { silent } = opts; // silent = background refresh, no loading UI
    if (!silent) {
      dom.dashboardPrompt.classList.add('hidden');
      dom.dashboard.classList.add('hidden');
      dom.dashboardLoading.classList.remove('hidden');
      dom.dashboardLoadingText.textContent = 'Fetching all listings from Empire Flippers...';
    }

    try {
      const data = await apiGet('/api/dashboard-data');
      state.dashboardData = data;
      state.marketData = computeMarketData(data.forSale || [], data.sold || []);

      // Persist to IndexedDB
      await dbPut('dashboardData', data);
      console.log('Dashboard data saved to IndexedDB');

      if (!silent) {
        dom.dashboardLoading.classList.add('hidden');
      }
      dom.dashboard.classList.remove('hidden');
      hideUpdateBanner();

      renderDashboard();
      showToast(`Loaded ${(data.forSale || []).length} active + ${(data.sold || []).length} sold listings.`, 'success');
    } catch (err) {
      if (!silent) {
        dom.dashboardLoading.classList.add('hidden');
        // If we have cached data, show that; otherwise show prompt
        if (state.dashboardData) {
          dom.dashboard.classList.remove('hidden');
        } else {
          dom.dashboardPrompt.classList.remove('hidden');
        }
      }
      console.error('Dashboard load error:', err);
      showToast('Failed to load dashboard data. ' + err.message, 'error');
    }
  }

  async function loadDashboardFromCache() {
    try {
      const cached = await dbGet('dashboardData');
      if (cached && cached.forSale && cached.forSale.length > 0) {
        console.log(`Loaded ${cached.forSale.length} active + ${cached.sold.length} sold from IndexedDB (cached ${timeAgo(cached.fetchedAt)})`);
        state.dashboardData = cached;
        state.marketData = computeMarketData(cached.forSale || [], cached.sold || []);

        dom.dashboardPrompt.classList.add('hidden');
        dom.dashboardLoading.classList.add('hidden');
        dom.dashboard.classList.remove('hidden');
        renderDashboard();
        return true;
      }
    } catch (err) {
      console.warn('Failed to load from IndexedDB:', err);
    }
    return false;
  }

  async function checkForNewListings() {
    if (!state.dashboardData) return;
    try {
      const check = await apiGet('/api/listings/check');
      const cachedForSaleCount = (state.dashboardData.forSale || []).length;
      const cachedSoldCount = (state.dashboardData.sold || []).length;

      // Check if counts changed
      const forSaleDiff = check.forSaleCount - cachedForSaleCount;
      const soldDiff = check.soldCount - cachedSoldCount;

      // Also check if latest IDs are present in our cache
      const cachedForSaleIds = new Set((state.dashboardData.forSale || []).map(l => l.listing_number || l.id));
      const newForSaleIds = (check.latestForSaleIds || []).filter(id => !cachedForSaleIds.has(id));

      if (forSaleDiff !== 0 || soldDiff !== 0 || newForSaleIds.length > 0) {
        const parts = [];
        if (forSaleDiff > 0) parts.push(`${forSaleDiff} new active listing${forSaleDiff > 1 ? 's' : ''}`);
        if (forSaleDiff < 0) parts.push(`${Math.abs(forSaleDiff)} listing${Math.abs(forSaleDiff) > 1 ? 's' : ''} removed/sold`);
        if (soldDiff > 0) parts.push(`${soldDiff} new sale${soldDiff > 1 ? 's' : ''}`);
        if (newForSaleIds.length > 0 && forSaleDiff <= 0) parts.push(`${newForSaleIds.length} new listing${newForSaleIds.length > 1 ? 's' : ''}`);

        const msg = parts.length > 0
          ? `Updates detected: ${parts.join(', ')}.`
          : 'Listing data may have changed.';
        showUpdateBanner(msg);
      } else {
        console.log('Freshness check: data is up to date.');
      }
    } catch (err) {
      console.warn('Freshness check failed:', err);
    }
  }

  function showUpdateBanner(msg) {
    const banner = $('#update-banner');
    const text = $('#update-banner-text');
    if (banner && text) {
      text.textContent = msg;
      banner.classList.remove('hidden');
    }
  }

  function hideUpdateBanner() {
    const banner = $('#update-banner');
    if (banner) banner.classList.add('hidden');
  }

  function renderDashboard() {
    const { forSale, sold, fetchedAt } = state.dashboardData;
    const md = state.marketData;

    // Last updated indicator
    const lastUpdatedEl = $('#last-updated');
    if (lastUpdatedEl && fetchedAt) {
      const ageMs = Date.now() - new Date(fetchedAt).getTime();
      const isStale = ageMs > 2 * 60 * 60 * 1000; // >2 hours
      lastUpdatedEl.innerHTML = `<span class="last-updated-dot ${isStale ? 'stale' : ''}"></span> Data loaded ${timeAgo(fetchedAt)} &bull; ${forSale.length} active + ${sold.length} sold listings`;
    }

    // Stats
    dom.dashActiveCount.textContent = forSale.length.toLocaleString();
    dom.dashSoldCount.textContent = sold.length.toLocaleString();

    const avgMultiple = avg(forSale, l => parseFloat(l.listing_multiple || 0));
    const avgSoldMultiple = avg(sold, l => parseFloat(l.listing_multiple || 0));
    dom.dashAvgMultiple.textContent = formatMultiple(avgMultiple);
    dom.dashAvgSoldMultiple.textContent = formatMultiple(avgSoldMultiple);

    // Score all active listings
    const scored = forSale.map(l => ({ listing: l, ...calculateDealScore(l, md) })).sort((a, b) => b.score - a.score);

    dom.dashBestScore.textContent = scored[0] ? scored[0].score + '/100' : '--';

    // Each render wrapped in try/catch so one failure doesn't break the rest
    const renders = [
      ['DistributionStats', () => renderDistributionStats(forSale, sold)],
      ['NicheLeaderboard', () => renderNicheLeaderboard(md)],
      ['NicheProfitChart', () => renderNicheProfitChart(md)],
      ['NicheROIChart', () => renderNicheROIChart(md)],
      ['MonetizationLeaderboard', () => renderMonetizationLeaderboard(md)],
      ['Opportunities', () => renderOpportunities(scored.slice(0, 20))],
      ['NicheDistChart', () => renderNicheDistChart(forSale, sold)],
      ['PriceDistChart', () => renderPriceDistChart(forSale)],
      ['ProfitDistChart', () => renderProfitDistChart(forSale)],
      ['MultipleDistChart', () => renderMultipleDistChart(forSale, sold)],
      ['MonetizationCharts', () => renderMonetizationCharts(forSale, sold, md)],
      ['Trends', () => renderTrends(forSale, sold, md)],
      ['WealthPicks', () => renderWealthPicks(scored.slice(0, 60), md)],
      ['FlipOpportunities', () => renderFlipOpportunities(forSale, md)],
      ['ROIProjections', () => renderROIProjections(scored, md)],
      ['SaleProbability', () => renderSaleProbability(forSale, sold, md)],
      ['NicheGrowth', () => renderNicheGrowth(forSale, sold, md)],
      ['RiskAssessment', () => renderRiskAssessment(forSale, md)],
      ['PassiveIncome', () => renderPassiveIncome(forSale, md)],
      ['Undervalued', () => renderUndervalued(forSale, md)],
      ['Arbitrage', () => renderArbitrage(forSale, sold, md)],
      ['Comps', () => renderComps(forSale, sold, md)],
      ['DaysOnMarket', () => renderDaysOnMarket(forSale)],
      ['BudgetOptimizer', () => renderBudgetOptimizer(forSale, md)],
      ['ScatterRevProfit', () => renderScatterRevProfit(forSale)],
      ['Seasonality', () => renderSeasonality(sold)],
      ['BuildVsBuy', () => renderBuildVsBuy(forSale, md)],
      ['MoatTable', () => renderMoatTable(forSale, md)],
      ['ReplicableTable', () => renderReplicableTable(forSale, md)],
      ['MarketSignal', () => renderMarketSignal(forSale, sold, md)],
      ['HistoricalTrends', () => renderHistoricalTrends(sold)],
      ['NegotiationIntel', () => renderNegotiationIntel(forSale, sold, md)],
      ['MotivatedSellers', () => renderMotivatedSellers(forSale, md)],
      ['SmartMoney', () => renderSmartMoney(sold, md)],
      ['NicheShifts', () => renderNicheShifts(forSale, sold)],
      ['PriceAnchoring', () => renderPriceAnchoring(forSale, sold)],
      ['ExitTiming', () => renderExitTiming(sold)],
    ];
    for (const [name, fn] of renders) {
      try { fn(); } catch (err) { console.error(`Render ${name} failed:`, err); }
    }
  }

  function avg(arr, fn) {
    if (!arr.length) return 0;
    const vals = arr.map(fn).filter(v => v > 0);
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  // =====================================================================
  //  NICHE & MONETIZATION LEADERBOARDS
  // =====================================================================

  function rankBadge(i) {
    if (i === 0) return `<span class="leaderboard-rank rank-gold">1</span>`;
    if (i === 1) return `<span class="leaderboard-rank rank-silver">2</span>`;
    if (i === 2) return `<span class="leaderboard-rank rank-bronze">3</span>`;
    return `<span class="leaderboard-rank rank-default">${i + 1}</span>`;
  }

  function buildSortableLeaderboard(tableEl, columns, rows, defaultSortCol, defaultSortDir, onNameClick) {
    let sortCol = defaultSortCol;
    let sortDir = defaultSortDir || 'desc';

    function render() {
      const sorted = [...rows].sort((a, b) => {
        const va = a[sortCol], vb = b[sortCol];
        return sortDir === 'desc' ? vb - va : va - vb;
      });

      const maxMarketVal = Math.max(...sorted.map(r => r._marketValue || 0), 1);

      tableEl.innerHTML = `
        <thead><tr>${columns.map(c =>
          `<th class="${sortCol === c.key ? (sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc') : ''}" data-col="${c.key}">${c.label}</th>`
        ).join('')}</tr></thead>
        <tbody>${sorted.map((row, i) => `<tr>${columns.map(c => {
          if (c.key === '_rank') return `<td>${rankBadge(i)}</td>`;
          if (c.render) return `<td class="${c.tdClass || ''}">${c.render(row, i, maxMarketVal)}</td>`;
          if (c.key === '_name') {
            if (onNameClick) return `<td class="name-cell"><a href="#" class="browse-name-link" data-name="${escapeHtml(row._name)}">${escapeHtml(row._name)}</a></td>`;
            return `<td class="name-cell">${escapeHtml(row._name)}</td>`;
          }
          return `<td>${row[c.key] != null ? row[c.key] : '--'}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
      `;

      // Bind sort
      tableEl.querySelectorAll('thead th[data-col]').forEach(th => {
        th.addEventListener('click', () => {
          const col = th.dataset.col;
          if (col === '_rank' || col === '_name') return;
          if (sortCol === col) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
          else { sortCol = col; sortDir = 'desc'; }
          render();
        });
      });

      // Bind name click for browsing
      if (onNameClick) {
        tableEl.querySelectorAll('.browse-name-link').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            onNameClick(link.dataset.name);
          });
        });
      }
    }

    render();
  }

  function renderNicheLeaderboard(md) {
    const table = $('#niche-leaderboard');
    if (!table) return;

    const niches = Object.keys(md.nicheAcc);
    const rows = niches.map(n => {
      const acc = md.nicheAcc[n];
      const avgProfit = robustAvg(acc.profit);
      const avgRevenue = robustAvg(acc.revenue);
      const avgMultiple = median(acc.multiple);
      const avgPrice = median(acc.price);
      const margin = avgRevenue > 0 ? (avgProfit / avgRevenue) * 100 : 0;
      const annualROI = avgMultiple > 0 ? (12 / avgMultiple) * 100 : 0;
      const active = md.nicheActiveCount[n] || 0;
      const soldN = md.nicheSoldCount[n] || 0;
      const totalListings = active + soldN;
      const marketValue = avgPrice * active;

      const medHours = median(acc.hours);
      const profitPerHour = medHours > 0 ? avgProfit / medHours : 0;
      const paybackYears = avgPrice > 0 && avgProfit > 0 ? avgPrice / (avgProfit * 12) : 0;

      return {
        _name: n, _rank: 0,
        active, sold: soldN, totalListings,
        avgMonthlyProfit: avgProfit,
        avgAnnualProfit: avgProfit * 12,
        avgMonthlyRevenue: avgRevenue,
        avgAnnualRevenue: avgRevenue * 12,
        avgMargin: margin,
        avgMultiple,
        avgPrice,
        annualROI,
        medHours,
        profitPerHour,
        paybackYears,
        _marketValue: marketValue,
      };
    }).filter(r => r.totalListings >= 2);

    const columns = [
      { key: '_rank', label: '#' },
      { key: '_name', label: 'Niche' },
      { key: 'totalListings', label: 'n', render: r => `<span class="confidence-badge ${r.totalListings >= 10 ? 'conf-high' : r.totalListings >= 5 ? 'conf-med' : 'conf-low'}" title="${r.totalListings} samples — ${r.totalListings >= 10 ? 'high' : r.totalListings >= 5 ? 'moderate' : 'low'} confidence">${r.totalListings}</span>` },
      { key: 'active', label: 'Active', render: r => r.active },
      { key: 'sold', label: 'Sold', render: r => r.sold },
      { key: 'avgAnnualProfit', label: 'Avg Annual Net Profit', tdClass: 'profit-cell', render: r => formatUSD(r.avgAnnualProfit) },
      { key: 'avgMonthlyProfit', label: 'Avg Mo. Profit', tdClass: 'profit-cell', render: r => formatUSD(r.avgMonthlyProfit) },
      { key: 'avgAnnualRevenue', label: 'Avg Annual Revenue', render: r => formatUSD(r.avgAnnualRevenue) },
      { key: 'avgMargin', label: 'Avg Margin', render: r => formatPercent(r.avgMargin) },
      { key: 'avgMultiple', label: 'Median Multiple', render: r => formatMultiple(r.avgMultiple) },
      { key: 'annualROI', label: 'Avg Annual ROI', tdClass: 'roi-cell', render: r => formatPercent(r.annualROI) },
      { key: 'medHours', label: 'Med. Hrs/Wk', render: r => r.medHours > 0 ? r.medHours.toFixed(0) + 'h' : '--' },
      { key: 'profitPerHour', label: '$/Hr/Wk', tdClass: 'profit-cell', render: r => r.profitPerHour > 0 ? formatUSD(r.profitPerHour) : '--' },
      { key: 'paybackYears', label: 'Payback', render: r => r.paybackYears > 0 ? r.paybackYears.toFixed(1) + 'y' : '--' },
      { key: 'avgPrice', label: 'Median Price', render: r => formatUSD(r.avgPrice) },
      { key: '_marketValue', label: 'Active Market Value', render: (r, i, max) => {
        const barW = max > 0 ? Math.round((r._marketValue / max) * 80) : 0;
        return `${formatUSD(r._marketValue)}<span class="market-value-bar" style="width:${barW}px"></span>`;
      }},
    ];

    buildSortableLeaderboard(table, columns, rows, 'avgAnnualProfit', 'desc', browseByNiche);
  }

  function renderMonetizationLeaderboard(md) {
    const table = $('#monetization-leaderboard');
    if (!table) return;

    const mons = Object.keys(md.monAcc);
    const rows = mons.map(m => {
      const acc = md.monAcc[m];
      const avgProfit = robustAvg(acc.profit);
      const avgRevenue = robustAvg(acc.revenue);
      const avgMultiple = median(acc.multiple);
      const avgPrice = median(acc.price);
      const margin = avgRevenue > 0 ? (avgProfit / avgRevenue) * 100 : 0;
      const annualROI = avgMultiple > 0 ? (12 / avgMultiple) * 100 : 0;
      const active = md.monetizationActiveCount[m] || 0;
      const soldN = md.monetizationSoldCount[m] || 0;

      return {
        _name: m, _rank: 0,
        active, sold: soldN, totalListings: active + soldN,
        avgMonthlyProfit: avgProfit,
        avgAnnualProfit: avgProfit * 12,
        avgMonthlyRevenue: avgRevenue,
        avgAnnualRevenue: avgRevenue * 12,
        avgMargin: margin,
        avgMultiple,
        avgPrice,
        annualROI,
        _marketValue: avgPrice * active,
      };
    }).filter(r => r.totalListings >= 2);

    const columns = [
      { key: '_rank', label: '#' },
      { key: '_name', label: 'Monetization' },
      { key: 'totalListings', label: 'n', render: r => `<span class="confidence-badge ${r.totalListings >= 10 ? 'conf-high' : r.totalListings >= 5 ? 'conf-med' : 'conf-low'}" title="${r.totalListings} samples — ${r.totalListings >= 10 ? 'high' : r.totalListings >= 5 ? 'moderate' : 'low'} confidence">${r.totalListings}</span>` },
      { key: 'active', label: 'Active', render: r => r.active },
      { key: 'sold', label: 'Sold', render: r => r.sold },
      { key: 'avgAnnualProfit', label: 'Avg Annual Net Profit', tdClass: 'profit-cell', render: r => formatUSD(r.avgAnnualProfit) },
      { key: 'avgMonthlyProfit', label: 'Avg Mo. Profit', tdClass: 'profit-cell', render: r => formatUSD(r.avgMonthlyProfit) },
      { key: 'avgAnnualRevenue', label: 'Avg Annual Revenue', render: r => formatUSD(r.avgAnnualRevenue) },
      { key: 'avgMargin', label: 'Avg Margin', render: r => formatPercent(r.avgMargin) },
      { key: 'avgMultiple', label: 'Median Multiple', render: r => formatMultiple(r.avgMultiple) },
      { key: 'annualROI', label: 'Avg Annual ROI', tdClass: 'roi-cell', render: r => formatPercent(r.annualROI) },
      { key: 'avgPrice', label: 'Median Price', render: r => formatUSD(r.avgPrice) },
    ];

    buildSortableLeaderboard(table, columns, rows, 'avgAnnualProfit', 'desc', browseByMonetization);
  }

  function renderNicheProfitChart(md) {
    destroyChart('nicheProfitRank');
    const canvas = $('#chart-niche-profit-rank');
    if (!canvas) { console.warn('chart-niche-profit-rank canvas not found'); return; }

    const niches = Object.keys(md.nicheAcc)
      .map(n => ({ name: n, profit: (md.nicheAvgProfit[n] || 0) * 12, count: md.nicheTotalListings[n] || md.nicheAcc[n].profit.length }))
      .filter(n => n.profit > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 15);

    console.log('Niche profit chart:', niches.length, 'niches');
    if (!niches.length) return;

    state.charts.nicheProfitRank = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: niches.map(n => n.name + ' (' + n.count + ')'),
        datasets: [{
          label: 'Avg Annual Net Profit',
          data: niches.map(n => Math.round(n.profit)),
          backgroundColor: 'rgba(46,160,67,0.6)',
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx) { return formatUSD(ctx.raw) + '  (' + niches[ctx.dataIndex].count + ' listings)'; } } },
        },
        scales: {
          x: { ticks: { color: '#6a737d', callback: function(v) { return formatUSD(v); } }, grid: { color: 'rgba(45,49,72,0.5)' } },
          y: { ticks: { color: '#8b949e', font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  function renderNicheROIChart(md) {
    destroyChart('nicheROIRank');
    const canvas = $('#chart-niche-roi-rank');
    if (!canvas) { console.warn('chart-niche-roi-rank canvas not found'); return; }

    const niches = Object.keys(md.nicheAcc)
      .map(n => {
        const mult = md.nicheAvgMultiple[n] || 0;
        const count = md.nicheTotalListings[n] || md.nicheAcc[n].multiple.length;
        return { name: n, roi: mult > 0 ? (12 / mult) * 100 : 0, count: count };
      })
      .filter(n => n.roi > 0 && n.count >= 3)
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 15);

    console.log('Niche ROI chart:', niches.length, 'niches');
    if (!niches.length) return;

    state.charts.nicheROIRank = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: niches.map(n => n.name + ' (' + n.count + ')'),
        datasets: [{
          label: 'Avg Annual ROI %',
          data: niches.map(n => parseFloat(n.roi.toFixed(1))),
          backgroundColor: 'rgba(79,134,247,0.6)',
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx) { return ctx.raw + '%  (' + niches[ctx.dataIndex].count + ' listings)'; } } },
        },
        scales: {
          x: { ticks: { color: '#6a737d', callback: function(v) { return v + '%'; } }, grid: { color: 'rgba(45,49,72,0.5)' } },
          y: { ticks: { color: '#8b949e', font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  // =====================================================================
  //  OPPORTUNITY CARDS
  // =====================================================================
  function renderOpportunities(scored) {
    dom.opportunitiesGrid.innerHTML = scored.map((item, i) => {
      const l = item.listing;
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const price = parseFloat(l.listing_price || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const multiple = l.listing_multiple;
      const annualROI = multiple > 0 ? (12 / multiple) * 100 : 0;
      const hours = l.hours_worked_per_week;

      return `
        <div class="opp-card">
          <div class="opp-card-header">
            <div class="opp-card-title">
              <span class="opp-rank ${i < 3 ? 'top-3' : ''}">${i + 1}</span>
              <a href="https://empireflippers.com/listing/${escapeHtml(String(num))}" target="_blank" rel="noopener">#${escapeHtml(String(num))}</a>
            </div>
            <div class="opp-score">
              <span class="score-badge ${getScoreClass(item.score)}">${item.score}/100</span>
            </div>
          </div>
          <div class="opp-card-niches">
            ${niches.map(n => `<span class="niche-tag">${escapeHtml(n)}</span>`).join('') || '<span class="niche-tag">--</span>'}
          </div>
          <div class="opp-card-stats">
            <div class="opp-stat"><span class="opp-stat-label">Price</span><span class="opp-stat-value">${formatUSD(price)}</span></div>
            <div class="opp-stat"><span class="opp-stat-label">Annual Profit</span><span class="opp-stat-value profit">${formatUSD(profit * 12)}</span></div>
            <div class="opp-stat"><span class="opp-stat-label">Mo. Profit</span><span class="opp-stat-value profit">${formatUSD(profit)}</span></div>
            <div class="opp-stat"><span class="opp-stat-label">Multiple</span><span class="opp-stat-value">${formatMultiple(multiple)}</span></div>
            <div class="opp-stat"><span class="opp-stat-label">Annual ROI</span><span class="opp-stat-value highlight">${formatPercent(annualROI)}</span></div>
            <div class="opp-stat"><span class="opp-stat-label">Hrs/Wk</span><span class="opp-stat-value">${hours != null ? hours + 'h' : '--'}</span></div>
          </div>
          <div class="opp-card-actions">
            <a href="https://empireflippers.com/listing/${escapeHtml(String(num))}" target="_blank" rel="noopener" class="btn btn-sm btn-accent" style="text-decoration:none">View Listing</a>
            <button class="btn btn-sm btn-secondary opp-fav-btn" data-idx="${i}">${isFavorited(l) ? '\u2605 Saved' : '\u2606 Save'}</button>
            <button class="btn btn-sm btn-ghost opp-compare-btn" data-idx="${i}">+ Compare</button>
            <button class="btn btn-sm btn-ghost opp-analyze-btn" data-num="${escapeHtml(String(num))}">Deep Dive</button>
          </div>
        </div>
      `;
    }).join('');

    // Bind events
    dom.opportunitiesGrid.querySelectorAll('.opp-fav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const l = scored[idx].listing;
        toggleFavorite(l);
        btn.textContent = isFavorited(l) ? '\u2605 Saved' : '\u2606 Save';
      });
    });

    dom.opportunitiesGrid.querySelectorAll('.opp-compare-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        toggleCompare(scored[idx].listing);
      });
    });

    dom.opportunitiesGrid.querySelectorAll('.opp-analyze-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openListingDeepDive(btn.dataset.num);
      });
    });
  }

  // =====================================================================
  //  CHARTS
  // =====================================================================
  function destroyChart(key) {
    if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; }
  }

  // chartDefaults removed - using hBarOpts()/vBarOpts() builders instead

  // Shared simple chart options builder (avoids object spread issues)
  function hBarOpts(opts = {}) {
    return {
      responsive: true,
      indexAxis: 'y',
      plugins: {
        legend: { display: opts.legend !== false ? true : false, labels: { color: '#8b949e', font: { size: 11 } } },
        tooltip: opts.tooltip || {},
      },
      scales: {
        x: { ticks: { color: '#6a737d', callback: opts.xFormat || (v => v) }, grid: { color: 'rgba(45,49,72,0.5)' } },
        y: { ticks: { color: '#8b949e', font: { size: 11 } }, grid: { display: false } },
      },
    };
  }

  function vBarOpts(opts = {}) {
    return {
      responsive: true,
      plugins: {
        legend: { display: opts.legend !== false ? true : false, labels: { color: '#8b949e', font: { size: 11 } } },
        tooltip: opts.tooltip || {},
      },
      scales: {
        x: { ticks: { color: '#6a737d', font: { size: 10 } }, grid: { color: 'rgba(45,49,72,0.5)' } },
        y: { ticks: { color: '#6a737d', font: { size: 10 } }, grid: { color: 'rgba(45,49,72,0.5)' } },
      },
    };
  }

  function renderDistributionStats(forSale, sold) {
    const el = $('#distribution-stats');
    if (!el) return;

    const prices = forSale.map(l => parseFloat(l.listing_price || 0)).filter(p => p > 0);
    const profits = forSale.map(l => parseFloat(l.average_monthly_net_profit || 0)).filter(p => p > 0);
    const multiples = forSale.map(l => parseFloat(l.listing_multiple || 0)).filter(m => m > 0);
    const revenues = forSale.map(l => parseFloat(l.average_monthly_gross_revenue || 0)).filter(r => r > 0);
    const margins = forSale.map(l => {
      const r = parseFloat(l.average_monthly_gross_revenue || 0);
      const p = parseFloat(l.average_monthly_net_profit || 0);
      return r > 0 ? (p / r * 100) : 0;
    }).filter(m => m > 0);
    const hours = forSale.map(l => l.hours_worked_per_week).filter(h => h != null && h > 0);

    const soldMultiples = sold.map(l => parseFloat(l.listing_multiple || 0)).filter(m => m > 0);

    const totalMarketValue = prices.reduce((a, b) => a + b, 0);
    const totalAnnualProfit = profits.reduce((a, b) => a + b, 0) * 12;

    el.innerHTML = `
      <div class="dist-stat">
        <div class="dist-stat-label">Median Price</div>
        <div class="dist-stat-value">${formatUSD(median(prices))}</div>
        <div class="dist-stat-sub">Avg: ${formatUSD(robustAvg(prices))}</div>
      </div>
      <div class="dist-stat">
        <div class="dist-stat-label">Median Monthly Profit</div>
        <div class="dist-stat-value" style="color:var(--success)">${formatUSD(median(profits))}</div>
        <div class="dist-stat-sub">Avg: ${formatUSD(robustAvg(profits))}</div>
      </div>
      <div class="dist-stat">
        <div class="dist-stat-label">Median Multiple</div>
        <div class="dist-stat-value">${formatMultiple(median(multiples))}</div>
        <div class="dist-stat-sub">Sold: ${formatMultiple(median(soldMultiples))}</div>
      </div>
      <div class="dist-stat">
        <div class="dist-stat-label">Median Revenue</div>
        <div class="dist-stat-value">${formatUSD(median(revenues))}</div>
        <div class="dist-stat-sub">Avg: ${formatUSD(robustAvg(revenues))}</div>
      </div>
      <div class="dist-stat">
        <div class="dist-stat-label">Median Margin</div>
        <div class="dist-stat-value">${formatPercent(median(margins))}</div>
        <div class="dist-stat-sub">Avg: ${formatPercent(robustAvg(margins))}</div>
      </div>
      <div class="dist-stat">
        <div class="dist-stat-label">Median Hrs/Wk</div>
        <div class="dist-stat-value">${hours.length ? median(hours).toFixed(0) + 'h' : '--'}</div>
        <div class="dist-stat-sub">Avg: ${hours.length ? robustAvg(hours).toFixed(0) + 'h' : '--'}</div>
      </div>
      <div class="dist-stat">
        <div class="dist-stat-label">Total Market Value</div>
        <div class="dist-stat-value">${formatUSD(totalMarketValue)}</div>
        <div class="dist-stat-sub">${forSale.length} active listings</div>
      </div>
      <div class="dist-stat">
        <div class="dist-stat-label">Total Annual Profit</div>
        <div class="dist-stat-value" style="color:var(--success)">${formatUSD(totalAnnualProfit)}</div>
        <div class="dist-stat-sub">All active combined</div>
      </div>
    `;
  }

  function renderNicheDistChart(forSale, sold) {
    destroyChart('nicheDist');
    const canvas = $('#chart-niche-dist');
    if (!canvas) return;

    const nicheCounts = { active: {}, sold: {} };
    forSale.forEach(l => getNicheNames(l).forEach(n => { nicheCounts.active[n] = (nicheCounts.active[n] || 0) + 1; }));
    sold.forEach(l => getNicheNames(l).forEach(n => { nicheCounts.sold[n] = (nicheCounts.sold[n] || 0) + 1; }));

    const allNiches = [...new Set([...Object.keys(nicheCounts.active), ...Object.keys(nicheCounts.sold)])];
    const sorted = allNiches.sort((a, b) => ((nicheCounts.active[b] || 0) + (nicheCounts.sold[b] || 0)) - ((nicheCounts.active[a] || 0) + (nicheCounts.sold[a] || 0))).slice(0, 12);

    state.charts.nicheDist = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: sorted,
        datasets: [
          { label: 'For Sale (Active)', data: sorted.map(n => nicheCounts.active[n] || 0), backgroundColor: 'rgba(79,134,247,0.7)', borderRadius: 3 },
          { label: 'Sold (Completed)', data: sorted.map(n => nicheCounts.sold[n] || 0), backgroundColor: 'rgba(218,54,51,0.5)', borderRadius: 3 },
        ],
      },
      options: hBarOpts(),
    });
  }

  function renderPriceDistChart(forSale) {
    destroyChart('priceDist');
    const canvas = $('#chart-price-dist');
    if (!canvas) return;

    const prices = forSale.map(l => parseFloat(l.listing_price || 0)).filter(p => p > 0);
    if (!prices.length) return;

    const buckets = [0, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, Infinity];
    const labels = [];
    const counts = [];
    for (let i = 0; i < buckets.length - 1; i++) {
      const lo = buckets[i], hi = buckets[i + 1];
      labels.push(hi === Infinity ? `${formatUSD(lo)}+` : `${formatUSD(lo)}-${formatUSD(hi)}`);
      counts.push(prices.filter(p => p >= lo && p < hi).length);
    }

    state.charts.priceDist = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Active Listings', data: counts, backgroundColor: 'rgba(210,153,34,0.6)', borderRadius: 3 }] },
      options: vBarOpts({ legend: false }),
    });
  }

  function renderProfitDistChart(forSale) {
    destroyChart('profitDist');
    const canvas = $('#chart-profit-dist');
    if (!canvas) return;

    const profits = forSale.map(l => parseFloat(l.average_monthly_net_profit || 0)).filter(p => p > 0);
    if (!profits.length) return;

    const buckets = [0, 1000, 2500, 5000, 10000, 25000, 50000, 100000, Infinity];
    const labels = [];
    const counts = [];
    for (let i = 0; i < buckets.length - 1; i++) {
      const lo = buckets[i], hi = buckets[i + 1];
      labels.push(hi === Infinity ? `${formatUSD(lo)}+` : `${formatUSD(lo)}-${formatUSD(hi)}`);
      counts.push(profits.filter(p => p >= lo && p < hi).length);
    }

    state.charts.profitDist = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Active Listings', data: counts, backgroundColor: 'rgba(46,160,67,0.6)', borderRadius: 3 }] },
      options: vBarOpts({ legend: false }),
    });
  }

  function renderMultipleDistChart(forSale, sold) {
    destroyChart('multipleDist');
    const canvas = $('#chart-multiple-dist');
    if (!canvas) return;

    function getBucketedMultiples(listings) {
      const multiples = listings.map(l => parseFloat(l.listing_multiple || 0)).filter(m => m > 0);
      const buckets = [0, 20, 30, 40, 50, 60, 80, 100, 150, Infinity];
      return buckets.slice(0, -1).map((lo, i) => multiples.filter(m => m >= lo && m < buckets[i + 1]).length);
    }

    const bucketLabels = ['0-20x', '20-30x', '30-40x', '40-50x', '50-60x', '60-80x', '80-100x', '100-150x', '150x+'];

    state.charts.multipleDist = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: bucketLabels,
        datasets: [
          { label: 'For Sale (Active)', data: getBucketedMultiples(forSale), backgroundColor: 'rgba(79,134,247,0.6)', borderRadius: 3 },
          { label: 'Sold (Completed)', data: getBucketedMultiples(sold), backgroundColor: 'rgba(218,54,51,0.4)', borderRadius: 3 },
        ],
      },
      options: vBarOpts(),
    });
  }

  function renderMonetizationCharts(forSale, sold, md) {
    destroyChart('monMultiple');
    destroyChart('monProfit');

    const canvas1 = $('#chart-monetization-multiple');
    const canvas2 = $('#chart-monetization-profit');
    if (!canvas1 || !canvas2) { console.warn('Monetization chart canvases not found'); return; }

    // Filter to monetizations that have data
    const allMons = Object.keys(md.monAcc || {}).filter(m => md.monAcc[m].multiple.length > 0);
    console.log('Monetization chart data:', allMons.length, 'types found:', allMons.slice(0, 5));
    if (!allMons.length) { console.warn('No monetization data for charts'); return; }

    const monsByMultiple = [...allMons].sort((a, b) => (md.monetizationAvgMultiple[a] || 0) - (md.monetizationAvgMultiple[b] || 0)).slice(0, 12);
    const multipleData = monsByMultiple.map(m => parseFloat((md.monetizationAvgMultiple[m] || 0).toFixed(1)));
    const multipleCounts = monsByMultiple.map(m => (md.monAcc[m] || {}).multiple ? md.monAcc[m].multiple.length : 0);
    const multipleLabels = monsByMultiple.map((m, i) => m + ' (' + multipleCounts[i] + ')');

    state.charts.monMultiple = new Chart(canvas1, {
      type: 'bar',
      data: {
        labels: multipleLabels,
        datasets: [{
          label: 'Avg Multiple',
          data: multipleData,
          backgroundColor: 'rgba(79,134,247,0.6)',
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx) { return ctx.raw + 'x  (' + multipleCounts[ctx.dataIndex] + ' listings)'; } } },
        },
        scales: {
          x: { ticks: { color: '#6a737d' }, grid: { color: 'rgba(45,49,72,0.5)' } },
          y: { ticks: { color: '#8b949e', font: { size: 11 } }, grid: { display: false } },
        },
      },
    });

    const monsByProfit = [...allMons].filter(m => (md.monetizationAvgProfit[m] || 0) > 0)
      .sort((a, b) => (md.monetizationAvgProfit[b] || 0) - (md.monetizationAvgProfit[a] || 0)).slice(0, 12);
    const profitData = monsByProfit.map(m => Math.round((md.monetizationAvgProfit[m] || 0) * 12));
    const profitCounts = monsByProfit.map(m => (md.monAcc[m] || {}).profit ? md.monAcc[m].profit.length : 0);
    const profitLabels = monsByProfit.map((m, i) => m + ' (' + profitCounts[i] + ')');

    state.charts.monProfit = new Chart(canvas2, {
      type: 'bar',
      data: {
        labels: profitLabels,
        datasets: [{
          label: 'Avg Annual Net Profit',
          data: profitData,
          backgroundColor: 'rgba(46,160,67,0.6)',
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx) { return formatUSD(ctx.raw) + '  (' + profitCounts[ctx.dataIndex] + ' listings)'; } } },
        },
        scales: {
          x: { ticks: { color: '#6a737d', callback: function(v) { return formatUSD(v); } }, grid: { color: 'rgba(45,49,72,0.5)' } },
          y: { ticks: { color: '#8b949e', font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  // =====================================================================
  //  TREND ANALYSIS
  // =====================================================================
  function renderTrends(forSale, sold, md) {
    const niches = Object.keys(md.nicheTotalListings);

    const nicheMetrics = niches.map(n => {
      const soldCount = md.nicheSoldCount[n] || 0;
      const activeCount = md.nicheActiveCount[n] || 0;
      const avgMult = md.nicheAvgMultiple[n] || 0;
      const avgProf = md.nicheAvgProfit[n] || 0;
      const avgRev = md.nicheAvgRevenue[n] || 0;
      const demandRatio = activeCount > 0 ? soldCount / activeCount : soldCount;

      return { name: n, soldCount, activeCount, avgMult, avgProf, avgRev, demandRatio };
    }).filter(n => n.soldCount > 0 || n.activeCount > 0);

    nicheMetrics.sort((a, b) => b.demandRatio - a.demandRatio);
    const top15 = nicheMetrics.slice(0, 15);

    dom.trendsGrid.innerHTML = top15.map(n => {
      const heat = n.demandRatio >= 2 ? 'hot' : n.demandRatio >= 1 ? 'warm' : 'cool';
      const heatLabel = heat === 'hot' ? 'High Demand' : heat === 'warm' ? 'Moderate' : 'Low Demand';
      const annualROI = n.avgMult > 0 ? (12 / n.avgMult) * 100 : 0;
      const annualProfit = n.avgProf * 12;
      const annualRevenue = n.avgRev * 12;
      const margin = n.avgRev > 0 ? (n.avgProf / n.avgRev) * 100 : 0;

      return `
        <div class="trend-card">
          <div class="trend-card-header">
            <h4><a href="#" class="browse-niche-link" data-niche="${escapeHtml(n.name)}">${escapeHtml(n.name)}</a></h4>
            <span class="trend-indicator trend-${heat}">${heatLabel}</span>
          </div>
          <div class="trend-stats">
            <div class="trend-stat"><span class="trend-stat-label">Sold</span><span class="trend-stat-value">${n.soldCount}</span></div>
            <div class="trend-stat"><span class="trend-stat-label">Active</span><span class="trend-stat-value">${n.activeCount}</span></div>
            <div class="trend-stat"><span class="trend-stat-label">Avg Annual Profit</span><span class="trend-stat-value" style="color:var(--success)">${formatUSD(annualProfit)}</span></div>
            <div class="trend-stat"><span class="trend-stat-label">Avg Annual Revenue</span><span class="trend-stat-value">${formatUSD(annualRevenue)}</span></div>
            <div class="trend-stat"><span class="trend-stat-label">Avg Margin</span><span class="trend-stat-value">${formatPercent(margin)}</span></div>
            <div class="trend-stat"><span class="trend-stat-label">Avg Multiple</span><span class="trend-stat-value">${formatMultiple(n.avgMult)}</span></div>
            <div class="trend-stat"><span class="trend-stat-label">Avg Annual ROI</span><span class="trend-stat-value" style="color:var(--accent)">${formatPercent(annualROI)}</span></div>
            <div class="trend-stat"><span class="trend-stat-label">Demand Ratio</span><span class="trend-stat-value">${n.demandRatio.toFixed(1)}x</span></div>
          </div>
          <div class="trend-card-actions">
            <a href="#" class="btn btn-sm btn-accent browse-niche-link" data-niche="${escapeHtml(n.name)}">Browse ${n.activeCount} Active Listings</a>
          </div>
        </div>
      `;
    }).join('');

    // Bind browse links in trend cards
    dom.trendsGrid.querySelectorAll('.browse-niche-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        browseByNiche(link.dataset.niche);
      });
    });
  }

  // =====================================================================
  //  WEALTH BUILDER PICKS
  // =====================================================================
  function renderWealthPicks(topScored, md) {
    dom.wealthPicks.innerHTML = topScored.map((item, i) => {
      const l = item.listing;
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const price = parseFloat(l.listing_price || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const revenue = parseFloat(l.average_monthly_gross_revenue || 0);
      const multiple = l.listing_multiple;
      const annualROI = multiple > 0 ? (12 / multiple) * 100 : 0;
      const annualProfit = profit * 12;
      const paybackYears = price > 0 && profit > 0 ? (price / (profit * 12)).toFixed(1) : '--';
      const margin = revenue > 0 ? (profit / revenue * 100) : 0;
      const hours = l.hours_worked_per_week;

      // Generate reason
      const reasons = [];
      if (annualROI > 30) reasons.push(`${formatPercent(annualROI)} annual ROI`);
      if (margin > 50) reasons.push(`${formatPercent(margin)} profit margin`);
      if (hours != null && hours < 10) reasons.push(`Only ${hours}h/week effort`);
      if (l.sba_financing_approved) reasons.push('SBA financing eligible');
      if (item.breakdown.discount > 5) reasons.push('Priced below niche average');
      if (item.breakdown.momentum > 8) reasons.push('High-demand niche');
      if (getAgeMonths(l) > 36) reasons.push('Mature business (3+ years)');

      return `
        <div class="wealth-card">
          <div class="wealth-card-header">
            <span class="wealth-card-title">
              <a href="https://empireflippers.com/listing/${escapeHtml(String(num))}" target="_blank" rel="noopener">#${escapeHtml(String(num))}</a>
              &mdash; ${niches.map(n => escapeHtml(n)).join(', ') || 'N/A'}
            </span>
            <span class="score-badge ${getScoreClass(item.score)}">${item.score}</span>
          </div>
          <div class="wealth-reason">${reasons.length ? reasons.join(' &bull; ') : 'Strong overall metrics'}</div>
          <div class="wealth-metrics">
            <div class="wealth-metric"><span class="wealth-metric-label">Asking Price</span><span class="wealth-metric-value">${formatUSD(price)}</span></div>
            <div class="wealth-metric"><span class="wealth-metric-label">Annual Net Profit</span><span class="wealth-metric-value" style="color:var(--success)">${formatUSD(annualProfit)}</span></div>
            <div class="wealth-metric"><span class="wealth-metric-label">Monthly Cash Flow</span><span class="wealth-metric-value" style="color:var(--success)">${formatUSD(profit)}</span></div>
            <div class="wealth-metric"><span class="wealth-metric-label">Annual Revenue</span><span class="wealth-metric-value">${formatUSD(revenue * 12)}</span></div>
            <div class="wealth-metric"><span class="wealth-metric-label">Annual ROI</span><span class="wealth-metric-value" style="color:var(--accent)">${formatPercent(annualROI)}</span></div>
            <div class="wealth-metric"><span class="wealth-metric-label">Payback Period</span><span class="wealth-metric-value">${paybackYears} years</span></div>
            <div class="wealth-metric"><span class="wealth-metric-label">Profit Margin</span><span class="wealth-metric-value">${formatPercent(margin)}</span></div>
            <div class="wealth-metric"><span class="wealth-metric-label">Work Required</span><span class="wealth-metric-value">${hours != null ? hours + 'h/week' : 'Unknown'}</span></div>
          </div>
          <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:8px;">
            <a href="https://empireflippers.com/listing/${escapeHtml(String(num))}" target="_blank" rel="noopener" class="btn btn-sm btn-accent" style="text-decoration:none">View on Empire Flippers</a>
          </div>
        </div>
      `;
    }).join('');
  }

  // =====================================================================
  //  FORECASTING & DEEP ANALYSIS
  // =====================================================================

  // --- Risk scoring per listing ---
  function calculateRisk(listing, md) {
    const risk = {};
    const multiple = parseFloat(listing.listing_multiple || 0);
    const profit = parseFloat(listing.average_monthly_net_profit || 0);
    const revenue = parseFloat(listing.average_monthly_gross_revenue || 0);
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const ageMonths = getAgeMonths(listing);
    const hours = listing.hours_worked_per_week;
    const niches = getNicheNames(listing);
    const price = parseFloat(listing.listing_price || 0);

    // 1. Overpricing risk (0-20): multiple vs niche median
    const nicheMultiples = niches.flatMap(n => (md.nicheAcc[n] || { multiple: [] }).multiple);
    const nicheMedianMult = median(nicheMultiples);
    if (multiple > 0 && nicheMedianMult > 0) {
      const overpriceRatio = multiple / nicheMedianMult;
      risk.overpricing = Math.min(20, Math.max(0, (overpriceRatio - 1) * 40));
    } else {
      risk.overpricing = 10;
    }

    // 2. Immaturity risk (0-20): younger = riskier
    risk.immaturity = Math.max(0, 20 - ageMonths * 0.5);

    // 3. Low margin risk (0-15): margin < 30% is concerning
    risk.lowMargin = margin > 0 ? Math.max(0, 15 - margin * 0.5) : 15;

    // 4. Niche saturation risk (0-15): many active vs few sold = oversupply
    const activeInNiche = niches.reduce((s, n) => s + (md.nicheActiveCount[n] || 0), 0) / Math.max(niches.length, 1);
    const soldInNiche = niches.reduce((s, n) => s + (md.nicheSoldCount[n] || 0), 0) / Math.max(niches.length, 1);
    const supplyRatio = soldInNiche > 0 ? activeInNiche / soldInNiche : 3;
    risk.saturation = Math.min(15, Math.max(0, supplyRatio * 5));

    // 5. Effort risk (0-15): high hours = harder to scale
    if (hours != null && hours >= 0) {
      risk.effort = Math.min(15, hours * 0.5);
    } else {
      risk.effort = 8;
    }

    // 6. Concentration risk (0-15): single niche = less diversified
    risk.concentration = niches.length <= 1 ? 10 : Math.max(0, 15 - niches.length * 5);

    risk.total = Math.round(Object.values(risk).reduce((a, b) => a + b, 0));
    return risk;
  }

  function getRiskClass(total) {
    if (total <= 25) return 'risk-low';
    if (total <= 50) return 'risk-medium';
    if (total <= 70) return 'risk-high';
    return 'risk-critical';
  }

  function getRiskLabel(total) {
    if (total <= 25) return 'Low Risk';
    if (total <= 50) return 'Moderate';
    if (total <= 70) return 'High Risk';
    return 'Very High';
  }

  // --- Flip Opportunity Analyzer ---
  function renderFlipOpportunities(forSale, md) {
    const el = dom.flipOpportunities;
    if (!el) return;

    const flips = forSale.map(l => {
      const niches = getNicheNames(l);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const revenue = parseFloat(l.average_monthly_gross_revenue || 0);
      const price = parseFloat(l.listing_price || 0);
      const multiple = parseFloat(l.listing_multiple || 0);
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      const num = l.listing_number || l.id;

      // Best margin in the niche (robust avg of top quartile)
      const nicheMargins = niches.flatMap(n => {
        const acc = md.nicheAcc[n];
        if (!acc || !acc.profit.length || !acc.revenue.length) return [];
        return acc.profit.map((p, i) => acc.revenue[i] > 0 ? (p / acc.revenue[i]) * 100 : 0).filter(m => m > 0);
      });
      const bestNicheMargin = nicheMargins.length ? removeOutliers(nicheMargins).sort((a, b) => b - a).slice(0, Math.ceil(nicheMargins.length * 0.25)).reduce((a, b) => a + b, 0) / Math.ceil(nicheMargins.length * 0.25) : 0;

      // If current margin is below niche top-quartile, there's upside
      const targetMargin = Math.max(margin, Math.min(bestNicheMargin, 80));
      const improvedProfit = revenue > 0 ? (targetMargin / 100) * revenue : profit;
      const profitGainMonthly = Math.max(0, improvedProfit - profit);
      const profitGainAnnual = profitGainMonthly * 12;
      const marginGap = targetMargin - margin;

      // Implied post-improvement valuation (at niche avg multiple)
      const nicheAvgMult = niches.reduce((s, n) => s + (md.nicheAvgMultiple[n] || 0), 0) / Math.max(niches.length, 1);
      const improvedValuation = improvedProfit * (nicheAvgMult > 0 ? nicheAvgMult : multiple);
      const flipProfit = improvedValuation - price;

      return {
        listing: l, num, niches, price, profit, revenue, margin,
        targetMargin, profitGainAnnual, marginGap, improvedProfit,
        improvedValuation, flipProfit, multiple, nicheAvgMult
      };
    })
    .filter(f => f.profitGainAnnual > 1000 && f.marginGap > 5 && f.revenue > 0)
    .sort((a, b) => b.flipProfit - a.flipProfit)
    .slice(0, 30);

    el.innerHTML = flips.map((f, i) => {
      const flipROI = f.price > 0 ? (f.flipProfit / f.price * 100) : 0;
      return `
        <div class="forecast-card flip-card">
          <div class="forecast-card-header">
            <div class="forecast-card-title">
              <span class="forecast-rank">${i + 1}</span>
              <a href="https://empireflippers.com/listing/${escapeHtml(String(f.num))}" target="_blank" rel="noopener">#${escapeHtml(String(f.num))}</a>
              <span class="forecast-niche">${f.niches.map(n => escapeHtml(n)).join(', ')}</span>
            </div>
            <span class="forecast-badge ${flipROI > 50 ? 'badge-excellent' : flipROI > 20 ? 'badge-good' : 'badge-fair'}">${formatPercent(flipROI)} flip ROI</span>
          </div>
          <div class="forecast-metrics">
            <div class="forecast-metric">
              <span class="forecast-metric-label">Buy Price</span>
              <span class="forecast-metric-value">${formatUSD(f.price)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Current Margin</span>
              <span class="forecast-metric-value">${formatPercent(f.margin)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Target Margin</span>
              <span class="forecast-metric-value" style="color:var(--success)">${formatPercent(f.targetMargin)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Annual Profit Gain</span>
              <span class="forecast-metric-value" style="color:var(--success)">+${formatUSD(f.profitGainAnnual)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Improved Valuation</span>
              <span class="forecast-metric-value">${formatUSD(f.improvedValuation)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Flip Profit</span>
              <span class="forecast-metric-value ${f.flipProfit > 0 ? '' : 'text-danger'}" style="color:${f.flipProfit > 0 ? 'var(--success)' : 'var(--danger)'}">${formatUSD(f.flipProfit)}</span>
            </div>
          </div>
          <div class="forecast-bar-row">
            <span class="forecast-bar-label">Margin improvement potential</span>
            <div class="forecast-bar-track">
              <div class="forecast-bar-current" style="width:${Math.min(100, f.margin)}%"></div>
              <div class="forecast-bar-target" style="width:${Math.min(100, f.targetMargin)}%"></div>
            </div>
            <span class="forecast-bar-values">${formatPercent(f.margin)} → ${formatPercent(f.targetMargin)}</span>
          </div>
        </div>
      `;
    }).join('') || '<p class="empty-state">No flip opportunities found with significant margin improvement potential.</p>';
  }

  // --- ROI Projections Table ---
  function renderROIProjections(scored, md) {
    const table = dom.roiProjectionsTable;
    if (!table) return;

    const top40 = scored.slice(0, 40);
    const rows = top40.map(item => {
      const l = item.listing;
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const price = parseFloat(l.listing_price || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const annualProfit = profit * 12;
      const multiple = parseFloat(l.listing_multiple || 0);

      // Conservative: -20% profit, Base: current, Optimistic: +30%
      const conservative = annualProfit * 0.8;
      const optimistic = annualProfit * 1.3;

      const paybackBase = price > 0 && annualProfit > 0 ? price / annualProfit : 99;
      const paybackCons = price > 0 && conservative > 0 ? price / conservative : 99;
      const paybackOpt = price > 0 && optimistic > 0 ? price / optimistic : 99;

      // Cumulative returns over years
      const roi1y = price > 0 ? (annualProfit / price * 100) : 0;
      const roi3y = price > 0 ? (annualProfit * 3 / price * 100) : 0;
      const roi5y = price > 0 ? (annualProfit * 5 / price * 100) : 0;

      const roi5yOpt = price > 0 ? (optimistic * 5 / price * 100) : 0;

      return {
        _name: `#${num}`, _num: num, _niches: niches.join(', '),
        price, annualProfit, conservative, optimistic,
        paybackBase, paybackCons, paybackOpt,
        roi1y, roi3y, roi5y, roi5yOpt, score: item.score
      };
    });

    const columns = [
      { key: '_rank', label: '#' },
      { key: '_name', label: 'Listing', render: r => `<a href="https://empireflippers.com/listing/${escapeHtml(String(r._num))}" target="_blank" rel="noopener">${escapeHtml(r._name)}</a>` },
      { key: 'price', label: 'Buy Price', render: r => formatUSD(r.price) },
      { key: 'annualProfit', label: 'Base Annual', tdClass: 'profit-cell', render: r => formatUSD(r.annualProfit) },
      { key: 'conservative', label: 'Conservative', render: r => formatUSD(r.conservative) },
      { key: 'optimistic', label: 'Optimistic', tdClass: 'profit-cell', render: r => formatUSD(r.optimistic) },
      { key: 'paybackBase', label: 'Payback (yrs)', render: r => r.paybackBase < 20 ? r.paybackBase.toFixed(1) + 'y' : '20+' },
      { key: 'roi1y', label: 'ROI 1yr', tdClass: 'roi-cell', render: r => formatPercent(r.roi1y) },
      { key: 'roi3y', label: 'ROI 3yr', tdClass: 'roi-cell', render: r => formatPercent(r.roi3y) },
      { key: 'roi5y', label: 'ROI 5yr', tdClass: 'roi-cell', render: r => formatPercent(r.roi5y) },
      { key: 'roi5yOpt', label: 'ROI 5yr (opt)', tdClass: 'profit-cell', render: r => formatPercent(r.roi5yOpt) },
      { key: 'score', label: 'Deal Score', render: r => `<span class="score-badge ${getScoreClass(r.score)}">${r.score}</span>` },
    ];

    buildSortableLeaderboard(table, columns, rows, 'roi5y', 'desc');
  }

  // --- Sale Probability & Negotiation Intel ---
  function renderSaleProbability(forSale, sold, md) {
    const el = dom.saleProbabilityGrid;
    if (!el) return;

    // Build sold comps per niche: avg sold multiple, avg days to sell
    const nicheSoldData = {};
    sold.forEach(l => {
      const niches = getNicheNames(l);
      const soldMult = parseFloat(l.listing_multiple || 0);
      const createdAt = l.first_listed_at || l.created_at;
      const soldAt = l.sold_date || l.sold_at || l.updated_at;
      let daysToSell = 0;
      if (createdAt && soldAt) {
        daysToSell = Math.max(0, (new Date(soldAt) - new Date(createdAt)) / (1000 * 60 * 60 * 24));
      }
      niches.forEach(n => {
        if (!nicheSoldData[n]) nicheSoldData[n] = { multiples: [], daysToSell: [] };
        if (soldMult > 0) nicheSoldData[n].multiples.push(soldMult);
        if (daysToSell > 0 && daysToSell < 365) nicheSoldData[n].daysToSell.push(daysToSell);
      });
    });

    const items = forSale.map(l => {
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const price = parseFloat(l.listing_price || 0);
      const multiple = parseFloat(l.listing_multiple || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);

      // Avg sold multiple and days for this niche
      const soldMults = niches.flatMap(n => (nicheSoldData[n] || { multiples: [] }).multiples);
      const soldDays = niches.flatMap(n => (nicheSoldData[n] || { daysToSell: [] }).daysToSell);
      const avgSoldMultiple = robustAvg(soldMults);
      const medianDaysToSell = median(soldDays);

      // Fair value = profit * avg sold multiple
      const fairValue = profit > 0 && avgSoldMultiple > 0 ? profit * avgSoldMultiple : price;

      // Negotiation room: how much above fair value is the asking price
      const negotiationRoom = price > 0 && fairValue > 0 ? ((price - fairValue) / price * 100) : 0;

      // Sale probability based on: pricing vs comps, niche demand
      const demandRatio = niches.reduce((s, n) => {
        const sold = md.nicheSoldCount[n] || 0;
        const active = md.nicheActiveCount[n] || 1;
        return s + sold / active;
      }, 0) / Math.max(niches.length, 1);

      const pricingFactor = avgSoldMultiple > 0 && multiple > 0
        ? Math.min(1, avgSoldMultiple / multiple) // closer to 1 if priced at or below sold avg
        : 0.5;

      const saleProb = Math.min(95, Math.max(5, Math.round(
        (pricingFactor * 50 + Math.min(demandRatio, 3) / 3 * 40 + (profit > 0 ? 5 : 0))
      )));

      return {
        listing: l, num, niches, price, multiple, profit,
        avgSoldMultiple, medianDaysToSell, fairValue,
        negotiationRoom, saleProb, demandRatio
      };
    })
    .filter(i => i.profit > 0)
    .sort((a, b) => b.saleProb - a.saleProb)
    .slice(0, 30);

    el.innerHTML = items.map(f => {
      const probClass = f.saleProb >= 70 ? 'badge-excellent' : f.saleProb >= 40 ? 'badge-good' : 'badge-fair';
      const negotiationClass = f.negotiationRoom > 10 ? 'text-success' : f.negotiationRoom < -5 ? 'text-danger' : '';
      return `
        <div class="forecast-card">
          <div class="forecast-card-header">
            <div class="forecast-card-title">
              <a href="https://empireflippers.com/listing/${escapeHtml(String(f.num))}" target="_blank" rel="noopener">#${escapeHtml(String(f.num))}</a>
              <span class="forecast-niche">${f.niches.map(n => escapeHtml(n)).join(', ')}</span>
            </div>
            <span class="forecast-badge ${probClass}">${f.saleProb}% likely to sell</span>
          </div>
          <div class="forecast-metrics">
            <div class="forecast-metric">
              <span class="forecast-metric-label">Asking Price</span>
              <span class="forecast-metric-value">${formatUSD(f.price)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Est. Fair Value</span>
              <span class="forecast-metric-value" style="color:var(--accent)">${formatUSD(f.fairValue)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Asking Multiple</span>
              <span class="forecast-metric-value">${formatMultiple(f.multiple)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Avg Sold Multiple</span>
              <span class="forecast-metric-value">${formatMultiple(f.avgSoldMultiple)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Negotiation Room</span>
              <span class="forecast-metric-value ${negotiationClass}">${f.negotiationRoom > 0 ? '+' : ''}${formatPercent(f.negotiationRoom)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Avg Days to Sell</span>
              <span class="forecast-metric-value">${f.medianDaysToSell > 0 ? Math.round(f.medianDaysToSell) + 'd' : '--'}</span>
            </div>
          </div>
          <div class="sale-prob-bar">
            <div class="sale-prob-fill ${f.saleProb >= 70 ? 'prob-high' : f.saleProb >= 40 ? 'prob-med' : 'prob-low'}" style="width:${f.saleProb}%"></div>
          </div>
        </div>
      `;
    }).join('') || '<p class="empty-state">No sale probability data available.</p>';
  }

  // --- Niche Growth Radar ---
  function renderNicheGrowth(forSale, sold, md) {
    const el = dom.nicheGrowthGrid;
    if (!el) return;

    // For each niche, compute a health score based on:
    // demand ratio, profit trend, volume, avg ROI
    const niches = Object.keys(md.nicheTotalListings).filter(n => (md.nicheTotalListings[n] || 0) >= 3);

    const maxSold = Math.max(...niches.map(n => md.nicheSoldCount[n] || 0), 1);
    const maxProfit = Math.max(...niches.map(n => md.nicheAvgProfit[n] || 0), 1);

    const nicheScores = niches.map(n => {
      const soldCount = md.nicheSoldCount[n] || 0;
      const activeCount = md.nicheActiveCount[n] || 0;
      const avgProfit = md.nicheAvgProfit[n] || 0;
      const avgMultiple = md.nicheAvgMultiple[n] || 0;
      const demandRatio = activeCount > 0 ? soldCount / activeCount : soldCount;
      const roi = avgMultiple > 0 ? (12 / avgMultiple) * 100 : 0;

      // Health score (0-100)
      const demandScore = Math.min(35, demandRatio * 15);
      const profitScore = Math.min(30, (avgProfit / maxProfit) * 30);
      const volumeScore = Math.min(15, (soldCount / maxSold) * 15);
      const roiScore = Math.min(20, roi * 0.6);

      const health = Math.round(demandScore + profitScore + volumeScore + roiScore);
      const signal = health >= 65 ? 'growing' : health >= 40 ? 'stable' : 'declining';

      return {
        name: n, soldCount, activeCount, demandRatio, avgProfit,
        avgMultiple, roi, health, signal,
        annualProfit: avgProfit * 12
      };
    }).sort((a, b) => b.health - a.health);

    // Render chart
    renderNicheHealthChart(nicheScores.slice(0, 20));

    // Render cards
    el.innerHTML = nicheScores.slice(0, 20).map(n => {
      const signalClass = n.signal === 'growing' ? 'signal-grow' : n.signal === 'stable' ? 'signal-stable' : 'signal-decline';
      const signalIcon = n.signal === 'growing' ? '&#9650;' : n.signal === 'stable' ? '&#9644;' : '&#9660;';
      return `
        <div class="forecast-card niche-health-card">
          <div class="forecast-card-header">
            <div class="forecast-card-title">
              <a href="#" class="browse-niche-link" data-niche="${escapeHtml(n.name)}">${escapeHtml(n.name)}</a>
            </div>
            <span class="signal-badge ${signalClass}">${signalIcon} ${n.signal}</span>
          </div>
          <div class="health-score-ring">
            <svg viewBox="0 0 36 36" class="health-ring">
              <path class="health-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
              <path class="health-ring-fill ${signalClass}" stroke-dasharray="${n.health}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
              <text x="18" y="20.5" class="health-ring-text">${n.health}</text>
            </svg>
          </div>
          <div class="forecast-metrics">
            <div class="forecast-metric">
              <span class="forecast-metric-label">Demand Ratio</span>
              <span class="forecast-metric-value">${n.demandRatio.toFixed(1)}x</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Avg Annual Profit</span>
              <span class="forecast-metric-value" style="color:var(--success)">${formatUSD(n.annualProfit)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Annual ROI</span>
              <span class="forecast-metric-value" style="color:var(--accent)">${formatPercent(n.roi)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Active / Sold</span>
              <span class="forecast-metric-value">${n.activeCount} / ${n.soldCount}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind browse links
    el.querySelectorAll('.browse-niche-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        browseByNiche(link.dataset.niche);
      });
    });
  }

  function renderNicheHealthChart(nicheScores) {
    destroyChart('nicheHealth');
    const canvas = $('#chart-niche-health');
    if (!canvas) return;

    const labels = nicheScores.map(n => n.name);
    const healthData = nicheScores.map(n => n.health);
    const colors = nicheScores.map(n =>
      n.signal === 'growing' ? 'rgba(46, 160, 67, 0.8)' :
      n.signal === 'stable' ? 'rgba(210, 153, 34, 0.8)' :
      'rgba(218, 54, 51, 0.8)'
    );

    state.charts.nicheHealth = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Health Score',
          data: healthData,
          backgroundColor: colors,
          borderRadius: 4,
        }]
      },
      options: hBarOpts({ title: 'Niche Health Score', yLabel: '', xLabel: 'Health (0-100)' })
    });
  }

  // --- Risk Assessment Table ---
  function renderRiskAssessment(forSale, md) {
    const table = dom.riskAssessmentTable;
    if (!table) return;

    const rows = forSale.map(l => {
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const price = parseFloat(l.listing_price || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const risk = calculateRisk(l, md);

      return {
        _name: `#${num}`, _num: num, _niches: niches.join(', '),
        price, monthlyProfit: profit,
        overpricing: Math.round(risk.overpricing),
        immaturity: Math.round(risk.immaturity),
        lowMargin: Math.round(risk.lowMargin),
        saturation: Math.round(risk.saturation),
        effort: Math.round(risk.effort),
        concentration: Math.round(risk.concentration),
        riskTotal: risk.total,
      };
    })
    .sort((a, b) => a.riskTotal - b.riskTotal)
    .slice(0, 50);

    const riskBar = (val, max) => {
      const pct = Math.min(100, (val / max) * 100);
      const color = pct <= 33 ? 'var(--success)' : pct <= 66 ? 'var(--warning)' : 'var(--danger)';
      return `<div class="mini-risk-bar"><div class="mini-risk-fill" style="width:${pct}%;background:${color}"></div></div><span>${val}</span>`;
    };

    const columns = [
      { key: '_rank', label: '#' },
      { key: '_name', label: 'Listing', render: r => `<a href="https://empireflippers.com/listing/${escapeHtml(String(r._num))}" target="_blank" rel="noopener">${escapeHtml(r._name)}</a>` },
      { key: 'price', label: 'Price', render: r => formatUSD(r.price) },
      { key: 'monthlyProfit', label: 'Mo. Profit', tdClass: 'profit-cell', render: r => formatUSD(r.monthlyProfit) },
      { key: 'overpricing', label: 'Overprice', render: r => riskBar(r.overpricing, 20) },
      { key: 'immaturity', label: 'Immature', render: r => riskBar(r.immaturity, 20) },
      { key: 'lowMargin', label: 'Low Margin', render: r => riskBar(r.lowMargin, 15) },
      { key: 'saturation', label: 'Saturated', render: r => riskBar(r.saturation, 15) },
      { key: 'effort', label: 'Effort', render: r => riskBar(r.effort, 15) },
      { key: 'concentration', label: 'Concentr.', render: r => riskBar(r.concentration, 15) },
      { key: 'riskTotal', label: 'Total Risk', render: r => `<span class="risk-total-badge ${getRiskClass(r.riskTotal)}">${r.riskTotal}/100 ${getRiskLabel(r.riskTotal)}</span>` },
    ];

    buildSortableLeaderboard(table, columns, rows, 'riskTotal', 'asc');
  }

  // --- Passive Income Scorecard ---
  function renderPassiveIncome(forSale, md) {
    const el = dom.passiveIncomeGrid;
    if (!el) return;

    const items = forSale.map(l => {
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const price = parseFloat(l.listing_price || 0);
      const hours = l.hours_worked_per_week;
      const multiple = parseFloat(l.listing_multiple || 0);

      if (hours == null || hours <= 0 || profit <= 0) return null;

      const profitPerHour = profit / hours;
      const annualProfitPerHour = profitPerHour * 12;
      const annualProfit = profit * 12;
      const roi = price > 0 ? (annualProfit / price * 100) : 0;
      const monthlyPerDollar = price > 0 ? (profit / price * 1000) : 0;

      return {
        listing: l, num, niches, profit, price, hours, multiple,
        profitPerHour, annualProfitPerHour, annualProfit, roi, monthlyPerDollar
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.profitPerHour - a.profitPerHour)
    .slice(0, 30);

    el.innerHTML = items.map((f, i) => {
      const efficiency = f.hours <= 5 ? 'Highly Passive' : f.hours <= 10 ? 'Semi-Passive' : f.hours <= 20 ? 'Part-Time' : 'Active';
      const effClass = f.hours <= 5 ? 'eff-excellent' : f.hours <= 10 ? 'eff-good' : f.hours <= 20 ? 'eff-fair' : 'eff-active';
      return `
        <div class="forecast-card passive-card">
          <div class="forecast-card-header">
            <div class="forecast-card-title">
              <span class="forecast-rank">${i + 1}</span>
              <a href="https://empireflippers.com/listing/${escapeHtml(String(f.num))}" target="_blank" rel="noopener">#${escapeHtml(String(f.num))}</a>
              <span class="forecast-niche">${f.niches.map(n => escapeHtml(n)).join(', ')}</span>
            </div>
            <span class="forecast-badge ${effClass}">${efficiency}</span>
          </div>
          <div class="passive-hero">
            <div class="passive-hero-value">${formatUSD(f.profitPerHour)}</div>
            <div class="passive-hero-label">profit / hour / week</div>
          </div>
          <div class="forecast-metrics">
            <div class="forecast-metric">
              <span class="forecast-metric-label">Monthly Profit</span>
              <span class="forecast-metric-value" style="color:var(--success)">${formatUSD(f.profit)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Hours/Week</span>
              <span class="forecast-metric-value">${f.hours}h</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Price</span>
              <span class="forecast-metric-value">${formatUSD(f.price)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Annual ROI</span>
              <span class="forecast-metric-value" style="color:var(--accent)">${formatPercent(f.roi)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('') || '<p class="empty-state">No passive income data available (listings missing hours data).</p>';
  }

  // =====================================================================
  //  NEW ANALYSIS: Undervalued Z-Score
  // =====================================================================
  function renderUndervalued(forSale, md) {
    const table = dom.undervaluedTable;
    if (!table) return;

    const rows = forSale.map(l => {
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const multiple = parseFloat(l.listing_multiple || 0);
      const price = parseFloat(l.listing_price || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);

      const nicheMults = niches.flatMap(n => (md.nicheAcc[n] || { multiple: [] }).multiple);
      const nichePrices = niches.flatMap(n => (md.nicheAcc[n] || { price: [] }).price);

      const meanMult = robustAvg(nicheMults);
      const stdMult = stdDev(nicheMults);
      const meanPrice = robustAvg(nichePrices);
      const stdPrice = stdDev(nichePrices);

      const zMult = stdMult > 0 && multiple > 0 ? (multiple - meanMult) / stdMult : 0;
      const zPrice = stdPrice > 0 && price > 0 ? (price - meanPrice) / stdPrice : 0;
      const zCombo = (zMult + zPrice) / 2;

      const discount = meanMult > 0 && multiple > 0 ? ((meanMult - multiple) / meanMult * 100) : 0;

      return {
        _name: `#${num}`, _num: num, _niches: niches.join(', '),
        price, profit, multiple, meanMult, zMult, zPrice, zCombo, discount,
        annualProfit: profit * 12,
        n: nicheMults.length,
      };
    })
    .filter(r => r.zCombo < -0.3 && r.profit > 0 && r.n >= 3)
    .sort((a, b) => a.zCombo - b.zCombo)
    .slice(0, 40);

    const columns = [
      { key: '_rank', label: '#' },
      { key: '_name', label: 'Listing', render: r => `<a href="https://empireflippers.com/listing/${escapeHtml(String(r._num))}" target="_blank" rel="noopener">${escapeHtml(r._name)}</a>` },
      { key: '_niches', label: 'Niche', render: r => escapeHtml(r._niches) },
      { key: 'price', label: 'Price', render: r => formatUSD(r.price) },
      { key: 'multiple', label: 'Multiple', render: r => formatMultiple(r.multiple) },
      { key: 'meanMult', label: 'Niche Avg', render: r => formatMultiple(r.meanMult) },
      { key: 'discount', label: 'Discount', tdClass: 'profit-cell', render: r => `${r.discount > 0 ? '+' : ''}${formatPercent(r.discount)}` },
      { key: 'zCombo', label: 'Z-Score', render: r => `<span class="z-score-badge ${r.zCombo < -1.5 ? 'z-extreme' : r.zCombo < -0.8 ? 'z-strong' : 'z-mild'}">${r.zCombo.toFixed(2)}</span>` },
      { key: 'annualProfit', label: 'Annual Profit', tdClass: 'profit-cell', render: r => formatUSD(r.annualProfit) },
      { key: 'n', label: 'n', render: r => `<span class="confidence-badge ${r.n >= 10 ? 'conf-high' : r.n >= 5 ? 'conf-med' : 'conf-low'}">${r.n}</span>` },
    ];

    buildSortableLeaderboard(table, columns, rows, 'zCombo', 'asc');
  }

  function stdDev(arr) {
    if (arr.length < 2) return 0;
    const cleaned = removeOutliers(arr);
    if (cleaned.length < 2) return 0;
    const mean = cleaned.reduce((a, b) => a + b, 0) / cleaned.length;
    const variance = cleaned.reduce((sum, v) => sum + (v - mean) ** 2, 0) / cleaned.length;
    return Math.sqrt(variance);
  }

  // =====================================================================
  //  NEW ANALYSIS: Multiple Arbitrage Detector
  // =====================================================================
  function renderArbitrage(forSale, sold, md) {
    const el = dom.arbitrageGrid;
    if (!el) return;

    // Build sold multiples per niche
    const nicheSoldMults = {};
    sold.forEach(l => {
      const mult = parseFloat(l.listing_multiple || 0);
      if (mult <= 0) return;
      getNicheNames(l).forEach(n => {
        if (!nicheSoldMults[n]) nicheSoldMults[n] = [];
        nicheSoldMults[n].push(mult);
      });
    });

    const items = forSale.map(l => {
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const multiple = parseFloat(l.listing_multiple || 0);
      const price = parseFloat(l.listing_price || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);

      const soldMults = niches.flatMap(n => nicheSoldMults[n] || []);
      const medianSoldMult = median(soldMults);

      if (multiple <= 0 || medianSoldMult <= 0 || soldMults.length < 3) return null;

      const spread = medianSoldMult - multiple;
      const spreadPct = (spread / multiple) * 100;
      const impliedValue = profit * medianSoldMult;
      const arbitrageProfit = impliedValue - price;

      return {
        listing: l, num, niches, multiple, price, profit,
        medianSoldMult, spread, spreadPct,
        impliedValue, arbitrageProfit, n: soldMults.length
      };
    })
    .filter(f => f && f.spread > 0 && f.profit > 0)
    .sort((a, b) => b.arbitrageProfit - a.arbitrageProfit)
    .slice(0, 25);

    el.innerHTML = items.map((f, i) => `
      <div class="forecast-card">
        <div class="forecast-card-header">
          <div class="forecast-card-title">
            <span class="forecast-rank">${i + 1}</span>
            <a href="https://empireflippers.com/listing/${escapeHtml(String(f.num))}" target="_blank" rel="noopener">#${escapeHtml(String(f.num))}</a>
            <span class="forecast-niche">${f.niches.map(n => escapeHtml(n)).join(', ')}</span>
          </div>
          <span class="forecast-badge badge-excellent">+${formatPercent(f.spreadPct)} spread</span>
        </div>
        <div class="forecast-metrics">
          <div class="forecast-metric">
            <span class="forecast-metric-label">Asking Multiple</span>
            <span class="forecast-metric-value">${formatMultiple(f.multiple)}</span>
          </div>
          <div class="forecast-metric">
            <span class="forecast-metric-label">Median Sold Multiple</span>
            <span class="forecast-metric-value" style="color:var(--success)">${formatMultiple(f.medianSoldMult)}</span>
          </div>
          <div class="forecast-metric">
            <span class="forecast-metric-label">Asking Price</span>
            <span class="forecast-metric-value">${formatUSD(f.price)}</span>
          </div>
          <div class="forecast-metric">
            <span class="forecast-metric-label">Implied Value</span>
            <span class="forecast-metric-value" style="color:var(--success)">${formatUSD(f.impliedValue)}</span>
          </div>
          <div class="forecast-metric">
            <span class="forecast-metric-label">Arbitrage Profit</span>
            <span class="forecast-metric-value" style="color:var(--success)">${formatUSD(f.arbitrageProfit)}</span>
          </div>
          <div class="forecast-metric">
            <span class="forecast-metric-label">Sold Comps</span>
            <span class="forecast-metric-value"><span class="confidence-badge ${f.n >= 10 ? 'conf-high' : f.n >= 5 ? 'conf-med' : 'conf-low'}">${f.n}</span></span>
          </div>
        </div>
      </div>
    `).join('') || '<p class="empty-state">No arbitrage opportunities found.</p>';
  }

  // =====================================================================
  //  NEW ANALYSIS: Comparable Sales
  // =====================================================================
  function renderComps(forSale, sold, md) {
    const el = dom.compsGrid;
    if (!el) return;

    // Pre-index sold by niche
    const soldByNiche = {};
    sold.forEach(l => {
      getNicheNames(l).forEach(n => {
        if (!soldByNiche[n]) soldByNiche[n] = [];
        soldByNiche[n].push(l);
      });
    });

    // For top 20 scored active listings, find comps
    const scored = forSale
      .map(l => ({ listing: l, ...calculateDealScore(l, md) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    el.innerHTML = scored.map(item => {
      const l = item.listing;
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const price = parseFloat(l.listing_price || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const multiple = parseFloat(l.listing_multiple || 0);

      // Find most similar sold listings (same niche, closest profit)
      const candidates = niches.flatMap(n => soldByNiche[n] || []);
      const uniqueMap = new Map();
      candidates.forEach(c => uniqueMap.set(c.listing_number || c.id, c));
      const comps = [...uniqueMap.values()]
        .map(c => {
          const cProfit = parseFloat(c.average_monthly_net_profit || 0);
          const cPrice = parseFloat(c.listing_price || 0);
          const cMult = parseFloat(c.listing_multiple || 0);
          const similarity = profit > 0 && cProfit > 0 ? 1 - Math.abs(profit - cProfit) / Math.max(profit, cProfit) : 0;
          return { listing: c, num: c.listing_number || c.id, profit: cProfit, price: cPrice, multiple: cMult, similarity };
        })
        .filter(c => c.similarity > 0.3 && c.profit > 0)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 4);

      if (!comps.length) return '';

      const avgCompMult = robustAvg(comps.map(c => c.multiple).filter(m => m > 0));
      const avgCompPrice = robustAvg(comps.map(c => c.price).filter(p => p > 0));
      const fairValue = profit > 0 && avgCompMult > 0 ? profit * avgCompMult : 0;

      return `
        <div class="forecast-card comps-card">
          <div class="forecast-card-header">
            <div class="forecast-card-title">
              <a href="https://empireflippers.com/listing/${escapeHtml(String(num))}" target="_blank" rel="noopener">#${escapeHtml(String(num))}</a>
              <span class="forecast-niche">${niches.map(n => escapeHtml(n)).join(', ')}</span>
            </div>
            <span class="forecast-badge ${fairValue > price ? 'badge-excellent' : 'badge-fair'}">${fairValue > price ? 'Below comps' : 'At/above comps'}</span>
          </div>
          <div class="comps-subject">
            <div class="forecast-metrics" style="margin-bottom:10px">
              <div class="forecast-metric"><span class="forecast-metric-label">Asking</span><span class="forecast-metric-value">${formatUSD(price)}</span></div>
              <div class="forecast-metric"><span class="forecast-metric-label">Fair Value (comps)</span><span class="forecast-metric-value" style="color:var(--accent)">${formatUSD(fairValue)}</span></div>
              <div class="forecast-metric"><span class="forecast-metric-label">Asking Multiple</span><span class="forecast-metric-value">${formatMultiple(multiple)}</span></div>
              <div class="forecast-metric"><span class="forecast-metric-label">Avg Comp Multiple</span><span class="forecast-metric-value">${formatMultiple(avgCompMult)}</span></div>
            </div>
          </div>
          <div class="comps-list">
            <div class="comps-list-title">Comparable Sold Businesses</div>
            ${comps.map(c => `
              <div class="comp-row">
                <a href="https://empireflippers.com/listing/${escapeHtml(String(c.num))}" target="_blank" rel="noopener">#${escapeHtml(String(c.num))}</a>
                <span class="comp-detail">Sold at ${formatMultiple(c.multiple)} &bull; ${formatUSD(c.price)} &bull; ${formatUSD(c.profit)}/mo</span>
                <span class="comp-similarity">${Math.round(c.similarity * 100)}% match</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).filter(Boolean).join('') || '<p class="empty-state">No comparable sales data found.</p>';
  }

  // =====================================================================
  //  NEW ANALYSIS: Days on Market
  // =====================================================================
  function renderDaysOnMarket(forSale) {
    const table = dom.daysOnMarketTable;
    if (!table) return;

    const now = Date.now();
    const rows = forSale.map(l => {
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const price = parseFloat(l.listing_price || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const multiple = parseFloat(l.listing_multiple || 0);
      const listedAt = l.first_listed_at || l.created_at;
      const daysOnMarket = listedAt ? Math.max(0, Math.round((now - new Date(listedAt).getTime()) / (1000 * 60 * 60 * 24))) : 0;

      return {
        _name: `#${num}`, _num: num, _niches: niches.join(', '),
        price, profit, multiple, daysOnMarket,
        annualProfit: profit * 12,
        annualROI: multiple > 0 ? (12 / multiple) * 100 : 0,
        stale: daysOnMarket > 60,
      };
    })
    .filter(r => r.daysOnMarket > 0 && r.profit > 0)
    .sort((a, b) => b.daysOnMarket - a.daysOnMarket)
    .slice(0, 50);

    const columns = [
      { key: '_rank', label: '#' },
      { key: '_name', label: 'Listing', render: r => `<a href="https://empireflippers.com/listing/${escapeHtml(String(r._num))}" target="_blank" rel="noopener">${escapeHtml(r._name)}</a>` },
      { key: '_niches', label: 'Niche', render: r => escapeHtml(r._niches) },
      { key: 'daysOnMarket', label: 'Days Listed', render: r => `<span class="dom-badge ${r.daysOnMarket > 90 ? 'dom-stale' : r.daysOnMarket > 30 ? 'dom-aging' : 'dom-fresh'}">${r.daysOnMarket}d</span>` },
      { key: 'price', label: 'Price', render: r => formatUSD(r.price) },
      { key: 'profit', label: 'Mo. Profit', tdClass: 'profit-cell', render: r => formatUSD(r.profit) },
      { key: 'multiple', label: 'Multiple', render: r => formatMultiple(r.multiple) },
      { key: 'annualROI', label: 'Annual ROI', tdClass: 'roi-cell', render: r => formatPercent(r.annualROI) },
    ];

    buildSortableLeaderboard(table, columns, rows, 'daysOnMarket', 'desc');
  }

  // =====================================================================
  //  NEW ANALYSIS: Budget Optimizer
  // =====================================================================
  function renderBudgetOptimizer(forSale, md) {
    const el = dom.budgetTiers;
    if (!el) return;

    const budgets = [50000, 100000, 250000, 500000, 1000000];
    const scored = forSale
      .map(l => ({ listing: l, ...calculateDealScore(l, md) }))
      .filter(s => parseFloat(s.listing.listing_price || 0) > 0 && parseFloat(s.listing.average_monthly_net_profit || 0) > 0)
      .sort((a, b) => b.score - a.score);

    el.innerHTML = budgets.map(budget => {
      // Best single listing
      const bestSingle = scored.find(s => parseFloat(s.listing.listing_price) <= budget);

      // Best portfolio (greedy: pick highest-scored that fits remaining budget)
      const portfolio = [];
      let remaining = budget;
      const used = new Set();
      for (const s of scored) {
        const p = parseFloat(s.listing.listing_price);
        const id = s.listing.listing_number || s.listing.id;
        if (p <= remaining && !used.has(id) && portfolio.length < 3) {
          portfolio.push(s);
          remaining -= p;
          used.add(id);
        }
      }

      const totalCost = portfolio.reduce((s, p) => s + parseFloat(p.listing.listing_price), 0);
      const totalMonthlyProfit = portfolio.reduce((s, p) => s + parseFloat(p.listing.average_monthly_net_profit), 0);
      const totalAnnualProfit = totalMonthlyProfit * 12;
      const portfolioROI = totalCost > 0 ? (totalAnnualProfit / totalCost * 100) : 0;
      const uniqueNiches = new Set(portfolio.flatMap(p => getNicheNames(p.listing)));

      const singlePrice = bestSingle ? parseFloat(bestSingle.listing.listing_price) : 0;
      const singleProfit = bestSingle ? parseFloat(bestSingle.listing.average_monthly_net_profit) * 12 : 0;
      const singleROI = singlePrice > 0 ? (singleProfit / singlePrice * 100) : 0;

      return `
        <div class="budget-tier">
          <div class="budget-tier-header">
            <h3 class="budget-tier-amount">${formatUSD(budget)}</h3>
          </div>
          <div class="budget-columns">
            <div class="budget-col">
              <div class="budget-col-title">Best Single Listing</div>
              ${bestSingle ? `
                <a href="https://empireflippers.com/listing/${escapeHtml(String(bestSingle.listing.listing_number || bestSingle.listing.id))}" target="_blank" rel="noopener" class="budget-listing-link">#${escapeHtml(String(bestSingle.listing.listing_number || bestSingle.listing.id))}</a>
                <span class="budget-niche">${getNicheNames(bestSingle.listing).map(n => escapeHtml(n)).join(', ')}</span>
                <div class="budget-stats">
                  <span>Price: ${formatUSD(singlePrice)}</span>
                  <span>Annual Profit: <strong style="color:var(--success)">${formatUSD(singleProfit)}</strong></span>
                  <span>ROI: <strong style="color:var(--accent)">${formatPercent(singleROI)}</strong></span>
                  <span>Score: <strong>${bestSingle.score}/100</strong></span>
                </div>
              ` : '<p class="text-muted">No listing fits this budget</p>'}
            </div>
            <div class="budget-col">
              <div class="budget-col-title">Best Portfolio (up to 3)</div>
              ${portfolio.length ? `
                ${portfolio.map(p => {
                  const pNum = p.listing.listing_number || p.listing.id;
                  return `<div class="budget-portfolio-item">
                    <a href="https://empireflippers.com/listing/${escapeHtml(String(pNum))}" target="_blank" rel="noopener">#${escapeHtml(String(pNum))}</a>
                    <span>${formatUSD(parseFloat(p.listing.listing_price))} &bull; ${formatUSD(parseFloat(p.listing.average_monthly_net_profit))}/mo &bull; Score ${p.score}</span>
                  </div>`;
                }).join('')}
                <div class="budget-portfolio-summary">
                  <span>Total: ${formatUSD(totalCost)} invested</span>
                  <span>Combined Annual Profit: <strong style="color:var(--success)">${formatUSD(totalAnnualProfit)}</strong></span>
                  <span>Portfolio ROI: <strong style="color:var(--accent)">${formatPercent(portfolioROI)}</strong></span>
                  <span>Diversification: <strong>${uniqueNiches.size} niches</strong></span>
                </div>
              ` : '<p class="text-muted">No listings fit this budget</p>'}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // =====================================================================
  //  BUSINESS EFFICIENCY MAPS — Revenue vs Profit + Margin vs Price
  // =====================================================================
  function renderScatterRevProfit(forSale) {
    destroyChart('scatterRevProfit');
    destroyChart('scatterMarginPrice');
    const canvas1 = $('#chart-scatter-rev-profit');
    const canvas2 = $('#chart-scatter-margin-price');
    if (!canvas1 && !canvas2) return;

    // Build shared data
    const allData = forSale
      .map(l => {
        const revenue = parseFloat(l.average_monthly_gross_revenue || 0);
        const profit = parseFloat(l.average_monthly_net_profit || 0);
        const price = parseFloat(l.listing_price || 0);
        const multiple = parseFloat(l.listing_multiple || 0);
        const margin = revenue > 0 ? (profit / revenue * 100) : 0;
        const num = l.listing_number || l.id;
        const niche = getNicheNames(l)[0] || 'Unknown';
        if (revenue <= 0 || profit <= 0 || price <= 0) return null;
        return { revenue, profit, price, multiple, margin, num, niche };
      })
      .filter(Boolean);

    // Shared color by margin
    function marginColor(m, alpha) {
      if (m >= 50) return 'rgba(46, 160, 67, ' + alpha + ')';
      if (m >= 30) return 'rgba(210, 153, 34, ' + alpha + ')';
      return 'rgba(218, 54, 51, ' + alpha + ')';
    }

    function scatterTooltip(ctx) {
      const d = ctx.raw;
      return [
        'Listing #' + d.num + ' — ' + d.niche,
        'Revenue: ' + formatUSD(d.revenue) + '/mo',
        'Profit: ' + formatUSD(d.profit) + '/mo',
        'Margin: ' + d.margin.toFixed(1) + '%',
        'Price: ' + formatUSD(d.price),
        'Multiple: ' + d.multiple.toFixed(1) + 'x',
        '(click to open)'
      ];
    }

    function scatterClick(filtered) {
      return function(evt, elements) {
        var pts = elements.filter(function(e) { return e.datasetIndex === 1; });
        if (pts.length > 0) {
          var d = filtered[pts[0].index];
          window.open('https://empireflippers.com/listing/' + d.num, '_blank');
        }
      };
    }

    function fmtDollar(v) {
      return v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'K' : '$' + v;
    }

    // --- Chart 1: Revenue vs Profit ---
    if (canvas1) {
      var revs = allData.map(function(d) { return d.revenue; });
      var cleanRevs = removeOutliers(revs);
      var maxRev = cleanRevs.length ? Math.max.apply(null, cleanRevs) * 1.1 : 100000;
      var f1 = allData.filter(function(d) { return d.revenue <= maxRev; });
      var d1 = f1.map(function(d) { return { x: d.revenue, y: d.profit, num: d.num, niche: d.niche, margin: d.margin, price: d.price, revenue: d.revenue, profit: d.profit, multiple: d.multiple }; });
      var c1 = f1.map(function(d) { return marginColor(d.margin, 0.8); });
      var b1 = f1.map(function(d) { return marginColor(d.margin, 1); });

      // 100% margin diagonal
      var diagMax = Math.min(maxRev, Math.max.apply(null, f1.map(function(d) { return d.profit; })) * 1.2);

      state.charts.scatterRevProfit = new Chart(canvas1, {
        type: 'scatter',
        data: {
          datasets: [
            {
              label: '100% Margin',
              data: [{ x: 0, y: 0 }, { x: diagMax, y: diagMax }],
              type: 'line',
              borderColor: 'rgba(139, 148, 158, 0.3)',
              borderDash: [6, 4],
              borderWidth: 1.5,
              pointRadius: 0,
              fill: false,
              order: 1,
            },
            {
              label: 'Listings',
              data: d1,
              backgroundColor: c1,
              borderColor: b1,
              borderWidth: 1.5,
              pointRadius: 6,
              pointHoverRadius: 10,
              order: 0,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              filter: function(item) { return item.datasetIndex === 1; },
              callbacks: { title: function() { return ''; }, label: scatterTooltip }
            }
          },
          scales: {
            x: {
              title: { display: true, text: 'Monthly Revenue', color: '#8b949e', font: { size: 12 } },
              ticks: { color: '#8b949e', callback: fmtDollar },
              grid: { color: 'rgba(45,49,72,0.4)' },
              min: 0,
            },
            y: {
              title: { display: true, text: 'Monthly Profit', color: '#8b949e', font: { size: 12 } },
              ticks: { color: '#8b949e', callback: fmtDollar },
              grid: { color: 'rgba(45,49,72,0.4)' },
              min: 0,
            }
          },
          onClick: scatterClick(d1)
        }
      });
    }

    // --- Chart 2: Margin vs Price ---
    if (canvas2) {
      var pvals = allData.map(function(d) { return d.price; });
      var cleanP = removeOutliers(pvals);
      var maxP = cleanP.length ? Math.max.apply(null, cleanP) * 1.1 : 5000000;
      var f2 = allData.filter(function(d) { return d.price <= maxP; });
      var d2 = f2.map(function(d) { return { x: d.price, y: d.margin, num: d.num, niche: d.niche, margin: d.margin, price: d.price, revenue: d.revenue, profit: d.profit, multiple: d.multiple }; });
      var c2 = f2.map(function(d) { return marginColor(d.margin, 0.8); });
      var b2 = f2.map(function(d) { return marginColor(d.margin, 1); });

      // Sizes by profit
      var profs = f2.map(function(d) { return d.profit; });
      var minProf = Math.min.apply(null, profs) || 1;
      var maxProf = Math.max.apply(null, profs) || 1;
      var sz = f2.map(function(d) {
        var norm = maxProf > minProf ? (d.profit - minProf) / (maxProf - minProf) : 0.5;
        return 5 + norm * 12;
      });

      // Median margin line
      var sortedMargins = f2.map(function(d) { return d.margin; }).sort(function(a, b) { return a - b; });
      var medMargin = sortedMargins.length ? sortedMargins[Math.floor(sortedMargins.length / 2)] : 50;

      state.charts.scatterMarginPrice = new Chart(canvas2, {
        type: 'scatter',
        data: {
          datasets: [
            {
              label: 'Median Margin',
              data: [{ x: 0, y: medMargin }, { x: maxP, y: medMargin }],
              type: 'line',
              borderColor: 'rgba(139, 148, 158, 0.4)',
              borderDash: [6, 4],
              borderWidth: 1.5,
              pointRadius: 0,
              fill: false,
              order: 1,
            },
            {
              label: 'Listings',
              data: d2,
              backgroundColor: c2,
              borderColor: b2,
              borderWidth: 1.5,
              pointRadius: sz,
              pointHoverRadius: sz.map(function(s) { return s + 4; }),
              order: 0,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              filter: function(item) { return item.datasetIndex === 1; },
              callbacks: { title: function() { return ''; }, label: scatterTooltip }
            }
          },
          scales: {
            x: {
              title: { display: true, text: 'Listing Price', color: '#8b949e', font: { size: 12 } },
              ticks: { color: '#8b949e', callback: fmtDollar },
              grid: { color: 'rgba(45,49,72,0.4)' },
              min: 0,
            },
            y: {
              title: { display: true, text: 'Profit Margin %', color: '#8b949e', font: { size: 12 } },
              ticks: { color: '#8b949e', callback: function(v) { return v + '%'; } },
              grid: { color: 'rgba(45,49,72,0.4)' },
              min: 0,
              max: 100,
            }
          },
          onClick: scatterClick(d2)
        }
      });
    }
  }

  // =====================================================================
  //  NEW ANALYSIS: Seasonality Patterns
  // =====================================================================
  function renderSeasonality(sold) {
    destroyChart('seasonalityMultiple');
    destroyChart('seasonalityVolume');

    const canvasMult = $('#chart-seasonality-multiple');
    const canvasVol = $('#chart-seasonality-volume');
    if (!canvasMult && !canvasVol) return;

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthData = Array.from({ length: 12 }, () => ({ multiples: [], count: 0, prices: [] }));

    sold.forEach(l => {
      const soldDate = l.sold_date || l.sold_at || l.updated_at;
      if (!soldDate) return;
      const d = new Date(soldDate);
      if (isNaN(d.getTime())) return;
      const month = d.getMonth();
      const mult = parseFloat(l.listing_multiple || 0);
      const price = parseFloat(l.listing_price || 0);
      monthData[month].count++;
      if (mult > 0) monthData[month].multiples.push(mult);
      if (price > 0) monthData[month].prices.push(price);
    });

    const avgMults = monthData.map(m => robustAvg(m.multiples));
    const volumes = monthData.map(m => m.count);
    const overallAvgMult = robustAvg(avgMults.filter(m => m > 0));

    // Find cheapest months
    const minMult = Math.min(...avgMults.filter(m => m > 0));

    if (canvasMult) {
      const barColors = avgMults.map(m => m > 0 && m <= minMult * 1.05 ? 'rgba(46, 160, 67, 0.8)' : 'rgba(79, 134, 247, 0.6)');

      state.charts.seasonalityMultiple = new Chart(canvasMult, {
        type: 'bar',
        data: {
          labels: monthNames,
          datasets: [{
            label: 'Avg Sold Multiple',
            data: avgMults,
            backgroundColor: barColors,
            borderRadius: 4,
          }]
        },
        options: vBarOpts({ title: '', yLabel: 'Multiple' })
      });
    }

    if (canvasVol) {
      state.charts.seasonalityVolume = new Chart(canvasVol, {
        type: 'bar',
        data: {
          labels: monthNames,
          datasets: [{
            label: 'Sales Volume',
            data: volumes,
            backgroundColor: 'rgba(79, 134, 247, 0.6)',
            borderRadius: 4,
          }]
        },
        options: vBarOpts({ title: '', yLabel: 'Sales Count' })
      });
    }
  }

  // =====================================================================
  //  BUILD vs BUY — AI REPLICABILITY ANALYSIS
  // =====================================================================

  // Replicability score by monetization type (0-100, higher = easier to replicate)
  const MONETIZATION_REPLICABILITY = {
    'Display Advertising': 90,
    'Advertising': 90,
    'Adsense': 90,
    'Affiliate': 80,
    'Amazon Associates': 80,
    'Info Products': 75,
    'Digital Products': 70,
    'SaaS': 55,
    'Subscription': 50,
    'eCommerce': 35,
    'Dropshipping': 45,
    'Amazon FBA': 20,
    'FBA': 20,
    'Amazon KDP': 65,
    'KDP': 65,
    'Lead Generation': 60,
    'Service': 25,
    'Services': 25,
    'Marketplace': 40,
    'App': 50,
    'Software': 50,
    'Membership': 45,
  };

  function calculateReplicability(listing, md) {
    const niches = getNicheNames(listing);
    const mons = getMonetizationNames(listing);
    const ageMonths = getAgeMonths(listing);
    const price = parseFloat(listing.listing_price || 0);
    const profit = parseFloat(listing.average_monthly_net_profit || 0);
    const revenue = parseFloat(listing.average_monthly_gross_revenue || 0);
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const hours = listing.hours_worked_per_week;
    const hasTrademark = listing.has_trademark;
    const hasSBA = listing.sba_financing_approved;

    const rep = {};

    // 1. Monetization replicability (0-35): content/ad businesses are easy, physical product businesses are hard
    const monScores = mons.map(m => {
      // Fuzzy match
      const key = Object.keys(MONETIZATION_REPLICABILITY).find(k => m.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(m.toLowerCase()));
      return key ? MONETIZATION_REPLICABILITY[key] : 50;
    });
    rep.monetization = monScores.length ? (monScores.reduce((a, b) => a + b, 0) / monScores.length) * 0.35 : 17;

    // 2. Age penalty (0-25): older businesses have SEO authority, backlinks, reputation that take years to build
    // < 12 months = easy to replicate, > 60 months = very hard
    rep.ageMoat = Math.min(25, ageMonths * 0.4);
    rep.ageReplicable = 25 - rep.ageMoat; // Invert: young = replicable

    // 3. Brand moat (0-15): trademark = strong brand, SBA = institutional trust
    rep.brandMoat = (hasTrademark ? 10 : 0) + (hasSBA ? 5 : 0);
    rep.brandReplicable = 15 - rep.brandMoat;

    // 4. Operational simplicity (0-15): low hours = simple ops, AI can handle
    if (hours != null && hours >= 0) {
      rep.opsReplicable = hours <= 5 ? 15 : hours <= 10 ? 12 : hours <= 20 ? 8 : Math.max(0, 15 - hours * 0.3);
    } else {
      rep.opsReplicable = 8;
    }

    // 5. Margin signal (0-10): very high margins suggest content/digital (easy to replicate), low margins suggest physical/complex
    rep.marginSignal = Math.min(10, margin * 0.15);

    const replicabilityScore = Math.round(
      rep.monetization + rep.ageReplicable + rep.brandReplicable + rep.opsReplicable + rep.marginSignal
    );

    // Moat score is the inverse
    const moatScore = 100 - replicabilityScore;

    // Build cost estimate (very rough): content sites ~$500-5K, SaaS ~$5K-50K, eCommerce ~$10K-100K
    const baseBuildCost = monScores.length ? monScores.reduce((a, b) => a + b, 0) / monScores.length : 50;
    const estimatedBuildCost = baseBuildCost > 70
      ? Math.max(200, profit * 0.5) // Content/affiliate: very cheap
      : baseBuildCost > 50
      ? Math.max(2000, profit * 2)  // SaaS/digital: moderate
      : Math.max(10000, profit * 5); // Physical/complex: expensive

    // Time to replicate (months)
    const estimatedTimeMonths = baseBuildCost > 70 ? 2 : baseBuildCost > 50 ? 6 : 12;

    // Verdict
    let verdict, verdictClass;
    if (replicabilityScore >= 70) {
      verdict = 'Build It';
      verdictClass = 'verdict-build';
    } else if (replicabilityScore >= 50) {
      verdict = 'Consider Building';
      verdictClass = 'verdict-maybe';
    } else if (replicabilityScore >= 30) {
      verdict = 'Lean Buy';
      verdictClass = 'verdict-lean-buy';
    } else {
      verdict = 'Buy It';
      verdictClass = 'verdict-buy';
    }

    // Key moats (human-readable) with detailed categories
    const moats = [];
    const moatDetails = [];
    if (ageMonths > 60) {
      moats.push(`${Math.round(ageMonths / 12)}yr SEO authority`);
      moatDetails.push({ type: 'SEO Authority', icon: 'shield', strength: 'Very Strong', desc: `${Math.round(ageMonths / 12)} years of backlinks, domain authority, and organic rankings that take years to replicate` });
    } else if (ageMonths > 36) {
      moats.push(`${Math.round(ageMonths / 12)}yr SEO authority`);
      moatDetails.push({ type: 'SEO Authority', icon: 'shield', strength: 'Strong', desc: `${Math.round(ageMonths / 12)} years of search presence and domain trust` });
    } else if (ageMonths > 18) {
      moatDetails.push({ type: 'Growing Authority', icon: 'shield', strength: 'Moderate', desc: `${Math.round(ageMonths / 12)}yr history building organic presence` });
    }
    if (hasTrademark) {
      moats.push('Trademarked brand');
      moatDetails.push({ type: 'Brand IP', icon: 'lock', strength: 'Strong', desc: 'Registered trademark — legal protection against copycats' });
    }
    if (hasSBA) {
      moats.push('SBA approved');
      moatDetails.push({ type: 'Institutional Trust', icon: 'bank', strength: 'Moderate', desc: 'SBA-approved — passed financial vetting, easier buyer financing' });
    }
    if (baseBuildCost < 30) {
      moats.push('Physical supply chain');
      moatDetails.push({ type: 'Supply Chain', icon: 'truck', strength: 'Very Strong', desc: 'Physical inventory, supplier relationships, and logistics that AI cannot replicate' });
    } else if (baseBuildCost < 45) {
      moats.push('Product sourcing');
      moatDetails.push({ type: 'Product Moat', icon: 'box', strength: 'Strong', desc: 'Physical products or complex marketplace requiring real-world infrastructure' });
    }
    if (hours != null && hours > 30) {
      moats.push('Complex operations');
      moatDetails.push({ type: 'Operational Complexity', icon: 'gear', strength: 'Moderate', desc: `${hours}h/week operations — requires human expertise and relationships` });
    }
    if (profit > 5000 && margin > 40) {
      moatDetails.push({ type: 'Proven Revenue Engine', icon: 'money', strength: 'Strong', desc: `${formatUSD(profit)}/mo profit with ${margin.toFixed(0)}% margin — validated business model with real customers` });
    }
    // Niche dominance: if this listing's profit is well above niche average
    const nicheAvg = niches.reduce((s, n) => s + (md.nicheAvgProfit[n] || 0), 0) / Math.max(niches.length, 1);
    if (profit > nicheAvg * 1.5 && nicheAvg > 0) {
      moatDetails.push({ type: 'Niche Leader', icon: 'crown', strength: 'Strong', desc: `Profit ${((profit / nicheAvg - 1) * 100).toFixed(0)}% above niche average — market leadership position` });
    }
    // Recurring revenue moat
    const hasRecurring = mons.some(m => /subscription|membership|saas|recurring/i.test(m));
    if (hasRecurring) {
      moatDetails.push({ type: 'Recurring Revenue', icon: 'repeat', strength: 'Strong', desc: 'Subscription/recurring model — predictable cash flow with customer lock-in' });
    }

    // AI advantages
    const aiAdvantages = [];
    if (baseBuildCost > 70) aiAdvantages.push('AI can generate all content');
    if (baseBuildCost > 55) aiAdvantages.push('AI can build the tech stack');
    if (margin > 60) aiAdvantages.push('High-margin digital model');
    if (hours != null && hours < 10) aiAdvantages.push('Simple operations to automate');
    if (ageMonths < 18) aiAdvantages.push('Young domain — no SEO moat to overcome');

    return {
      replicabilityScore: Math.min(100, Math.max(0, replicabilityScore)),
      moatScore: Math.min(100, Math.max(0, moatScore)),
      verdict, verdictClass,
      estimatedBuildCost, estimatedTimeMonths,
      moats, moatDetails, aiAdvantages,
      breakdown: rep,
    };
  }

  // --- Build vs Buy Grid ---
  function renderBuildVsBuy(forSale, md) {
    const el = dom.buildVsBuyGrid;
    if (!el) return;

    const items = forSale.map(l => {
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const mons = getMonetizationNames(l);
      const price = parseFloat(l.listing_price || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const rep = calculateReplicability(l, md);

      return { listing: l, num, niches, mons, price, profit, ...rep };
    })
    .filter(i => i.profit > 0)
    .sort((a, b) => b.replicabilityScore - a.replicabilityScore)
    .slice(0, 30);

    el.innerHTML = items.map((f, i) => {
      const savingsVsBuy = f.price - f.estimatedBuildCost;
      const savingsPct = f.price > 0 ? (savingsVsBuy / f.price * 100) : 0;

      return `
        <div class="forecast-card bvb-card">
          <div class="forecast-card-header">
            <div class="forecast-card-title">
              <span class="forecast-rank">${i + 1}</span>
              <a href="https://empireflippers.com/listing/${escapeHtml(String(f.num))}" target="_blank" rel="noopener">#${escapeHtml(String(f.num))}</a>
              <span class="forecast-niche">${f.mons.map(m => escapeHtml(m)).join(', ')}</span>
            </div>
            <span class="bvb-verdict ${f.verdictClass}">${f.verdict}</span>
          </div>

          <div class="bvb-score-row">
            <div class="bvb-score-bar">
              <div class="bvb-score-fill" style="width:${f.replicabilityScore}%;background:${f.replicabilityScore >= 70 ? 'var(--success)' : f.replicabilityScore >= 50 ? 'var(--warning)' : 'var(--danger)'}"></div>
            </div>
            <span class="bvb-score-value">${f.replicabilityScore}/100 replicable</span>
          </div>

          <div class="forecast-metrics">
            <div class="forecast-metric">
              <span class="forecast-metric-label">Asking Price</span>
              <span class="forecast-metric-value">${formatUSD(f.price)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Est. Build Cost</span>
              <span class="forecast-metric-value" style="color:var(--success)">${formatUSD(f.estimatedBuildCost)}</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Savings vs Buy</span>
              <span class="forecast-metric-value" style="color:var(--success)">${formatUSD(savingsVsBuy)} (${formatPercent(savingsPct)})</span>
            </div>
            <div class="forecast-metric">
              <span class="forecast-metric-label">Est. Build Time</span>
              <span class="forecast-metric-value">${f.estimatedTimeMonths} months</span>
            </div>
          </div>

          ${f.aiAdvantages.length ? `
            <div class="bvb-tags">
              <span class="bvb-tag-label">AI can:</span>
              ${f.aiAdvantages.map(a => `<span class="bvb-tag bvb-tag-ai">${escapeHtml(a)}</span>`).join('')}
            </div>
          ` : ''}

          ${f.moats.length ? `
            <div class="bvb-tags">
              <span class="bvb-tag-label">Moats:</span>
              ${f.moats.map(m => `<span class="bvb-tag bvb-tag-moat">${escapeHtml(m)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('') || '<p class="empty-state">No replicability data available.</p>';
  }

  // --- Strongest Moats (Rich Cards) ---
  function renderMoatTable(forSale, md) {
    const table = dom.moatTable;
    if (!table) return;

    // Repurpose the table container as a card grid
    const parent = table.parentElement.parentElement.parentElement; // table > table-scroll > table-container > dashboard-section
    // Replace table container with a grid
    const container = table.closest('.table-container');
    if (!container) return;

    const items = forSale.map(l => {
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const mons = getMonetizationNames(l);
      const price = parseFloat(l.listing_price || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const multiple = parseFloat(l.listing_multiple || 0);
      const ageMonths = getAgeMonths(l);
      const rep = calculateReplicability(l, md);

      return { listing: l, num, niches, mons, price, profit, multiple, ageMonths, ...rep, annualProfit: profit * 12 };
    })
    .filter(i => i.profit > 0 && i.moatScore >= 55)
    .sort((a, b) => b.moatScore - a.moatScore)
    .slice(0, 25);

    const strengthColor = s => s === 'Very Strong' ? 'var(--danger)' : s === 'Strong' ? 'var(--warning)' : 'var(--accent)';

    const grid = document.createElement('div');
    grid.className = 'forecast-grid';
    grid.innerHTML = items.map((f, i) => `
      <div class="forecast-card moat-card">
        <div class="forecast-card-header">
          <div class="forecast-card-title">
            <span class="forecast-rank">${i + 1}</span>
            <a href="https://empireflippers.com/listing/${escapeHtml(String(f.num))}" target="_blank" rel="noopener">#${escapeHtml(String(f.num))}</a>
            <span class="forecast-niche">${f.niches.map(n => escapeHtml(n)).join(', ')}</span>
          </div>
          <span class="bvb-verdict verdict-buy">${f.moatScore}/100 moat</span>
        </div>

        <div class="forecast-metrics" style="margin-bottom:10px">
          <div class="forecast-metric">
            <span class="forecast-metric-label">Price</span>
            <span class="forecast-metric-value">${formatUSD(f.price)}</span>
          </div>
          <div class="forecast-metric">
            <span class="forecast-metric-label">Annual Profit</span>
            <span class="forecast-metric-value" style="color:var(--success)">${formatUSD(f.annualProfit)}</span>
          </div>
          <div class="forecast-metric">
            <span class="forecast-metric-label">Business Age</span>
            <span class="forecast-metric-value">${f.ageMonths >= 12 ? (f.ageMonths / 12).toFixed(1) + ' years' : f.ageMonths + ' mo'}</span>
          </div>
          <div class="forecast-metric">
            <span class="forecast-metric-label">Type</span>
            <span class="forecast-metric-value">${f.mons.map(m => escapeHtml(m)).join(', ')}</span>
          </div>
        </div>

        <div class="moat-details">
          <div class="moat-details-title">Competitive Moats</div>
          ${f.moatDetails.map(m => `
            <div class="moat-detail-row">
              <div class="moat-detail-header">
                <span class="moat-detail-type">${escapeHtml(m.type)}</span>
                <span class="moat-strength" style="color:${strengthColor(m.strength)}">${m.strength}</span>
              </div>
              <p class="moat-detail-desc">${escapeHtml(m.desc)}</p>
            </div>
          `).join('')}
          ${f.moatDetails.length === 0 ? '<p class="moat-detail-desc">No specific moats identified beyond general market presence.</p>' : ''}
        </div>

        <div class="moat-verdict-row">
          <span class="moat-verdict-text">Hard to replicate with AI. Consider buying.</span>
        </div>
      </div>
    `).join('') || '<p class="empty-state">No strong-moat businesses found.</p>';

    container.replaceWith(grid);
  }

  // --- Most Replicable Table ---
  function renderReplicableTable(forSale, md) {
    const table = dom.replicableTable;
    if (!table) return;

    const rows = forSale.map(l => {
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const mons = getMonetizationNames(l);
      const price = parseFloat(l.listing_price || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const rep = calculateReplicability(l, md);

      return {
        _name: `#${num}`, _num: num,
        niche: niches.join(', '), monetization: mons.join(', '),
        price, annualProfit: profit * 12, monthlyProfit: profit,
        replicabilityScore: rep.replicabilityScore,
        estimatedBuildCost: rep.estimatedBuildCost,
        estimatedTimeMonths: rep.estimatedTimeMonths,
        savings: price - rep.estimatedBuildCost,
        verdict: rep.verdict, verdictClass: rep.verdictClass,
      };
    })
    .filter(r => r.monthlyProfit > 0 && r.replicabilityScore >= 50)
    .sort((a, b) => b.replicabilityScore - a.replicabilityScore)
    .slice(0, 40);

    const columns = [
      { key: '_rank', label: '#' },
      { key: '_name', label: 'Listing', render: r => `<a href="https://empireflippers.com/listing/${escapeHtml(String(r._num))}" target="_blank" rel="noopener">${escapeHtml(r._name)}</a>` },
      { key: 'monetization', label: 'Type', render: r => escapeHtml(r.monetization) },
      { key: 'replicabilityScore', label: 'Replicable', render: r => `<span class="bvb-verdict ${r.verdictClass}">${r.replicabilityScore}/100</span>` },
      { key: 'price', label: 'Asking Price', render: r => formatUSD(r.price) },
      { key: 'estimatedBuildCost', label: 'Build Cost', tdClass: 'profit-cell', render: r => formatUSD(r.estimatedBuildCost) },
      { key: 'savings', label: 'Savings', tdClass: 'profit-cell', render: r => formatUSD(r.savings) },
      { key: 'estimatedTimeMonths', label: 'Build Time', render: r => r.estimatedTimeMonths + ' mo' },
      { key: 'annualProfit', label: 'Annual Profit', tdClass: 'profit-cell', render: r => formatUSD(r.annualProfit) },
    ];

    buildSortableLeaderboard(table, columns, rows, 'replicabilityScore', 'desc');
  }

  // =====================================================================
  //  BUYER'S vs SELLER'S MARKET INDICATOR
  // =====================================================================
  function renderMarketSignal(forSale, sold, md) {
    const el = dom.marketSignalContainer;
    if (!el) return;

    const askingMultiples = forSale.map(l => parseFloat(l.listing_multiple || 0)).filter(m => m > 0);
    const soldMultiples = sold.map(l => parseFloat(l.listing_multiple || 0)).filter(m => m > 0);

    const medianAsking = median(askingMultiples);
    const medianSold = median(soldMultiples);
    const avgAsking = robustAvg(askingMultiples);
    const avgSold = robustAvg(soldMultiples);

    const gap = medianAsking - medianSold;
    const gapPct = medianSold > 0 ? (gap / medianSold * 100) : 0;

    // Compute avg discount from sold data (where we can compare asking vs sold)
    const soldPrices = sold.map(l => parseFloat(l.listing_price || 0)).filter(p => p > 0);
    const askingPrices = forSale.map(l => parseFloat(l.listing_price || 0)).filter(p => p > 0);
    const medianAskingPrice = median(askingPrices);
    const medianSoldPrice = median(soldPrices);

    // Market signal
    let signal, signalClass, signalDesc;
    if (gapPct > 15) {
      signal = "Strong Buyer's Market";
      signalClass = 'signal-buyers';
      signalDesc = `Sellers are asking ${formatPercent(gapPct)} above what buyers actually pay. Lots of negotiation room — be aggressive with offers.`;
    } else if (gapPct > 5) {
      signal = "Moderate Buyer's Market";
      signalClass = 'signal-buyers';
      signalDesc = `Asking multiples are ${formatPercent(gapPct)} above sold multiples. Some negotiation room exists — counter-offer below asking.`;
    } else if (gapPct > -5) {
      signal = 'Balanced Market';
      signalClass = 'signal-neutral';
      signalDesc = 'Asking and sold multiples are closely aligned. Fair pricing — expect modest negotiation room.';
    } else {
      signal = "Seller's Market";
      signalClass = 'signal-sellers';
      signalDesc = 'Businesses are selling at or above asking multiples. Competition among buyers is high — act fast on good deals.';
    }

    const supplyDemand = sold.length > 0 ? (forSale.length / sold.length).toFixed(2) : '--';

    el.innerHTML = `
      <div class="signal-verdict ${signalClass}">
        <div class="signal-verdict-label">${signal}</div>
        <div class="signal-verdict-desc">${signalDesc}</div>
      </div>
      <div class="signal-card">
        <div class="signal-card-title">Median Asking Multiple</div>
        <div class="signal-card-value">${formatMultiple(medianAsking)}</div>
        <div class="signal-card-sub">Avg: ${formatMultiple(avgAsking)}</div>
      </div>
      <div class="signal-card">
        <div class="signal-card-title">Median Sold Multiple</div>
        <div class="signal-card-value" style="color:var(--success)">${formatMultiple(medianSold)}</div>
        <div class="signal-card-sub">Avg: ${formatMultiple(avgSold)}</div>
      </div>
      <div class="signal-card">
        <div class="signal-card-title">Multiple Gap</div>
        <div class="signal-card-value" style="color:${gapPct > 5 ? 'var(--success)' : gapPct < -5 ? 'var(--danger)' : 'var(--warning)'}">${gap > 0 ? '+' : ''}${gap.toFixed(1)}x</div>
        <div class="signal-card-sub">${gapPct > 0 ? '+' : ''}${formatPercent(gapPct)} above sold</div>
      </div>
      <div class="signal-card">
        <div class="signal-card-title">Supply / Demand Ratio</div>
        <div class="signal-card-value">${supplyDemand}x</div>
        <div class="signal-card-sub">${forSale.length} active / ${sold.length} sold</div>
      </div>
      <div class="signal-card">
        <div class="signal-card-title">Median Asking Price</div>
        <div class="signal-card-value">${formatUSD(medianAskingPrice)}</div>
        <div class="signal-card-sub">vs ${formatUSD(medianSoldPrice)} sold</div>
      </div>
    `;
  }

  // =====================================================================
  //  HISTORICAL MULTIPLE TRENDS
  // =====================================================================
  function renderHistoricalTrends(sold) {
    destroyChart('multipleTrends');
    destroyChart('volumeTrends');
    const canvasMult = $('#chart-multiple-trends');
    const canvasVol = $('#chart-volume-trends');
    if (!canvasMult && !canvasVol) return;

    // Group sold listings by quarter
    const quarters = {};
    sold.forEach(l => {
      const soldDate = l.sold_date || l.sold_at || l.updated_at;
      if (!soldDate) return;
      const d = new Date(soldDate);
      if (isNaN(d.getTime())) return;
      const q = `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
      if (!quarters[q]) quarters[q] = { multiples: [], prices: [], count: 0, date: d };
      const mult = parseFloat(l.listing_multiple || 0);
      const price = parseFloat(l.listing_price || 0);
      if (mult > 0) quarters[q].multiples.push(mult);
      if (price > 0) quarters[q].prices.push(price);
      quarters[q].count++;
    });

    const sortedKeys = Object.keys(quarters).sort((a, b) => quarters[a].date - quarters[b].date);
    // Keep last 12 quarters max
    const keys = sortedKeys.slice(-12);
    if (keys.length < 2) return;

    const avgMultiples = keys.map(k => robustAvg(quarters[k].multiples));
    const medMultiples = keys.map(k => median(quarters[k].multiples));
    const volumes = keys.map(k => quarters[k].count);
    const avgPrices = keys.map(k => robustAvg(quarters[k].prices));

    if (canvasMult) {
      state.charts.multipleTrends = new Chart(canvasMult, {
        type: 'line',
        data: {
          labels: keys,
          datasets: [
            {
              label: 'Median Sold Multiple',
              data: medMultiples,
              borderColor: 'rgba(79,134,247,0.9)',
              backgroundColor: 'rgba(79,134,247,0.1)',
              fill: true,
              tension: 0.3,
              pointRadius: 4,
            },
            {
              label: 'Avg Sold Multiple (IQR)',
              data: avgMultiples,
              borderColor: 'rgba(46,160,67,0.7)',
              borderDash: [5, 5],
              fill: false,
              tension: 0.3,
              pointRadius: 3,
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: '#8b949e' } },
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.raw.toFixed(1) + 'x' } },
          },
          scales: {
            x: { ticks: { color: '#6a737d' }, grid: { color: 'rgba(45,49,72,0.5)' } },
            y: { ticks: { color: '#6a737d', callback: v => v + 'x' }, grid: { color: 'rgba(45,49,72,0.5)' } },
          },
        },
      });
    }

    if (canvasVol) {
      state.charts.volumeTrends = new Chart(canvasVol, {
        type: 'bar',
        data: {
          labels: keys,
          datasets: [
            {
              label: 'Sales Volume',
              data: volumes,
              backgroundColor: 'rgba(79,134,247,0.5)',
              borderRadius: 3,
              yAxisID: 'y',
            },
            {
              label: 'Avg Sale Price',
              data: avgPrices,
              type: 'line',
              borderColor: 'rgba(210,153,34,0.9)',
              fill: false,
              tension: 0.3,
              pointRadius: 3,
              yAxisID: 'y1',
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: '#8b949e' } },
            tooltip: {
              callbacks: {
                label: ctx => ctx.dataset.label + ': ' + (ctx.dataset.yAxisID === 'y1' ? formatUSD(ctx.raw) : ctx.raw)
              }
            },
          },
          scales: {
            x: { ticks: { color: '#6a737d' }, grid: { color: 'rgba(45,49,72,0.5)' } },
            y: { position: 'left', ticks: { color: '#6a737d' }, grid: { color: 'rgba(45,49,72,0.5)' }, title: { display: true, text: 'Volume', color: '#6a737d' } },
            y1: { position: 'right', ticks: { color: '#d29922', callback: v => formatUSD(v) }, grid: { display: false }, title: { display: true, text: 'Avg Price', color: '#d29922' } },
          },
        },
      });
    }
  }

  // =====================================================================
  //  NEGOTIATION INTELLIGENCE
  // =====================================================================
  function renderNegotiationIntel(forSale, sold, md) {
    const el = dom.negotiationContainer;
    if (!el) return;

    // --- By Niche: avg discount from asking ---
    const nicheSoldData = {};
    sold.forEach(l => {
      const mult = parseFloat(l.listing_multiple || 0);
      const price = parseFloat(l.listing_price || 0);
      if (mult <= 0 || price <= 0) return;
      getNicheNames(l).forEach(n => {
        if (!nicheSoldData[n]) nicheSoldData[n] = { multiples: [], prices: [] };
        nicheSoldData[n].multiples.push(mult);
        nicheSoldData[n].prices.push(price);
      });
    });

    const nicheAskingData = {};
    forSale.forEach(l => {
      const mult = parseFloat(l.listing_multiple || 0);
      if (mult <= 0) return;
      getNicheNames(l).forEach(n => {
        if (!nicheAskingData[n]) nicheAskingData[n] = [];
        nicheAskingData[n].push(mult);
      });
    });

    const nicheNegotiation = Object.keys(nicheSoldData)
      .filter(n => nicheSoldData[n].multiples.length >= 3 && nicheAskingData[n] && nicheAskingData[n].length >= 2)
      .map(n => {
        const askMedian = median(nicheAskingData[n]);
        const soldMedian = median(nicheSoldData[n].multiples);
        const discount = askMedian > 0 ? ((askMedian - soldMedian) / askMedian * 100) : 0;
        return { name: n, askMedian, soldMedian, discount, n: nicheSoldData[n].multiples.length };
      })
      .filter(x => x.discount > 0)
      .sort((a, b) => b.discount - a.discount);

    // --- By Price Range ---
    const priceBuckets = [
      { label: 'Under $50K', min: 0, max: 50000 },
      { label: '$50K - $100K', min: 50000, max: 100000 },
      { label: '$100K - $250K', min: 100000, max: 250000 },
      { label: '$250K - $500K', min: 250000, max: 500000 },
      { label: '$500K - $1M', min: 500000, max: 1000000 },
      { label: '$1M+', min: 1000000, max: Infinity },
    ];

    const priceRangeData = priceBuckets.map(b => {
      const fsInRange = forSale.filter(l => {
        const p = parseFloat(l.listing_price || 0);
        return p >= b.min && p < b.max;
      });
      const sdInRange = sold.filter(l => {
        const p = parseFloat(l.listing_price || 0);
        return p >= b.min && p < b.max;
      });
      const askMults = fsInRange.map(l => parseFloat(l.listing_multiple || 0)).filter(m => m > 0);
      const soldMults = sdInRange.map(l => parseFloat(l.listing_multiple || 0)).filter(m => m > 0);
      const askMedian = median(askMults);
      const soldMedian = median(soldMults);
      const discount = askMedian > 0 ? ((askMedian - soldMedian) / askMedian * 100) : 0;
      return { label: b.label, askMedian, soldMedian, discount, soldCount: soldMults.length };
    }).filter(d => d.soldCount >= 3);

    // --- By Days on Market ---
    const domBuckets = [
      { label: '0-30 days', min: 0, max: 30 },
      { label: '30-60 days', min: 30, max: 60 },
      { label: '60-90 days', min: 60, max: 90 },
      { label: '90+ days', min: 90, max: 9999 },
    ];

    const now = Date.now();
    const domData = domBuckets.map(b => {
      const listings = forSale.filter(l => {
        const listedAt = l.first_listed_at || l.created_at;
        if (!listedAt) return false;
        const days = (now - new Date(listedAt).getTime()) / (1000 * 60 * 60 * 24);
        return days >= b.min && days < b.max;
      });
      const count = listings.length;
      const mults = listings.map(l => parseFloat(l.listing_multiple || 0)).filter(m => m > 0);
      const avgMult = robustAvg(mults);
      return { label: b.label, count, avgMult };
    });

    el.innerHTML = `
      <div class="negotiation-section-title">Typical Discount by Niche (Asking vs Sold Multiple)</div>
      <div class="negotiation-grid">
        ${nicheNegotiation.slice(0, 12).map(n => `
          <div class="negotiation-card">
            <h4>${escapeHtml(n.name)}</h4>
            <div class="negotiation-stat">
              <span class="negotiation-stat-label">Median Asking</span>
              <span class="negotiation-stat-value">${formatMultiple(n.askMedian)}</span>
            </div>
            <div class="negotiation-stat">
              <span class="negotiation-stat-label">Median Sold</span>
              <span class="negotiation-stat-value" style="color:var(--success)">${formatMultiple(n.soldMedian)}</span>
            </div>
            <div class="negotiation-stat">
              <span class="negotiation-stat-label">Avg Discount</span>
              <span class="negotiation-stat-value" style="color:var(--accent)">${formatPercent(n.discount)}</span>
            </div>
            <div class="negotiation-stat">
              <span class="negotiation-stat-label">Sold Comps</span>
              <span class="negotiation-stat-value">${n.n}</span>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="negotiation-section-title" style="margin-top:24px">Negotiation Room by Price Range</div>
      <div class="negotiation-grid">
        ${priceRangeData.map(d => `
          <div class="negotiation-card">
            <h4>${d.label}</h4>
            <div class="negotiation-stat">
              <span class="negotiation-stat-label">Asking Multiple</span>
              <span class="negotiation-stat-value">${formatMultiple(d.askMedian)}</span>
            </div>
            <div class="negotiation-stat">
              <span class="negotiation-stat-label">Sold Multiple</span>
              <span class="negotiation-stat-value" style="color:var(--success)">${formatMultiple(d.soldMedian)}</span>
            </div>
            <div class="negotiation-stat">
              <span class="negotiation-stat-label">Negotiation Room</span>
              <span class="negotiation-stat-value" style="color:var(--accent)">${d.discount > 0 ? formatPercent(d.discount) : 'Minimal'}</span>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="negotiation-section-title" style="margin-top:24px">Listing Inventory by Time on Market</div>
      <div class="negotiation-grid">
        ${domData.map(d => `
          <div class="negotiation-card">
            <h4>${d.label}</h4>
            <div class="negotiation-stat">
              <span class="negotiation-stat-label">Active Listings</span>
              <span class="negotiation-stat-value">${d.count}</span>
            </div>
            <div class="negotiation-stat">
              <span class="negotiation-stat-label">Avg Multiple</span>
              <span class="negotiation-stat-value">${formatMultiple(d.avgMult)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // =====================================================================
  //  MOTIVATED SELLER DETECTOR
  // =====================================================================
  function renderMotivatedSellers(forSale, md) {
    const table = dom.motivatedSellersTable;
    if (!table) return;

    const now = Date.now();
    const rows = forSale.map(l => {
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const price = parseFloat(l.listing_price || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const multiple = parseFloat(l.listing_multiple || 0);
      const listedAt = l.first_listed_at || l.created_at;
      const daysOnMarket = listedAt ? Math.max(0, Math.round((now - new Date(listedAt).getTime()) / (1000 * 60 * 60 * 24))) : 0;

      // Compare multiple to niche median
      const nicheMults = niches.flatMap(n => (md.nicheAcc[n] || { multiple: [] }).multiple);
      const nicheMedianMult = median(nicheMults);
      const overpriceRatio = nicheMedianMult > 0 && multiple > 0 ? ((multiple - nicheMedianMult) / nicheMedianMult * 100) : 0;

      // Motivation score: higher = more motivated
      const daysFactor = Math.min(40, daysOnMarket * 0.4);
      const overpriceFactor = Math.min(30, Math.max(0, overpriceRatio * 0.6));
      const motivationScore = Math.round(daysFactor + overpriceFactor);

      return {
        _name: `#${num}`, _num: num, _niches: niches.join(', '),
        price, profit, multiple, daysOnMarket,
        nicheMedianMult, overpriceRatio, motivationScore,
        annualROI: multiple > 0 ? (12 / multiple) * 100 : 0,
      };
    })
    .filter(r => r.daysOnMarket >= 30 && r.overpriceRatio > 0 && r.profit > 0)
    .sort((a, b) => b.motivationScore - a.motivationScore)
    .slice(0, 40);

    const columns = [
      { key: '_rank', label: '#' },
      { key: '_name', label: 'Listing', render: r => `<a href="https://empireflippers.com/listing/${escapeHtml(String(r._num))}" target="_blank" rel="noopener">${escapeHtml(r._name)}</a>` },
      { key: '_niches', label: 'Niche', render: r => escapeHtml(r._niches) },
      { key: 'daysOnMarket', label: 'Days Listed', render: r => `<span class="dom-badge ${r.daysOnMarket > 90 ? 'dom-stale' : 'dom-aging'}">${r.daysOnMarket}d</span>` },
      { key: 'multiple', label: 'Asking Mult.', render: r => formatMultiple(r.multiple) },
      { key: 'nicheMedianMult', label: 'Niche Median', render: r => formatMultiple(r.nicheMedianMult) },
      { key: 'overpriceRatio', label: 'Over Niche %', render: r => `<span style="color:var(--danger)">+${formatPercent(r.overpriceRatio)}</span>` },
      { key: 'price', label: 'Price', render: r => formatUSD(r.price) },
      { key: 'profit', label: 'Mo. Profit', tdClass: 'profit-cell', render: r => formatUSD(r.profit) },
      { key: 'motivationScore', label: 'Motivation', render: r => `<span class="motivated-badge ${r.motivationScore >= 40 ? 'motivated-hot' : 'motivated-warm'}">${r.motivationScore}/70</span>` },
    ];

    buildSortableLeaderboard(table, columns, rows, 'motivationScore', 'desc');
  }

  // =====================================================================
  //  SMART MONEY TRACKER
  // =====================================================================
  function renderSmartMoney(sold, md) {
    const grid = $('#smart-money-grid');
    if (!grid) return;

    const now = Date.now();
    // Group sold by niche: avg days to sell + avg sold multiple
    const nicheStats = {};
    sold.forEach(l => {
      const mult = parseFloat(l.listing_multiple || 0);
      const listedAt = l.first_listed_at || l.created_at;
      const soldAt = l.sold_date || l.sold_at || l.updated_at;
      if (mult <= 0 || !listedAt || !soldAt) return;
      const daysToSell = Math.max(0, Math.round((new Date(soldAt).getTime() - new Date(listedAt).getTime()) / (1000 * 60 * 60 * 24)));
      if (daysToSell > 365) return; // skip outliers
      const price = parseFloat(l.listing_price || 0);
      getNicheNames(l).forEach(n => {
        if (!nicheStats[n]) nicheStats[n] = { days: [], multiples: [], prices: [], count: 0 };
        nicheStats[n].days.push(daysToSell);
        nicheStats[n].multiples.push(mult);
        nicheStats[n].prices.push(price);
        nicheStats[n].count++;
      });
    });

    const ranked = Object.entries(nicheStats)
      .filter(([n, s]) => s.count >= 5)
      .map(([name, s]) => {
        const avgDays = Math.round(s.days.reduce((a, b) => a + b, 0) / s.days.length);
        const medMult = median(s.multiples);
        const avgPrice = Math.round(s.prices.reduce((a, b) => a + b, 0) / s.prices.length);
        // Smart money score: high multiple AND fast sale = hot demand
        // Normalize: lower days = better, higher multiple = better
        const dayScore = Math.max(0, 100 - avgDays); // 0 days = 100, 100 days = 0
        const multScore = Math.min(100, medMult * 1.5); // 60x mult = 90 score
        const score = (dayScore * 0.6) + (multScore * 0.4);
        return { name, avgDays, medMult, avgPrice, count: s.count, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    if (!ranked.length) { grid.innerHTML = '<p style="color:var(--text-secondary)">Not enough sold data.</p>'; return; }

    grid.innerHTML = ranked.map((r, i) => {
      const heat = r.score >= 70 ? 'hot' : r.score >= 50 ? 'warm' : 'cool';
      return `
        <div class="smart-money-card smart-money-${heat}">
          <div class="smart-money-name">${escapeHtml(r.name)}</div>
          <div class="smart-money-stats">
            <div><span class="smart-money-stat-label">Avg Days to Sell</span><br><span class="smart-money-stat-value">${r.avgDays}d</span></div>
            <div><span class="smart-money-stat-label">Median Multiple</span><br><span class="smart-money-stat-value">${r.medMult.toFixed(1)}x</span></div>
            <div><span class="smart-money-stat-label">Avg Sale Price</span><br><span class="smart-money-stat-value">${formatUSD(r.avgPrice)}</span></div>
            <div><span class="smart-money-stat-label">Sales (n)</span><br><span class="smart-money-stat-value">${r.count}</span></div>
          </div>
          <span class="smart-money-badge smart-money-badge-${heat}">${heat === 'hot' ? 'High Demand' : heat === 'warm' ? 'Moderate Demand' : 'Normal Demand'}</span>
        </div>`;
    }).join('');
  }

  // =====================================================================
  //  NICHE QUARTERLY SHIFTS
  // =====================================================================
  function renderNicheShifts(forSale, sold) {
    destroyChart('nicheShifts');
    const canvas = $('#chart-niche-shifts');
    const cardsEl = $('#niche-shifts-cards');
    if (!canvas && !cardsEl) return;

    // Determine current and previous quarter
    const now = new Date();
    const curQ = Math.floor(now.getMonth() / 3);
    const curYear = now.getFullYear();
    const prevQ = curQ === 0 ? 3 : curQ - 1;
    const prevYear = curQ === 0 ? curYear - 1 : curYear;

    function getQuarter(dateStr) {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      return { q: Math.floor(d.getMonth() / 3), y: d.getFullYear() };
    }

    function isInQuarter(dateStr, q, y) {
      const qd = getQuarter(dateStr);
      return qd && qd.q === q && qd.y === y;
    }

    const qLabels = ['Q1', 'Q2', 'Q3', 'Q4'];
    const curLabel = qLabels[curQ] + ' ' + curYear;
    const prevLabel = qLabels[prevQ] + ' ' + prevYear;

    // Count listings and multiples per niche per quarter
    const nicheData = {};

    function addToNiche(n, quarter, mult) {
      if (!nicheData[n]) nicheData[n] = { cur: { count: 0, multiples: [] }, prev: { count: 0, multiples: [] } };
      if (quarter === 'cur') { nicheData[n].cur.count++; if (mult > 0) nicheData[n].cur.multiples.push(mult); }
      if (quarter === 'prev') { nicheData[n].prev.count++; if (mult > 0) nicheData[n].prev.multiples.push(mult); }
    }

    // Use sold data for quarter analysis
    sold.forEach(l => {
      const soldDate = l.sold_date || l.sold_at || l.updated_at;
      const mult = parseFloat(l.listing_multiple || 0);
      const niches = getNicheNames(l);
      if (isInQuarter(soldDate, curQ, curYear)) niches.forEach(n => addToNiche(n, 'cur', mult));
      if (isInQuarter(soldDate, prevQ, prevYear)) niches.forEach(n => addToNiche(n, 'prev', mult));
    });

    // Also count currently active listings as current quarter supply
    forSale.forEach(l => {
      const mult = parseFloat(l.listing_multiple || 0);
      getNicheNames(l).forEach(n => {
        if (!nicheData[n]) nicheData[n] = { cur: { count: 0, multiples: [] }, prev: { count: 0, multiples: [] } };
        nicheData[n].cur.count++;
        if (mult > 0) nicheData[n].cur.multiples.push(mult);
      });
    });

    const shifts = Object.entries(nicheData)
      .filter(([n, d]) => d.prev.count >= 3 && d.cur.count >= 3)
      .map(([name, d]) => {
        const supplyChange = d.prev.count > 0 ? ((d.cur.count - d.prev.count) / d.prev.count * 100) : 0;
        const prevMedMult = d.prev.multiples.length ? median(d.prev.multiples) : 0;
        const curMedMult = d.cur.multiples.length ? median(d.cur.multiples) : 0;
        const multChange = prevMedMult > 0 ? ((curMedMult - prevMedMult) / prevMedMult * 100) : 0;

        let verdict, verdictClass;
        if (supplyChange < -10 && multChange > 5) { verdict = 'Heating Up'; verdictClass = 'niche-shift-heating'; }
        else if (supplyChange > 10 && multChange < -5) { verdict = 'Cooling Down'; verdictClass = 'niche-shift-cooling'; }
        else { verdict = 'Stable'; verdictClass = 'niche-shift-stable'; }

        return { name, curCount: d.cur.count, prevCount: d.prev.count, supplyChange, prevMedMult, curMedMult, multChange, verdict, verdictClass };
      })
      .sort((a, b) => Math.abs(b.supplyChange) + Math.abs(b.multChange) - Math.abs(a.supplyChange) - Math.abs(a.multChange))
      .slice(0, 15);

    if (!shifts.length) {
      if (cardsEl) cardsEl.innerHTML = '<p style="color:var(--text-secondary)">Not enough quarterly data to compare.</p>';
      return;
    }

    // Chart: grouped bar showing supply change + multiple change per niche
    if (canvas) {
      state.charts.nicheShifts = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: shifts.map(s => s.name),
          datasets: [
            {
              label: 'Supply Change %',
              data: shifts.map(s => parseFloat(s.supplyChange.toFixed(1))),
              backgroundColor: shifts.map(s => s.supplyChange > 0 ? 'rgba(218,54,51,0.6)' : 'rgba(46,160,67,0.6)'),
              borderRadius: 3,
            },
            {
              label: 'Multiple Change %',
              data: shifts.map(s => parseFloat(s.multChange.toFixed(1))),
              backgroundColor: shifts.map(s => s.multChange > 0 ? 'rgba(46,160,67,0.6)' : 'rgba(218,54,51,0.6)'),
              borderRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#8b949e' } },
            tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + (ctx.raw > 0 ? '+' : '') + ctx.raw + '%'; } } },
          },
          scales: {
            x: { ticks: { color: '#8b949e', font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
            y: { ticks: { color: '#6a737d', callback: function(v) { return v + '%'; } }, grid: { color: 'rgba(45,49,72,0.5)' } },
          },
        },
      });
    }

    // Cards
    if (cardsEl) {
      cardsEl.innerHTML = shifts.map(s => {
        function arrow(val) {
          if (val > 0) return '<span class="niche-shift-up">+' + val.toFixed(1) + '%</span>';
          if (val < 0) return '<span class="niche-shift-down">' + val.toFixed(1) + '%</span>';
          return '<span class="niche-shift-flat">0%</span>';
        }
        return `
          <div class="niche-shift-card">
            <div class="niche-shift-name">${escapeHtml(s.name)}</div>
            <div class="niche-shift-row"><span>Supply (${prevLabel} vs ${curLabel})</span>${arrow(s.supplyChange)}</div>
            <div class="niche-shift-row"><span>Median Multiple</span><span>${s.prevMedMult.toFixed(1)}x &rarr; ${s.curMedMult.toFixed(1)}x ${arrow(s.multChange)}</span></div>
            <div class="niche-shift-row"><span>Listings</span><span>${s.prevCount} &rarr; ${s.curCount}</span></div>
            <span class="niche-shift-verdict ${s.verdictClass}">${s.verdict}</span>
          </div>`;
      }).join('');
    }
  }

  // =====================================================================
  //  PRICE ANCHORING ANALYSIS
  // =====================================================================
  function renderPriceAnchoring(forSale, sold) {
    destroyChart('priceAnchoring');
    destroyChart('multipleAnchoring');
    const canvas1 = $('#chart-price-anchoring');
    const canvas2 = $('#chart-multiple-anchoring');
    const summaryEl = $('#anchoring-summary');
    console.log('Price Anchoring: canvas1=' + !!canvas1 + ' canvas2=' + !!canvas2 + ' summary=' + !!summaryEl + ' forSale=' + forSale.length + ' sold=' + sold.length);

    // Group by price range
    const buckets = [
      { label: 'Under $50K', min: 0, max: 50000 },
      { label: '$50K-$100K', min: 50000, max: 100000 },
      { label: '$100K-$250K', min: 100000, max: 250000 },
      { label: '$250K-$500K', min: 250000, max: 500000 },
      { label: '$500K-$1M', min: 500000, max: 1000000 },
      { label: '$1M+', min: 1000000, max: Infinity },
    ];

    // For each bucket, compare asking (forSale) vs sold multiples and prices
    const bucketData = buckets.map(b => {
      const askMults = forSale
        .filter(l => { const p = parseFloat(l.listing_price || 0); return p >= b.min && p < b.max; })
        .map(l => parseFloat(l.listing_multiple || 0))
        .filter(m => m > 0);
      const soldMults = sold
        .filter(l => { const p = parseFloat(l.listing_price || 0); return p >= b.min && p < b.max; })
        .map(l => parseFloat(l.listing_multiple || 0))
        .filter(m => m > 0);
      const askPrices = forSale
        .filter(l => { const p = parseFloat(l.listing_price || 0); return p >= b.min && p < b.max; })
        .map(l => parseFloat(l.listing_price || 0));
      const soldPrices = sold
        .filter(l => { const p = parseFloat(l.listing_price || 0); return p >= b.min && p < b.max; })
        .map(l => parseFloat(l.listing_price || 0));

      const medAskMult = askMults.length ? median(askMults) : 0;
      const medSoldMult = soldMults.length ? median(soldMults) : 0;
      const medAskPrice = askPrices.length ? median(askPrices) : 0;
      const medSoldPrice = soldPrices.length ? median(soldPrices) : 0;
      const discount = medAskMult > 0 && medSoldMult > 0 ? ((medAskMult - medSoldMult) / medAskMult * 100) : 0;
      const priceDiscount = medAskPrice > 0 && medSoldPrice > 0 ? ((medAskPrice - medSoldPrice) / medAskPrice * 100) : 0;

      return {
        label: b.label, medAskMult, medSoldMult, medAskPrice, medSoldPrice,
        discount, priceDiscount,
        askCount: askMults.length, soldCount: soldMults.length,
      };
    }).filter(b => b.askCount >= 1 && b.soldCount >= 1);

    console.log('Price Anchoring buckets:', bucketData.map(b => b.label + ': ask=' + b.askCount + ' sold=' + b.soldCount + ' askMult=' + b.medAskMult.toFixed(1) + ' soldMult=' + b.medSoldMult.toFixed(1) + ' disc=' + b.discount.toFixed(1) + '%'));

    if (!bucketData.length) {
      if (summaryEl) summaryEl.innerHTML = '<p style="color:var(--text-secondary)">Not enough data to compare asking vs sold prices.</p>';
      return;
    }

    // Chart 1: Discount % by size
    if (canvas1) {
      state.charts.priceAnchoring = new Chart(canvas1, {
        type: 'bar',
        data: {
          labels: bucketData.map(b => b.label),
          datasets: [{
            label: 'Avg Discount from Asking %',
            data: bucketData.map(b => parseFloat(b.discount.toFixed(1))),
            backgroundColor: bucketData.map(b => b.discount > 10 ? 'rgba(46,160,67,0.7)' : b.discount > 5 ? 'rgba(210,153,34,0.7)' : 'rgba(79,134,247,0.7)'),
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function(ctx) { var b = bucketData[ctx.dataIndex]; return ['Discount: ' + ctx.raw + '%', 'Asking: ' + b.medAskMult.toFixed(1) + 'x  Sold: ' + b.medSoldMult.toFixed(1) + 'x', '(' + b.askCount + ' asking, ' + b.soldCount + ' sold)']; } } },
          },
          scales: {
            x: { ticks: { color: '#8b949e' }, grid: { display: false } },
            y: { ticks: { color: '#6a737d', callback: function(v) { return v + '%'; } }, grid: { color: 'rgba(45,49,72,0.5)' }, min: 0 },
          },
        },
      });
    }

    // Chart 2: Asking vs Sold multiple side by side
    if (canvas2) {
      state.charts.multipleAnchoring = new Chart(canvas2, {
        type: 'bar',
        data: {
          labels: bucketData.map(b => b.label),
          datasets: [
            { label: 'Asking Multiple', data: bucketData.map(b => parseFloat(b.medAskMult.toFixed(1))), backgroundColor: 'rgba(218,54,51,0.6)', borderRadius: 3 },
            { label: 'Sold Multiple', data: bucketData.map(b => parseFloat(b.medSoldMult.toFixed(1))), backgroundColor: 'rgba(46,160,67,0.6)', borderRadius: 3 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#8b949e' } },
            tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + ctx.raw + 'x (' + bucketData[ctx.dataIndex][ctx.datasetIndex === 0 ? 'askCount' : 'soldCount'] + ' listings)'; } } },
          },
          scales: {
            x: { ticks: { color: '#8b949e' }, grid: { display: false } },
            y: { ticks: { color: '#6a737d', callback: function(v) { return v + 'x'; } }, grid: { color: 'rgba(45,49,72,0.5)' } },
          },
        },
      });
    }

    // Summary cards
    if (summaryEl) {
      const overall = bucketData.reduce((acc, b) => {
        acc.totalDiscount += b.discount * b.soldCount;
        acc.totalSold += b.soldCount;
        return acc;
      }, { totalDiscount: 0, totalSold: 0 });
      const avgDiscount = overall.totalSold > 0 ? (overall.totalDiscount / overall.totalSold) : 0;
      const bestDeal = bucketData.reduce((best, b) => b.discount > best.discount ? b : best, bucketData[0]);
      const tightest = bucketData.reduce((t, b) => b.discount < t.discount ? b : t, bucketData[0]);

      summaryEl.innerHTML = `
        <div class="anchoring-card">
          <div class="anchoring-card-label">Overall Avg Discount</div>
          <div class="anchoring-card-value">${avgDiscount.toFixed(1)}%</div>
          <div class="anchoring-card-sub">below asking multiple</div>
        </div>
        <div class="anchoring-card">
          <div class="anchoring-card-label">Most Negotiation Room</div>
          <div class="anchoring-card-value" style="color:#2ea043">${bestDeal.label}</div>
          <div class="anchoring-card-sub">${bestDeal.discount.toFixed(1)}% avg discount (${bestDeal.soldCount} sales)</div>
        </div>
        <div class="anchoring-card">
          <div class="anchoring-card-label">Tightest Pricing</div>
          <div class="anchoring-card-value" style="color:#da3633">${tightest.label}</div>
          <div class="anchoring-card-sub">${tightest.discount.toFixed(1)}% avg discount (${tightest.soldCount} sales)</div>
        </div>
        <div class="anchoring-card">
          <div class="anchoring-card-label">Your Edge</div>
          <div class="anchoring-card-value">Open ${bestDeal.discount.toFixed(0)}% below</div>
          <div class="anchoring-card-sub">for ${bestDeal.label} businesses</div>
        </div>
      `;
    }
  }

  // =====================================================================
  //  EXIT TIMING OPTIMIZER
  // =====================================================================
  function renderExitTiming(sold) {
    destroyChart('exitTiming');
    const canvas = $('#chart-exit-timing');
    const cardsEl = $('#exit-timing-cards');
    if (!canvas && !cardsEl) return;

    // Group sold listings by niche and quarter
    const qLabels = ['Q1', 'Q2', 'Q3', 'Q4'];
    const nicheQ = {};

    sold.forEach(l => {
      const soldDate = l.sold_date || l.sold_at || l.updated_at;
      if (!soldDate) return;
      const d = new Date(soldDate);
      const q = Math.floor(d.getMonth() / 3);
      const mult = parseFloat(l.listing_multiple || 0);
      if (mult <= 0) return;
      getNicheNames(l).forEach(n => {
        if (!nicheQ[n]) nicheQ[n] = [[], [], [], []]; // Q1-Q4
        nicheQ[n][q].push(mult);
      });
    });

    // Only niches with data in at least 3 quarters and 10+ total sales
    const nicheTimings = Object.entries(nicheQ)
      .filter(([n, qs]) => {
        const nonEmpty = qs.filter(q => q.length > 0).length;
        const total = qs.reduce((s, q) => s + q.length, 0);
        return nonEmpty >= 3 && total >= 10;
      })
      .map(([name, qs]) => {
        const qMedians = qs.map(q => q.length ? median(q) : null);
        const validMedians = qMedians.filter(m => m !== null);
        const overallMedian = median(validMedians);

        let bestQ = -1, bestMult = 0, worstQ = -1, worstMult = Infinity;
        qMedians.forEach((m, i) => {
          if (m !== null && m > bestMult) { bestMult = m; bestQ = i; }
          if (m !== null && m < worstMult) { worstMult = m; worstQ = i; }
        });

        const premium = overallMedian > 0 ? ((bestMult - overallMedian) / overallMedian * 100) : 0;
        return { name, qMedians, bestQ, bestMult, worstQ, worstMult, premium, overallMedian, totalSales: qs.reduce((s, q) => s + q.length, 0) };
      })
      .sort((a, b) => b.premium - a.premium)
      .slice(0, 12);

    if (!nicheTimings.length) {
      if (cardsEl) cardsEl.innerHTML = '<p style="color:var(--text-secondary)">Not enough quarterly sold data.</p>';
      return;
    }

    // Chart: heatmap-style grouped bar
    if (canvas) {
      const datasets = [0, 1, 2, 3].map(qi => ({
        label: qLabels[qi],
        data: nicheTimings.map(nt => nt.qMedians[qi] !== null ? parseFloat(nt.qMedians[qi].toFixed(1)) : 0),
        backgroundColor: ['rgba(79,134,247,0.6)', 'rgba(46,160,67,0.6)', 'rgba(210,153,34,0.6)', 'rgba(218,54,51,0.6)'][qi],
        borderRadius: 3,
      }));

      state.charts.exitTiming = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: nicheTimings.map(nt => nt.name),
          datasets: datasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#8b949e' } },
            tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + ctx.raw + 'x multiple'; } } },
          },
          scales: {
            x: { ticks: { color: '#8b949e', font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
            y: { ticks: { color: '#6a737d', callback: function(v) { return v + 'x'; } }, grid: { color: 'rgba(45,49,72,0.5)' }, title: { display: true, text: 'Median Sold Multiple', color: '#6a737d' } },
          },
        },
      });
    }

    // Cards
    if (cardsEl) {
      cardsEl.innerHTML = nicheTimings.map(nt => {
        return `
          <div class="exit-timing-card">
            <div class="exit-timing-name">${escapeHtml(nt.name)}</div>
            <div class="exit-timing-best">Best: ${qLabels[nt.bestQ]} at ${nt.bestMult.toFixed(1)}x (+${nt.premium.toFixed(1)}% vs avg)</div>
            <div class="exit-timing-worst">Worst: ${qLabels[nt.worstQ]} at ${nt.worstMult.toFixed(1)}x</div>
            <div class="exit-timing-quarters">
              ${nt.qMedians.map((m, i) => `
                <div class="exit-timing-q ${i === nt.bestQ ? 'exit-timing-q-best' : ''}">
                  <span class="exit-timing-q-label">${qLabels[i]}</span>
                  <span class="exit-timing-q-value">${m !== null ? m.toFixed(1) + 'x' : '--'}</span>
                </div>`).join('')}
            </div>
            <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:6px">${nt.totalSales} sales analyzed</div>
          </div>`;
      }).join('');
    }
  }

  // =====================================================================
  //  PORTFOLIO DIVERSIFICATION (Favorites tab)
  // =====================================================================
  function renderPortfolioDiversification() {
    const el = dom.portfolioDiversification;
    if (!el) return;

    const favs = Object.values(state.favorites);
    if (favs.length < 2) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');

    const totalCost = favs.reduce((s, l) => s + parseFloat(l.listing_price || 0), 0);
    const totalMonthlyProfit = favs.reduce((s, l) => s + parseFloat(l.average_monthly_net_profit || 0), 0);
    const totalAnnualProfit = totalMonthlyProfit * 12;
    const portfolioROI = totalCost > 0 ? (totalAnnualProfit / totalCost * 100) : 0;
    const avgPayback = totalCost > 0 && totalAnnualProfit > 0 ? (totalCost / totalAnnualProfit) : 0;

    // Niche diversity
    const allNiches = favs.flatMap(l => getNicheNames(l));
    const nicheCountMap = {};
    allNiches.forEach(n => { nicheCountMap[n] = (nicheCountMap[n] || 0) + 1; });
    const uniqueNiches = Object.keys(nicheCountMap);
    const duplicateNiches = uniqueNiches.filter(n => nicheCountMap[n] > 1);

    // Monetization diversity
    const allMons = favs.flatMap(l => getMonetizationNames(l));
    const monCountMap = {};
    allMons.forEach(m => { monCountMap[m] = (monCountMap[m] || 0) + 1; });
    const uniqueMons = Object.keys(monCountMap);
    const duplicateMons = uniqueMons.filter(m => monCountMap[m] > 1);

    // Concentration risk (Herfindahl index)
    const priceFractions = favs.map(l => {
      const p = parseFloat(l.listing_price || 0);
      return totalCost > 0 ? (p / totalCost) : 0;
    });
    const hhi = priceFractions.reduce((s, f) => s + f * f, 0);
    // HHI: 1/n = perfect diversification, 1 = single holding
    const diversificationScore = Math.round((1 - hhi) * 100);

    // Risk assessment
    let riskLevel, riskColor;
    if (diversificationScore >= 60 && uniqueNiches.length >= 3) {
      riskLevel = 'Well Diversified';
      riskColor = 'var(--success)';
    } else if (diversificationScore >= 40 || uniqueNiches.length >= 2) {
      riskLevel = 'Moderate Concentration';
      riskColor = 'var(--warning)';
    } else {
      riskLevel = 'High Concentration Risk';
      riskColor = 'var(--danger)';
    }

    el.innerHTML = `
      <div class="portfolio-title">Portfolio Diversification Analysis (${favs.length} businesses)</div>
      <div class="portfolio-stats">
        <div class="portfolio-stat">
          <div class="portfolio-stat-label">Total Investment</div>
          <div class="portfolio-stat-value">${formatUSD(totalCost)}</div>
        </div>
        <div class="portfolio-stat">
          <div class="portfolio-stat-label">Combined Annual Profit</div>
          <div class="portfolio-stat-value" style="color:var(--success)">${formatUSD(totalAnnualProfit)}</div>
        </div>
        <div class="portfolio-stat">
          <div class="portfolio-stat-label">Portfolio ROI</div>
          <div class="portfolio-stat-value" style="color:var(--accent)">${formatPercent(portfolioROI)}</div>
        </div>
        <div class="portfolio-stat">
          <div class="portfolio-stat-label">Avg Payback</div>
          <div class="portfolio-stat-value">${avgPayback > 0 ? avgPayback.toFixed(1) + ' years' : '--'}</div>
        </div>
        <div class="portfolio-stat">
          <div class="portfolio-stat-label">Unique Niches</div>
          <div class="portfolio-stat-value">${uniqueNiches.length}</div>
        </div>
        <div class="portfolio-stat">
          <div class="portfolio-stat-label">Diversification</div>
          <div class="portfolio-stat-value" style="color:${riskColor}">${riskLevel}</div>
        </div>
      </div>
      <div class="portfolio-risk-bar">
        <div class="portfolio-risk-fill" style="width:${diversificationScore}%;background:${riskColor}"></div>
      </div>
      ${duplicateNiches.length > 0 ? `
        <div class="portfolio-overlap">
          <div class="portfolio-overlap-title">Overlapping Niches (concentration risk)</div>
          <div class="portfolio-tags">
            ${duplicateNiches.map(n => `<span class="portfolio-tag portfolio-tag-warn">${escapeHtml(n)} (${nicheCountMap[n]}x)</span>`).join('')}
          </div>
        </div>
      ` : ''}
      <div class="portfolio-overlap" style="margin-top:10px">
        <div class="portfolio-overlap-title">Coverage</div>
        <div class="portfolio-tags">
          ${uniqueNiches.map(n => `<span class="portfolio-tag">${escapeHtml(n)}</span>`).join('')}
          ${uniqueMons.map(m => `<span class="portfolio-tag" style="background:var(--success-bg);color:var(--success)">${escapeHtml(m)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  // =====================================================================
  //  LISTING DEEP DIVE
  // =====================================================================
  function openDeepDive() {
    dom.deepDiveOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    populateDeepDiveSelect();
  }

  function closeDeepDive() {
    dom.deepDiveOverlay.classList.add('hidden');
    document.body.style.overflow = '';
    destroyChart('ddRadar');
    destroyChart('ddCashflow');
  }

  function populateDeepDiveSelect() {
    const select = dom.deepDiveSelect;
    if (!select) return;
    const allListings = [
      ...(state.dashboardData?.forSale || []),
      ...(state.dashboardData?.sold || []),
    ];
    select.innerHTML = '<option value="">Select a listing...</option>';
    allListings
      .sort((a, b) => (b.listing_number || 0) - (a.listing_number || 0))
      .forEach(l => {
        const num = l.listing_number || l.id;
        const niches = getNicheNames(l).join(', ');
        const price = formatUSD(parseFloat(l.listing_price || 0));
        const status = (l.listing_status || '').includes('Sold') ? ' [SOLD]' : '';
        const opt = document.createElement('option');
        opt.value = num;
        opt.textContent = `#${num} — ${niches || 'N/A'} — ${price}${status}`;
        select.appendChild(opt);
      });
  }

  function filterDeepDiveSelect(query) {
    const select = dom.deepDiveSelect;
    const options = select.querySelectorAll('option');
    const q = query.toLowerCase();
    options.forEach(opt => {
      if (!opt.value) return;
      opt.hidden = !opt.textContent.toLowerCase().includes(q);
    });
  }

  function renderDeepDive(listingId) {
    const allListings = [
      ...(state.dashboardData?.forSale || []),
      ...(state.dashboardData?.sold || []),
    ];
    const listing = allListings.find(l => String(l.listing_number || l.id) === String(listingId));
    if (!listing) {
      dom.deepDiveBody.innerHTML = '<div class="deep-dive-empty"><p>Listing not found.</p></div>';
      return;
    }

    const forSale = state.dashboardData?.forSale || [];
    const sold = state.dashboardData?.sold || [];
    const md = state.marketData;
    if (!md) return;

    const num = listing.listing_number || listing.id;
    const niches = getNicheNames(listing);
    const mons = getMonetizationNames(listing);
    const price = parseFloat(listing.listing_price || 0);
    const profit = parseFloat(listing.average_monthly_net_profit || 0);
    const revenue = parseFloat(listing.average_monthly_gross_revenue || 0);
    const multiple = parseFloat(listing.listing_multiple || 0);
    const margin = revenue > 0 ? (profit / revenue * 100) : 0;
    const hours = listing.hours_worked_per_week;
    const ageMonths = getAgeMonths(listing);
    const isSold = (listing.listing_status || '').toLowerCase().includes('sold');

    const { score, breakdown } = calculateDealScore(listing, md);
    const risk = calculateRisk(listing, md);
    const rep = calculateReplicability(listing, md);

    // Percentile computation
    function percentile(val, arr) {
      if (!arr.length || val == null) return 0;
      const below = arr.filter(v => v < val).length;
      return Math.round((below / arr.length) * 100);
    }

    const allPrices = forSale.map(l => parseFloat(l.listing_price || 0)).filter(p => p > 0);
    const allProfits = forSale.map(l => parseFloat(l.average_monthly_net_profit || 0)).filter(p => p > 0);
    const allMultiples = forSale.map(l => parseFloat(l.listing_multiple || 0)).filter(m => m > 0);
    const allMargins = forSale.map(l => {
      const r = parseFloat(l.average_monthly_gross_revenue || 0);
      const p = parseFloat(l.average_monthly_net_profit || 0);
      return r > 0 ? (p / r * 100) : 0;
    }).filter(m => m > 0);
    const allHours = forSale.map(l => l.hours_worked_per_week).filter(h => h != null && h >= 0);
    const allAges = forSale.map(l => getAgeMonths(l)).filter(a => a > 0);

    const pctPrice = percentile(price, allPrices);
    const pctProfit = percentile(profit, allProfits);
    const pctMultiple = percentile(multiple, allMultiples);
    const pctMargin = percentile(margin, allMargins);
    const pctHours = hours != null ? 100 - percentile(hours, allHours) : null; // Invert: lower hours = better
    const pctAge = percentile(ageMonths, allAges);

    // Niche comparison
    const nicheAcc = niches.flatMap(n => md.nicheAcc[n] ? [md.nicheAcc[n]] : []);
    const nicheAvgProfit = robustAvg(nicheAcc.flatMap(a => a.profit));
    const nicheAvgRevenue = robustAvg(nicheAcc.flatMap(a => a.revenue));
    const nicheMedianMult = median(nicheAcc.flatMap(a => a.multiple));
    const nicheMedianPrice = median(nicheAcc.flatMap(a => a.price));
    const nicheMedianHours = median(nicheAcc.flatMap(a => a.hours));

    // Comparable sold
    const soldByNiche = {};
    sold.forEach(l => getNicheNames(l).forEach(n => {
      if (!soldByNiche[n]) soldByNiche[n] = [];
      soldByNiche[n].push(l);
    }));
    const comps = niches.flatMap(n => soldByNiche[n] || [])
      .map(c => {
        const cProfit = parseFloat(c.average_monthly_net_profit || 0);
        const cPrice = parseFloat(c.listing_price || 0);
        const cMult = parseFloat(c.listing_multiple || 0);
        const similarity = profit > 0 && cProfit > 0 ? 1 - Math.abs(profit - cProfit) / Math.max(profit, cProfit) : 0;
        return { num: c.listing_number || c.id, profit: cProfit, price: cPrice, multiple: cMult, similarity };
      })
      .filter(c => c.similarity > 0.2 && c.profit > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    const annualProfit = profit * 12;
    const annualROI = price > 0 ? (annualProfit / price * 100) : 0;
    const paybackYears = annualProfit > 0 ? (price / annualProfit) : 0;

    function pctColor(pct) {
      if (pct >= 75) return 'var(--success)';
      if (pct >= 50) return 'var(--accent)';
      if (pct >= 25) return 'var(--warning)';
      return 'var(--danger)';
    }

    function vsNiche(val, nicheVal, isMoney) {
      if (!nicheVal || nicheVal === 0) return '--';
      const diff = ((val - nicheVal) / nicheVal * 100);
      const sign = diff > 0 ? '+' : '';
      return `<span style="color:${diff > 0 ? 'var(--success)' : 'var(--danger)'}">${sign}${diff.toFixed(0)}% vs niche</span>`;
    }

    dom.deepDiveBody.innerHTML = `
      <div class="dd-hero">
        <div class="dd-hero-left">
          <div class="dd-hero-title">
            <a href="https://empireflippers.com/listing/${escapeHtml(String(num))}" target="_blank" rel="noopener">#${escapeHtml(String(num))}</a>
            ${isSold ? '<span class="status-badge status-sold" style="margin-left:8px">Sold</span>' : '<span class="status-badge status-for-sale" style="margin-left:8px">For Sale</span>'}
          </div>
          <div class="dd-hero-subtitle">
            ${niches.map(n => escapeHtml(n)).join(', ') || 'N/A'} &mdash; ${mons.map(m => escapeHtml(m)).join(', ') || 'N/A'}
          </div>
          <div class="dd-hero-stats">
            <div class="dd-stat">
              <span class="dd-stat-label">Price</span>
              <span class="dd-stat-value">${formatUSD(price)}</span>
            </div>
            <div class="dd-stat">
              <span class="dd-stat-label">Monthly Profit</span>
              <span class="dd-stat-value" style="color:var(--success)">${formatUSD(profit)}</span>
            </div>
            <div class="dd-stat">
              <span class="dd-stat-label">Annual Profit</span>
              <span class="dd-stat-value" style="color:var(--success)">${formatUSD(annualProfit)}</span>
            </div>
            <div class="dd-stat">
              <span class="dd-stat-label">Monthly Revenue</span>
              <span class="dd-stat-value">${formatUSD(revenue)}</span>
            </div>
            <div class="dd-stat">
              <span class="dd-stat-label">Multiple</span>
              <span class="dd-stat-value">${formatMultiple(multiple)}</span>
            </div>
            <div class="dd-stat">
              <span class="dd-stat-label">Profit Margin</span>
              <span class="dd-stat-value">${formatPercent(margin)}</span>
            </div>
            <div class="dd-stat">
              <span class="dd-stat-label">Hours/Week</span>
              <span class="dd-stat-value">${hours != null ? hours + 'h' : 'Unknown'}</span>
            </div>
            <div class="dd-stat">
              <span class="dd-stat-label">Business Age</span>
              <span class="dd-stat-value">${ageMonths >= 12 ? (ageMonths / 12).toFixed(1) + ' years' : ageMonths + ' mo'}</span>
            </div>
          </div>
        </div>
        <div class="dd-hero-right">
          <div class="dd-score-card">
            <h4>Deal Score</h4>
            <div class="dd-score-big" style="color:${getScoreColor(score)}">${score}/100</div>
          </div>
          <div class="dd-score-card">
            <h4>Risk Score</h4>
            <div class="dd-score-big" style="color:${risk.total <= 25 ? 'var(--success)' : risk.total <= 50 ? 'var(--warning)' : 'var(--danger)'}">${risk.total}/100</div>
            <div style="font-size:0.8rem;color:var(--text-secondary)">${getRiskLabel(risk.total)}</div>
          </div>
          <div class="dd-score-card">
            <h4>AI Replicability</h4>
            <div class="dd-score-big" style="color:${rep.replicabilityScore >= 70 ? 'var(--success)' : rep.replicabilityScore >= 50 ? 'var(--warning)' : 'var(--danger)'}">${rep.replicabilityScore}/100</div>
            <div class="bvb-verdict ${rep.verdictClass}" style="display:inline-block;margin-top:4px">${rep.verdict}</div>
          </div>
        </div>
      </div>

      <!-- Percentile Rankings -->
      <div class="dd-section">
        <div class="dd-section-title">Market Percentile Rankings (vs all active listings)</div>
        <div class="dd-percentile-grid">
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Price (${pctPrice}th percentile)</div>
            <div class="dd-percentile-bar"><div class="dd-percentile-fill" style="width:${pctPrice}%;background:${pctColor(100 - pctPrice)}"></div></div>
            <div class="dd-percentile-values"><span>${formatUSD(allPrices[0] || 0)}</span><span class="dd-percentile-yours">${formatUSD(price)}</span><span>${formatUSD(allPrices[allPrices.length - 1] || 0)}</span></div>
          </div>
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Monthly Profit (${pctProfit}th percentile)</div>
            <div class="dd-percentile-bar"><div class="dd-percentile-fill" style="width:${pctProfit}%;background:${pctColor(pctProfit)}"></div></div>
            <div class="dd-percentile-values"><span>Low</span><span class="dd-percentile-yours">${formatUSD(profit)}</span><span>High</span></div>
          </div>
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Multiple (${pctMultiple}th percentile) ${pctMultiple < 30 ? '- Good value' : ''}</div>
            <div class="dd-percentile-bar"><div class="dd-percentile-fill" style="width:${pctMultiple}%;background:${pctColor(100 - pctMultiple)}"></div></div>
            <div class="dd-percentile-values"><span>Low</span><span class="dd-percentile-yours">${formatMultiple(multiple)}</span><span>High</span></div>
          </div>
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Profit Margin (${pctMargin}th percentile)</div>
            <div class="dd-percentile-bar"><div class="dd-percentile-fill" style="width:${pctMargin}%;background:${pctColor(pctMargin)}"></div></div>
            <div class="dd-percentile-values"><span>Low</span><span class="dd-percentile-yours">${formatPercent(margin)}</span><span>High</span></div>
          </div>
          ${pctHours != null ? `
            <div class="dd-percentile-item">
              <div class="dd-percentile-label">Efficiency (${pctHours}th percentile)</div>
              <div class="dd-percentile-bar"><div class="dd-percentile-fill" style="width:${pctHours}%;background:${pctColor(pctHours)}"></div></div>
              <div class="dd-percentile-values"><span>Most work</span><span class="dd-percentile-yours">${hours}h/wk</span><span>Least work</span></div>
            </div>
          ` : ''}
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Business Age (${pctAge}th percentile)</div>
            <div class="dd-percentile-bar"><div class="dd-percentile-fill" style="width:${pctAge}%;background:${pctColor(pctAge)}"></div></div>
            <div class="dd-percentile-values"><span>Newest</span><span class="dd-percentile-yours">${getBusinessAge(listing)}</span><span>Oldest</span></div>
          </div>
        </div>
      </div>

      <!-- Niche Comparison -->
      <div class="dd-section">
        <div class="dd-section-title">vs Niche Average (${niches.join(', ')})</div>
        <div class="dd-percentile-grid">
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Monthly Profit</div>
            <div class="dd-stat-value">${formatUSD(profit)} <small>${vsNiche(profit, nicheAvgProfit)}</small></div>
          </div>
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Monthly Revenue</div>
            <div class="dd-stat-value">${formatUSD(revenue)} <small>${vsNiche(revenue, nicheAvgRevenue)}</small></div>
          </div>
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Multiple</div>
            <div class="dd-stat-value">${formatMultiple(multiple)} <small>${vsNiche(multiple, nicheMedianMult)}</small></div>
          </div>
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Price</div>
            <div class="dd-stat-value">${formatUSD(price)} <small>${vsNiche(price, nicheMedianPrice)}</small></div>
          </div>
        </div>
      </div>

      <!-- Deal Score Breakdown Radar -->
      <div class="dd-section">
        <div class="dd-section-title">Deal Score Breakdown</div>
        <div class="dd-calc-grid">
          <div class="dd-chart-container">
            <canvas id="dd-radar-chart"></canvas>
          </div>
          <div class="dd-calc-results">
            <div class="dd-calc-result-row"><span class="dd-calc-result-label">ROI Score</span><span class="dd-calc-result-value">${breakdown.roi.toFixed(1)} / 25</span></div>
            <div class="dd-calc-result-row"><span class="dd-calc-result-label">Margin Score</span><span class="dd-calc-result-value">${breakdown.margin.toFixed(1)} / 20</span></div>
            <div class="dd-calc-result-row"><span class="dd-calc-result-label">Age/Maturity</span><span class="dd-calc-result-value">${breakdown.age.toFixed(1)} / 15</span></div>
            <div class="dd-calc-result-row"><span class="dd-calc-result-label">Niche Momentum</span><span class="dd-calc-result-value">${breakdown.momentum.toFixed(1)} / 12</span></div>
            <div class="dd-calc-result-row"><span class="dd-calc-result-label">Work Efficiency</span><span class="dd-calc-result-value">${breakdown.efficiency.toFixed(1)} / 10</span></div>
            <div class="dd-calc-result-row"><span class="dd-calc-result-label">Price Discount</span><span class="dd-calc-result-value">${breakdown.discount.toFixed(1)} / 10</span></div>
            <div class="dd-calc-result-row"><span class="dd-calc-result-label">SBA Bonus</span><span class="dd-calc-result-value">${breakdown.sba} / 5</span></div>
            <div class="dd-calc-result-row"><span class="dd-calc-result-label">Trademark Bonus</span><span class="dd-calc-result-value">${breakdown.trademark} / 3</span></div>
          </div>
        </div>
      </div>

      <!-- Risk Breakdown -->
      <div class="dd-section">
        <div class="dd-section-title">Risk Assessment Breakdown</div>
        <div class="dd-percentile-grid">
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Overpricing Risk</div>
            <div class="dd-percentile-bar"><div class="dd-percentile-fill" style="width:${risk.overpricing / 20 * 100}%;background:var(--danger)"></div></div>
            <div class="dd-stat-value">${Math.round(risk.overpricing)}/20</div>
          </div>
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Immaturity Risk</div>
            <div class="dd-percentile-bar"><div class="dd-percentile-fill" style="width:${risk.immaturity / 20 * 100}%;background:var(--warning)"></div></div>
            <div class="dd-stat-value">${Math.round(risk.immaturity)}/20</div>
          </div>
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Low Margin Risk</div>
            <div class="dd-percentile-bar"><div class="dd-percentile-fill" style="width:${risk.lowMargin / 15 * 100}%;background:var(--warning)"></div></div>
            <div class="dd-stat-value">${Math.round(risk.lowMargin)}/15</div>
          </div>
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Niche Saturation</div>
            <div class="dd-percentile-bar"><div class="dd-percentile-fill" style="width:${risk.saturation / 15 * 100}%;background:var(--accent)"></div></div>
            <div class="dd-stat-value">${Math.round(risk.saturation)}/15</div>
          </div>
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Effort Risk</div>
            <div class="dd-percentile-bar"><div class="dd-percentile-fill" style="width:${risk.effort / 15 * 100}%;background:var(--warning)"></div></div>
            <div class="dd-stat-value">${Math.round(risk.effort)}/15</div>
          </div>
          <div class="dd-percentile-item">
            <div class="dd-percentile-label">Concentration Risk</div>
            <div class="dd-percentile-bar"><div class="dd-percentile-fill" style="width:${risk.concentration / 15 * 100}%;background:var(--accent)"></div></div>
            <div class="dd-stat-value">${Math.round(risk.concentration)}/15</div>
          </div>
        </div>
      </div>

      <!-- Investment Calculator -->
      <div class="dd-section">
        <div class="dd-section-title">Investment Calculator</div>
        <div class="dd-calc-grid">
          <div class="dd-calc-inputs">
            <div class="dd-calc-group">
              <label>Purchase Price</label>
              <input type="number" id="dd-calc-price" value="${Math.round(price)}" step="1000">
            </div>
            <div class="dd-calc-group">
              <label>Annual Growth Rate (%)</label>
              <input type="range" id="dd-calc-growth" min="-30" max="50" value="0" step="5">
              <span id="dd-calc-growth-label">0%</span>
            </div>
            <div class="dd-calc-group">
              <label>Hold Period (years)</label>
              <input type="range" id="dd-calc-years" min="1" max="10" value="3" step="1">
              <span id="dd-calc-years-label">3 years</span>
            </div>
            <div class="dd-calc-group">
              <label>Exit Multiple</label>
              <input type="number" id="dd-calc-exit-mult" value="${(multiple || 36).toFixed(0)}" step="1">
            </div>
            <button class="btn btn-accent btn-sm" id="dd-calc-run">Calculate</button>
          </div>
          <div>
            <div class="dd-calc-results" id="dd-calc-results">
              <div class="dd-calc-result-row"><span class="dd-calc-result-label">Monthly Cash Flow (Year 1)</span><span class="dd-calc-result-value" style="color:var(--success)">${formatUSD(profit)}</span></div>
              <div class="dd-calc-result-row"><span class="dd-calc-result-label">Annual Cash Flow (Year 1)</span><span class="dd-calc-result-value" style="color:var(--success)">${formatUSD(annualProfit)}</span></div>
              <div class="dd-calc-result-row"><span class="dd-calc-result-label">Payback Period</span><span class="dd-calc-result-value">${paybackYears > 0 ? paybackYears.toFixed(1) + ' years' : '--'}</span></div>
              <div class="dd-calc-result-row"><span class="dd-calc-result-label">Annual ROI</span><span class="dd-calc-result-value" style="color:var(--accent)">${formatPercent(annualROI)}</span></div>
              <div class="dd-calc-result-row"><span class="dd-calc-result-label">3-Year Total Cash</span><span class="dd-calc-result-value" style="color:var(--success)">${formatUSD(annualProfit * 3)}</span></div>
              <div class="dd-calc-result-row"><span class="dd-calc-result-label">3-Year Total ROI</span><span class="dd-calc-result-value" style="color:var(--accent)">${price > 0 ? formatPercent(annualProfit * 3 / price * 100) : '--'}</span></div>
            </div>
            <div class="dd-chart-container">
              <canvas id="dd-cashflow-chart"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Moat & AI Analysis -->
      ${rep.moatDetails.length || rep.aiAdvantages.length ? `
        <div class="dd-section">
          <div class="dd-section-title">Build vs Buy Analysis</div>
          ${rep.moatDetails.length ? `
            <div style="margin-bottom:12px">
              <strong style="color:var(--danger)">Moats (hard to replicate):</strong>
              ${rep.moatDetails.map(m => `
                <div style="padding:6px 0;border-bottom:1px solid var(--border)">
                  <span style="font-weight:600">${escapeHtml(m.type)}</span>
                  <span style="color:${m.strength === 'Very Strong' ? 'var(--danger)' : m.strength === 'Strong' ? 'var(--warning)' : 'var(--accent)'};margin-left:8px;font-size:0.8rem">${m.strength}</span>
                  <div style="color:var(--text-secondary);font-size:0.85rem">${escapeHtml(m.desc)}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${rep.aiAdvantages.length ? `
            <div>
              <strong style="color:var(--success)">AI Advantages (easy to replicate):</strong>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                ${rep.aiAdvantages.map(a => `<span class="bvb-tag bvb-tag-ai">${escapeHtml(a)}</span>`).join('')}
              </div>
            </div>
          ` : ''}
          <div style="margin-top:12px;padding:10px;background:var(--bg-tertiary);border-radius:var(--radius-sm)">
            Est. Build Cost: <strong>${formatUSD(rep.estimatedBuildCost)}</strong> &bull;
            Est. Build Time: <strong>${rep.estimatedTimeMonths} months</strong> &bull;
            Savings vs Buy: <strong style="color:var(--success)">${formatUSD(price - rep.estimatedBuildCost)}</strong>
          </div>
        </div>
      ` : ''}

      <!-- Comparable Sales -->
      ${comps.length ? `
        <div class="dd-section">
          <div class="dd-section-title">Comparable Sold Businesses</div>
          <div class="dd-comps-list">
            ${comps.map(c => `
              <div class="comp-row" style="padding:8px 0;border-bottom:1px solid var(--border)">
                <a href="https://empireflippers.com/listing/${escapeHtml(String(c.num))}" target="_blank" rel="noopener">#${escapeHtml(String(c.num))}</a>
                <span class="comp-detail">Sold at ${formatMultiple(c.multiple)} &bull; ${formatUSD(c.price)} &bull; ${formatUSD(c.profit)}/mo</span>
                <span class="comp-similarity">${Math.round(c.similarity * 100)}% match</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="dd-actions">
        <a href="https://empireflippers.com/listing/${escapeHtml(String(num))}" target="_blank" rel="noopener" class="btn btn-accent" style="text-decoration:none">View on Empire Flippers</a>
        <button class="btn btn-secondary dd-fav-btn" data-num="${escapeHtml(String(num))}">${isFavorited(listing) ? '\u2605 Saved' : '\u2606 Save to Favorites'}</button>
        <button class="btn btn-ghost dd-compare-btn" data-num="${escapeHtml(String(num))}">+ Add to Compare</button>
      </div>
    `;

    // Bind investment calculator
    bindInvestmentCalculator(listing);

    // Render radar chart
    renderDeepDiveRadar(breakdown);

    // Render cash flow chart
    renderDeepDiveCashflow(price, profit);

    // Bind fav/compare buttons
    const favBtn = dom.deepDiveBody.querySelector('.dd-fav-btn');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        toggleFavorite(listing);
        favBtn.textContent = isFavorited(listing) ? '\u2605 Saved' : '\u2606 Save to Favorites';
      });
    }
    const compBtn = dom.deepDiveBody.querySelector('.dd-compare-btn');
    if (compBtn) {
      compBtn.addEventListener('click', () => {
        toggleCompare(listing);
        showToast('Added to comparison', 'success');
      });
    }
  }

  function renderDeepDiveRadar(breakdown) {
    destroyChart('ddRadar');
    const canvas = $('#dd-radar-chart');
    if (!canvas) return;

    state.charts.ddRadar = new Chart(canvas, {
      type: 'radar',
      data: {
        labels: ['ROI', 'Margin', 'Maturity', 'Momentum', 'Efficiency', 'Value'],
        datasets: [{
          label: 'This Listing',
          data: [
            breakdown.roi / 25 * 100,
            breakdown.margin / 20 * 100,
            breakdown.age / 15 * 100,
            breakdown.momentum / 12 * 100,
            breakdown.efficiency / 10 * 100,
            breakdown.discount / 10 * 100,
          ],
          borderColor: 'rgba(79,134,247,0.9)',
          backgroundColor: 'rgba(79,134,247,0.2)',
          borderWidth: 2,
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { color: '#6a737d', backdropColor: 'transparent', font: { size: 9 } },
            grid: { color: 'rgba(45,49,72,0.5)' },
            pointLabels: { color: '#8b949e', font: { size: 10 } },
          },
        },
        plugins: { legend: { display: false } },
      },
    });
  }

  function renderDeepDiveCashflow(buyPrice, monthlyProfit) {
    destroyChart('ddCashflow');
    const canvas = $('#dd-cashflow-chart');
    if (!canvas) return;

    const years = [0, 1, 2, 3, 4, 5];
    const cumulative = years.map(y => monthlyProfit * 12 * y - buyPrice);

    state.charts.ddCashflow = new Chart(canvas, {
      type: 'line',
      data: {
        labels: years.map(y => `Year ${y}`),
        datasets: [{
          label: 'Cumulative P&L',
          data: cumulative,
          borderColor: cumulative.map(v => v >= 0 ? 'rgba(46,160,67,0.9)' : 'rgba(218,54,51,0.9)'),
          segment: {
            borderColor: ctx => {
              const val = ctx.p1.parsed.y;
              return val >= 0 ? 'rgba(46,160,67,0.9)' : 'rgba(218,54,51,0.9)';
            }
          },
          fill: {
            target: 'origin',
            above: 'rgba(46,160,67,0.1)',
            below: 'rgba(218,54,51,0.1)',
          },
          tension: 0.3,
          pointRadius: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => formatUSD(ctx.raw) } },
        },
        scales: {
          x: { ticks: { color: '#6a737d' }, grid: { color: 'rgba(45,49,72,0.5)' } },
          y: { ticks: { color: '#6a737d', callback: v => formatUSD(v) }, grid: { color: 'rgba(45,49,72,0.5)' } },
        },
      },
    });
  }

  function bindInvestmentCalculator(listing) {
    const growthSlider = $('#dd-calc-growth');
    const yearsSlider = $('#dd-calc-years');
    const growthLabel = $('#dd-calc-growth-label');
    const yearsLabel = $('#dd-calc-years-label');
    const calcBtn = $('#dd-calc-run');
    const resultsEl = $('#dd-calc-results');

    if (!growthSlider || !calcBtn) return;

    growthSlider.addEventListener('input', () => {
      growthLabel.textContent = growthSlider.value + '%';
    });

    yearsSlider.addEventListener('input', () => {
      yearsLabel.textContent = yearsSlider.value + ' years';
    });

    function runCalc() {
      const buyPrice = parseFloat($('#dd-calc-price').value) || 0;
      const growthRate = parseFloat(growthSlider.value) / 100;
      const holdYears = parseInt(yearsSlider.value);
      const exitMult = parseFloat($('#dd-calc-exit-mult').value) || 0;
      const baseProfit = parseFloat(listing.average_monthly_net_profit || 0);

      let totalCash = 0;
      const yearlyData = [];
      for (let y = 1; y <= holdYears; y++) {
        const yearProfit = baseProfit * 12 * Math.pow(1 + growthRate, y - 1);
        totalCash += yearProfit;
        yearlyData.push(yearProfit);
      }

      const exitProfit = baseProfit * Math.pow(1 + growthRate, holdYears - 1);
      const exitValue = exitProfit * exitMult;
      const totalReturn = totalCash + exitValue - buyPrice;
      const totalROI = buyPrice > 0 ? (totalReturn / buyPrice * 100) : 0;
      const payback = buyPrice > 0 && yearlyData[0] > 0 ? (buyPrice / yearlyData[0]) : 0;

      resultsEl.innerHTML = `
        <div class="dd-calc-result-row"><span class="dd-calc-result-label">Year 1 Cash Flow</span><span class="dd-calc-result-value" style="color:var(--success)">${formatUSD(yearlyData[0] || 0)}</span></div>
        <div class="dd-calc-result-row"><span class="dd-calc-result-label">Year ${holdYears} Cash Flow</span><span class="dd-calc-result-value" style="color:var(--success)">${formatUSD(yearlyData[holdYears - 1] || 0)}</span></div>
        <div class="dd-calc-result-row"><span class="dd-calc-result-label">Total Cash Over ${holdYears}yr</span><span class="dd-calc-result-value" style="color:var(--success)">${formatUSD(totalCash)}</span></div>
        <div class="dd-calc-result-row"><span class="dd-calc-result-label">Exit Value (${exitMult}x)</span><span class="dd-calc-result-value">${formatUSD(exitValue)}</span></div>
        <div class="dd-calc-result-row"><span class="dd-calc-result-label">Total Return</span><span class="dd-calc-result-value" style="color:${totalReturn > 0 ? 'var(--success)' : 'var(--danger)'}">${formatUSD(totalReturn)}</span></div>
        <div class="dd-calc-result-row"><span class="dd-calc-result-label">Total ROI</span><span class="dd-calc-result-value" style="color:var(--accent)">${formatPercent(totalROI)}</span></div>
        <div class="dd-calc-result-row"><span class="dd-calc-result-label">Payback Period</span><span class="dd-calc-result-value">${payback > 0 ? payback.toFixed(1) + ' years' : '--'}</span></div>
      `;

      // Update cash flow chart
      destroyChart('ddCashflow');
      const canvas = $('#dd-cashflow-chart');
      if (!canvas) return;

      const labels = ['Buy'];
      const cumData = [-buyPrice];
      let running = -buyPrice;
      for (let y = 1; y <= holdYears; y++) {
        running += yearlyData[y - 1];
        labels.push(`Year ${y}`);
        cumData.push(running);
      }
      // Add exit
      labels.push('Exit');
      cumData.push(running + exitValue);

      state.charts.ddCashflow = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Cumulative P&L',
            data: cumData,
            fill: {
              target: 'origin',
              above: 'rgba(46,160,67,0.1)',
              below: 'rgba(218,54,51,0.1)',
            },
            segment: {
              borderColor: ctx => ctx.p1.parsed.y >= 0 ? 'rgba(46,160,67,0.9)' : 'rgba(218,54,51,0.9)',
            },
            tension: 0.3,
            pointRadius: 5,
            pointBackgroundColor: cumData.map(v => v >= 0 ? 'rgba(46,160,67,0.9)' : 'rgba(218,54,51,0.9)'),
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => formatUSD(ctx.raw) } },
          },
          scales: {
            x: { ticks: { color: '#6a737d' }, grid: { color: 'rgba(45,49,72,0.5)' } },
            y: { ticks: { color: '#6a737d', callback: v => formatUSD(v) }, grid: { color: 'rgba(45,49,72,0.5)' } },
          },
        },
      });
    }

    calcBtn.addEventListener('click', runCalc);
  }

  // Global function to open deep dive from anywhere
  function openListingDeepDive(listingId) {
    openDeepDive();
    if (listingId) {
      dom.deepDiveSelect.value = String(listingId);
      renderDeepDive(listingId);
    }
  }

  // =====================================================================
  //  FAVORITES TAB
  // =====================================================================
  function renderFavorites() {
    const favs = Object.values(state.favorites);
    renderPortfolioDiversification();
    if (!favs.length) {
      dom.favoritesEmpty.classList.remove('hidden');
      dom.favoritesGrid.querySelectorAll('.fav-card').forEach(c => c.remove());
      return;
    }
    dom.favoritesEmpty.classList.add('hidden');

    // Remove old cards but keep empty state element
    dom.favoritesGrid.querySelectorAll('.fav-card').forEach(c => c.remove());

    favs.forEach(l => {
      const card = document.createElement('div');
      card.className = 'fav-card';
      const num = l.listing_number || l.id;
      const niches = getNicheNames(l);
      const price = parseFloat(l.listing_price || 0);
      const profit = parseFloat(l.average_monthly_net_profit || 0);
      const multiple = l.listing_multiple;
      const { score } = calculateDealScore(l, state.marketData);

      card.innerHTML = `
        <div class="fav-card-header">
          <div>
            <a href="https://empireflippers.com/listing/${escapeHtml(String(num))}" target="_blank" rel="noopener" style="font-weight:600;font-size:1rem;">#${escapeHtml(String(num))}</a>
            <div class="niche-tags" style="margin-top:4px">
              ${niches.map(n => `<span class="niche-tag">${escapeHtml(n)}</span>`).join('') || ''}
            </div>
          </div>
          <span class="score-badge ${getScoreClass(score)}">${score}</span>
        </div>
        <div class="fav-card-stats">
          <div class="opp-stat"><span class="opp-stat-label">Price</span><span class="opp-stat-value">${formatUSD(price)}</span></div>
          <div class="opp-stat"><span class="opp-stat-label">Mo. Profit</span><span class="opp-stat-value profit">${formatUSD(profit)}</span></div>
          <div class="opp-stat"><span class="opp-stat-label">Multiple</span><span class="opp-stat-value">${formatMultiple(multiple)}</span></div>
        </div>
        <div class="fav-card-actions">
          <button class="btn btn-sm btn-ghost fav-remove-btn">Remove</button>
          <button class="btn btn-sm btn-secondary fav-compare-btn">+ Compare</button>
        </div>
      `;

      card.querySelector('.fav-remove-btn').addEventListener('click', () => {
        delete state.favorites[String(num)];
        saveFavorites();
        renderFavorites();
      });

      card.querySelector('.fav-compare-btn').addEventListener('click', () => {
        toggleCompare(l);
      });

      dom.favoritesGrid.appendChild(card);
    });
  }

  // =====================================================================
  //  COMPARISON TAB
  // =====================================================================
  function renderComparison() {
    // Gather listing data for compared items
    const allSources = [
      ...(state.dashboardData?.forSale || []),
      ...(state.dashboardData?.sold || []),
      ...state.listings,
      ...Object.values(state.favorites),
    ];

    const compareListings = [];
    state.compareIds.forEach(id => {
      const found = allSources.find(l => String(l.listing_number || l.id) === id);
      if (found) compareListings.push(found);
    });

    if (!compareListings.length) {
      dom.compareEmpty.classList.remove('hidden');
      dom.compareContainer.querySelectorAll('.compare-table').forEach(t => t.remove());
      dom.compareChartContainer.classList.add('hidden');
      return;
    }
    dom.compareEmpty.classList.add('hidden');
    dom.compareContainer.querySelectorAll('.compare-table').forEach(t => t.remove());

    const metrics = [
      { label: 'Listing', fn: l => `<a href="https://empireflippers.com/listing/${l.listing_number || l.id}" target="_blank">#${l.listing_number || l.id}</a>`, raw: l => 0, skipHighlight: true },
      { label: 'Niche', fn: l => getNicheNames(l).join(', ') || '--', raw: l => 0, skipHighlight: true },
      { label: 'Monetization', fn: l => getMonetizationNames(l).join(', ') || '--', raw: l => 0, skipHighlight: true },
      { label: 'Price', fn: l => formatUSD(parseFloat(l.listing_price || 0)), raw: l => parseFloat(l.listing_price || 0), lowerBetter: true },
      { label: 'Monthly Profit', fn: l => formatUSD(parseFloat(l.average_monthly_net_profit || 0)), raw: l => parseFloat(l.average_monthly_net_profit || 0) },
      { label: 'Monthly Revenue', fn: l => formatUSD(parseFloat(l.average_monthly_gross_revenue || 0)), raw: l => parseFloat(l.average_monthly_gross_revenue || 0) },
      { label: 'Multiple', fn: l => formatMultiple(l.listing_multiple), raw: l => parseFloat(l.listing_multiple || 999), lowerBetter: true },
      { label: 'Annual ROI', fn: l => { const m = l.listing_multiple; return m > 0 ? formatPercent((12 / m) * 100) : '--'; }, raw: l => { const m = l.listing_multiple; return m > 0 ? (12 / m) * 100 : 0; } },
      { label: 'Profit Margin', fn: l => { const r = parseFloat(l.average_monthly_gross_revenue || 0); const p = parseFloat(l.average_monthly_net_profit || 0); return r > 0 ? formatPercent(p / r * 100) : '--'; }, raw: l => { const r = parseFloat(l.average_monthly_gross_revenue || 0); const p = parseFloat(l.average_monthly_net_profit || 0); return r > 0 ? p / r * 100 : 0; } },
      { label: 'Business Age', fn: l => getBusinessAge(l), raw: l => getAgeMonths(l) },
      { label: 'Hours/Week', fn: l => l.hours_worked_per_week != null ? l.hours_worked_per_week + 'h' : '--', raw: l => l.hours_worked_per_week != null ? l.hours_worked_per_week : 999, lowerBetter: true },
      { label: 'Deal Score', fn: l => calculateDealScore(l, state.marketData).score, raw: l => calculateDealScore(l, state.marketData).score },
      { label: 'SBA Eligible', fn: l => l.sba_financing_approved ? 'Yes' : 'No', raw: l => l.sba_financing_approved ? 1 : 0 },
      { label: 'Trademark', fn: l => l.has_trademark ? 'Yes' : 'No', raw: l => l.has_trademark ? 1 : 0 },
    ];

    const table = document.createElement('table');
    table.className = 'compare-table';

    // Header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th>Metric</th>' + compareListings.map(l => `<th style="text-align:center">#${l.listing_number || l.id}</th>`).join('');
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body rows
    const tbody = document.createElement('tbody');
    metrics.forEach(metric => {
      const tr = document.createElement('tr');
      const rawValues = compareListings.map(l => metric.raw(l));
      const validValues = rawValues.filter(v => v !== 0 && v !== 999);

      let bestIdx = -1, worstIdx = -1;
      if (!metric.skipHighlight && validValues.length > 1) {
        if (metric.lowerBetter) {
          bestIdx = rawValues.indexOf(Math.min(...validValues));
          worstIdx = rawValues.indexOf(Math.max(...validValues));
        } else {
          bestIdx = rawValues.indexOf(Math.max(...validValues));
          worstIdx = rawValues.indexOf(Math.min(...validValues));
        }
      }

      tr.innerHTML = `<th>${metric.label}</th>` + compareListings.map((l, i) => {
        const cls = i === bestIdx ? 'best-value' : i === worstIdx ? 'worst-value' : '';
        return `<td class="${cls}">${metric.fn(l)}</td>`;
      }).join('');

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    dom.compareContainer.appendChild(table);

    // Radar chart
    renderCompareRadar(compareListings);
  }

  function renderCompareRadar(listings) {
    destroyChart('compareRadar');
    if (listings.length < 2) {
      dom.compareChartContainer.classList.add('hidden');
      return;
    }
    dom.compareChartContainer.classList.remove('hidden');

    const colors = ['rgba(79,134,247,0.7)', 'rgba(46,160,67,0.7)', 'rgba(210,153,34,0.7)', 'rgba(218,54,51,0.7)', 'rgba(160,80,240,0.7)'];
    const bgColors = ['rgba(79,134,247,0.15)', 'rgba(46,160,67,0.15)', 'rgba(210,153,34,0.15)', 'rgba(218,54,51,0.15)', 'rgba(160,80,240,0.15)'];

    const radarLabels = ['ROI', 'Profit', 'Margin', 'Age', 'Efficiency', 'Score'];

    const datasets = listings.map((l, i) => {
      const { score, breakdown } = calculateDealScore(l, state.marketData);
      const multiple = parseFloat(l.listing_multiple || 0);
      const roi = multiple > 0 ? Math.min(100, (12 / multiple) * 100 * 2) : 0;
      const profit = Math.min(100, parseFloat(l.average_monthly_net_profit || 0) / 500);
      const rev = parseFloat(l.average_monthly_gross_revenue || 0);
      const p = parseFloat(l.average_monthly_net_profit || 0);
      const margin = rev > 0 ? (p / rev * 100) : 0;
      const age = Math.min(100, getAgeMonths(l) * 2);
      const hours = l.hours_worked_per_week;
      const efficiency = hours != null ? Math.max(0, 100 - hours * 2.5) : 50;

      return {
        label: `#${l.listing_number || l.id}`,
        data: [roi, profit, margin, age, efficiency, score],
        borderColor: colors[i % colors.length],
        backgroundColor: bgColors[i % bgColors.length],
        borderWidth: 2,
        pointRadius: 3,
      };
    });

    state.charts.compareRadar = new Chart($('#chart-compare-radar'), {
      type: 'radar',
      data: { labels: radarLabels, datasets },
      options: {
        responsive: true,
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { color: '#6a737d', backdropColor: 'transparent', font: { size: 10 } },
            grid: { color: 'rgba(45,49,72,0.5)' },
            pointLabels: { color: '#8b949e', font: { size: 11 } },
          },
        },
        plugins: { legend: { labels: { color: '#8b949e' } } },
      },
    });
  }

  // =====================================================================
  //  MODALS
  // =====================================================================
  function closeModals() {
    dom.modalBackdrop.classList.add('hidden');
  }

  // =====================================================================
  //  EVENT BINDING
  // =====================================================================
  function bindEvents() {
    // Category collapse/expand
    $$('.category-header[data-collapse]').forEach(header => {
      const bodyId = header.getAttribute('data-collapse');
      const body = $('#' + bodyId);
      if (!body) return;
      // Set initial max-height so transition works
      body.style.maxHeight = body.scrollHeight + 'px';
      header.addEventListener('click', () => {
        const isCollapsed = header.classList.toggle('collapsed');
        if (isCollapsed) {
          body.style.maxHeight = body.scrollHeight + 'px';
          body.offsetHeight; // force reflow
          body.classList.add('collapsed');
          body.style.maxHeight = '0';
        } else {
          body.classList.remove('collapsed');
          body.style.maxHeight = body.scrollHeight + 'px';
          // After transition, remove max-height so new content isn't clipped
          setTimeout(() => { if (!header.classList.contains('collapsed')) body.style.maxHeight = 'none'; }, 450);
        }
      });
    });

    // Back to TOC floating button
    const backToTocBtn = $('#back-to-toc');
    if (backToTocBtn) {
      window.addEventListener('scroll', () => {
        backToTocBtn.classList.toggle('visible', window.scrollY > 600);
      });
      backToTocBtn.addEventListener('click', () => {
        const toc = $('#dashboard-toc');
        if (toc) toc.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Tab navigation
    $$('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Apply / Reset filters
    dom.btnApply.addEventListener('click', () => {
      readFiltersFromUI();
      state.pagination.page = 1;
      fetchListings();
    });
    dom.btnReset.addEventListener('click', resetFilters);

    // Status toggle
    $$('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filters.status = btn.dataset.status;
      });
    });

    // Toggle filter panel
    dom.btnToggleFilters.addEventListener('click', () => {
      dom.filterBody.classList.toggle('collapsed');
      dom.btnToggleFilters.classList.toggle('collapsed');
    });

    // Load dashboard (force refresh)
    dom.btnLoadDashboard.addEventListener('click', () => {
      switchTab('dashboard');
      loadDashboard();
    });
    dom.btnLoadDashboard2.addEventListener('click', loadDashboard);

    // Update banner: refresh / dismiss
    const btnRefresh = $('#btn-refresh-data');
    const btnDismiss = $('#btn-dismiss-update');
    if (btnRefresh) btnRefresh.addEventListener('click', () => loadDashboard());
    if (btnDismiss) btnDismiss.addEventListener('click', hideUpdateBanner);

    // Export CSV
    dom.btnExportCsv.addEventListener('click', () => exportCSV(state.listings, `ef-listings-${new Date().toISOString().slice(0, 10)}.csv`));

    // Export favorites CSV
    dom.btnExportFavorites.addEventListener('click', () => {
      exportCSV(Object.values(state.favorites), `ef-favorites-${new Date().toISOString().slice(0, 10)}.csv`);
    });

    // Clear favorites
    dom.btnClearFavorites.addEventListener('click', () => {
      if (Object.keys(state.favorites).length === 0) return;
      state.favorites = {};
      saveFavorites();
      renderFavorites();
      showToast('All favorites cleared.', 'success');
    });

    // Clear compare
    dom.btnClearCompare.addEventListener('click', () => {
      state.compareIds.clear();
      updateCompareBadge();
      renderComparison();
    });

    // Select all compare
    dom.selectAllCompare.addEventListener('change', e => {
      const checked = e.target.checked;
      if (checked) {
        state.listings.slice(0, 5).forEach(l => {
          const id = String(l.listing_number || l.id);
          if (!state.compareIds.has(id) && state.compareIds.size < 5) state.compareIds.add(id);
        });
      } else {
        state.compareIds.clear();
      }
      updateCompareBadge();
      // Update checkboxes in table
      dom.listingsBody.querySelectorAll('.compare-cb').forEach(cb => {
        cb.checked = state.compareIds.has(cb.dataset.id);
      });
    });

    // Close modals
    dom.modalClose.addEventListener('click', closeModals);
    dom.modalBackdrop.addEventListener('click', e => {
      if (e.target === dom.modalBackdrop) closeModals();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModals();
    });

    // Deep Dive
    if (dom.deepDiveClose) {
      dom.deepDiveClose.addEventListener('click', closeDeepDive);
    }
    if (dom.deepDiveOverlay) {
      dom.deepDiveOverlay.addEventListener('click', e => {
        if (e.target === dom.deepDiveOverlay) closeDeepDive();
      });
    }
    if (dom.deepDiveSelect) {
      dom.deepDiveSelect.addEventListener('change', () => {
        const val = dom.deepDiveSelect.value;
        if (val) renderDeepDive(val);
      });
    }
    if (dom.deepDiveSearch) {
      dom.deepDiveSearch.addEventListener('input', e => {
        filterDeepDiveSelect(e.target.value);
      });
    }
    if (dom.tocOpenDeepDive) {
      dom.tocOpenDeepDive.addEventListener('click', e => {
        e.preventDefault();
        openDeepDive();
      });
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !dom.deepDiveOverlay.classList.contains('hidden')) {
        closeDeepDive();
      }
    });

    // Close dropdowns on outside click
    document.addEventListener('click', e => {
      if (!e.target.closest('.multi-select-wrapper')) closeAllDropdowns();
    });

    // Column sorting
    setupColumnSort();

    // Enter key in filter inputs
    [dom.filterPriceMin, dom.filterPriceMax, dom.filterProfitMin, dom.filterProfitMax].forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          readFiltersFromUI();
          state.pagination.page = 1;
          fetchListings();
        }
      });
    });
  }

  // =====================================================================
  //  INIT
  // =====================================================================
  async function init() {
    bindEvents();
    updateSortIndicators();
    updateFavBadge();
    updateCompareBadge();
    await fetchConfig();

    // Start on dashboard tab
    switchTab('dashboard');

    // Try loading cached dashboard data from IndexedDB
    const hadCache = await loadDashboardFromCache();

    if (hadCache) {
      // Data loaded from cache - check for new listings in background
      setTimeout(() => checkForNewListings(), 2000);
    } else {
      // No cached data - auto-fetch immediately
      loadDashboard();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
