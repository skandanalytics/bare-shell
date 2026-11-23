const {
  firstNumberAtPaths,
  firstObjectAtPaths,
  firstStringAtPaths,
  getBrokerDiscoveryMappingConfig,
  positionPnlFromConfig,
  rowsAtPaths,
  sumNumberObjectsAtPaths
} = require('./discovery_mapping_config');

function mapZerodhaDiscovery(candidate, overrides = {}) {
  const payload = parseBody(candidate && candidate.bodyPreview);
  if (!payload) return null;

  const mapping = getBrokerDiscoveryMappingConfig('zerodha', overrides);
  const url = String(candidate.url || '').toLowerCase();
  if (url.includes('/oms/user/profile')) {
    return mapProfile(payload, mapping.profile);
  }
  if (url.includes('/oms/user/margins')) {
    return mapMargins(payload, mapping.funds);
  }
  if (url.includes('/oms/portfolio/positions')) {
    return mapPositions(payload, mapping.positions);
  }
  return null;
}

function mapProfile(payload, mapping = {}) {
  const profile = firstObjectAtPaths(payload, mapping.rootPaths);
  if (!profile) return null;
  return summary({
    clientId: firstStringAtPaths(profile, mapping.clientIdPaths),
    clientName: firstStringAtPaths(profile, mapping.clientNamePaths),
    accountStatus: firstStringAtPaths(profile, mapping.accountStatusPaths, 'Active')
  });
}

function mapMargins(payload, mapping = {}) {
  const equity = firstObjectAtPaths(payload, mapping.rootPaths);
  if (!equity) return null;
  const balance = firstNumberAtPaths(equity, mapping.balancePaths);
  const explicitMarginUsed = firstNumberAtPaths(equity, mapping.marginUsedPaths);
  const objectMarginUsed = sumNumberObjectsAtPaths(equity, mapping.marginUsedObjectPaths);
  const marginUsed = Number.isFinite(explicitMarginUsed) ? explicitMarginUsed : objectMarginUsed;
  return summary({
    balance,
    marginUsed: Number.isFinite(marginUsed) ? marginUsed : null
  });
}

function mapPositions(payload, mapping = {}) {
  const positions = rowsAtPaths(payload, mapping.rowPaths);
  if (!positions.length) return summary({ dayPnl: 0, positions: [] });
  return summary({
    dayPnl: positions.reduce((total, position) => total + positionPnlFromConfig(position, mapping), 0),
    positions
  });
}

function summary(values) {
  return {
    ok: true,
    clientId: '',
    clientName: '',
    accountStatus: '',
    balance: null,
    marginUsed: null,
    dayPnl: null,
    positions: [],
    message: 'Loaded from Zerodha discovery.',
    ...values
  };
}

function parseBody(body) {
  const text = String(body || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

module.exports = {
  mapZerodhaDiscovery
};
