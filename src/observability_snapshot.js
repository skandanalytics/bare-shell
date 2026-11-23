function buildObservabilitySnapshot(options = {}) {
  const now = options.now || new Date();
  const config = options.config || {};
  const featureModules = options.featureModules || {};
  const brokerStatus = options.brokerStatus || {};
  const accountSummary = options.accountSummary || {};
  const strategyState = options.strategyState || {};

  return {
    generatedAt: now.toISOString(),
    shell: {
      appName: options.appName || 'Trade Assist',
      appVersion: options.appVersion || '',
      platform: process.platform,
      arch: process.arch,
      runtimePolicy: options.runtimePolicy || {}
    },
    broker: {
      selectedBroker: options.selectedBroker || config.selectedBroker || brokerStatus.selectedBroker || '',
      ready: Boolean(brokerStatus.ready),
      visible: Boolean(brokerStatus.visible),
      hasSessionToken: Boolean(brokerStatus.hasSessionToken),
      activeToken: brokerStatus.activeToken || '',
      lastMarketTickAt: brokerStatus.lastMarketTickAt || '',
      accountLoaded: Boolean(accountSummary && (accountSummary.account || accountSummary.clientId || accountSummary.clientName)),
      balanceLoaded: accountSummary && accountSummary.balance != null,
      dayPnlLoaded: accountSummary && accountSummary.dayPnl != null,
      positionsCount: Array.isArray(accountSummary && accountSummary.positions) ? accountSummary.positions.length : 0
    },
    license: {
      configured: Boolean(featureModules.configured),
      userId: featureModules.userId || '',
      deviceId: featureModules.deviceId || '',
      licenseKeyMasked: featureModules.licenseKeyMasked || '',
      lastSyncAt: featureModules.lastSyncAt || '',
      lastSuccessfulSyncAt: featureModules.lastSuccessfulSyncAt || '',
      manifestExpiresAt: featureModules.manifestExpiresAt || '',
      offlineGrace: featureModules.offlineGrace || null,
      errors: featureModules.errors || []
    },
    modules: summarizeModules(featureModules.modules || [], now),
    cache: {
      cacheDir: featureModules.cacheDir || '',
      cleanupEnabled: config.featureModuleCleanupEnabled !== false,
      cleanupHour: Number(config.featureModuleCleanupHour || 19),
      cacheMaxHours: Number(config.featureModuleCacheMaxHours || 24),
      lastCleanupAt: featureModules.lastCleanupAt || '',
      lastStartupCleanupAt: featureModules.lastStartupCleanupAt || '',
      cleanupReason: featureModules.cleanupReason || ''
    },
    risk: {
      emergencyStop: Boolean(config.riskEmergencyStop),
      dailyLossLimit: numberOrZero(config.riskDailyLossLimit),
      maxTradesPerDay: numberOrZero(config.riskMaxTradesPerDay),
      maxOpenPositions: numberOrZero(config.riskMaxOpenPositions),
      strategyAutoTrade: Boolean(config.strategyAutoTrade)
    },
    strategy: {
      openPosition: Boolean(strategyState.position),
      position: strategyState.position || null,
      cooldown: strategyState.cooldown || null
    },
    dataStore: options.dataStore || null
  };
}

function summarizeModules(modules = [], now = new Date()) {
  const rows = modules.map((item) => {
    const installedAtMs = Date.parse(item.installedAt || '');
    const expiresAtMs = Date.parse(item.expiresAt || '');
    return {
      id: item.id || item.moduleId || '',
      version: item.version || '',
      status: item.status || '',
      runtimeStatus: item.runtimeStatus || '',
      featureIds: item.featureIds || [],
      installedAt: item.installedAt || '',
      expiresAt: item.expiresAt || '',
      cacheAgeHours: Number.isFinite(installedAtMs) ? round((now.getTime() - installedAtMs) / 36e5) : null,
      expired: Number.isFinite(expiresAtMs) ? expiresAtMs <= now.getTime() : false,
      minAppVersion: item.minAppVersion || '',
      maxAppVersion: item.maxAppVersion || '',
      error: item.error || item.runtimeError || ''
    };
  });
  return {
    total: rows.length,
    byStatus: rows.reduce((out, item) => {
      const key = item.status || 'unknown';
      out[key] = Number(out[key] || 0) + 1;
      return out;
    }, {}),
    rows
  };
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

module.exports = {
  buildObservabilitySnapshot,
  summarizeModules
};
