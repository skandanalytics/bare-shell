const INTERNAL_FLAGS = new Set(['1', 'true', 'yes', 'internal', 'support']);

const CUSTOMER_CONFIG_ALLOWLIST = new Set([
  'selectedBroker',
  'featureModuleUserId',
  'featureModuleLicenseKey',
  'featureModuleDeviceId',
  'riskEmergencyStop',
  'riskDailyLossLimit',
  'riskMaxTradesPerDay',
  'riskMaxOpenPositions',
  'strategyFastHardSlCooldownMs',
  'dataRetentionEnabled',
  'dataRetentionCandleDays',
  'dataRetentionJournalDays',
  'dataRetentionSupportBundleDays',
  'defaultExchange',
  'defaultProduct',
  'defaultOrderType',
  'defaultQuantity',
  'showBrokerPanel'
]);

function getRuntimePolicy(env = process.env, argv = process.argv) {
  const internalAdminEnabled = INTERNAL_FLAGS.has(String(env.ALGO_INTERNAL_ADMIN || '').toLowerCase())
    || argv.includes('--internal-admin')
    || argv.includes('--support-admin');
  return {
    internalAdminEnabled,
    customerMode: !internalAdminEnabled,
    sensitiveControlsLocked: !internalAdminEnabled
  };
}

function assertInternalAdmin(policy, action = 'This action') {
  if (!policy || !policy.internalAdminEnabled) {
    throw new Error(`${action} is available only in internal support mode.`);
  }
}

function enforceCustomerConfig(config = {}, policy = getRuntimePolicy()) {
  if (!policy.customerMode) return config;
  return {
    ...config,
    featureModuleAllowUnsigned: false
  };
}

function filterConfigUpdateForPolicy(partial = {}, policy = getRuntimePolicy()) {
  if (!policy.customerMode) return { ...partial };
  const safe = {};
  for (const [key, value] of Object.entries(partial || {})) {
    if (CUSTOMER_CONFIG_ALLOWLIST.has(key)) safe[key] = value;
  }
  safe.featureModuleAllowUnsigned = false;
  return safe;
}

function sanitizeFeatureModuleStatus(status, policy = getRuntimePolicy()) {
  if (!status || !policy.customerMode) return status;
  const modules = Array.isArray(status.modules) ? status.modules : [];
  const installed = modules.filter((item) => item.status === 'installed').length;
  const unavailable = modules.filter((item) => item.status !== 'installed').length;
  return {
    configured: Boolean(status.configured),
    lastSyncAt: status.lastSyncAt || '',
    manifestExpiresAt: status.manifestExpiresAt || '',
    appVersion: status.appVersion || '',
    userId: status.userId || '',
    deviceId: status.deviceId || '',
    licenseKeyMasked: status.licenseKeyMasked || '',
    lastCleanupAt: status.lastCleanupAt || '',
    lastStartupCleanupAt: status.lastStartupCleanupAt || '',
    cleanupReason: status.cleanupReason || '',
    entitlements: (status.entitlements || []).map((item) => ({
      id: item.id,
      name: item.name || item.id,
      expiresAt: item.expiresAt || ''
    })),
    moduleSummary: {
      total: modules.length,
      installed,
      unavailable
    },
    modules: [],
    offlineGrace: status.offlineGrace || null,
    errors: status.errors || []
  };
}

module.exports = {
  assertInternalAdmin,
  enforceCustomerConfig,
  filterConfigUpdateForPolicy,
  getRuntimePolicy,
  sanitizeFeatureModuleStatus
};
