const DEFAULT_DISCOVERY_MAPPINGS = {
  aliceblue: {
    profile: {
      rootPaths: ['result.0', 'result', '$'],
      clientIdPaths: ['userId', 'actId'],
      clientNamePaths: ['clientName'],
      accountStatusPaths: ['actStatus']
    },
    funds: {
      rootPaths: ['result.0', 'result', '$'],
      balancePaths: ['availableMargin'],
      marginUsedPaths: ['marginUsed']
    },
    positions: {
      rowPaths: ['result'],
      pnlPaths: ['pnl'],
      realizedPnlPaths: ['realizedPnl', 'realisedPnl'],
      unrealizedPnlPaths: ['unrealizedPnl', 'unrealisedPnl']
    }
  },
  zerodha: {
    profile: {
      rootPaths: ['data', 'result', '$'],
      clientIdPaths: ['user_id', 'userId', 'login_id'],
      clientNamePaths: ['user_name', 'userName', 'name'],
      accountStatusPaths: ['user_type', 'broker']
    },
    funds: {
      rootPaths: ['data.equity', 'data.Equity', 'data', 'result.equity', 'result', '$'],
      balancePaths: ['available.live_balance', 'available.opening_balance', 'available.cash', 'net', 'availableMargin'],
      marginUsedObjectPaths: ['utilised', 'utilized'],
      marginUsedPaths: ['marginUsed', 'usedMargin']
    },
    positions: {
      rowPaths: ['data.net', 'data.day', 'data', 'result.net', 'result.day', 'result'],
      pnlPaths: ['pnl', 'day_pnl', 'realised', 'realized', 'unrealised', 'unrealized', 'm2m'],
      realizedPnlPaths: [],
      unrealizedPnlPaths: []
    }
  }
};

function getBrokerDiscoveryMappingConfig(brokerId, overrides = {}) {
  const id = String(brokerId || '').trim().toLowerCase();
  const defaults = DEFAULT_DISCOVERY_MAPPINGS[id] || {};
  const brokerOverrides = overrides && (overrides[id] || overrides);
  return mergeMappingConfig(defaults, brokerOverrides && typeof brokerOverrides === 'object' ? brokerOverrides : {});
}

function mergeMappingConfig(defaults = {}, overrides = {}) {
  const merged = { ...defaults };
  for (const [section, value] of Object.entries(overrides || {})) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      merged[section] = value;
      continue;
    }
    merged[section] = {
      ...(defaults[section] || {}),
      ...value
    };
  }
  return merged;
}

function firstObjectAtPaths(payload, paths = []) {
  for (const path of paths || []) {
    const value = valueAtPath(payload, path);
    if (Array.isArray(value)) {
      const first = value[0];
      if (first && typeof first === 'object') return first;
    }
    if (value && typeof value === 'object') return value;
  }
  return null;
}

function rowsAtPaths(payload, paths = []) {
  const rows = [];
  for (const path of paths || []) {
    const value = valueAtPath(payload, path);
    if (Array.isArray(value)) rows.push(...value);
  }
  return rows;
}

function firstStringAtPaths(source, paths = [], fallback = '') {
  for (const path of paths || []) {
    const value = valueAtPath(source, path);
    if (value != null && value !== '') return String(value);
  }
  return fallback;
}

function firstNumberAtPaths(source, paths = []) {
  for (const path of paths || []) {
    const value = valueAtPath(source, path);
    const number = numberValue(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function sumNumberObjectsAtPaths(source, paths = []) {
  let total = 0;
  let found = false;
  for (const path of paths || []) {
    const value = valueAtPath(source, path);
    if (!value || typeof value !== 'object') continue;
    for (const item of Object.values(value)) {
      const number = numberValue(item);
      if (!Number.isFinite(number)) continue;
      total += number;
      found = true;
    }
  }
  return found ? total : null;
}

function positionPnlFromConfig(position, config = {}) {
  const direct = firstNumberAtPaths(position, config.pnlPaths || []);
  if (Number.isFinite(direct)) return direct;
  const realized = firstNumberAtPaths(position, config.realizedPnlPaths || []);
  const unrealized = firstNumberAtPaths(position, config.unrealizedPnlPaths || []);
  if (!Number.isFinite(realized) && !Number.isFinite(unrealized)) return 0;
  return (Number.isFinite(realized) ? realized : 0) + (Number.isFinite(unrealized) ? unrealized : 0);
}

function valueAtPath(source, path) {
  if (path === '$' || path == null || path === '') return source;
  const parts = String(path).split('.').filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (current == null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[Number(part)];
    } else {
      current = current[part];
    }
  }
  return current;
}

function numberValue(value) {
  if (typeof value === 'number') return value;
  if (value == null) return NaN;
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : NaN;
}

module.exports = {
  DEFAULT_DISCOVERY_MAPPINGS,
  firstNumberAtPaths,
  firstObjectAtPaths,
  firstStringAtPaths,
  getBrokerDiscoveryMappingConfig,
  numberValue,
  positionPnlFromConfig,
  rowsAtPaths,
  sumNumberObjectsAtPaths,
  valueAtPath
};
