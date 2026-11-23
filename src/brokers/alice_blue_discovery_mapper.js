const {
  firstNumberAtPaths,
  firstObjectAtPaths,
  firstStringAtPaths,
  getBrokerDiscoveryMappingConfig,
  positionPnlFromConfig,
  rowsAtPaths
} = require('./discovery_mapping_config');

function mapAliceBlueDiscovery(candidate, overrides = {}) {
  const payload = parseBody(candidate && candidate.bodyPreview);
  if (!payload) return null;

  const mapping = getBrokerDiscoveryMappingConfig('aliceblue', overrides);
  const url = String(candidate.url || '').toLowerCase();
  if (url.includes('/omk/client-rest/profile/getclientdetails')) {
    return mapProfile(payload, mapping.profile);
  }
  if (url.includes('/omk/funds-rest/funds/limits')) {
    return mapFunds(payload, mapping.funds);
  }
  if (url.includes('/omk/po-rest/positions')) {
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
    accountStatus: firstStringAtPaths(profile, mapping.accountStatusPaths)
  });
}

function mapFunds(payload, mapping = {}) {
  const funds = firstObjectAtPaths(payload, mapping.rootPaths);
  if (!funds) return null;
  return summary({
    balance: firstNumberAtPaths(funds, mapping.balancePaths),
    marginUsed: firstNumberAtPaths(funds, mapping.marginUsedPaths)
  });
}

function mapPositions(payload, mapping = {}) {
  const positions = rowsAtPaths(payload, mapping.rowPaths);
  if (!positions.length) return null;
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
    message: 'Loaded from Alice Blue discovery.',
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
  mapAliceBlueDiscovery
};
