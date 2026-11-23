const crypto = require('crypto');

class AliceRestExecutor {
  constructor({ sessionToken = '', apiKey = '' } = {}) {
    this.apiBase = 'https://ant.aliceblueonline.com';
    this.setCredentials({ sessionToken, apiKey });
  }

  setCredentials({ sessionToken = '', apiKey = '' } = {}) {
    const parsed = normalizeSessionToken(sessionToken);
    this.rawSessionToken = String(sessionToken || '').trim();
    this.sessionToken = parsed.token;
    this.sessionInfo = parsed.info;
    this.apiKey = String(apiKey || '').trim();
  }

  async placeOrder(order) {
    if (!this.sessionToken) {
      throw new Error('Alice session token is missing. Login in the broker panel first.');
    }

    const payload = this.buildOrderPayload(order);
    const result = await this.post('/omk/od-rest/orders/web/execute', [payload]);
    assertAliceOk(result, 'place order');
    return {
      ok: true,
      submittedAt: new Date().toISOString(),
      payload,
      result
    };
  }

  async modifyOrder(order) {
    if (!this.sessionToken) {
      throw new Error('Alice session token is missing. Login in the broker panel first.');
    }
    if (!order.orderNo) {
      throw new Error('Alice order number is required to modify SL order.');
    }

    const payload = this.buildModifyPayload(order);
    const result = await this.post('/omk/od-rest/orders/modify', payload);
    assertAliceOk(result, 'modify order');
    return {
      ok: true,
      submittedAt: new Date().toISOString(),
      payload,
      result
    };
  }

  async getAccountSummary() {
    if (!this.sessionToken) {
      return emptyAccountSummary('Alice session token is missing.');
    }

    const [profile, balance, positions] = await Promise.allSettled([
      this.get('/omk/client-rest/profile/getclientdetails'),
      this.get('/omk/funds-rest/funds/limits'),
      this.get('/omk/po-rest/positions')
    ]);

    return normalizeAccountSummary({
      profile: settledValue(profile),
      balance: settledValue(balance),
      positions: settledValue(positions),
      error: firstError([profile, balance, positions])
    });
  }

  async getOrderBook() {
    if (!this.sessionToken) {
      throw new Error('Alice session token is missing. Login in the broker panel first.');
    }
    return this.get('/omk/od-rest/info/orderbook');
  }

  buildOrderPayload(order) {
    const action = String(order.action || order.side || 'BUY').toUpperCase();
    const priceType = mapPriceType(order.orderType || order.pricetype || 'MARKET');
    const product = String(order.product || order.producttype || 'MIS').toUpperCase();
    const quantity = String(order.quantity || order.qty || '0');
    const price = priceType === 'MKT' ? 0 : Number(order.price || '0');
    const triggerPrice = priceType.startsWith('SL') ? Number(order.triggerPrice || order.triggerprice || '0') : 0;
    const exchange = String(order.exchange || 'BFO').toUpperCase();
    const symbol = String(order.symbol || order.trading_symbol || '').trim();

    return {
      deviceNumber: deviceNumberFrom(this.sessionToken),
      exchange,
      token: String(order.token || order.symbol_id || '').trim(),
      tradingSymbol: compactTradingSymbol(symbol, order, exchange),
      ltp: '',
      qty: quantity,
      price,
      product,
      priceType,
      orderType: 'Regular',
      transType: action === 'SELL' || action === 'S' ? 'S' : 'B',
      ret: 'DAY',
      triggerPrice,
      disclosedQty: '',
      mktProtection: '',
      target: '',
      stopLoss: '',
      trailingStopLoss: ''
    };
  }

  buildModifyPayload(order) {
    const payload = this.buildOrderPayload(order);
    return {
      ...payload,
      orderNo: String(order.orderNo || '').trim(),
      price: payload.priceType === 'MKT' ? 0 : String(payload.price),
      triggerPrice: payload.priceType.startsWith('SL') ? payload.triggerPrice : '',
      disclosedQty: String(order.disclosedQty || order.disclosedQuantity || '')
    };
  }

  async post(endpoint, body) {
    const url = `${this.apiBase}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body)
    });
    const text = await response.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch (_) {}
    if (!response.ok) {
      throw new Error(`Alice REST ${response.status} ${endpoint}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
    return data;
  }

  async get(endpoint) {
    const response = await fetch(`${this.apiBase}${endpoint}`, {
      method: 'GET',
      headers: this.headers()
    });
    const text = await response.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch (_) {}
    if (!response.ok) {
      throw new Error(`Alice REST ${response.status} ${endpoint}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
    return data;
  }

  headers() {
    const headers = {
      Authorization: `Bearer ${this.sessionToken}`,
      'Content-Type': 'application/json'
    };
    if (this.apiKey) headers['x-api-key'] = this.apiKey;
    return headers;
  }
}

function normalizeSessionToken(value) {
  const text = String(value || '').trim();
  if (!text) return { token: '', info: {} };
  if (!/^[{[]/.test(text)) return { token: text, info: {} };
  try {
    const parsed = JSON.parse(text);
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    if (row && typeof row === 'object') {
      return {
        token: String(row.accessToken || row.token || row.sessionToken || '').trim(),
        info: {
          authorized: row.authorized,
          kcRole: row.kcRole || '',
          userId: row.userId || row.ucc || ''
        }
      };
    }
  } catch (_) {}
  return { token: text, info: {} };
}

function normalizeAccountSummary({ profile, balance, positions, error }) {
  const profileData = firstObject(profile);
  const balanceData = firstObject(balance);
  const positionRows = Array.isArray(positions)
    ? positions
    : Array.isArray(positions && positions.result)
      ? positions.result
      : Array.isArray(positions && positions.data)
        ? positions.data
        : [];

  return {
    ok: Boolean(profile || balance || positions),
    clientId: pick(profileData, ['clientId', 'accountId', 'loginId', 'userId', 'uid', 'client_id']),
    clientName: pick(profileData, ['clientName', 'accountName', 'name', 'userName', 'client_name']),
    accountStatus: pick(profileData, ['accountStatus', 'status']),
    balance: numberFrom(balanceData, ['availableMargin', 'availableCash', 'cashmarginavailable', 'net', 'balance', 'credits', 'cash']),
    marginUsed: numberFrom(balanceData, ['utilizedMargin', 'marginused', 'debits', 'utilized', 'usedMargin']),
    dayPnl: calculatePositionPnl(positionRows),
    positions: positionRows,
    message: error || ''
  };
}

function emptyAccountSummary(message) {
  return {
    ok: false,
    clientId: '',
    clientName: '',
    accountStatus: '',
    balance: null,
    marginUsed: null,
    dayPnl: null,
    positions: [],
    message
  };
}

function settledValue(result) {
  return result.status === 'fulfilled' ? result.value : null;
}

function firstError(results) {
  const failed = results.find((result) => result.status === 'rejected');
  return failed ? failed.reason.message : '';
}

function firstObject(payload) {
  if (!payload) return {};
  if (Array.isArray(payload)) return payload[0] || {};
  if (Array.isArray(payload.result)) return payload.result[0] || {};
  if (Array.isArray(payload.data)) return payload.data[0] || {};
  if (payload.result && typeof payload.result === 'object') return payload.result;
  if (payload.data && typeof payload.data === 'object') return payload.data;
  return typeof payload === 'object' ? payload : {};
}

function pick(source, keys) {
  for (const key of keys) {
    if (source && source[key] != null && source[key] !== '') return String(source[key]);
  }
  return '';
}

function numberFrom(source, keys) {
  for (const key of keys) {
    const value = Number(source && source[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function calculatePositionPnl(rows) {
  let total = 0;
  let found = false;
  for (const row of rows) {
    const value = Number(row && (row.pnl || row.netPnl || row.realisedPnl || row.realizedPnl || row.unrealisedPnl || row.unrealizedPnl || row.MtoM || row.mtom || row.profitandloss));
    if (Number.isFinite(value)) {
      total += value;
      found = true;
    }
  }
  return found ? total : null;
}

function mapPriceType(orderType) {
  const normalized = String(orderType || 'MARKET').toUpperCase();
  if (['MKT', 'MARKET'].includes(normalized)) return 'MKT';
  if (['L', 'LIMIT'].includes(normalized)) return 'L';
  if (['SL', 'STOPLOSS_LIMIT', 'STOP_LOSS_LIMIT'].includes(normalized)) return 'SL';
  if (['SL-M', 'SLM', 'STOPLOSS_MARKET', 'STOP_LOSS_MARKET'].includes(normalized)) return 'SL-M';
  return normalized;
}

function compactTradingSymbol(symbol, order, exchange) {
  const explicit = String(order.tradingSymbol || order.trading_symbol_compact || order.compactTradingSymbol || '').trim();
  if (explicit) return explicit;
  const text = String(symbol || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (/^[A-Z]+\d{2}[A-Z]\d{2}\d+(CE|PE)$/.test(text)) return text;

  const match = text.match(/^(SENSEX)\s+(\d{1,2})(?:ST|ND|RD|TH)?\s+([A-Z]{3})\s+(\d{4,7})\s+(CE|PE)$/);
  if (exchange === 'BFO' && match) {
    const [, root, day, month, strike, optionType] = match;
    const year = inferExpiryYear(month, Number(day));
    const monthCode = aliceMonthCode(month);
    if (year && isMonthlyExpiry(month, Number(day), year)) {
      return `${root}${String(year).slice(-2)}${month}${strike}${optionType}`;
    }
    if (year && monthCode) return `${root}${String(year).slice(-2)}${monthCode}${String(day).padStart(2, '0')}${strike}${optionType}`;
  }

  return text.replace(/\s+/g, '');
}

function inferExpiryYear(month, day) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const monthIndex = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(month);
  if (monthIndex < 0) return currentYear;
  const expiry = new Date(currentYear, monthIndex, day || 1);
  const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  return expiry < thirtyDaysAgo ? currentYear + 1 : currentYear;
}

function aliceMonthCode(month) {
  return {
    JAN: 'J',
    FEB: 'F',
    MAR: 'M',
    APR: 'A',
    MAY: 'Y',
    JUN: 'U',
    JUL: 'L',
    AUG: 'G',
    SEP: 'S',
    OCT: 'O',
    NOV: 'N',
    DEC: 'D'
  }[month];
}

function isMonthlyExpiry(month, day, year) {
  const monthIndex = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(month);
  if (monthIndex < 0 || !Number.isFinite(day) || !Number.isFinite(year)) return false;
  const lastDay = new Date(year, monthIndex + 1, 0);
  for (let date = lastDay.getDate(); date >= 1; date -= 1) {
    const candidate = new Date(year, monthIndex, date);
    if (candidate.getDay() === 4) return date === day;
  }
  return false;
}

function assertAliceOk(result, action) {
  const rows = Array.isArray(result) ? result : [result];
  const failed = rows.find((row) => {
    if (!row || typeof row !== 'object') return false;
    const status = String(row.status || row.stat || '').toUpperCase();
    return status && status !== 'OK' && status !== 'SUCCESS';
  });
  if (!failed) return;
  const message = failed.message || failed.emsg || failed.errorMessage || failed.infoMessage || JSON.stringify(failed);
  throw new Error(`Alice ${action} failed: ${message}`);
}

function deviceNumberFrom(token) {
  return crypto.createHash('md5')
    .update(`trade-assist:${String(token || '').slice(-48)}`)
    .digest('hex');
}

module.exports = AliceRestExecutor;
module.exports.compactTradingSymbol = compactTradingSymbol;
