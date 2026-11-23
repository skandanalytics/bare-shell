const { ipcRenderer } = require('electron');

let discoveryEnabled = false;
const DISCOVERY_MAX_BODY = 12000;
const observedSockets = new WeakSet();
const latestTicksByToken = new Map();

ipcRenderer.on('discovery-mode', (_event, enabled) => {
  discoveryEnabled = Boolean(enabled);
});

function parseTicks(payload) {
  const ticks = [];
  try {
    if (typeof payload !== 'string') return ticks;
    const data = JSON.parse(payload);
    const rows = Array.isArray(data) ? data : [data];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const token = normalizeToken(row.tk || row.token || row.t || row.instrument_token || row.symbol_id || row.s);
      const lp = Number(row.lp || row.ltp || row.l || row.price || row.last_price);
      if (token && Number.isFinite(lp)) {
        ticks.push({
          token,
          lp,
          ts: Number(row.ft || row.ts || row.time || Date.now()),
          symbol: row.tsym || row.trading_symbol || row.symbol || row.name || row.s,
          exchange: row.e || row.exch || row.exchange,
          segment: row.segment || row.seg
        });
      }
    }
  } catch (_) {}
  return ticks;
}

function normalizeToken(value) {
  return String(value || '').replace('#', '').trim();
}

function sendTicks(ticks) {
  if (!ticks || ticks.length === 0) return;
  for (const tick of ticks) {
    const token = normalizeToken(tick && tick.token);
    const price = Number(tick && tick.lp);
    if (token && Number.isFinite(price)) {
      latestTicksByToken.set(token, {
        token,
        price,
        ts: Date.now(),
        symbol: tick.symbol || '',
        exchange: tick.exchange || '',
        segment: tick.segment || ''
      });
    }
  }
  ipcRenderer.send('broker-ticks', ticks);
}

function syncSessionToken() {
  try {
    const keys = ['userSession', 'sessionID', 'sessionId', 'alice_session', 'enctoken', 'kf_session', 'public_token', 'request_token', 'authToken', 'accessToken', 'token'];
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const key of keys) {
        const value = storage && storage.getItem(key);
        if (value && value.length > 12) {
          ipcRenderer.send('broker-session-token', { token: value, key });
          return;
        }
      }
    }
  } catch (_) {}
}

function patchWebSocket() {
  if (window.__algoAlicePreloadHooked || !window.WebSocket) return;
  window.__algoAlicePreloadHooked = true;
  const NativeWebSocket = window.WebSocket;
  window.WebSocket = function AlgoAlicePreloadWebSocket(...args) {
    const ws = new NativeWebSocket(...args);
    observeWebSocket(ws);
    return ws;
  };
  window.WebSocket.prototype = NativeWebSocket.prototype;
  Object.assign(window.WebSocket, NativeWebSocket);
}

function observeWebSocket(ws) {
  try {
    if (!ws || observedSockets.has(ws) || typeof ws.addEventListener !== 'function') return false;
    observedSockets.add(ws);
    window.__algoAliceLastWs = ws;
    ws.addEventListener('message', (event) => sendTicks(parseTicks(event.data)));
    return true;
  } catch (_) {
    return false;
  }
}

function observeKnownWebSockets() {
  try {
    observeWebSocket(window.__algoAliceLastWs);
    observeWebSocket(window.__skandAltWS);
    observeWebSocket(window.__skandWS);
    observeWebSocket(window.skandAltWS);
  } catch (_) {}
}

function patchDiscovery() {
  patchFetchDiscovery();
  patchXhrDiscovery();
}

function patchFetchDiscovery() {
  if (window.__algoAliceFetchDiscovery || !window.fetch) return;
  window.__algoAliceFetchDiscovery = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const startedAt = Date.now();
    const response = await nativeFetch(...args);
    const request = args[0];
    const init = args[1] || {};
    const url = typeof request === 'string' ? request : request && request.url;
    const method = String(init.method || (request && request.method) || 'GET').toUpperCase();
    const requestBody = init.body || '';
    captureResponse({
      transport: discoveryEnabled ? 'fetch-discovery' : 'fetch-passive',
      url,
      method,
      status: response.status,
      startedAt,
      requestBody,
      response: response.clone()
    });
    return response;
  };
}

function patchXhrDiscovery() {
  if (window.__algoAliceXhrDiscovery || !window.XMLHttpRequest) return;
  window.__algoAliceXhrDiscovery = true;
  const NativeXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function AlgoAliceDiscoveryXHR() {
    const xhr = new NativeXHR();
    let method = 'GET';
    let url = '';
    let startedAt = 0;
    let requestBody = '';
    const nativeOpen = xhr.open;
    const nativeSend = xhr.send;
    xhr.open = function open(nextMethod, nextUrl, ...rest) {
      method = String(nextMethod || 'GET').toUpperCase();
      url = String(nextUrl || '');
      return nativeOpen.call(xhr, nextMethod, nextUrl, ...rest);
    };
    xhr.send = function send(body) {
      requestBody = body || '';
      return nativeSend.call(xhr, body);
    };
    xhr.addEventListener('loadstart', () => {
      startedAt = Date.now();
    });
    xhr.addEventListener('loadend', () => {
      if (!url) return;
      capturePayload({
        transport: discoveryEnabled ? 'xhr-discovery' : 'xhr-passive',
        url,
        method,
        status: xhr.status,
        startedAt,
        contentType: xhr.getResponseHeader('content-type') || '',
        requestBody,
        body: typeof xhr.responseText === 'string' ? xhr.responseText : ''
      });
    });
    return xhr;
  };
  window.XMLHttpRequest.prototype = NativeXHR.prototype;
}

async function captureResponse(meta) {
  try {
    const contentType = meta.response.headers.get('content-type') || '';
    const body = await meta.response.text();
    capturePayload({ ...meta, contentType, body, response: undefined });
  } catch (_) {}
}

function capturePayload(meta) {
  if (!looksInteresting(meta.url, meta.body)) return;
  ipcRenderer.send('broker-api-candidate', {
    transport: meta.transport,
    url: String(meta.url || ''),
    method: meta.method,
    status: meta.status,
    contentType: meta.contentType || '',
    durationMs: Date.now() - Number(meta.startedAt || Date.now()),
    capturedAt: new Date().toISOString(),
    requestPreview: stringifyBody(meta.requestBody).slice(0, DISCOVERY_MAX_BODY),
    bodyPreview: String(meta.body || '').slice(0, DISCOVERY_MAX_BODY)
  });
}

function stringifyBody(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof FormData) {
    const rows = [];
    try {
      for (const [key, value] of body.entries()) rows.push([key, typeof value === 'string' ? value : '[binary]']);
    } catch (_) {}
    return JSON.stringify(rows);
  }
  try {
    return JSON.stringify(body);
  } catch (_) {
    return String(body || '');
  }
}

function looksInteresting(url, body) {
  const text = `${url || ''} ${String(body || '').slice(0, 1000)}`.toLowerCase();
  return /(account|profile|balance|fund|limit|margin|position|holding|order|pnl|profit|loss|rms|client|user|watchlist|marketwatch|option|optionchain|chain|scrip|symbol|trading.?symbol|instrument|token|sensex|nifty|bfo|nfo|\bce\b|\bpe\b)/.test(text);
}

function installHooks() {
  patchWebSocket();
  patchDiscovery();
  observeKnownWebSockets();
  syncSessionToken();
  setInterval(syncSessionToken, 3000);
  setInterval(observeKnownWebSockets, 2000);
  installInstrumentScraper();
}

function installInstrumentScraper() {
  if (window.__algoAliceInstrumentScraper) return;
  window.__algoAliceInstrumentScraper = true;
  const scrape = () => {
    try {
      const rows = [
        ...scrapeDomInstrumentRows(),
        ...scrapeStorageInstrumentRows()
      ];
      const unique = uniqueInstrumentRows(rows).slice(0, 300);
      if (unique.length) ipcRenderer.send('broker-instrument-candidates', unique);
    } catch (_) {}
  };
  setInterval(scrape, 10000);
  setTimeout(scrape, 2500);
}

function scrapeDomInstrumentRows() {
  const rows = [];
  const optionPattern = /\b(?:SENSEX|BANKEX|NIFTY|BANKNIFTY|FINNIFTY)[A-Z0-9\s./_-]{0,70}\d{4,7}\s*(?:CE|PE)\b/ig;
  const selectors = [
    'tr',
    '[role="row"]',
    '[role="option"]',
    'li',
    '.watchlist-item',
    '.watchlist-row',
    '.symbol',
    '.instrument',
    '.contract',
    '[class*="watch"]',
    '[class*="symbol"]',
    '[class*="scrip"]',
    '[class*="instrument"]'
  ].join(',');
  const elements = Array.from(new Set([
    ...document.querySelectorAll(selectors),
    ...Array.from(document.querySelectorAll('div, span, button, a')).filter((element) => {
      const text = compactText(element.innerText || element.textContent || '');
      return text.length >= 10 && text.length <= 220 && /\b(CE|PE)\b|(?:CE|PE)$/i.test(text) && /(SENSEX|BANKEX|NIFTY|BANKNIFTY|FINNIFTY)/i.test(text);
    })
  ])).slice(0, 1600);
  for (const element of elements) {
    const container = findInstrumentContainer(element);
    const text = compactText(container.innerText || container.textContent || element.innerText || element.textContent || '');
    if (!/(CE|PE|SENSEX|NIFTY|BANKNIFTY|BANKEX|FINNIFTY)/i.test(text)) continue;
    rows.push(...extractInstrumentRowsFromText(text, 'dom-text'));
    const symbol = firstMatch(text, optionPattern);
    const aggregated = isAggregatedInstrumentText(text);
    const ltp = aggregated ? NaN : extractDisplayedPrice(text, symbol);
    const token = findTokenInElement(container) || findTokenInElement(element) || matchTokenByDisplayedPrice(ltp);
    if (symbol || token) {
      rows.push({
        token,
        symbol,
        trading_symbol: symbol,
        exchange: findExchange(text),
        lastPrice: Number.isFinite(ltp) ? ltp : null,
        textSample: text.slice(0, 180),
        source: aggregated ? 'dom-metadata' : token && !findTokenInElement(container) && !findTokenInElement(element) ? 'dom-price-match' : 'dom'
      });
    }
  }
  return rows;
}

function extractInstrumentRowsFromText(text, source) {
  const rows = [];
  const normalized = compactText(text || '');
  if (!normalized || !/\b(?:CE|PE)\b/i.test(normalized)) return rows;
  const pattern = /\b((?:SENSEX|BANKEX|NIFTY|BANKNIFTY|FINNIFTY)[A-Z0-9\s./_-]{0,70}?\d{4,7}\s*(?:CE|PE))\s+(\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)\s*(BFO|NFO|BSE|NSE|MCX|CDS)?\b/ig;
  let match;
  while ((match = pattern.exec(normalized))) {
    const symbol = normalizeInstrumentText(match[1]);
    const ltp = Number(String(match[2] || '').replace(/,/g, ''));
    if (!symbol || !Number.isFinite(ltp) || ltp <= 0) continue;
    const token = matchTokenByDisplayedPrice(ltp);
    rows.push({
      token,
      symbol,
      trading_symbol: symbol,
      exchange: String(match[3] || findExchange(normalized) || '').toUpperCase(),
      lastPrice: ltp,
      textSample: normalized.slice(Math.max(0, match.index - 20), Math.min(normalized.length, match.index + match[0].length + 80)),
      source: token ? `${source}-price-match` : source
    });
  }
  return rows;
}

function findInstrumentContainer(element) {
  let best = element;
  let current = element;
  for (let depth = 0; current && depth < 7; depth += 1) {
    const text = compactText(current.innerText || current.textContent || '');
    if (text.length > 0 && text.length <= 600 && /\b(?:CE|PE)\b/i.test(text) && /\d+(?:\.\d+)?/.test(text)) best = current;
    if (text.length > 900) break;
    current = current.parentElement;
  }
  return best || element;
}

function extractDisplayedPrice(text, symbol) {
  const cleanSymbol = compactText(symbol || '');
  let rest = compactText(text || '');
  if (isPortfolioOrAccountText(rest)) return NaN;
  if (cleanSymbol) rest = rest.replace(cleanSymbol, ' ');
  const numbers = rest.match(/\b\d{2,5}(?:,\d{3})*(?:\.\d{1,2})?\b/g) || [];
  const prices = numbers
    .map((value) => Number(String(value).replace(/,/g, '')))
    .filter((value) => Number.isFinite(value) && value > 1 && value < 100000);
  if (!prices.length) return NaN;
  const optionLike = prices.filter((value) => value < 10000);
  return optionLike.length ? optionLike[0] : prices[0];
}

function isAggregatedInstrumentText(text) {
  const normalized = compactText(text || '');
  if (!normalized) return false;
  if (isPortfolioOrAccountText(normalized)) return true;
  return countOptionSymbols(normalized) > 1;
}

function isPortfolioOrAccountText(text) {
  return /\b(today'?s positions|position breakups?|net p&l|day'?s p&l|realized p&l|unrealized p&l|sell avg|buy avg|qty\.?|holdings|portfolio|download)\b/i.test(String(text || ''));
}

function countOptionSymbols(text) {
  const matches = String(text || '').match(/\b(?:SENSEX|BANKEX|NIFTY|BANKNIFTY|FINNIFTY)[A-Z0-9\s./_-]{0,70}?\d{4,7}\s*(?:CE|PE)\b/ig);
  return matches ? new Set(matches.map((value) => normalizeInstrumentText(value).toUpperCase())).size : 0;
}

function matchTokenByDisplayedPrice(price) {
  if (!Number.isFinite(price) || price <= 0) return '';
  const now = Date.now();
  const matches = [];
  for (const tick of latestTicksByToken.values()) {
    if (now - Number(tick.ts || 0) > 30000) continue;
    if (Math.abs(Number(tick.price) - price) <= 0.05) matches.push(tick);
  }
  if (matches.length !== 1) return '';
  return normalizeToken(matches[0].token);
}

function findTokenInElement(element) {
  const attrs = ['data-token', 'data-symbol-token', 'data-instrument-token', 'data-instrumentid', 'data-instrument-id', 'data-id', 'token', 'symbol-token'];
  const scanElement = (target) => {
    if (!target || !target.getAttribute) return '';
    for (const attr of attrs) {
      const value = target.getAttribute(attr);
      if (isTokenLike(value)) return normalizeToken(value);
    }
    for (const [key, value] of Object.entries(target.dataset || {})) {
      if (/token|instrument|symbol|scrip/i.test(key) && isTokenLike(value)) return normalizeToken(value);
    }
    return '';
  };
  const direct = scanElement(element);
  if (direct) return direct;
  for (const child of Array.from(element.querySelectorAll ? element.querySelectorAll('*') : []).slice(0, 80)) {
    const found = scanElement(child);
    if (found) return found;
  }
  let current = element.parentElement;
  for (let depth = 0; current && depth < 3; depth += 1) {
    const found = scanElement(current);
    if (found) return found;
    for (const [key, value] of Object.entries(current.dataset || {})) {
      if (/token|instrument|symbol/i.test(key) && isTokenLike(value)) return normalizeToken(value);
    }
    current = current.parentElement;
  }
  return '';
}

function scrapeStorageInstrumentRows() {
  const rows = [];
  for (const storage of [window.localStorage, window.sessionStorage]) {
    if (!storage) continue;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      const value = storage.getItem(key);
      if (!/(watch|market|option|scrip|symbol|instrument|token|sensex|nifty|bfo|nfo)/i.test(`${key} ${String(value).slice(0, 500)}`)) continue;
      collectInstrumentObjects(parseMaybeJson(value), rows, 'storage');
    }
  }
  return rows;
}

function collectInstrumentObjects(value, rows, source) {
  if (!value || rows.length > 500) return;
  if (Array.isArray(value)) {
    for (const item of value) collectInstrumentObjects(item, rows, source);
    return;
  }
  if (typeof value !== 'object') return;
  const token = normalizeToken(value.token || value.instrument_token || value.instrumentToken || value.instrument_id || value.instrumentId || value.symbol_id || value.symbolId || value.symbolToken || value.pSymbol || value.tk || value.t || '');
  const symbol = compactText(value.trading_symbol || value.tradingsymbol || value.tradingSymbol || value.pTrdSymbol || value.symbol_name || value.symbolName || value.displayName || value.symbol || value.name || value.tsym || '');
  if (token || /\b(CE|PE)\b/i.test(symbol)) {
    rows.push({
      token,
      symbol,
      trading_symbol: symbol,
      exchange: value.exchange || value.exch || value.e || '',
      segment: value.segment || value.seg || '',
      textSample: compactText(symbol).slice(0, 180),
      source
    });
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') collectInstrumentObjects(child, rows, source);
  }
}

function uniqueInstrumentRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const token = normalizeToken(row.token);
    const symbol = compactText(row.symbol || row.trading_symbol);
    if (!token && !symbol) continue;
    const key = `${token}:${symbol}`;
    const existing = map.get(key) || {};
    map.set(key, mergeInstrumentCandidate(existing, { ...row, token, symbol, trading_symbol: row.trading_symbol || symbol }));
  }
  return Array.from(map.values());
}

function mergeInstrumentCandidate(existing, next) {
  const existingHasPrice = Number.isFinite(Number(existing.lastPrice));
  const nextHasPrice = Number.isFinite(Number(next.lastPrice));
  return {
    ...existing,
    ...next,
    token: next.token || existing.token || '',
    symbol: next.symbol || existing.symbol || '',
    trading_symbol: next.trading_symbol || existing.trading_symbol || next.symbol || existing.symbol || '',
    exchange: next.exchange || existing.exchange || '',
    segment: next.segment || existing.segment || '',
    lastPrice: nextHasPrice ? next.lastPrice : existingHasPrice ? existing.lastPrice : null,
    textSample: nextHasPrice && next.textSample ? next.textSample : existing.textSample || next.textSample || '',
    source: nextHasPrice ? next.source || existing.source : existing.source || next.source || ''
  };
}

function parseMaybeJson(value) {
  const text = String(value || '').trim();
  if (!text || !/^[{[]/.test(text)) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function firstMatch(text, pattern) {
  const match = String(text || '').match(pattern);
  return match ? normalizeInstrumentText(match[0]) : '';
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeInstrumentText(value) {
  return compactText(value).replace(/,/g, '');
}

function isTokenLike(value) {
  const token = normalizeToken(value);
  return /^\d{4,10}$/.test(token);
}

function findExchange(text) {
  const match = String(text || '').match(/\b(BFO|NFO|BSE|NSE|MCX|CDS)\b/i);
  return match ? match[1].toUpperCase() : '';
}

installHooks();
window.addEventListener('DOMContentLoaded', installHooks);

document.addEventListener('algo-alice-tick', (event) => {
  const detail = event.detail || {};
  sendTicks([{
    token: detail.token,
    lp: detail.lp,
    ts: detail.ts || Date.now(),
    symbol: detail.symbol,
    exchange: detail.exchange,
    segment: detail.segment
  }]);
});

document.addEventListener('algo-alice-session-token', (event) => {
  if (event.detail) ipcRenderer.send('broker-session-token', event.detail);
});
