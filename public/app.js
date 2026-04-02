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

    return `
      <div class="detail-grid">
        <div class="detail-section">
          <h4>Deal Score Breakdown</h4>
          ${scoreItems.map(s => `<div class="detail-row-item"><span class="label">${s.key}</span><span class="value">${s.value}</span></div>`).join('')}
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
          if (c.key === '_name') {
            if (onNameClick) return `<td class="name-cell"><a href="#" class="browse-name-link" data-name="${escapeHtml(row._name)}">${escapeHtml(row._name)}</a></td>`;
            return `<td class="name-cell">${escapeHtml(row._name)}</td>`;
          }
          if (c.render) return `<td class="${c.tdClass || ''}">${c.render(row, i, maxMarketVal)}</td>`;
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
      .map(n => ({ name: n, profit: (md.nicheAvgProfit[n] || 0) * 12 }))
      .filter(n => n.profit > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 15);

    console.log('Niche profit chart:', niches.length, 'niches');
    if (!niches.length) return;

    state.charts.nicheProfitRank = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: niches.map(n => n.name),
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
          tooltip: { callbacks: { label: ctx => formatUSD(ctx.raw) } },
        },
        scales: {
          x: { ticks: { color: '#6a737d', callback: v => formatUSD(v) }, grid: { color: 'rgba(45,49,72,0.5)' } },
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
        return { name: n, roi: mult > 0 ? (12 / mult) * 100 : 0 };
      })
      .filter(n => n.roi > 0 && (md.nicheTotalListings[n.name] || 0) >= 3)
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 15);

    console.log('Niche ROI chart:', niches.length, 'niches');
    if (!niches.length) return;

    state.charts.nicheROIRank = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: niches.map(n => n.name),
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
          tooltip: { callbacks: { label: ctx => ctx.raw + '%' } },
        },
        scales: {
          x: { ticks: { color: '#6a737d', callback: v => v + '%' }, grid: { color: 'rgba(45,49,72,0.5)' } },
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

    state.charts.monMultiple = new Chart(canvas1, {
      type: 'bar',
      data: {
        labels: monsByMultiple,
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
          tooltip: { callbacks: { label: ctx => ctx.raw + 'x' } },
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

    state.charts.monProfit = new Chart(canvas2, {
      type: 'bar',
      data: {
        labels: monsByProfit,
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
          tooltip: { callbacks: { label: ctx => formatUSD(ctx.raw) } },
        },
        scales: {
          x: { ticks: { color: '#6a737d', callback: v => formatUSD(v) }, grid: { color: 'rgba(45,49,72,0.5)' } },
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
  //  FAVORITES TAB
  // =====================================================================
  function renderFavorites() {
    const favs = Object.values(state.favorites);
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
