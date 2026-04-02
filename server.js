const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = 3000;
const EF_API_BASE = "https://api.empireflippers.com/api/v1";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// In-memory cache (key -> { data, timestamp })
// ---------------------------------------------------------------------------
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_TTL_LONG_MS = 30 * 60 * 1000; // 30 minutes for sold/historical data

function getCached(key, ttl) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < (ttl || CACHE_TTL_MS)) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ---------------------------------------------------------------------------
// Rate limiter - 1 request per second to the EF API
// ---------------------------------------------------------------------------
let lastRequestTime = 0;

async function rateLimitedFetch(url) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
  }
  lastRequestTime = Date.now();

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`EF API error ${response.status}: ${text}`);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// GET /api/config - proxy to /ef-config (cached)
// ---------------------------------------------------------------------------
app.get("/api/config", async (req, res) => {
  try {
    const cached = getCached("config");
    if (cached) return res.json(cached);

    const data = await rateLimitedFetch(`${EF_API_BASE}/ef-config`);
    setCache("config", data);
    res.json(data);
  } catch (err) {
    console.error("Error fetching config:", err.message);
    res.status(err.status || 502).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/listings - proxy to /listings/list with query params
// ---------------------------------------------------------------------------
const ALLOWED_LISTING_PARAMS = [
  "page",
  "limit",
  "sort",
  "order",
  "listing_status",
  "listing_price_from",
  "listing_price_to",
  "average_monthly_net_profit_from",
  "average_monthly_net_profit_to",
  "niches",
  "monetizations",
  "countries",
  "sba_financing_approved",
  "has_trademark",
  "uses_pbn",
  "created_at_from",
  "created_at_to",
  "sold_at_from",
  "sold_at_to",
];

app.get("/api/listings", async (req, res) => {
  try {
    const params = new URLSearchParams();
    for (const key of ALLOWED_LISTING_PARAMS) {
      if (req.query[key] !== undefined) {
        params.set(key, req.query[key]);
      }
    }

    const url = `${EF_API_BASE}/listings/list?${params.toString()}`;
    const data = await rateLimitedFetch(url);
    res.json(data);
  } catch (err) {
    console.error("Error fetching listings:", err.message);
    res.status(err.status || 502).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/listings/recommendations/:id
// ---------------------------------------------------------------------------
app.get("/api/listings/recommendations/:id", async (req, res) => {
  try {
    const url = `${EF_API_BASE}/listings/recommendations?id=${encodeURIComponent(req.params.id)}`;
    const data = await rateLimitedFetch(url);
    res.json(data);
  } catch (err) {
    console.error("Error fetching recommendations:", err.message);
    res.status(err.status || 502).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/fetch-all - paginate through ALL listings (cached)
// ---------------------------------------------------------------------------
app.get("/api/fetch-all", async (req, res) => {
  const listingStatus = req.query.listing_status || "For Sale";
  const cacheKey = `fetch-all:${listingStatus}`;

  try {
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const allListings = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        page: String(page),
        limit: "100",
        listing_status: listingStatus,
      });

      const url = `${EF_API_BASE}/listings/list?${params.toString()}`;
      console.log(`Fetching page ${page} for "${listingStatus}" listings...`);
      const raw = await rateLimitedFetch(url);
      const inner = raw.data || raw;
      const listings = inner.listings || [];
      if (listings.length === 0) {
        hasMore = false;
      } else {
        allListings.push(...listings);
        // Stop if we got fewer than the limit (last page)
        if (listings.length < 100) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

    const result = { total: allListings.length, listings: allListings };
    setCache(cacheKey, result);
    console.log(`Fetched ${allListings.length} total "${listingStatus}" listings (${page} pages).`);
    res.json(result);
  } catch (err) {
    console.error("Error in fetch-all:", err.message);
    res.status(err.status || 502).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/dashboard-data - fetch both sold + for-sale data for analytics
// ---------------------------------------------------------------------------
app.get("/api/dashboard-data", async (req, res) => {
  const cacheKey = "dashboard-data";

  try {
    const cached = getCached(cacheKey, CACHE_TTL_LONG_MS);
    if (cached) return res.json(cached);

    // Fetch for-sale and sold in sequence (rate-limited)
    console.log("Dashboard: fetching For Sale listings...");
    const forSaleResult = await fetchAllPages("For Sale");
    console.log(`Dashboard: got ${forSaleResult.length} For Sale. Now fetching Sold...`);
    const soldResult = await fetchAllPages("Sold");
    console.log(`Dashboard: got ${soldResult.length} Sold listings.`);

    const result = {
      forSale: forSaleResult,
      sold: soldResult,
      fetchedAt: new Date().toISOString(),
    };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error("Error in dashboard-data:", err.message);
    res.status(err.status || 502).json({ error: err.message });
  }
});

async function fetchAllPages(listingStatus) {
  const allListings = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      page: String(page),
      limit: "100",
      listing_status: listingStatus,
    });
    const url = `${EF_API_BASE}/listings/list?${params.toString()}`;
    const raw = await rateLimitedFetch(url);
    const inner = raw.data || raw;
    const listings = inner.listings || [];
    if (listings.length === 0) {
      hasMore = false;
    } else {
      allListings.push(...listings);
      if (listings.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }
  return allListings;
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
// Start server only when run directly (not when imported by Vercel)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Empire Flippers Scout server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
