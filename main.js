const { app, BrowserWindow, BrowserView, ipcMain, shell, globalShortcut } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const CandleEngine = require('./src/candle_engine');
const { applyDataRetention, ensureDataStore, scanCandleIntegrity } = require('./src/data_store');
const FeatureModuleManager = require('./src/feature_module_manager');
const { parseOption } = require('./src/option_symbol');
const {
  BUILTIN_MOMENTUM_REVERSAL,
  withStrategyIdentity
} = require('./src/strategy_identity');
const { buildObservabilitySnapshot } = require('./src/observability_snapshot');
const { buildSupportBundle } = require('./src/support_bundle');
const {
  assertInternalAdmin,
  enforceCustomerConfig,
  filterConfigUpdateForPolicy,
  getRuntimePolicy,
  sanitizeFeatureModuleStatus
} = require('./src/shell_access_policy');
const {
  createBrokerAdapter,
  listBrokers,
  normalizeBrokerId
} = require('./src/brokers/broker_registry');
const {
  isCompleteOrderStatus,
  isOpenOrderStatus,
  normalizeOrderStatus
} = require('./src/brokers/order_status');

let MomentumReversalStrategy = null;
try {
  MomentumReversalStrategy = require('./src/momentum_reversal_strategy');
} catch (_) {
  MomentumReversalStrategy = null;
}

const SENSEX_TOKEN = '1';
const SENSEX_NAME = 'SENSEX';
const DEFAULT_INTERVAL_MS = 60_000;
const ACCOUNT_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const ACCOUNT_PRESENCE_INTERVAL_MS = 30 * 1000;
const MARKET_FEED_STALE_MS = 90 * 1000;
const MARKET_FEED_RECOVERY_COOLDOWN_MS = 3 * 60 * 1000;
const MARKET_FEED_RECOVERY_WAIT_MS = 8000;
const PROTECTIVE_SL_ADOPTION_INTERVAL_MS = 3000;
const PROTECTIVE_SL_MODIFY_MIN_INTERVAL_MS = 12_000;
const PROTECTIVE_SL_MODIFY_WINDOW_MS = 60_000;
const PROTECTIVE_SL_MODIFY_MAX_PER_WINDOW = 5;
const APP_DISPLAY_NAME = 'Trade Assist';

app.setName(APP_DISPLAY_NAME);

const WS_INTERCEPTOR_MAIN = `
(() => {
  if (window.__algoAliceSensexHooked) return;
  window.__algoAliceSensexHooked = true;

  const emitTick = (tick) => {
    if (!tick || tick.lp == null) return;
    const token = String(tick.token || tick.tk || tick.t || tick.s || tick.symbol_id || '').replace('#', '').trim();
    const lp = Number(tick.lp || tick.ltp || tick.l || tick.price);
    if (!token || !Number.isFinite(lp)) return;
    document.dispatchEvent(new CustomEvent('algo-alice-tick', {
      detail: {
        token,
        lp,
        ts: Number(tick.ft || tick.ts || tick.time || Date.now()),
        symbol: tick.tsym || tick.trading_symbol || tick.symbol || tick.name || tick.s,
        exchange: tick.e || tick.exch || tick.exchange,
        segment: tick.segment || tick.seg
      }
    }));
  };

  const inspect = (payload) => {
    try {
      if (typeof payload !== 'string') return;
      const data = JSON.parse(payload);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        emitTick({
          token: item.tk || item.token || item.t || item.symbol_id || item.s,
          lp: item.lp || item.ltp || item.l || item.price || item.last_price,
          ft: item.ft,
          ts: item.ts,
          time: item.time,
          tsym: item.tsym,
          trading_symbol: item.trading_symbol,
          symbol: item.symbol,
          name: item.name,
          e: item.e,
          exch: item.exch,
          exchange: item.exchange,
          segment: item.segment || item.seg
        });
      }
    } catch (_) {}
  };

  const NativeWebSocket = window.WebSocket;
  window.WebSocket = function AlgoAliceWebSocket(...args) {
    const ws = new NativeWebSocket(...args);
    window.__algoAliceLastWs = ws;
    ws.addEventListener('message', (event) => inspect(event.data));
    return ws;
  };
  window.WebSocket.prototype = NativeWebSocket.prototype;
  Object.assign(window.WebSocket, NativeWebSocket);

  const syncToken = () => {
    try {
      const keys = ['userSession', 'sessionID', 'sessionId', 'alice_session', 'enctoken', 'kf_session', 'public_token', 'request_token', 'authToken', 'accessToken', 'token'];
      for (const storage of [window.localStorage, window.sessionStorage]) {
        for (const key of keys) {
          const value = storage && storage.getItem(key);
          if (value && value.length > 12) {
            document.dispatchEvent(new CustomEvent('algo-alice-session-token', { detail: { token: value, key } }));
            return;
          }
        }
      }
    } catch (_) {}
  };
  setInterval(syncToken, 3000);
  syncToken();
})();
`;

let mainWindow = null;
let brokerView = null;
let configPath = null;
let config = null;
let candleEngines = new Map();
let brokerAdapter = null;
let brokerVisible = false;
let brokerReady = false;
let brokerBounds = null;
let lastSensexTick = null;
let lastMarketTick = null;
let lastTickByToken = new Map();
let accountSummary = null;
let activeToken = '';
let discoveryEnabled = false;
let discoveryLogPath = null;
let discoveryCaptureCount = 0;
let brokerNetworkRequests = new Map();
let reversalStrategy = null;
let accountSyncTimer = null;
let accountPresenceTimer = null;
let marketFeedTimer = null;
let lastPortalSessionSignature = '';
let protectiveSlAdoptionInFlight = false;
let lastProtectiveSlAdoptionAt = 0;
let protectiveSlModifyAttempts = [];
let instrumentMetadata = new Map();
let lastMarketFeedRecoveryAt = 0;
let featureModuleManager = null;
let lastFeatureModuleStrategyBucket = null;
let lastStrategyEntryRejectionKey = '';
let dataStoreState = null;
const runtimePolicy = getRuntimePolicy();

function defaultConfig() {
  return {
    selectedBroker: 'aliceblue',
    apiKey: '',
    sessionToken: '',
    brokerCredentials: {},
    brokerDiscoveryMappings: {},
    defaultExchange: 'BFO',
    defaultProduct: 'MIS',
    defaultOrderType: 'MARKET',
    defaultQuantity: 10,
    defaultToken: SENSEX_TOKEN,
    defaultSymbol: SENSEX_NAME,
    candleIntervalMs: DEFAULT_INTERVAL_MS,
    strategyEnabled: true,
    strategyAutoTrade: false,
    strategyIndexToken: SENSEX_TOKEN,
    strategyTrailingStopEnabled: true,
    strategyTrailingActivationPoints: 15,
    strategyTrailingLockPoints: 10,
    strategyTrailingPeakGapPoints: 35,
    strategyTrailingCandleRangePct: 35,
    strategyInitialStopLossPoints: 35,
    strategyTickProtectionEnabled: true,
    strategySoftStopGapPoints: 30,
    strategyHardStopGapPoints: 35,
    strategyFastStopWindowMs: 4000,
    strategySlowStopWindowMs: 10000,
    strategyFastHardSlCooldownMs: 5 * 60 * 1000,
    strategyProtectiveSlEnabled: true,
    strategyProtectiveSlActivationPoints: 15,
    strategyProtectiveSlLockPoints: 10,
    strategyProtectiveSlLimitOffsetPoints: 1,
    strategyProtectiveSlTrailStepPoints: 1,
    strategyProtectiveSlModifyThrottleMs: PROTECTIVE_SL_MODIFY_MIN_INTERVAL_MS,
    strategyFalseSignalExitEnabled: true,
    strategyFalseSignalExitAfterMs: 5 * 60 * 1000,
    strategyFalseSignalMinProfitPoints: 3,
    strategyFalseSignalProfitPoints: 5,
    strategyOptionMicroConfirmationEnabled: true,
    strategyOptionMicroConfirmationMinMovePoints: 1,
    strategyOptionMicroConfirmationMinTicks: 2,
    strategyOptionMicroConfirmationMinCloseLocationPct: 55,
    strategyOptionMicroConfirmationMaxAgeMs: 90 * 1000,
    strategyFailedReversalCooldownEnabled: true,
    strategyFailedReversalCooldownMs: 15 * 60 * 1000,
    strategyFailedReversalCooldownMaxPoints: 0,
    riskEmergencyStop: false,
    riskDailyLossLimit: 0,
    riskMaxTradesPerDay: 0,
    riskMaxOpenPositions: 1,
    featureModuleManifestUrl: '',
    featureModuleUserId: '',
    featureModuleLicenseKey: '',
    featureModulePublicKeyPem: '',
    featureModuleAllowUnsigned: false,
    featureModuleStrategyEnabled: false,
    featureModuleCleanupEnabled: true,
    featureModuleCleanupHour: 19,
    featureModuleCacheMaxHours: 24,
    featureModuleOfflineGraceEnabled: true,
    featureModuleOfflineGraceHours: 24,
    featureModuleDeviceId: '',
    featureModuleSyncJitterMs: 30_000,
    featureModuleSyncOnStartup: true,
    dataRetentionEnabled: true,
    dataRetentionCandleDays: 30,
    dataRetentionJournalDays: 14,
    dataRetentionSupportBundleDays: 7,
    showBrokerPanel: false
  };
}

function loadConfig() {
  const userData = app.getPath('userData');
  configPath = path.join(userData, 'algo_alice_blue_config.json');
  fs.mkdirSync(userData, { recursive: true });
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const merged = { ...defaultConfig(), ...parsed };
    if (parsed.strategyTickProtectionEnabled == null && Number(parsed.strategyInitialStopLossPoints) === 25) {
      merged.strategyInitialStopLossPoints = 35;
    }
    return merged;
  } catch (_) {
    return defaultConfig();
  }
}

function ensureFeatureModuleDeviceId(nextConfig) {
  if (nextConfig.featureModuleDeviceId) return nextConfig;
  const deviceId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const updated = { ...nextConfig, featureModuleDeviceId: `device-${deviceId}` };
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
  return updated;
}

function getDiscoveryLogPath() {
  if (!discoveryLogPath) {
    const dataDir = path.join(app.getPath('userData'), 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    discoveryLogPath = path.join(dataDir, `broker_api_discovery_${new Date().toISOString().slice(0, 10)}.jsonl`);
  }
  return discoveryLogPath;
}

function brokerDataKey() {
  return safePathPart(normalizeBrokerId(config && config.selectedBroker || 'broker'));
}

function getStrategyLearningPath(dataDir = path.join(app.getPath('userData'), 'data')) {
  return path.join(dataDir, `strategy_learning_${brokerDataKey()}.json`);
}

function getStrategyTradeJournalPath(dataDir = path.join(app.getPath('userData'), 'data')) {
  return path.join(dataDir, `strategy_trades_${brokerDataKey()}.jsonl`);
}

function getStrategyEventJournalPath(dataDir = path.join(app.getPath('userData'), 'data')) {
  return path.join(dataDir, `strategy_events_${brokerDataKey()}.jsonl`);
}

function getFeatureModuleAuditJournalPath(dataDir = path.join(app.getPath('userData'), 'data')) {
  return path.join(dataDir, `feature_module_audit_${brokerDataKey()}.jsonl`);
}

function getInstrumentMetadataPath(dataDir = path.join(app.getPath('userData'), 'data')) {
  return path.join(dataDir, `instrument_metadata_${brokerDataKey()}.json`);
}

function getStrategyTrailingConfig() {
  return {
    enabled: config && config.strategyTrailingStopEnabled !== false,
    activationProfitPoints: Number(config && config.strategyTrailingActivationPoints || 15),
    lockProfitPoints: Number(config && config.strategyTrailingLockPoints || 10),
    peakGapPoints: Number(config && config.strategyTrailingPeakGapPoints || 35),
    candleRangePct: Number(config && config.strategyTrailingCandleRangePct || 35),
    initialStopLossPoints: Number(config && config.strategyInitialStopLossPoints || 35),
    tickProtectionEnabled: config && config.strategyTickProtectionEnabled !== false,
    softStopGapPoints: Number(config && config.strategySoftStopGapPoints || 30),
    hardStopGapPoints: Number(config && config.strategyHardStopGapPoints || 35),
    fastStopWindowMs: Number(config && config.strategyFastStopWindowMs || 4000),
    slowStopWindowMs: Number(config && config.strategySlowStopWindowMs || 10000),
    fastHardSlCooldownMs: Number(config && config.strategyFastHardSlCooldownMs || 5 * 60 * 1000),
    protectiveSlEnabled: config && config.strategyProtectiveSlEnabled !== false,
    protectiveSlActivationPoints: Number(config && config.strategyProtectiveSlActivationPoints || 15),
    protectiveSlLockPoints: Number(config && config.strategyProtectiveSlLockPoints || 10),
    protectiveSlLimitOffsetPoints: Number(config && config.strategyProtectiveSlLimitOffsetPoints || 1),
    protectiveSlTrailStepPoints: Number(config && config.strategyProtectiveSlTrailStepPoints || 1),
    protectiveSlModifyThrottleMs: Math.max(
      PROTECTIVE_SL_MODIFY_MIN_INTERVAL_MS,
      Number(config && config.strategyProtectiveSlModifyThrottleMs || PROTECTIVE_SL_MODIFY_MIN_INTERVAL_MS)
    ),
    falseSignalExitEnabled: config && config.strategyFalseSignalExitEnabled !== false,
    falseSignalExitAfterMs: Number(config && config.strategyFalseSignalExitAfterMs || 5 * 60 * 1000),
    falseSignalMinProfitPoints: Number(config && config.strategyFalseSignalMinProfitPoints || 3),
    falseSignalProfitPoints: Number(config && config.strategyFalseSignalProfitPoints || 5)
  };
}

function getStrategyOptionPremiumConfirmationConfig() {
  return {
    enabled: config && config.strategyOptionMicroConfirmationEnabled !== false,
    minMovePoints: Number(config && config.strategyOptionMicroConfirmationMinMovePoints || 1),
    minTicks: Number(config && config.strategyOptionMicroConfirmationMinTicks || 2),
    minCloseLocation: Number(config && config.strategyOptionMicroConfirmationMinCloseLocationPct || 55) / 100,
    maxAgeMs: Number(config && config.strategyOptionMicroConfirmationMaxAgeMs || 90 * 1000)
  };
}

function getStrategyFailedReversalCooldownConfig() {
  return {
    enabled: config && config.strategyFailedReversalCooldownEnabled !== false,
    cooldownMs: Number(config && config.strategyFailedReversalCooldownMs || 15 * 60 * 1000),
    maxPoints: Number(config && config.strategyFailedReversalCooldownMaxPoints || 0)
  };
}

function getFeatureModuleConfig() {
  return {
    ...config,
    appVersion: require('./package.json').version
  };
}

function createFeatureModuleManager(dataDir) {
  featureModuleManager = new FeatureModuleManager({
    baseDir: path.join(dataDir, 'modules'),
    config: getFeatureModuleConfig()
  });
  featureModuleManager.cleanupStaleCacheOnStartup();
  return featureModuleManager;
}

async function syncFeatureModulesOnStartup() {
  if (!featureModuleManager || !featureModuleManager.config.syncOnStartup) return;
  if (!featureModuleManager.config.manifestUrl) return;
  const status = await featureModuleManager.sync({ jitter: true });
  send('feature-modules-status', sanitizeFeatureModuleStatus(status, runtimePolicy));
}

function getFeatureModuleStatus() {
  if (!featureModuleManager) return null;
  return sanitizeFeatureModuleStatus(featureModuleManager.getStatus(), runtimePolicy);
}

function sanitizeConfigForRenderer(value = config) {
  const credentials = getActiveBrokerCredentials();
  const safe = {
    ...value,
    sessionToken: maskToken(credentials.sessionToken),
    apiKey: credentials.apiKey || '',
    brokerCredentials: undefined,
    featureModuleLicenseKey: value.featureModuleLicenseKey ? '********' : '',
    featureModulePublicKeyPem: value.featureModulePublicKeyPem ? '[configured]' : ''
  };
  if (runtimePolicy.customerMode) {
    safe.featureModuleManifestUrl = '';
    safe.featureModulePublicKeyPem = '';
    safe.featureModuleAllowUnsigned = false;
    safe.featureModuleStrategyEnabled = false;
  }
  return safe;
}

function loadInstrumentMetadata(dataDir) {
  instrumentMetadata = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(getInstrumentMetadataPath(dataDir), 'utf8'));
    for (const item of Array.isArray(parsed) ? parsed : Object.values(parsed || {})) {
      rememberInstrumentMetadata(item, { persist: false });
    }
  } catch (_) {}
}

function saveInstrumentMetadata(dataDir = path.join(app.getPath('userData'), 'data')) {
  fs.mkdirSync(dataDir, { recursive: true });
  const rows = Array.from(instrumentMetadata.values())
    .sort((a, b) => String(a.token).localeCompare(String(b.token)));
  fs.writeFileSync(getInstrumentMetadataPath(dataDir), JSON.stringify(rows, null, 2));
}

function loadStrategyLearning(dataDir) {
  const filePath = getStrategyLearningPath(dataDir);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return {};
  }
}

function saveStrategyLearning(dataDir, learning) {
  if (!learning || typeof learning !== 'object') return;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(getStrategyLearningPath(dataDir), JSON.stringify(learning, null, 2));
}

function createLocalReversalStrategy(dataDir) {
  if (!MomentumReversalStrategy) return null;
  return new MomentumReversalStrategy({
    indexToken: config.strategyIndexToken || SENSEX_TOKEN,
    learning: loadStrategyLearning(dataDir),
    trailing: getStrategyTrailingConfig(),
    optionPremiumConfirmation: getStrategyOptionPremiumConfirmationConfig(),
    failedReversalCooldown: getStrategyFailedReversalCooldownConfig()
  });
}

function writeStrategyTrade(signal) {
  if (!signal || !signal.performance) return;
  const strategy = withStrategyIdentity(signal, BUILTIN_MOMENTUM_REVERSAL);
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const row = {
    broker: normalizeBrokerId(config && config.selectedBroker),
    strategyId: strategy.strategyId,
    strategyName: strategy.strategyName,
    strategySource: strategy.strategySource,
    featureId: strategy.featureId,
    setupKey: signal.setupKey || '',
    direction: signal.direction,
    optionType: signal.optionType,
    instrument: compactInstrument(signal.instrument),
    entryTime: signal.performance.entryTime,
    exitTime: signal.performance.exitTime,
    entryPrice: signal.performance.entryPrice,
    exitPrice: signal.performance.exitPrice,
    indexPoints: signal.performance.indexPoints,
    profitable: signal.performance.profitable,
    entryScore: signal.performance.entryScore,
    entryFeatures: signal.performance.entryFeatures || {},
    optionPerformance: signal.optionPerformance || null,
    exitReason: signal.reason,
    recordedAt: new Date().toISOString()
  };
  fs.appendFileSync(getStrategyTradeJournalPath(dataDir), `${JSON.stringify(row)}\n`);
}

function writeProtectiveSlClosedTrade(closed) {
  if (!closed || !closed.tradeSignal) return;
  const dataDir = path.join(app.getPath('userData'), 'data');
  if (reversalStrategy && typeof reversalStrategy.exportLearning === 'function') {
    saveStrategyLearning(dataDir, reversalStrategy.exportLearning());
  }
  writeStrategyTrade(closed.tradeSignal);
}

function writeStrategyEvent(type, payload = {}) {
  try {
    const dataDir = path.join(app.getPath('userData'), 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const strategy = withStrategyIdentity(payload, BUILTIN_MOMENTUM_REVERSAL);
    const row = {
      broker: normalizeBrokerId(config && config.selectedBroker),
      type,
      recordedAt: new Date().toISOString(),
      ...payload,
      strategyId: strategy.strategyId,
      strategyName: strategy.strategyName,
      strategySource: strategy.strategySource,
      featureId: strategy.featureId
    };
    fs.appendFileSync(getStrategyEventJournalPath(dataDir), `${JSON.stringify(row)}\n`);
  } catch (_) {}
}

function writeFeatureModuleAudit(action, payload = {}) {
  try {
    const dataDir = path.join(app.getPath('userData'), 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const row = {
      broker: normalizeBrokerId(config && config.selectedBroker),
      action,
      recordedAt: new Date().toISOString(),
      ...payload
    };
    fs.appendFileSync(getFeatureModuleAuditJournalPath(dataDir), `${JSON.stringify(row)}\n`);
  } catch (_) {}
}

function summarizeFeatureModuleContext(context = {}) {
  const candle = context.indexCandle || {};
  const account = context.account || {};
  const position = context.position || null;
  return {
    now: context.now,
    broker: context.broker,
    indexCandle: candle && candle.bucket ? {
      bucket: candle.bucket,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      pattern: candle.pattern,
      direction: candle.direction
    } : null,
    candleCount: Array.isArray(context.candles) ? context.candles.length : 0,
    hasOpenPosition: Boolean(position),
    position: position ? {
      direction: position.direction,
      optionType: position.optionType,
      setupKey: position.setupKey,
      instrument: compactInstrument(position.instrument)
    } : null,
    account: account ? {
      ok: account.ok,
      clientId: account.clientId,
      balance: account.balance,
      dayPnl: account.dayPnl
    } : null
  };
}

function compactInstrument(instrument) {
  if (!instrument) return null;
  return {
    symbol: instrument.symbol || instrument.trading_symbol || '',
    token: instrument.token || instrument.instrument_token || '',
    exchange: instrument.exchange || '',
    segment: instrument.segment || ''
  };
}

function safePathPart(value) {
  return String(value || 'unknown').replace(/[^a-z0-9_.-]+/gi, '_').slice(0, 160);
}

function rememberInstrumentMetadata(raw, options = {}) {
  const token = String(raw && (
    raw.token ||
    raw.instrument_token ||
    raw.instrumentToken ||
    raw.instrument_id ||
    raw.instrumentId ||
    raw.symbol_id ||
    raw.symbolId ||
    raw.symbolToken ||
    raw.pSymbol ||
    raw.tk ||
    raw.t ||
    ''
  )).replace('#', '').trim();
  if (!token || token === '[REDACTED]') return false;
  const symbol = cleanInstrumentSymbol(raw);
  if (!symbol || symbol === `Token ${token}`) return false;
  const option = parseOption(symbol);
  const existing = instrumentMetadata.get(token) || {};
  const next = {
    ...existing,
    token,
    symbol,
    trading_symbol: raw.trading_symbol || raw.tradingsymbol || raw.tradingSymbol || existing.trading_symbol || symbol,
    displayName: raw.displayName || raw.display_name || raw.name || existing.displayName || '',
    exchange: String(raw.exchange || raw.exch || raw.e || existing.exchange || '').toUpperCase(),
    segment: String(raw.segment || raw.seg || existing.segment || '').toUpperCase(),
    lotSize: numberOrNull(raw.lotSize || raw.lotsize || raw.lot_size || existing.lotSize),
    tickSize: numberOrNull(raw.tickSize || raw.ticksize || raw.tick_size || existing.tickSize),
    optionType: option && option.optionType || existing.optionType || '',
    strike: option && option.strike || existing.strike || null,
    updatedAt: new Date().toISOString()
  };
  instrumentMetadata.set(token, next);
  const engine = candleEngines.get(token);
  if (engine) {
    engine.symbol = next.symbol;
    if (next.exchange) engine.exchange = next.exchange;
    if (next.segment) engine.segment = next.segment;
  }
  if (options.persist !== false) saveInstrumentMetadata();
  return true;
}

function cleanInstrumentSymbol(raw) {
  const value = raw && (
    raw.formattedInsName ||
    raw.formatted_ins_name ||
    raw.displayName ||
    raw.display_name ||
    raw.name ||
    raw.trading_symbol ||
    raw.tradingsymbol ||
    raw.tradingSymbol ||
    raw.tradingSymbolName ||
    raw.symbol_name ||
    raw.symbolName ||
    raw.pTrdSymbol ||
    raw.pSymbolName ||
    raw.contract ||
    raw.contractName ||
    raw.tsym ||
    raw.symbol ||
    raw.s
  );
  return String(value || '').replace('#', '').replace(/,/g, '').trim();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeBrokerCredentials(credentials = {}, sourceConfig = config) {
  const selectedBroker = normalizeBrokerId(sourceConfig && sourceConfig.selectedBroker);
  const nextCredentials = { ...(credentials || {}) };
  nextCredentials[selectedBroker] = {
    sessionToken: sourceConfig && sourceConfig.sessionToken ? sourceConfig.sessionToken : '',
    apiKey: sourceConfig && sourceConfig.apiKey ? sourceConfig.apiKey : '',
    ...(nextCredentials[selectedBroker] || {})
  };
  return nextCredentials;
}

function getActiveBrokerCredentials() {
  const selectedBroker = normalizeBrokerId(config && config.selectedBroker);
  const credentials = config.brokerCredentials && config.brokerCredentials[selectedBroker];
  return {
    ...(credentials || {}),
    sessionToken: credentials && credentials.sessionToken ? credentials.sessionToken : config.sessionToken,
    apiKey: credentials && credentials.apiKey ? credentials.apiKey : config.apiKey
  };
}

function getActiveBrokerConfig() {
  return {
    ...getActiveBrokerCredentials(),
    brokerDiscoveryMappings: config && config.brokerDiscoveryMappings || {}
  };
}

function setActiveBrokerCredentials(credentials = {}) {
  const selectedBroker = normalizeBrokerId(config.selectedBroker);
  config.brokerCredentials = normalizeBrokerCredentials(config.brokerCredentials, config);
  config.brokerCredentials[selectedBroker] = {
    ...(config.brokerCredentials[selectedBroker] || {}),
    ...credentials
  };
  config.sessionToken = config.brokerCredentials[selectedBroker].sessionToken || '';
  config.apiKey = config.brokerCredentials[selectedBroker].apiKey || '';
}

function getBrokerSessionTokenKeys() {
  const keys = brokerAdapter && Array.isArray(brokerAdapter.tokenStorageKeys)
    ? brokerAdapter.tokenStorageKeys
    : [];
  return uniqueStrings([
    ...keys,
    'userSession',
    'sessionID',
    'sessionId',
    'alice_session',
    'enctoken',
    'kf_session',
    'public_token',
    'request_token',
    'authToken',
    'accessToken',
    'token'
  ]);
}

function buildBrokerPortalAuthHeaders() {
  const credentials = getActiveBrokerCredentials();
  const token = credentials.sessionToken || '';
  const tokenKey = credentials.sessionTokenKey || '';
  if (!brokerAdapter || typeof brokerAdapter.buildPortalAuthHeaders !== 'function') return {};
  return brokerAdapter.buildPortalAuthHeaders(token, tokenKey);
}

function uniqueStrings(values) {
  const seen = new Set();
  const rows = [];
  for (const value of values || []) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    rows.push(text);
  }
  return rows;
}

function saveConfig(nextConfig = config) {
  config = enforceCustomerConfig({ ...defaultConfig(), ...nextConfig }, runtimePolicy);
  config.selectedBroker = normalizeBrokerId(config.selectedBroker);
  config.brokerCredentials = normalizeBrokerCredentials(config.brokerCredentials, config);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  if (brokerAdapter) {
    brokerAdapter.config = getActiveBrokerConfig();
    brokerAdapter.setCredentials(getActiveBrokerCredentials());
  }
  if (featureModuleManager) featureModuleManager.updateConfig(getFeatureModuleConfig());
  return config;
}

function getDataRetentionConfig() {
  return {
    enabled: config && config.dataRetentionEnabled !== false,
    candleDays: Number(config && config.dataRetentionCandleDays || 30),
    journalDays: Number(config && config.dataRetentionJournalDays || 14),
    supportBundleDays: Number(config && config.dataRetentionSupportBundleDays || 7)
  };
}

function createWindow() {
  config = enforceCustomerConfig(ensureFeatureModuleDeviceId(loadConfig()), runtimePolicy);
  config.selectedBroker = normalizeBrokerId(config.selectedBroker);
  config.brokerCredentials = normalizeBrokerCredentials(config.brokerCredentials, config);
  const dataDir = path.join(app.getPath('userData'), 'data');
  dataStoreState = ensureDataStore({
    dataDir,
    appVersion: require('./package.json').version
  });
  const retention = applyDataRetention({
    dataDir,
    retention: getDataRetentionConfig()
  });
  dataStoreState = {
    ...ensureDataStore({
      dataDir,
      appVersion: require('./package.json').version
    }),
    retention
  };
  candleEngines = new Map();
  brokerAdapter = createBrokerAdapter(config.selectedBroker, { config: getActiveBrokerConfig() });
  loadInstrumentMetadata(dataDir);
  createFeatureModuleManager(dataDir);
  reversalStrategy = createLocalReversalStrategy(dataDir);
  hydrateCandleEngines(dataDir);

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 930,
    minWidth: 1180,
    minHeight: 740,
    backgroundColor: '#070b16',
    title: APP_DISPLAY_NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  createBrokerBrowserView();

  brokerVisible = Boolean(config.showBrokerPanel);
  applyLayout();
  mainWindow.on('resize', applyLayout);
  mainWindow.on('closed', () => {
    stopAccountSyncTimer();
    mainWindow = null;
    brokerView = null;
  });
  startAccountSyncTimer();
  syncFeatureModulesOnStartup().catch(() => {
    if (featureModuleManager) {
      send('feature-modules-status', sanitizeFeatureModuleStatus(featureModuleManager.getStatus(), runtimePolicy));
    }
  });
}

function createBrokerBrowserView() {
  if (!mainWindow || !brokerAdapter) return;
  if (brokerView) {
    try {
      mainWindow.removeBrowserView(brokerView);
      if (!brokerView.webContents.isDestroyed()) brokerView.webContents.destroy();
    } catch (_) {}
  }
  brokerNetworkRequests = new Map();
  brokerReady = false;
  lastPortalSessionSignature = '';
  brokerView = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'broker_preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: brokerAdapter.partition
    }
  });
  setupBrokerNetworkDiscovery();
  mainWindow.addBrowserView(brokerView);
  brokerView.webContents.loadURL(brokerAdapter.loginUrl);
  brokerView.webContents.on('did-finish-load', () => {
    brokerReady = true;
    brokerView.webContents.executeJavaScript(WS_INTERCEPTOR_MAIN).catch(() => {});
    brokerView.webContents.send('discovery-mode', discoveryEnabled);
    broadcastBrokerStatus();
    checkBrokerPortalPresence().catch(() => {});
    refreshAccountSummary({ source: 'portal-load' }).catch(() => {});
  });
  brokerView.webContents.on('did-fail-load', (_event, code, description, url) => {
    brokerReady = false;
    broadcastBrokerStatus({ error: `${code}: ${description}`, url });
  });
  applyLayout();
}

function registerViewShortcuts() {
  globalShortcut.register('Control+1', () => send('view-mode-request', { mode: 'app' }));
  globalShortcut.register('Control+2', () => send('view-mode-request', { mode: 'broker' }));
  globalShortcut.register('Control+3', () => send('view-mode-request', { mode: 'split' }));
}

function applyLayout() {
  if (!mainWindow || !brokerView) return;
  const { width } = mainWindow.getContentBounds();
  if (!brokerVisible) {
    brokerView.setBounds({ x: width + 20, y: 0, width: 10, height: 10 });
    return;
  }

  if (!brokerBounds) {
    brokerView.setBounds({ x: width + 20, y: 0, width: 10, height: 10 });
    return;
  }

  brokerView.setBounds(brokerBounds);
}

function normalizeBounds(bounds) {
  const { width: windowWidth, height: windowHeight } = mainWindow.getContentBounds();
  const x = clampInt(bounds && bounds.x, 0, windowWidth);
  const y = clampInt(bounds && bounds.y, 0, windowHeight);
  const maxWidth = Math.max(1, windowWidth - x);
  const maxHeight = Math.max(1, windowHeight - y);
  return {
    x,
    y,
    width: clampInt(bounds && bounds.width, 1, maxWidth),
    height: clampInt(bounds && bounds.height, 1, maxHeight)
  };
}

function clampInt(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function getState() {
  const snapshot = getActiveSnapshot();
  const featureModules = getFeatureModuleStatus();
  const brokerStatus = getBrokerObservabilityStatus();
  const instrumentMetadataHealth = getInstrumentMetadataHealth();
  const strategyState = {
    position: getCompactStrategyPosition(),
    cooldown: getCompactStrategyCooldown()
  };
  return {
    config: sanitizeConfigForRenderer(),
    runtimePolicy,
    dataStore: dataStoreState,
    featureModules,
    brokers: listBrokers(),
    selectedBroker: config.selectedBroker,
    accountSummary,
    hasSessionToken: Boolean(getActiveBrokerCredentials().sessionToken),
    brokerReady,
    brokerVisible,
    instrumentMetadataHealth,
    lastSensexTick,
    lastMarketTick,
    activeToken,
    instruments: getInstrumentSummaries(),
    strategyPosition: strategyState.position,
    strategyCooldown: strategyState.cooldown,
    observability: buildObservabilitySnapshot({
      appName: APP_DISPLAY_NAME,
      appVersion: require('./package.json').version,
      config: sanitizeConfigForRenderer(),
      selectedBroker: config.selectedBroker,
      runtimePolicy,
      dataStore: dataStoreState,
      accountSummary,
      featureModules,
      strategyState,
      brokerStatus
    }),
    candles: snapshot || emptySnapshot()
  };
}

function getBrokerObservabilityStatus() {
  return {
    ready: brokerReady,
    visible: brokerVisible,
    hasSessionToken: Boolean(getActiveBrokerCredentials().sessionToken),
    selectedBroker: config && config.selectedBroker,
    activeToken,
    lastMarketTickAt: lastMarketTick && lastMarketTick.ts || ''
  };
}

function getCompactStrategyPosition() {
  const position = reversalStrategy && typeof reversalStrategy.getOpenPosition === 'function'
    ? reversalStrategy.getOpenPosition()
    : null;
  if (!position) return null;
  return {
    status: 'active',
    direction: position.direction,
    optionType: position.optionType,
    strategyId: position.strategyId || BUILTIN_MOMENTUM_REVERSAL.strategyId,
    strategyName: position.strategyName || BUILTIN_MOMENTUM_REVERSAL.strategyName,
    strategySource: position.strategySource || BUILTIN_MOMENTUM_REVERSAL.strategySource,
    featureId: position.featureId || BUILTIN_MOMENTUM_REVERSAL.featureId,
    setupKey: position.setupKey || '',
    entryTime: position.entryTime || '',
    entryPrice: position.entryPrice,
    entryScore: position.entryScore,
    optionEntryPrice: position.optionEntryPrice,
    optionPeakPrice: position.optionPeakPrice,
    optionTrailingStop: position.optionTrailingStop,
    optionTrailingActive: Boolean(position.optionTrailingActive),
    instrument: compactInstrument(position.instrument),
    protectiveSl: position.protectiveSl ? {
      status: position.protectiveSl.status || '',
      orderNo: position.protectiveSl.orderNo || '',
      triggerPrice: position.protectiveSl.triggerPrice,
      price: position.protectiveSl.price,
      pendingTriggerPrice: position.protectiveSl.pendingTriggerPrice,
      pendingPrice: position.protectiveSl.pendingPrice,
      lastModifyAt: position.protectiveSl.lastModifyAt || '',
      lastModifyError: position.protectiveSl.lastModifyError || ''
    } : null
  };
}

function getRestartSafetyStatus() {
  const position = getCompactStrategyPosition();
  return {
    safe: !position,
    hasOpenPosition: Boolean(position),
    position
  };
}

function scheduleAppRestart(reason = 'user requested restart') {
  writeStrategyEvent('APP_RESTART_REQUESTED', {
    reason,
    broker: config && config.selectedBroker,
    hasOpenPosition: getRestartSafetyStatus().hasOpenPosition
  });
  try {
    saveConfig(config);
  } catch (_) {}
  stopAccountSyncTimer();
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 250);
}

function getCompactStrategyCooldown() {
  const cooldown = reversalStrategy && typeof reversalStrategy.getEntryCooldown === 'function'
    ? reversalStrategy.getEntryCooldown()
    : null;
  if (!cooldown && reversalStrategy && typeof reversalStrategy.getSetupSuppression === 'function') {
    const suppression = reversalStrategy.getSetupSuppression();
    if (!suppression) return null;
    return {
      reason: suppression.reason || '',
      direction: '',
      optionType: '',
      setupKey: suppression.setupKey || '',
      startedAt: suppression.startedAt,
      expiresAt: suppression.expiresAt
    };
  }
  if (!cooldown) return null;
  return {
    reason: cooldown.reason || '',
    direction: cooldown.direction || '',
    optionType: cooldown.optionType || '',
    setupKey: cooldown.setupKey || '',
    startedAt: cooldown.startedAt,
    expiresAt: cooldown.expiresAt
  };
}

function startAccountSyncTimer() {
  stopAccountSyncTimer();
  accountSyncTimer = setInterval(() => {
    refreshAccountSummary({ source: 'timer' }).catch(() => {});
  }, ACCOUNT_SYNC_INTERVAL_MS);
  accountPresenceTimer = setInterval(() => {
    checkBrokerPortalPresence().catch(() => {});
    if (featureModuleManager) featureModuleManager.cleanupIfDue();
  }, ACCOUNT_PRESENCE_INTERVAL_MS);
  marketFeedTimer = setInterval(() => {
    maybeRecoverMarketFeed().catch((error) => {
      broadcastBrokerStatus({ marketFeed: 'stale', error: error.message });
    });
  }, ACCOUNT_PRESENCE_INTERVAL_MS);
}

function stopAccountSyncTimer() {
  if (accountSyncTimer) clearInterval(accountSyncTimer);
  if (accountPresenceTimer) clearInterval(accountPresenceTimer);
  if (marketFeedTimer) clearInterval(marketFeedTimer);
  accountSyncTimer = null;
  accountPresenceTimer = null;
  marketFeedTimer = null;
}

async function refreshAccountSummary(options = {}) {
  const credentials = getActiveBrokerCredentials();
  let nextSummary = null;
  let restError = null;

  try {
    if (credentials.sessionToken && brokerAdapter) {
      nextSummary = await brokerAdapter.getAccountSummary();
    }
  } catch (error) {
    restError = error;
  }

  if (!hasUsefulAccountSummary(nextSummary)) {
    try {
      nextSummary = await refreshAccountSummaryFromPortal(options);
    } catch (error) {
      if (!restError) restError = error;
    }
  }

  if (hasUsefulAccountSummary(nextSummary)) {
    accountSummary = mergeAccountSummary(accountSummary, {
      ...nextSummary,
      message: nextSummary.message || `Synced account summary${options.source ? ` from ${options.source}` : ''}.`
    });
    learnInstrumentMetadataFromBrokerRows(accountSummary.positions || [], 'account-summary-positions');
  } else if (!accountSummary && restError) {
    accountSummary = {
      ok: false,
      clientId: '',
      clientName: '',
      accountStatus: '',
      balance: null,
      marginUsed: null,
      dayPnl: null,
      positions: [],
      message: restError.message
    };
  } else if (accountSummary && restError) {
    accountSummary = {
      ...accountSummary,
      message: `${accountSummary.message || 'Using last account summary.'} Latest sync failed: ${restError.message}`
    };
  }

  send('account-summary', accountSummary);
  return accountSummary;
}

function learnInstrumentMetadataFromBrokerRows(rowsOrPayload, source = 'broker-rows') {
  const rows = Array.isArray(rowsOrPayload) ? rowsOrPayload : extractOrderRows(rowsOrPayload);
  let changed = 0;
  let candidates = 0;
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue;
    if (looksLikeInstrumentObject(row)) candidates += 1;
    if (rememberInstrumentMetadata(row, { persist: false })) changed += 1;
  }
  if (!changed) return { changed: 0, candidates };
  saveInstrumentMetadata();
  const health = getInstrumentMetadataHealth();
  writeStrategyEvent('INSTRUMENT_METADATA_LEARNED', {
    source,
    candidates,
    changed,
    metadataHealth: {
      total: health.total,
      ceCount: health.ceCount,
      peCount: health.peCount,
      missingOptionTypes: health.missingOptionTypes
    }
  });
  send('market-tick', {
    instruments: getInstrumentSummaries(),
    instrumentMetadataHealth: health,
    activeToken,
    candles: getActiveSnapshot() || emptySnapshot()
  });
  return { changed, candidates };
}

async function refreshAccountSummaryFromPortal(options = {}) {
  if (!brokerView || brokerView.webContents.isDestroyed() || !brokerAdapter) return null;
  const requests = typeof brokerAdapter.getPortalAccountRequests === 'function'
    ? brokerAdapter.getPortalAccountRequests()
    : [];
  if (!requests.length) return null;
  const pageUrl = brokerView.webContents.getURL();
  if (!isActiveBrokerPortalUrl(pageUrl)) {
    return null;
  }

  const script = `
    (async () => {
      const requests = ${JSON.stringify(requests)};
      const tokenKeys = ${JSON.stringify(getBrokerSessionTokenKeys())};
      const baseHeaders = ${JSON.stringify(buildBrokerPortalAuthHeaders())};
      const brokerId = ${JSON.stringify(normalizeBrokerId(config && config.selectedBroker))};
      const readToken = () => {
        for (const storage of [window.localStorage, window.sessionStorage]) {
          for (const key of tokenKeys) {
            const value = storage && storage.getItem(key);
            if (value && String(value).length > 8) return { value: String(value), key };
          }
        }
        return { value: '', key: '' };
      };
      const token = readToken();
      const headers = { accept: 'application/json, text/plain, */*', ...baseHeaders };
      if (token.value) {
        if (brokerId === 'zerodha') {
          const value = /^enctoken\\s+/i.test(token.value) ? token.value : 'enctoken ' + token.value;
          headers.authorization = value;
          headers.Authorization = value;
          headers['x-kite-version'] = '3';
        } else {
          const value = token.value.startsWith('Bearer ') ? token.value : 'Bearer ' + token.value;
          headers.Authorization = value;
          headers['X-Authorization'] = value;
          headers.sessionId = token.value;
          headers.userSession = token.value;
          headers.token = token.value;
        }
      }
      const rows = [];
      for (const request of requests) {
        try {
          const response = await fetch(request.url, {
            method: request.method || 'GET',
            credentials: 'include',
            headers,
            cache: 'no-store'
          });
          const body = await response.text();
          rows.push({
            transport: 'portal-sync',
            url: response.url || request.url,
            method: request.method || 'GET',
            status: response.status,
            contentType: response.headers.get('content-type') || '',
            capturedAt: new Date().toISOString(),
            bodyPreview: body.slice(0, 12000)
          });
        } catch (error) {
          rows.push({
            transport: 'portal-sync',
            url: request.url,
            method: request.method || 'GET',
            status: 0,
            contentType: '',
            capturedAt: new Date().toISOString(),
            error: error.message,
            bodyPreview: ''
          });
        }
      }
      return rows;
    })();
  `;
  const rows = await brokerView.webContents.executeJavaScript(script, true);
  let nextSummary = null;
  let boundCount = 0;
  for (const row of rows || []) {
    const discovered = extractDiscoveryAccountSummary(row);
    if (!discovered) continue;
    nextSummary = mergeAccountSummary(nextSummary, discovered);
    boundCount += 1;
  }
  if (!boundCount) return null;
  return {
    ...nextSummary,
    message: `Synced from logged-in broker portal every ${Math.round(ACCOUNT_SYNC_INTERVAL_MS / 60000)} min.`,
    lastSyncedAt: new Date().toISOString()
  };
}

function hasUsefulAccountSummary(summary) {
  return Boolean(summary && (
    summary.clientId ||
    summary.clientName ||
    summary.accountStatus ||
    summary.balance != null ||
    summary.marginUsed != null ||
    summary.dayPnl != null ||
    (summary.positions && summary.positions.length)
  ));
}

function isActiveBrokerPortalUrl(url) {
  if (!brokerAdapter || typeof brokerAdapter.isPortalUrl !== 'function') return Boolean(url);
  return brokerAdapter.isPortalUrl(url);
}

async function checkBrokerPortalPresence() {
  if (!brokerView || brokerView.webContents.isDestroyed()) return null;
  const pageUrl = brokerView.webContents.getURL();
  if (!isActiveBrokerPortalUrl(pageUrl)) return null;

  const presence = await brokerView.webContents.executeJavaScript(`
    (() => {
      const keys = ${JSON.stringify(getBrokerSessionTokenKeys())};
      const loggedInKeywords = ${JSON.stringify(brokerAdapter.loggedInKeywords || [])};
      const loggedOutKeywords = ${JSON.stringify(brokerAdapter.loggedOutKeywords || [])};
      const tokens = [];
      for (const storageName of ['localStorage', 'sessionStorage']) {
        const storage = window[storageName];
        if (!storage) continue;
        for (const key of keys) {
          const value = storage.getItem(key);
          if (value && String(value).length > 8) {
            tokens.push({ storage: storageName, key, value: String(value) });
          }
        }
      }
      const text = String(document.body && document.body.innerText || '').toLowerCase();
      const url = location.href;
      const fullText = text + ' ' + url.toLowerCase();
      const hasLoggedOutText = loggedOutKeywords.some((keyword) => fullText.includes(String(keyword || '').toLowerCase()));
      const hasLoggedInText = loggedInKeywords.some((keyword) => fullText.includes(String(keyword || '').toLowerCase()));
      const loggedOut = hasLoggedOutText && !tokens.length;
      const loggedIn = tokens.length > 0 || hasLoggedInText;
      return {
        url,
        loggedIn,
        loggedOut,
        token: tokens[0] && tokens[0].value || '',
        tokenKey: tokens[0] && tokens[0].key || '',
        signature: tokens.map((item) => item.key + ':' + item.value.slice(0, 8) + ':' + item.value.slice(-6)).join('|')
      };
    })();
  `, true);

  const signature = presence && presence.signature || '';
  if (presence && presence.token) {
    const credentials = getActiveBrokerCredentials();
    if (presence.token !== credentials.sessionToken) {
      setActiveBrokerCredentials({ sessionToken: presence.token, sessionTokenKey: presence.tokenKey });
      saveConfig(config);
      send('session-token-detected', { masked: maskToken(presence.token) });
      broadcastBrokerStatus({ loggedIn: true, sessionKey: presence.tokenKey });
    }
  }

  if (presence && presence.loggedOut && (accountSummary || getActiveBrokerCredentials().sessionToken)) {
    accountSummary = null;
    setActiveBrokerCredentials({ sessionToken: '' });
    saveConfig(config);
    send('account-summary', accountSummary);
    broadcastBrokerStatus({ loggedIn: false, loggedOut: true });
    lastPortalSessionSignature = '';
    return presence;
  }

  const shouldSync = presence && presence.loggedIn && (
    !hasUsefulAccountSummary(accountSummary) ||
    (signature && signature !== lastPortalSessionSignature)
  );
  if (shouldSync) {
    lastPortalSessionSignature = signature;
    await refreshAccountSummary({ source: 'presence-check' });
  }
  if (presence && presence.loggedIn) {
    maybeRecoverMarketFeed().catch(() => {});
  }
  return presence;
}

function maskToken(token) {
  if (!token) return '';
  if (token.length <= 8) return '********';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function send(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function getActiveSnapshot() {
  if (activeToken && candleEngines.has(activeToken)) {
    return candleEngines.get(activeToken).getSnapshot();
  }
  const firstEngine = candleEngines.values().next().value;
  return firstEngine ? firstEngine.getSnapshot() : null;
}

function hydrateCandleEngines(dataDir) {
  const candleRoot = path.join(dataDir, 'market_candles');
  const day = localMarketDate();
  if (!fs.existsSync(candleRoot)) return;

  for (const dirName of fs.readdirSync(candleRoot)) {
    const dirPath = path.join(candleRoot, dirName);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    const filePath = resolveCandleHistoryFile(dirPath, day);
    if (!filePath) continue;
    const candles = readCandleJsonl(filePath);
    if (!candles.length) continue;

    const latest = candles[candles.length - 1];
    const token = String(latest.token || inferTokenFromDir(dirName)).trim();
    if (!token) continue;
    const engine = new CandleEngine({
      dataDir,
      symbol: latest.symbol || `Token ${token}`,
      token,
      intervalMs: Number(config.candleIntervalMs || DEFAULT_INTERVAL_MS)
    });
    engine.exchange = latest.exchange || '';
    engine.segment = latest.segment || '';
    engine.loadClosedCandles(candles);
    candleEngines.set(token, engine);
  }

  if (candleEngines.has(config.defaultToken)) {
    activeToken = config.defaultToken;
  } else if (!activeToken && candleEngines.size > 0) {
    activeToken = candleEngines.keys().next().value;
  }
}

function resolveCandleHistoryFile(dirPath, preferredDay) {
  const preferred = path.join(dirPath, `${preferredDay}.jsonl`);
  if (fs.existsSync(preferred)) return preferred;
  return '';
}

function readCandleJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function inferTokenFromDir(dirName) {
  const match = String(dirName || '').match(/_([0-9A-Za-z.-]+)$/);
  return match ? match[1] : '';
}

function localMarketDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function emptySnapshot() {
  return {
    symbol: config.defaultSymbol || SENSEX_NAME,
    token: config.defaultToken || SENSEX_TOKEN,
    intervalMs: config.candleIntervalMs || DEFAULT_INTERVAL_MS,
    current: null,
    closed: []
  };
}

function getInstrumentSummaries() {
  return Array.from(candleEngines.values())
    .map((engine) => {
      const snapshot = engine.getSnapshot();
      const candle = snapshot.current || snapshot.closed[snapshot.closed.length - 1] || null;
      const meta = instrumentMetadata.get(snapshot.token) || {};
      return {
        symbol: meta.symbol || snapshot.symbol,
        trading_symbol: meta.trading_symbol || meta.symbol || snapshot.symbol,
        token: snapshot.token,
        exchange: meta.exchange || engine.exchange || '',
        segment: meta.segment || engine.segment || '',
        optionType: meta.optionType || '',
        strike: meta.strike || null,
        intervalMs: snapshot.intervalMs,
        lastPrice: candle ? candle.close : null,
        lastTickTs: candle ? candle.lastTickTs : null,
        candleCount: snapshot.closed.length + (snapshot.current ? 1 : 0)
      };
    })
    .sort((a, b) => Number(b.lastTickTs || 0) - Number(a.lastTickTs || 0));
}

function getInstrumentMetadataHealth() {
  const rows = Array.from(instrumentMetadata.values());
  const ceRows = rows.filter((item) => item.optionType === 'CE');
  const peRows = rows.filter((item) => item.optionType === 'PE');
  const latest = rows
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 8)
    .map((item) => ({
      symbol: item.symbol || item.trading_symbol || '',
      token: item.token || '',
      exchange: item.exchange || '',
      optionType: item.optionType || '',
      strike: item.strike || null,
      updatedAt: item.updatedAt || ''
    }));
  const missingOptionTypes = [];
  if (!ceRows.length) missingOptionTypes.push('CE');
  if (!peRows.length) missingOptionTypes.push('PE');
  return {
    broker: normalizeBrokerId(config && config.selectedBroker),
    metadataPath: getInstrumentMetadataPath(),
    total: rows.length,
    ceCount: ceRows.length,
    peCount: peRows.length,
    missingOptionTypes,
    ok: missingOptionTypes.length === 0,
    latest,
    message: missingOptionTypes.length
      ? `Missing ${missingOptionTypes.join('/')} option metadata for ${brokerAdapter && brokerAdapter.name || config.selectedBroker}. Open that option in the broker watchlist/option chain, or add exact broker symbol/token metadata.`
      : 'CE and PE option metadata are available for strategy order building.'
  };
}

function upsertManualInstrumentMetadata(raw = {}) {
  const token = String(raw.token || raw.instrument_token || '').replace('#', '').trim();
  const symbol = String(raw.symbol || raw.trading_symbol || '').replace('#', '').trim();
  const exchange = String(raw.exchange || config.defaultExchange || '').trim().toUpperCase();
  const segment = String(raw.segment || '').trim().toUpperCase();
  if (!token) throw new Error('Instrument token is required.');
  if (!symbol) throw new Error('Broker trading symbol is required.');
  const option = parseOption(symbol);
  const looksLikeIndex = /\b(SENSEX|NIFTY|BANKNIFTY|FINNIFTY)\b/i.test(symbol);
  if (!option && !looksLikeIndex) {
    throw new Error('Symbol must be a broker option symbol with CE/PE and strike, or a recognized index symbol.');
  }
  const changed = rememberInstrumentMetadata({
    token,
    symbol,
    trading_symbol: raw.trading_symbol || symbol,
    exchange,
    segment
  });
  const health = getInstrumentMetadataHealth();
  writeStrategyEvent('INSTRUMENT_METADATA_UPSERT', {
    source: 'manual-admin-repair',
    changed,
    broker: normalizeBrokerId(config && config.selectedBroker),
    instrument: compactInstrument({ token, symbol, exchange, segment }),
    optionType: option && option.optionType || '',
    strike: option && option.strike || null,
    metadataHealth: {
      total: health.total,
      ceCount: health.ceCount,
      peCount: health.peCount,
      missingOptionTypes: health.missingOptionTypes
    }
  });
  send('market-tick', {
    instruments: getInstrumentSummaries(),
    instrumentMetadataHealth: health,
    activeToken,
    candles: getActiveSnapshot() || emptySnapshot()
  });
  return { ok: true, changed, instrumentMetadataHealth: health };
}

function broadcastBrokerStatus(extra = {}) {
  const credentials = getActiveBrokerCredentials();
  send('broker-status', {
    ready: brokerReady,
    visible: brokerVisible,
    url: brokerView ? brokerView.webContents.getURL() : '',
    selectedBroker: config && config.selectedBroker,
    hasSessionToken: Boolean(credentials.sessionToken),
    ...extra
  });
}

function setDiscoveryMode(enabled) {
  discoveryEnabled = Boolean(enabled);
  if (brokerView && !brokerView.webContents.isDestroyed()) {
    brokerView.webContents.send('discovery-mode', discoveryEnabled);
  }
  send('discovery-status', {
    enabled: discoveryEnabled,
    path: getDiscoveryLogPath(),
    captured: discoveryCaptureCount,
    instrumentMetadataHealth: getInstrumentMetadataHealth()
  });
}

function writeDiscoveryCandidate(candidate) {
  if (!discoveryEnabled) return;
  applyDiscoveryAccountCandidate(candidate);
  const row = redactDiscoveryCandidate({
    broker: config.selectedBroker,
    pageUrl: brokerView ? brokerView.webContents.getURL() : '',
    ...candidate
  });
  fs.appendFileSync(getDiscoveryLogPath(), `${JSON.stringify(row)}\n`);
  discoveryCaptureCount += 1;
  send('discovery-status', {
    enabled: discoveryEnabled,
    path: getDiscoveryLogPath(),
    captured: discoveryCaptureCount,
    latestUrl: row.url,
    latestStatus: row.status,
    instrumentMetadataHealth: getInstrumentMetadataHealth()
  });
}

function handleBrokerApiCandidate(candidate) {
  bindInstrumentMetadataFromCandidate(candidate);
  if (discoveryEnabled) {
    writeDiscoveryCandidate(candidate);
  } else {
    applyDiscoveryAccountCandidate(candidate);
  }
}

function bindInstrumentMetadataFromCandidate(candidate) {
  const payload = parseDiscoveryBody(candidate && candidate.bodyPreview);
  if (!payload) return 0;
  let changed = 0;
  let candidates = 0;
  for (const object of flattenObjects(payload, [])) {
    if (looksLikeInstrumentObject(object)) candidates += 1;
    if (rememberInstrumentMetadata(object, { persist: false })) changed += 1;
  }
  if (candidates > 0) writeInstrumentCandidateDiagnostic(candidate, { candidates, changed });
  if (changed > 0) {
    saveInstrumentMetadata();
    send('market-tick', {
      instruments: getInstrumentSummaries(),
      instrumentMetadataHealth: getInstrumentMetadataHealth(),
      activeToken,
      candles: getActiveSnapshot() || emptySnapshot()
    });
  }
  return changed;
}

function handleBrokerInstrumentCandidates(rows) {
  let changed = 0;
  let candidates = 0;
  const sampleRows = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const enriched = enrichInstrumentCandidateWithLiveToken(row);
    if (looksLikeInstrumentObject(enriched)) candidates += 1;
    if (sampleRows.length < 12) sampleRows.push(sanitizeInstrumentCandidate(enriched));
    if (rememberInstrumentMetadata(enriched, { persist: false })) changed += 1;
  }
  if (candidates > 0) {
    writeInstrumentCandidateDiagnostic({ url: 'broker-preload-scraper', status: 0, contentType: 'application/json' }, { candidates, changed, sampleRows });
  }
  if (changed > 0) {
    saveInstrumentMetadata();
    send('market-tick', {
      instruments: getInstrumentSummaries(),
      activeToken,
      candles: getActiveSnapshot() || emptySnapshot()
    });
    send('discovery-status', {
      enabled: discoveryEnabled,
      path: getInstrumentMetadataPath(),
      instrumentMetadata: instrumentMetadata.size,
      instrumentMetadataHealth: getInstrumentMetadataHealth(),
      captured: discoveryCaptureCount
    });
  }
}

function enrichInstrumentCandidateWithLiveToken(row) {
  if (!row || typeof row !== 'object') return row;
  const token = String(row.token || row.instrument_token || row.instrumentToken || row.symbol_id || row.symbolToken || row.tk || row.t || '').replace('#', '').trim();
  if (token) return row;
  const symbol = cleanInstrumentSymbol(row);
  const option = parseOption(symbol);
  const lastPrice = Number(row.lastPrice || row.ltp || row.lp || row.price || row.displayPrice || 0);
  if (!option || !Number.isFinite(lastPrice) || lastPrice <= 0) return row;
  const now = Date.now();
  const matches = [];
  for (const [candidateToken, tick] of lastTickByToken.entries()) {
    const price = Number(tick && tick.price);
    const age = now - Number(tick && tick.ts || 0);
    if (!candidateToken || !Number.isFinite(price) || age > 45_000) continue;
    if (Math.abs(price - lastPrice) <= 0.05) matches.push({ token: candidateToken, tick });
  }
  if (matches.length !== 1) return row;
  return {
    ...row,
    token: matches[0].token,
    exchange: row.exchange || matches[0].tick.exchange || config.defaultExchange,
    source: row.source ? `${row.source}-main-price-match` : 'main-price-match'
  };
}

function sanitizeInstrumentCandidate(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    token: String(row.token || row.instrument_token || row.instrumentToken || row.symbol_id || row.symbolToken || row.tk || row.t || '').replace('#', '').trim(),
    symbol: cleanInstrumentSymbol(row),
    trading_symbol: String(row.trading_symbol || row.tradingsymbol || row.tradingSymbol || row.tsym || '').replace('#', '').trim(),
    exchange: String(row.exchange || row.exch || row.e || '').toUpperCase(),
    source: String(row.source || '').slice(0, 40),
    lastPrice: Number.isFinite(Number(row.lastPrice)) ? Number(row.lastPrice) : null,
    textSample: String(row.textSample || '').replace(/\s+/g, ' ').trim().slice(0, 180)
  };
}

function looksLikeInstrumentObject(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return false;
  const text = JSON.stringify(object).toLowerCase();
  return /(token|instrument|symbol|trading.?symbol|tradingsymbol|scrip|sensex|nifty|banknifty|finnifty|bfo|nfo|\bce\b|\bpe\b)/.test(text);
}

function writeInstrumentCandidateDiagnostic(candidate, stats) {
  try {
    const dataDir = path.join(app.getPath('userData'), 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const row = {
      broker: normalizeBrokerId(config && config.selectedBroker),
      url: redactText(candidate && candidate.url),
      status: candidate && candidate.status,
      contentType: candidate && candidate.contentType,
      capturedAt: new Date().toISOString(),
      candidates: stats.candidates,
      changed: stats.changed,
      sampleRows: stats.sampleRows || []
    };
    fs.appendFileSync(path.join(dataDir, `instrument_candidates_${brokerDataKey()}.jsonl`), `${JSON.stringify(row)}\n`);
  } catch (_) {}
}

function setupBrokerNetworkDiscovery() {
  if (!brokerView || !brokerView.webContents) return;
  const wc = brokerView.webContents;
  try {
    if (!wc.debugger.isAttached()) {
      wc.debugger.attach('1.3');
      wc.debugger.sendCommand('Network.enable').catch(() => {});
    }
  } catch (error) {
    send('discovery-status', {
      enabled: discoveryEnabled,
      path: getDiscoveryLogPath(),
      captured: discoveryCaptureCount,
      error: `Network discovery unavailable: ${error.message}`
    });
    return;
  }

  wc.debugger.on('message', (_event, method, params = {}) => {
    if (method === 'Network.requestWillBeSent') {
      const request = params.request || {};
      if (!params.requestId || !request.url) return;
      const existing = brokerNetworkRequests.get(params.requestId) || {};
      brokerNetworkRequests.set(params.requestId, {
        ...existing,
        transport: 'devtools',
        url: request.url,
        method: request.method || existing.method || 'GET',
        requestHeaders: request.headers || existing.requestHeaders || {},
        requestPreview: String(request.postData || '').slice(0, 12000),
        startedAt: Date.now()
      });
      return;
    }

    if (method === 'Network.responseReceived') {
      const response = params.response || {};
      if (!params.requestId || !response.url) return;
      const existing = brokerNetworkRequests.get(params.requestId) || {};
      brokerNetworkRequests.set(params.requestId, {
        ...existing,
        transport: 'devtools',
        url: existing.url || response.url,
        method: existing.method || (response.requestHeaders && response.requestHeaders[':method']) || '',
        status: response.status,
        contentType: response.mimeType || '',
        responseHeaders: response.headers || {},
        startedAt: existing.startedAt || Date.now()
      });
      return;
    }

    if (method !== 'Network.loadingFinished' || !params.requestId) return;
    const meta = brokerNetworkRequests.get(params.requestId);
    brokerNetworkRequests.delete(params.requestId);
    if (!meta || !isPotentialDiscoveryResponse(meta)) return;
    wc.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId })
      .then((result) => {
        const body = result && result.base64Encoded
          ? Buffer.from(result.body || '', 'base64').toString('utf8')
          : String(result && result.body || '');
        if (!looksInterestingDiscovery(meta.url, body)) return;
        const candidate = {
          ...meta,
          method: meta.method || 'GET',
          durationMs: Date.now() - Number(meta.startedAt || Date.now()),
          capturedAt: new Date().toISOString(),
          requestPreview: String(meta.requestPreview || '').slice(0, 12000),
          bodyPreview: body.slice(0, 12000)
        };
        if (discoveryEnabled) {
          writeDiscoveryCandidate(candidate);
        } else {
          applyDiscoveryAccountCandidate(candidate);
        }
      })
      .catch(() => {});
  });
}

function isPotentialDiscoveryResponse(meta) {
  const contentType = String(meta.contentType || '').toLowerCase();
  const url = String(meta.url || '').toLowerCase();
  return (
    contentType.includes('json') ||
    contentType.includes('text') ||
    /account|profile|balance|fund|limit|margin|position|holding|order|pnl|profit|loss|rms|client|user|watchlist|marketwatch|option|optionchain|chain|scrip|symbol|instrument|token|sensex|nifty|bfo|nfo/.test(url)
  );
}

function looksInterestingDiscovery(url, body) {
  const text = `${url || ''} ${String(body || '').slice(0, 3000)}`.toLowerCase();
  return /(account|profile|balance|fund|limit|margin|position|holding|order|pnl|profit|loss|rms|client|user|available|cash|mtom|m2m|watchlist|marketwatch|option|optionchain|chain|scrip|symbol|trading.?symbol|instrument|token|sensex|nifty|bfo|nfo|\bce\b|\bpe\b)/.test(text);
}

function applyDiscoveryAccountCandidate(candidate) {
  const discovered = extractDiscoveryAccountSummary(candidate);
  if (!discovered) return;
  accountSummary = mergeAccountSummary(accountSummary, discovered);
  send('account-summary', accountSummary);
}

function bindAccountSummaryFromDiscoveryLog() {
  const logPath = getDiscoveryLogPath();
  if (!fs.existsSync(logPath)) return accountSummary;
  const lines = fs.readFileSync(logPath, 'utf8').split(/\n/).filter(Boolean);
  let nextSummary = accountSummary;
  let boundCount = 0;

  for (const line of lines) {
    let row = null;
    try {
      row = JSON.parse(line);
    } catch (_) {
      continue;
    }
    const discovered = extractDiscoveryAccountSummary(row);
    if (!discovered) continue;
    nextSummary = mergeAccountSummary(nextSummary, discovered);
    boundCount += 1;
  }

  if (boundCount > 0) {
    accountSummary = {
      ...nextSummary,
      message: `Loaded from ${boundCount} discovery response${boundCount === 1 ? '' : 's'}.`
    };
    send('account-summary', accountSummary);
    send('discovery-status', {
      enabled: discoveryEnabled,
      path: logPath,
      captured: discoveryCaptureCount || lines.length,
      bound: boundCount
    });
  }

  return accountSummary;
}

function extractDiscoveryAccountSummary(candidate) {
  const brokerSpecific = brokerAdapter && typeof brokerAdapter.mapDiscoveryAccountSummary === 'function'
    ? brokerAdapter.mapDiscoveryAccountSummary(candidate)
    : null;
  if (brokerSpecific) return brokerSpecific;

  const payload = parseDiscoveryBody(candidate && candidate.bodyPreview);
  if (!payload) return null;
  const url = String(candidate.url || '').toLowerCase();
  const text = `${url} ${JSON.stringify(payload).slice(0, 3000)}`.toLowerCase();
  const summary = {
    ok: true,
    clientId: '',
    clientName: '',
    accountStatus: '',
    balance: null,
    marginUsed: null,
    dayPnl: null,
    positions: [],
    message: 'Loaded from broker discovery.'
  };

  const objects = flattenObjects(payload);
  const first = objects[0] || {};
  if (/(account|profile|client|user|customer)/.test(text)) {
    summary.clientId = pickDeep(objects, ['clientId', 'accountId', 'loginId', 'userId', 'uid', 'client_id', 'clientcode', 'clientCode']);
    summary.clientName = pickDeep(objects, ['clientName', 'accountName', 'name', 'userName', 'client_name', 'clientname']);
    summary.accountStatus = pickDeep(objects, ['accountStatus', 'actStatus', 'status']);
  }
  if (/(balance|fund|limit|margin|rms|cash|ledger)/.test(text)) {
    summary.balance = numberFromDeep(objects, ['availableMargin', 'availableCash', 'cashmarginavailable', 'openingBalance', 'net', 'balance', 'credits', 'cash', 'netavailable', 'netAvailable', 'available_balance']);
    summary.marginUsed = numberFromDeep(objects, ['utilizedMargin', 'marginused', 'debits', 'utilized', 'usedMargin', 'margin_used']);
  }
  if (/(position|holding|pnl|profit|loss|m2m|mtom|mark)/.test(text)) {
    summary.positions = findArrayPayload(payload) || [];
    summary.dayPnl = calculateDiscoveryPnl(summary.positions.length ? summary.positions : objects);
  }

  if (summary.balance == null) {
    summary.balance = numberFromDeep([first], ['availableMargin', 'availableCash', 'cashmarginavailable', 'net', 'balance', 'credits', 'cash']);
  }
  if (summary.dayPnl == null) summary.dayPnl = calculateDiscoveryPnl(objects);

  const hasValue = summary.clientId || summary.clientName || summary.balance != null || summary.marginUsed != null || summary.dayPnl != null || summary.positions.length;
  return hasValue ? summary : null;
}

function parseDiscoveryBody(body) {
  const text = String(body || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const jsonMatch = text.match(/[{[][\s\S]*[}\]]/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (_) {
      return null;
    }
  }
}

function mergeAccountSummary(current, discovered) {
  const base = current || {
    ok: false,
    clientId: '',
    clientName: '',
    accountStatus: '',
    balance: null,
    marginUsed: null,
    dayPnl: null,
    positions: [],
    message: ''
  };
  return {
    ...base,
    ok: base.ok || discovered.ok,
    clientId: discovered.clientId || base.clientId,
    clientName: discovered.clientName || base.clientName,
    accountStatus: discovered.accountStatus || base.accountStatus,
    balance: discovered.balance != null ? discovered.balance : base.balance,
    marginUsed: discovered.marginUsed != null ? discovered.marginUsed : base.marginUsed,
    dayPnl: discovered.dayPnl != null ? discovered.dayPnl : base.dayPnl,
    positions: discovered.positions && discovered.positions.length ? discovered.positions : base.positions,
    message: discovered.message || base.message,
    lastSyncedAt: discovered.lastSyncedAt || base.lastSyncedAt
  };
}

function redactDiscoveryCandidate(candidate) {
  const redacted = JSON.parse(JSON.stringify(candidate || {}));
  redacted.url = redactText(redacted.url);
  redacted.pageUrl = redactText(redacted.pageUrl);
  redacted.requestPreview = redactText(redacted.requestPreview);
  redacted.bodyPreview = redactText(redacted.bodyPreview);
  if (redacted.requestHeaders) redacted.requestHeaders = redactHeaders(redacted.requestHeaders);
  if (redacted.responseHeaders) redacted.responseHeaders = redactHeaders(redacted.responseHeaders);
  return redacted;
}

function redactHeaders(headers) {
  const redacted = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (/authorization|cookie|token|session|api.?key|password/i.test(key)) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = redactText(value);
    }
  }
  return redacted;
}

function flattenObjects(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    for (const item of value) flattenObjects(item, output);
    return output;
  }
  output.push(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') flattenObjects(child, output);
  }
  return output;
}

function findArrayPayload(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object');
  for (const key of ['positions', 'position', 'positionBook', 'holdings', 'data', 'result', 'rows']) {
    if (Array.isArray(value[key])) return value[key].filter((item) => item && typeof item === 'object');
  }
  for (const child of Object.values(value)) {
    const found = findArrayPayload(child);
    if (found && found.length) return found;
  }
  return null;
}

function pickDeep(objects, keys) {
  const normalizedKeys = keys.map((key) => key.toLowerCase());
  for (const object of objects) {
    for (const [key, value] of Object.entries(object || {})) {
      if (normalizedKeys.includes(key.toLowerCase()) && value != null && value !== '') {
        return String(value);
      }
    }
  }
  return '';
}

function numberFromDeep(objects, keys) {
  const normalizedKeys = keys.map((key) => key.toLowerCase());
  for (const object of objects) {
    for (const [key, value] of Object.entries(object || {})) {
      if (!normalizedKeys.includes(key.toLowerCase())) continue;
      const number = parseBrokerNumber(value);
      if (Number.isFinite(number)) return number;
    }
  }
  return null;
}

function calculateDiscoveryPnl(rows) {
  let total = 0;
  let found = false;
  const pnlKeys = ['pnl', 'netPnl', 'realizedPnl', 'unrealizedPnl', 'realisedPnl', 'unrealisedPnl', 'MtoM', 'mtom', 'profitandloss', 'profitLoss', 'pl', 'netPL'];
  for (const row of rows || []) {
    const value = numberFromDeep([row], pnlKeys);
    if (Number.isFinite(value)) {
      total += value;
      found = true;
    }
  }
  return found ? total : null;
}

function parseBrokerNumber(value) {
  if (typeof value === 'number') return value;
  const cleaned = String(value || '').replace(/,/g, '').trim();
  if (!cleaned) return NaN;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : NaN;
}

function redactText(value) {
  return String(value || '')
    .replace(/(authorization|bearer|token|session|sessionid|session_id|userSession|cookie|password|passwd|apikey|api_key|x-api-key)(["'\s:=]+)([^"',\s&}]+)/gi, '$1$2[REDACTED]')
    .replace(/([?&](?:auth|token|session|sessionId|session_id|userSession|apikey|api_key)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[PAN_REDACTED]');
}

async function trackMarketWatch() {
  return ensureMarketWatchFeed('manual');
}

async function ensureMarketWatchFeed(source = 'manual') {
  if (!brokerView) throw new Error('Broker view is not available.');
  if (!brokerAdapter || !brokerAdapter.watchlistUrl) {
    throw new Error('Selected broker does not expose a watchlist page for market feed recovery.');
  }
  const requiredToken = getRequiredMarketToken();
  const connected = await isBrokerMarketSocketOpen();
  const tickAge = marketTickAgeMs(requiredToken);
  if (connected && tickAge <= MARKET_FEED_STALE_MS) {
    return { ok: true, mode: 'market-watch', token: requiredToken, alreadyOpen: true };
  }

  const pageUrl = brokerView.webContents.getURL();
  if (!isActiveBrokerPortalUrl(pageUrl)) {
    throw new Error('Broker portal is not open yet. Open/login to the broker panel and retry market feed.');
  }

  lastMarketFeedRecoveryAt = Date.now();
  broadcastBrokerStatus({
    marketFeed: 'reconnecting',
    staleToken: requiredToken,
    staleTokenAgeMs: Number.isFinite(tickAge) ? tickAge : null,
    message: `Opening ${brokerAdapter.name || config.selectedBroker} watchlist to reconnect token ${requiredToken}.`
  });
  await brokerView.webContents.loadURL(brokerAdapter.watchlistUrl);
  await delay(MARKET_FEED_RECOVERY_WAIT_MS);
  const reconnected = await isBrokerMarketSocketOpen();
  const refreshedTokenAge = marketTickAgeMs(requiredToken);
  if (!reconnected || refreshedTokenAge > MARKET_FEED_STALE_MS) {
    broadcastBrokerStatus({
      marketFeed: 'stale',
      staleToken: requiredToken,
      staleTokenAgeMs: Number.isFinite(refreshedTokenAge) ? refreshedTokenAge : null,
      error: `Token ${requiredToken} is not receiving ticks after opening watchlist.`
    });
    throw new Error(`Market feed is connected but token ${requiredToken} is not streaming. Keep SENSEX/token ${requiredToken} in the broker Watchlist/Market Watch page and retry.`);
  }
  broadcastBrokerStatus({ marketFeed: 'connected', recoveredFrom: source, token: requiredToken });
  return { ok: true, mode: 'market-watch', token: requiredToken, reloaded: true };
}

async function isBrokerMarketSocketOpen() {
  if (!brokerView || brokerView.webContents.isDestroyed()) return false;
  const script = `
    (() => {
      const ws = window.__algoAliceLastWs || window.__skandAltWS || window.__skandWS || window.skandAltWS;
      return Boolean(ws && ws.readyState === WebSocket.OPEN);
    })();
  `;
  try {
    return Boolean(await brokerView.webContents.executeJavaScript(script, true));
  } catch (_) {
    return false;
  }
}

async function maybeRecoverMarketFeed() {
  if (!brokerAdapter || normalizeBrokerId(config && config.selectedBroker) !== 'aliceblue') return;
  if (!brokerReady) return;
  if (!brokerAdapter.watchlistUrl) return;
  if (marketTickAgeMs(getRequiredMarketToken()) <= MARKET_FEED_STALE_MS) return;
  if (Date.now() - lastMarketFeedRecoveryAt < MARKET_FEED_RECOVERY_COOLDOWN_MS) return;
  await ensureMarketWatchFeed('presence-check');
}

function marketTickAgeMs(token = '') {
  const tick = token ? lastTickByToken.get(String(token)) : lastMarketTick;
  if (!tick || !tick.ts) return Infinity;
  const ts = Number(tick.ts);
  if (!Number.isFinite(ts)) return Infinity;
  return Date.now() - ts;
}

function getRequiredMarketToken() {
  return String(config && (config.strategyIndexToken || config.defaultToken) || SENSEX_TOKEN).trim() || SENSEX_TOKEN;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTick(rawTick) {
  const token = String(rawTick.token || rawTick.tk || rawTick.t || rawTick.instrument_token || rawTick.symbol_id || rawTick.s || '').replace('#', '').trim();
  const lp = Number(rawTick.lp || rawTick.ltp || rawTick.l || rawTick.price || rawTick.last_price);
  if (!token || !Number.isFinite(lp)) return null;
  rememberInstrumentMetadata({ ...rawTick, token }, { persist: false });
  const meta = instrumentMetadata.get(token) || {};
  return {
    token,
    lp,
    ts: normalizeTimestamp(rawTick.ts || rawTick.ft || rawTick.time || Date.now()),
    symbol: cleanSymbol(meta.symbol || rawTick.symbol || rawTick.tsym || rawTick.trading_symbol || rawTick.name || rawTick.s, token),
    exchange: String(meta.exchange || rawTick.exchange || rawTick.exch || rawTick.e || '').toUpperCase(),
    segment: String(meta.segment || rawTick.segment || rawTick.seg || '').toUpperCase()
  };
}

function handleBrokerTicks(rawTicks) {
  const ticks = Array.isArray(rawTicks) ? rawTicks : [rawTicks];
  for (const raw of ticks) {
    const tick = normalizeTick(raw);
    if (!tick) continue;

    const engine = getOrCreateEngine(tick);
    const update = engine.addTick(tick);
    const snapshot = engine.getSnapshot();
    lastMarketTick = {
      symbol: snapshot.symbol,
      token: tick.token,
      price: tick.lp,
      ts: tick.ts,
      candle: update.current
    };
    lastTickByToken.set(tick.token, lastMarketTick);
    if (tick.token === SENSEX_TOKEN) lastSensexTick = lastMarketTick;
    if (!activeToken) activeToken = tick.token;

    send('market-tick', {
      symbol: snapshot.symbol,
      token: tick.token,
      exchange: tick.exchange,
      segment: tick.segment,
      price: tick.lp,
      ts: tick.ts,
      currentCandle: update.current,
      activeToken,
      instruments: getInstrumentSummaries(),
      instrumentMetadataHealth: getInstrumentMetadataHealth(),
      candles: snapshot
    });
    handleStrategyTick(tick).catch((error) => {
      writeStrategyEvent('STRATEGY_TICK_ERROR', {
        token: tick && tick.token,
        error: error.message
      });
    });
    if (update.closed) {
      send('candle-closed', update.closed);
      handleStrategyCandle(update.closed, snapshot);
    }
  }
}

async function handleStrategyTick(tick) {
  if (!config.strategyEnabled || !reversalStrategy || typeof reversalStrategy.onOptionTick !== 'function') return;
  const adoptionPending = await maybeAdoptProtectiveSlFromOrderBook(tick);
  if (adoptionPending) return;
  const optionExit = reversalStrategy.onOptionTick(tick, {
    indexCandle: getLatestIndexCandle(),
    optionCandle: getLatestInstrumentCandle(tick && tick.token),
    autoTrade: Boolean(config.strategyAutoTrade)
  });
  if (optionExit) handleStrategySignal(optionExit);
}

async function maybeAdoptProtectiveSlFromOrderBook(tick) {
  if (!config.strategyAutoTrade) return false;
  if (normalizeBrokerId(config.selectedBroker || '') !== 'aliceblue') return false;
  if (!brokerAdapter || typeof brokerAdapter.getOrderBook !== 'function') return false;
  if (!reversalStrategy || typeof reversalStrategy.getOpenPosition !== 'function') return false;
  if (protectiveSlAdoptionInFlight) return true;

  let position = reversalStrategy.getOpenPosition();
  if (position && position.instrument) {
    const instrumentToken = String(position.instrument.token || position.instrument.instrument_token || '');
    if (instrumentToken && tick && String(tick.token || '') !== instrumentToken) return false;
    if (position.protectiveSl && ['placed', 'modify_requested', 'requested'].includes(position.protectiveSl.status)) return false;
  }

  const now = Date.now();
  if (now - lastProtectiveSlAdoptionAt < PROTECTIVE_SL_ADOPTION_INTERVAL_MS) return false;
  lastProtectiveSlAdoptionAt = now;
  protectiveSlAdoptionInFlight = true;
  try {
    const orderBook = await brokerAdapter.getOrderBook();
    learnInstrumentMetadataFromBrokerRows(orderBook, 'aliceblue-orderbook');
    if (!position || !position.instrument) {
      const adoptedPosition = findAdoptableBrokerPosition(orderBook, tick);
      if (!adoptedPosition) return false;
      if (
        typeof reversalStrategy.adoptOpenOptionPosition === 'function' &&
        reversalStrategy.adoptOpenOptionPosition({
          instrument: adoptedPosition.instrument,
          entryPrice: adoptedPosition.entryPrice,
          entryTime: adoptedPosition.entryTime,
          peakPrice: getOptionPeakSinceEntry(adoptedPosition.instrument.token, adoptedPosition.entryTime),
          optionType: adoptedPosition.optionType,
          direction: adoptedPosition.direction,
          reason: 'broker orderbook net-open BUY position'
        })
      ) {
        rememberInstrumentMetadata(adoptedPosition.instrument, { persist: true });
        writeStrategyEvent('BROKER_POSITION_ADOPTED', {
          orderNo: adoptedPosition.entryOrderNo,
          symbol: adoptedPosition.instrument.symbol,
          token: adoptedPosition.instrument.token,
          entryPrice: adoptedPosition.entryPrice,
          peakPrice: getOptionPeakSinceEntry(adoptedPosition.instrument.token, adoptedPosition.entryTime),
          netQty: adoptedPosition.netQty,
          optionType: adoptedPosition.optionType,
          hasPendingSl: Boolean(findPendingProtectiveSlOrder(orderBook, { instrument: adoptedPosition.instrument }))
        });
        send('strategy-signal', {
          type: 'BROKER_POSITION_ADOPTED',
          instrument: compactInstrument(adoptedPosition.instrument),
          optionEntryPrice: adoptedPosition.entryPrice,
          reason: 'adopted live broker position for SL/profit protection'
        });
        position = reversalStrategy.getOpenPosition();
      }
    }
    if (!position || !position.instrument) return false;
    const pendingSl = findPendingProtectiveSlOrder(orderBook, position);
    if (!pendingSl) return false;
    if (typeof reversalStrategy.adoptProtectiveSl === 'function' && reversalStrategy.adoptProtectiveSl(pendingSl)) {
      writeStrategyEvent('PROTECTIVE_SL_ADOPTED', {
        orderNo: pendingSl.orderNo,
        symbol: pendingSl.tradingSymbol,
        token: pendingSl.token,
        price: pendingSl.price,
        triggerPrice: pendingSl.triggerPrice,
        status: pendingSl.orderStatus
      });
      send('strategy-signal', {
        type: 'PROTECTIVE_SL_ADOPTED',
        instrument: compactInstrument(position.instrument),
        protectiveSl: {
          orderNo: pendingSl.orderNo,
          price: Number(pendingSl.price || pendingSl.rprice || 0),
          triggerPrice: Number(pendingSl.triggerPrice || 0),
          status: pendingSl.orderStatus
        },
        reason: `adopted existing broker SL order ${pendingSl.orderNo}`
      });
      return true;
    }
    return false;
  } catch (error) {
    writeStrategyEvent('PROTECTIVE_SL_ADOPT_ERROR', {
      token: tick && tick.token,
      error: error.message
    });
    return false;
  } finally {
    protectiveSlAdoptionInFlight = false;
  }
}

function handleStrategyCandle(candle, snapshot) {
  if (!config.strategyEnabled) return;
  if (reversalStrategy && typeof reversalStrategy.onOptionCandleClosed === 'function') {
    const optionExit = reversalStrategy.onOptionCandleClosed(candle, {
      indexCandle: getLatestIndexCandle()
    });
    if (optionExit) {
      handleStrategySignal(optionExit);
      return;
    }
  }

  handleFeatureModuleStrategyProposals(candle, snapshot);

  if (!reversalStrategy || typeof reversalStrategy.onCandleClosed !== 'function') return;
  const signal = reversalStrategy.onCandleClosed(candle, {
    candles: snapshot.closed,
    instruments: getInstrumentSummaries(),
    getOptionCandle: getLatestInstrumentCandle,
    getOptionPrice: getLatestInstrumentPrice
  });
  if (!signal) {
    writeLatestStrategyEntryRejection();
    return;
  }
  handleStrategySignal(signal);
}

function writeLatestStrategyEntryRejection() {
  if (!reversalStrategy || typeof reversalStrategy.getLastEntryRejection !== 'function') return;
  const rejection = reversalStrategy.getLastEntryRejection();
  if (!rejection) return;
  const key = [
    rejection.setupKey || '',
    rejection.direction || '',
    rejection.optionType || '',
    rejection.candle && rejection.candle.bucket || '',
    rejection.reason || ''
  ].join('|');
  if (!key || key === lastStrategyEntryRejectionKey) return;
  lastStrategyEntryRejectionKey = key;
  writeStrategyEvent('ENTRY_REJECTED', {
    strategyId: BUILTIN_MOMENTUM_REVERSAL.strategyId,
    strategyName: BUILTIN_MOMENTUM_REVERSAL.strategyName,
    strategySource: BUILTIN_MOMENTUM_REVERSAL.strategySource,
    featureId: BUILTIN_MOMENTUM_REVERSAL.featureId,
    direction: rejection.direction || '',
    optionType: rejection.optionType || '',
    setupKey: rejection.setupKey || '',
    candle: rejection.candle || null,
    instrument: compactInstrument(rejection.instrument),
    optionConfirmation: rejection.optionConfirmation || null,
    autoTrade: Boolean(config && config.strategyAutoTrade),
    reason: rejection.reason || 'entry rejected'
  });
}

function handleFeatureModuleStrategyProposals(candle, snapshot) {
  if (!config.featureModuleStrategyEnabled) return;
  if (!featureModuleManager) return;
  const token = String(candle && candle.token || '');
  const indexToken = String(config.strategyIndexToken || SENSEX_TOKEN);
  if (token !== indexToken) return;
  if (candle.bucket && candle.bucket === lastFeatureModuleStrategyBucket) return;
  lastFeatureModuleStrategyBucket = candle.bucket || Date.now();

  const context = buildFeatureModuleStrategyContext(candle, snapshot);
  const results = featureModuleManager.evaluateGatedRuntimeModules(context, {
    minEntryConfidence: 50
  });
  const accepted = results.flatMap((row) => row.gated && row.gated.accepted || []);
  const rejected = results.flatMap((row) => row.gated && row.gated.rejected || []);
  writeFeatureModuleAudit('STRATEGY_CANDLE_PROPOSALS', {
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    moduleCount: results.length,
    strategyIntegrationEnabled: true,
    context: summarizeFeatureModuleContext(context),
    results
  });
  writeStrategyEvent('MODULE_PROPOSALS', {
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    candle: compactCandle(candle),
    modules: results.map((row) => ({
      moduleId: row.moduleId,
      version: row.version,
      accepted: row.gated && row.gated.accepted && row.gated.accepted.length || 0,
      rejected: row.gated && row.gated.rejected && row.gated.rejected.length || 0,
      error: row.error || ''
    }))
  });
  if (!accepted.length && !rejected.length) return;
  send('strategy-signal', {
    type: 'MODULE_PROPOSALS',
    candle: compactCandle(candle),
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    reason: `feature modules evaluated | accepted ${accepted.length} | rejected ${rejected.length}`
  });
  for (const proposal of accepted.slice(0, 5)) {
    send('strategy-signal', {
      type: 'MODULE_PROPOSAL',
      proposalType: proposal.type,
      direction: proposal.direction,
      optionType: proposal.optionType,
      confidence: proposal.confidence,
      moduleId: proposal.moduleId,
      moduleVersion: proposal.moduleVersion,
      candle: compactCandle(candle),
      autoTrade: false,
      reason: proposal.reason || 'accepted feature module proposal'
    });
  }
}

function buildFeatureModuleStrategyContext(candle, snapshot = {}) {
  const openPosition = reversalStrategy && typeof reversalStrategy.getOpenPosition === 'function'
    ? reversalStrategy.getOpenPosition()
    : null;
  return {
    now: new Date().toISOString(),
    broker: normalizeBrokerId(config && config.selectedBroker),
    indexCandle: candle || getLatestIndexCandle(),
    candles: snapshot.closed || [],
    position: openPosition,
    account: accountSummary
  };
}

function handleStrategySignal(signal) {
  const identifiedSignal = withStrategyIdentity(signal || {}, BUILTIN_MOMENTUM_REVERSAL);
  const enrichedSignal = {
    ...identifiedSignal,
    autoTrade: Boolean(config.strategyAutoTrade),
    order: buildStrategyOrder(identifiedSignal)
  };
  if (enrichedSignal.type === 'ENTRY' && enrichedSignal.instrument) {
    const premium = getLatestInstrumentPrice(enrichedSignal.instrument.token);
    if (premium != null && reversalStrategy && typeof reversalStrategy.setOpenPositionOptionEntry === 'function') {
      reversalStrategy.setOpenPositionOptionEntry(premium, getLatestInstrumentCandle(enrichedSignal.instrument.token));
      enrichedSignal.optionPerformance = {
        entryPremium: premium,
        trailingConfig: getStrategyTrailingConfig()
      };
    }
  }
  writeStrategyEvent('SIGNAL', {
    signalType: enrichedSignal.type,
    strategyId: enrichedSignal.strategyId,
    strategyName: enrichedSignal.strategyName,
    strategySource: enrichedSignal.strategySource,
    featureId: enrichedSignal.featureId,
    direction: enrichedSignal.direction,
    optionType: enrichedSignal.optionType,
    confidence: enrichedSignal.confidence,
    setupKey: enrichedSignal.setupKey || '',
    candle: enrichedSignal.candle || null,
    instrument: compactInstrument(enrichedSignal.instrument),
    hasOrder: Boolean(enrichedSignal.order),
    autoTrade: Boolean(config.strategyAutoTrade),
    optionPerformance: enrichedSignal.optionPerformance || null,
    reason: enrichedSignal.reason || ''
  });
  if (enrichedSignal.performance && reversalStrategy && typeof reversalStrategy.exportLearning === 'function') {
    const dataDir = path.join(app.getPath('userData'), 'data');
    saveStrategyLearning(dataDir, reversalStrategy.exportLearning());
    writeStrategyTrade(enrichedSignal);
  }
  send('strategy-signal', enrichedSignal);

  if (config.strategyAutoTrade && !enrichedSignal.order && signal.type === 'ENTRY') {
    if (reversalStrategy && typeof reversalStrategy.cancelOpenPosition === 'function') {
      reversalStrategy.cancelOpenPosition('auto trade skipped: missing option metadata');
    }
    send('strategy-signal', {
      ...enrichedSignal,
      type: 'ERROR',
      error: `Auto trade skipped: missing ${signal.optionType || ''} option token/symbol metadata. Open the broker watchlist/option chain so the app can learn CE/PE instruments.`
    });
    writeStrategyEvent('ORDER_SKIPPED', {
      signalType: signal.type,
      strategyId: enrichedSignal.strategyId,
      strategyName: enrichedSignal.strategyName,
      strategySource: enrichedSignal.strategySource,
      featureId: enrichedSignal.featureId,
      direction: signal.direction,
      optionType: signal.optionType,
      setupKey: signal.setupKey || '',
      reason: 'missing option metadata'
    });
    return;
  }

  if (config.strategyAutoTrade && enrichedSignal.order) {
    executeStrategyOrder(enrichedSignal).catch((error) => {
      if (enrichedSignal.type === 'ENTRY' && reversalStrategy && typeof reversalStrategy.cancelOpenPosition === 'function') {
        reversalStrategy.cancelOpenPosition('entry order failed');
      }
      if (enrichedSignal.type === 'PROTECTIVE_SL' && reversalStrategy && typeof reversalStrategy.markProtectiveSlFailed === 'function') {
        reversalStrategy.markProtectiveSlFailed(error.message);
      }
      if (enrichedSignal.type === 'PROTECTIVE_SL_MODIFY' && reversalStrategy) {
        if (isOrderNoLongerOpenError(error.message) && typeof reversalStrategy.markProtectiveSlClosed === 'function') {
          reversalStrategy.markProtectiveSlClosed(error.message);
        } else if (typeof reversalStrategy.markProtectiveSlModifyFailed === 'function') {
          reversalStrategy.markProtectiveSlModifyFailed(error.message);
        }
      }
      writeStrategyEvent('ORDER_ERROR', {
        signalType: enrichedSignal.type,
        strategyId: enrichedSignal.strategyId,
        strategyName: enrichedSignal.strategyName,
        strategySource: enrichedSignal.strategySource,
        featureId: enrichedSignal.featureId,
        direction: enrichedSignal.direction,
        optionType: enrichedSignal.optionType,
        setupKey: enrichedSignal.setupKey || '',
        order: redactOrderForJournal(enrichedSignal.order),
        error: error.message
      });
      send('strategy-signal', {
        ...enrichedSignal,
        type: 'ERROR',
        error: error.message
      });
    });
  }
}

function getLatestIndexCandle() {
  const engine = candleEngines.get(config.strategyIndexToken || SENSEX_TOKEN) || candleEngines.get(SENSEX_TOKEN);
  if (!engine) return null;
  const snapshot = engine.getSnapshot();
  return snapshot.current || snapshot.closed[snapshot.closed.length - 1] || null;
}

function getLatestInstrumentCandle(token) {
  const engine = candleEngines.get(String(token || ''));
  if (!engine) return null;
  const snapshot = engine.getSnapshot();
  return snapshot.current || snapshot.closed[snapshot.closed.length - 1] || null;
}

function getLatestInstrumentPrice(token) {
  const tick = lastTickByToken.get(String(token || ''));
  if (tick && Number.isFinite(Number(tick.price))) return Number(tick.price);
  const candle = getLatestInstrumentCandle(token);
  if (candle && Number.isFinite(Number(candle.close))) return Number(candle.close);
  return null;
}

function getOptionPeakSinceEntry(token, entryTime) {
  const engine = candleEngines.get(String(token || ''));
  const entryMs = parseBrokerDateTime(entryTime);
  if (!engine) return null;
  const snapshot = engine.getSnapshot();
  const candles = [
    ...(snapshot.closed || []),
    snapshot.current
  ].filter(Boolean);
  const highs = candles
    .filter((candle) => {
      if (!entryMs) return true;
      const candleEnd = Number(candle.bucket || 0) + Number(config.candleIntervalMs || DEFAULT_INTERVAL_MS);
      return candleEnd >= entryMs;
    })
    .map((candle) => Number(candle.high))
    .filter(Number.isFinite);
  if (!highs.length) return null;
  return Math.max(...highs);
}

function parseBrokerDateTime(value) {
  if (!value) return 0;
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return direct;
  const match = String(value).match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;
  const [, dd, mm, yyyy, hh, min, ss = '0'] = match;
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`).getTime();
}

function buildStrategyOrder(signal) {
  const instrument = signal && signal.instrument;
  if (!instrument || !instrument.token || !instrument.symbol) return null;
  const meta = instrumentMetadata.get(String(instrument.token)) || {};
  const quantity = normalizeOrderQuantity(config.strategyQuantity || config.defaultQuantity, meta, instrument);
  if (signal.type === 'PROTECTIVE_SL') {
    return {
      action: 'SELL',
      symbol: meta.trading_symbol || meta.symbol || instrument.trading_symbol || instrument.symbol,
      token: instrument.token,
      exchange: meta.exchange || instrument.exchange || config.defaultExchange,
      product: config.defaultProduct,
      quantity,
      orderType: 'SL',
      price: signal.protectiveSl && signal.protectiveSl.price,
      triggerPrice: signal.protectiveSl && signal.protectiveSl.triggerPrice,
      source: 'momentum_reversal_strategy_protective_sl'
    };
  }
  if (signal.type === 'PROTECTIVE_SL_MODIFY') {
    return {
      action: 'SELL',
      symbol: meta.trading_symbol || meta.symbol || instrument.trading_symbol || instrument.symbol,
      token: instrument.token,
      exchange: meta.exchange || instrument.exchange || config.defaultExchange,
      product: config.defaultProduct,
      quantity,
      orderType: 'SL',
      price: signal.protectiveSl && signal.protectiveSl.price,
      triggerPrice: signal.protectiveSl && signal.protectiveSl.triggerPrice,
      orderNo: signal.protectiveSl && signal.protectiveSl.orderNo,
      source: 'momentum_reversal_strategy_protective_sl_modify'
    };
  }
  return {
    action: signal.action || 'BUY',
    symbol: meta.trading_symbol || meta.symbol || instrument.trading_symbol || instrument.symbol,
    token: instrument.token,
    exchange: meta.exchange || instrument.exchange || config.defaultExchange,
    product: config.defaultProduct,
    quantity,
    orderType: config.defaultOrderType,
    price: 0,
    triggerPrice: 0,
    source: 'momentum_reversal_strategy'
  };
}

function normalizeOrderQuantity(configuredQuantity, meta = {}, instrument = {}) {
  const adoptedNetQty = Number(instrument.netQty || instrument.openQty || 0);
  if (Number.isFinite(adoptedNetQty) && adoptedNetQty > 0) return adoptedNetQty;

  const rawQuantity = Number(configuredQuantity || 0);
  const lotSize = Number(meta.lotSize || instrument.lotSize || instrument.lotsize || 0);
  if (Number.isFinite(lotSize) && lotSize > 0) {
    const lots = Math.max(1, Math.ceil((Number.isFinite(rawQuantity) ? rawQuantity : 0) / lotSize));
    return lots * lotSize;
  }
  const symbol = String(meta.symbol || instrument.symbol || '').toUpperCase();
  const exchange = String(meta.exchange || instrument.exchange || '').toUpperCase();
  if (exchange === 'BFO' && /^SENSEX\b/.test(symbol) && /\b(CE|PE)\b/.test(symbol)) {
    return Math.max(20, Math.ceil((Number.isFinite(rawQuantity) ? rawQuantity : 0) / 20) * 20);
  }
  return rawQuantity;
}

function findPendingProtectiveSlOrder(orderBook, position) {
  const rows = extractOrderRows(orderBook);
  if (!rows.length || !position || !position.instrument) return null;

  const instrument = position.instrument;
  const meta = instrumentMetadata.get(String(instrument.token || instrument.instrument_token || '')) || {};
  const expectedToken = String(instrument.token || instrument.instrument_token || '').trim();
  const expectedSymbol = normalizeOrderSymbol(meta.trading_symbol || meta.symbol || instrument.trading_symbol || instrument.symbol);
  const expectedQty = normalizeOrderQuantity(config.strategyQuantity || config.defaultQuantity, meta, instrument);

  const candidates = rows.filter((row) => {
    const priceType = String(row.priceType || row.pricetype || '').toUpperCase();
    const transType = String(row.transType || row.transactionType || row.side || '').toUpperCase();
    const rowToken = String(row.token || row.symbolToken || row.symbol_id || '').trim();
    const rowSymbol = normalizeOrderSymbol(row.tradingSymbol || row.tradingsymbol || row.symbol || row.tsym);
    const qty = Number(row.qty || row.quantity || row.rqty || 0);
    const triggerPrice = Number(row.triggerPrice || row.triggerprice || row.trgprc || 0);
    const tokenMatches = expectedToken && rowToken && rowToken === expectedToken;
    const symbolMatches = expectedSymbol && rowSymbol && rowSymbol === expectedSymbol;
    const qtyMatches = !Number.isFinite(expectedQty) || expectedQty <= 0 || !Number.isFinite(qty) || qty >= expectedQty;

    return (
      (tokenMatches || symbolMatches) &&
      qtyMatches &&
      transType === 'S' &&
      priceType.startsWith('SL') &&
      Number.isFinite(triggerPrice) &&
      triggerPrice > 0 &&
      isOpenOrderStatus(row)
    );
  });

  candidates.sort((a, b) => {
    const triggerDiff = Number(b.triggerPrice || 0) - Number(a.triggerPrice || 0);
    if (triggerDiff) return triggerDiff;
    return String(b.exchUpdateTime || b.orderTime || '').localeCompare(String(a.exchUpdateTime || a.orderTime || ''));
  });
  return candidates[0] || null;
}

function findOrderByOrderNo(orderBook, orderNo) {
  const target = String(orderNo || '').trim();
  if (!target) return null;
  return extractOrderRows(orderBook).find((row) => String(row.orderNo || row.norenordno || '').trim() === target) || null;
}

function findAdoptableBrokerPosition(orderBook, tick) {
  const rows = extractOrderRows(orderBook);
  if (!rows.length) return null;
  const tickToken = tick && String(tick.token || '').trim();
  const positions = new Map();

  for (const row of rows) {
    const transType = String(row.transType || row.transactionType || row.side || '').toUpperCase();
    if (!isCompleteOrderStatus(row) || !['B', 'S'].includes(transType)) continue;
    const symbol = row.tradingSymbol || row.tradingsymbol || row.symbol || row.tsym || '';
    const parsed = parseOption(symbol);
    if (!parsed) continue;
    const token = String(row.token || row.symbolToken || row.symbol_id || '').trim();
    const normalizedSymbol = normalizeOrderSymbol(symbol);
    const key = token || normalizedSymbol;
    if (!key) continue;
    const qty = Number(row.fillShares || row.fillshares || row.fillqty || row.qty || row.quantity || 0);
    const price = Number(row.avgTradePrice || row.averagePrice || row.fillprc || row.price || row.rprice || 0);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) continue;

    const bucket = positions.get(key) || {
      token,
      symbol,
      normalizedSymbol,
      parsed,
      exchange: String(row.exchange || config.defaultExchange || '').toUpperCase(),
      segment: row.segment || '',
      lotSize: Number(row.lotSize || row.lotsize || 0) || undefined,
      tickSize: Number(row.tickSize || row.ticksize || 0.05) || 0.05,
      buyQty: 0,
      sellQty: 0,
      buyValue: 0,
      latestBuy: null,
      latestTime: ''
    };
    if (transType === 'B') {
      bucket.buyQty += qty;
      bucket.buyValue += qty * price;
      bucket.latestBuy = isNewerOrder(row, bucket.latestBuy) ? row : bucket.latestBuy || row;
    } else {
      bucket.sellQty += qty;
    }
    bucket.latestTime = newerTime(bucket.latestTime, row.exchUpdateTime || row.orderTime || '');
    positions.set(key, bucket);
  }

  const openPositions = [...positions.values()]
    .map((position) => ({ ...position, netQty: position.buyQty - position.sellQty }))
    .filter((position) => position.netQty > 0 && position.buyQty > 0 && position.buyValue > 0);
  if (!openPositions.length) return null;

  openPositions.sort((a, b) => {
    const aTickMatch = tickToken && a.token === tickToken ? 1 : 0;
    const bTickMatch = tickToken && b.token === tickToken ? 1 : 0;
    if (aTickMatch !== bTickMatch) return bTickMatch - aTickMatch;
    return String(b.latestTime || '').localeCompare(String(a.latestTime || ''));
  });

  const pickedPosition = openPositions[0];
  const picked = pickedPosition.latestBuy || {};
  const symbol = pickedPosition.symbol || picked.tradingSymbol || picked.tradingsymbol || picked.symbol || picked.tsym || '';
  const parsed = pickedPosition.parsed || parseOption(symbol) || {};
  const token = String(pickedPosition.token || picked.token || picked.symbolToken || picked.symbol_id || tickToken || '').trim();
  const entryPrice = pickedPosition.buyValue / pickedPosition.buyQty;
  return {
    entryOrderNo: picked.orderNo || '',
    entryPrice,
    entryTime: picked.exchUpdateTime || picked.orderTime || new Date().toISOString(),
    netQty: pickedPosition.netQty,
    optionType: parsed.optionType || '',
    direction: parsed.optionType === 'PE' ? 'bearish' : 'bullish',
    instrument: {
      token,
      symbol,
      trading_symbol: symbol,
      exchange: pickedPosition.exchange,
      segment: pickedPosition.segment,
      lotSize: pickedPosition.lotSize,
      tickSize: pickedPosition.tickSize,
      netQty: pickedPosition.netQty
    }
  };
}

function isNewerOrder(candidate, existing) {
  if (!existing) return true;
  return String(candidate.exchUpdateTime || candidate.orderTime || '').localeCompare(String(existing.exchUpdateTime || existing.orderTime || '')) > 0;
}

function newerTime(left, right) {
  return String(right || '').localeCompare(String(left || '')) > 0 ? right : left;
}

function extractOrderRows(orderBook) {
  if (!orderBook) return [];
  if (Array.isArray(orderBook)) return orderBook;
  if (Array.isArray(orderBook.result)) return orderBook.result;
  if (Array.isArray(orderBook.data)) return orderBook.data;
  if (orderBook.result && Array.isArray(orderBook.result.orders)) return orderBook.result.orders;
  return [];
}

function normalizeOrderSymbol(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, '').trim();
}

function isOrderNoLongerOpenError(message) {
  return /not\s+open\s+to\s+modify|order\s+is\s+not\s+open|not\s+modifiable|completed|complete/i.test(String(message || ''));
}

async function preflightProtectiveSlModify(signal) {
  if (!signal || signal.type !== 'PROTECTIVE_SL_MODIFY') return true;
  const orderNo = signal.order && signal.order.orderNo || signal.protectiveSl && signal.protectiveSl.orderNo;
  if (!orderNo) return true;

  if (!canSendProtectiveSlModify()) {
    if (reversalStrategy && typeof reversalStrategy.markProtectiveSlModifyFailed === 'function') {
      reversalStrategy.markProtectiveSlModifyFailed('protective SL modify rate limited');
    }
    writeStrategyEvent('ORDER_RATE_LIMITED', {
      signalType: signal.type,
      order: redactOrderForJournal(signal.order),
      orderNo,
      limit: `${PROTECTIVE_SL_MODIFY_MAX_PER_WINDOW}/${PROTECTIVE_SL_MODIFY_WINDOW_MS / 1000}s`
    });
    send('strategy-signal', {
      ...signal,
      type: 'ORDER_RATE_LIMITED',
      reason: 'protective SL modify skipped to protect broker rate limit'
    });
    return false;
  }

  if (!brokerAdapter || typeof brokerAdapter.getOrderBook !== 'function') return true;
  const orderBook = await brokerAdapter.getOrderBook();
  const brokerOrder = findOrderByOrderNo(orderBook, orderNo);
  const brokerStatus = brokerOrder ? normalizeOrderStatus(brokerOrder) : null;
  const statusLabel = brokerStatus && (brokerStatus.raw || brokerStatus.normalized) || 'missing';
  if (!brokerOrder || !brokerStatus.isOpen) {
    const closed = reversalStrategy && typeof reversalStrategy.markProtectiveSlClosed === 'function'
      ? reversalStrategy.markProtectiveSlClosed(
        `protective SL order is ${statusLabel}; position no longer modifiable`,
        brokerOrder,
        getLatestIndexCandle()
      )
      : null;
    writeProtectiveSlClosedTrade(closed);
    writeStrategyEvent('ORDER_SKIPPED', {
      signalType: signal.type,
      reason: `protective SL order is ${statusLabel}; modify skipped`,
      order: redactOrderForJournal(signal.order),
      brokerOrder: brokerOrder ? {
        orderNo: brokerOrder.orderNo,
        status: brokerOrder.orderStatus || brokerOrder.status || '',
        normalizedStatus: brokerStatus.normalized,
        price: brokerOrder.price,
        triggerPrice: brokerOrder.triggerPrice
      } : null,
      closed
    });
    send('strategy-signal', {
      ...signal,
      type: 'PROTECTIVE_SL_CLOSED',
      reason: `protective SL order is ${statusLabel}; trailing stopped`
    });
    return false;
  }

  const currentTrigger = Number(brokerOrder.triggerPrice || brokerOrder.triggerprice || 0);
  const nextTrigger = Number(signal.order && signal.order.triggerPrice || 0);
  if (Number.isFinite(currentTrigger) && Number.isFinite(nextTrigger) && currentTrigger >= nextTrigger) {
    if (reversalStrategy && typeof reversalStrategy.markProtectiveSlModified === 'function') {
      reversalStrategy.markProtectiveSlModified({ skipped: true, reason: 'broker trigger already at or above target' }, {
        triggerPrice: currentTrigger,
        price: Number(brokerOrder.price || brokerOrder.rprice || 0)
      });
    }
    writeStrategyEvent('ORDER_SKIPPED', {
      signalType: signal.type,
      reason: 'broker SL trigger already at or above target',
      orderNo,
      currentTrigger,
      nextTrigger
    });
    return false;
  }

  recordProtectiveSlModifyAttempt();
  return true;
}

function canSendProtectiveSlModify() {
  const now = Date.now();
  protectiveSlModifyAttempts = protectiveSlModifyAttempts.filter((ts) => now - ts < PROTECTIVE_SL_MODIFY_WINDOW_MS);
  return protectiveSlModifyAttempts.length < PROTECTIVE_SL_MODIFY_MAX_PER_WINDOW;
}

function recordProtectiveSlModifyAttempt() {
  protectiveSlModifyAttempts.push(Date.now());
}

function getRiskConfig() {
  return {
    emergencyStop: Boolean(config && config.riskEmergencyStop),
    dailyLossLimit: positiveNumber(config && config.riskDailyLossLimit),
    maxTradesPerDay: positiveInteger(config && config.riskMaxTradesPerDay),
    maxOpenPositions: positiveInteger(config && config.riskMaxOpenPositions)
  };
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function positiveInteger(value) {
  return Math.max(0, Math.floor(positiveNumber(value)));
}

function indiaDateKey(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function readJsonLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function getTodayStrategyEntryCount() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  const today = indiaDateKey();
  return readJsonLines(getStrategyEventJournalPath(dataDir)).filter((row) => {
    return row &&
      row.type === 'ORDER_RESULT' &&
      row.signalType === 'ENTRY' &&
      row.ok === true &&
      indiaDateKey(row.recordedAt) === today;
  }).length;
}

function positionNetQty(position) {
  if (!position || typeof position !== 'object') return 0;
  const directKeys = ['netQty', 'netqty', 'netQuantity', 'net_quantity', 'netqtycf', 'net'];
  for (const key of directKeys) {
    const value = Number(position[key]);
    if (Number.isFinite(value) && value !== 0) return value;
  }
  const buyQty = Number(position.buyQty || position.buyqty || position.cfBuyQty || position.dayBuyQty || 0);
  const sellQty = Number(position.sellQty || position.sellqty || position.cfSellQty || position.daySellQty || 0);
  if (Number.isFinite(buyQty) && Number.isFinite(sellQty) && buyQty !== sellQty) return buyQty - sellQty;
  const qty = Number(position.qty || position.quantity || position.openQty || position.open_quantity || 0);
  return Number.isFinite(qty) ? qty : 0;
}

function getKnownOpenPositionCount(options = {}) {
  let count = 0;
  if (
    options.includeStrategyPosition !== false &&
    reversalStrategy &&
    typeof reversalStrategy.getOpenPosition === 'function' &&
    reversalStrategy.getOpenPosition()
  ) {
    count += 1;
  }
  const positions = Array.isArray(accountSummary && accountSummary.positions) ? accountSummary.positions : [];
  count += positions.filter((position) => positionNetQty(position) !== 0).length;
  return count;
}

function isRiskReducingSignal(signal) {
  const action = String(signal && signal.order && signal.order.action || '').toUpperCase();
  return ['EXIT', 'PROTECTIVE_SL', 'PROTECTIVE_SL_MODIFY'].includes(signal && signal.type) || action === 'SELL';
}

function evaluateStrategyRisk(signal) {
  const risk = getRiskConfig();
  const metrics = {
    dayPnl: accountSummary && accountSummary.dayPnl != null ? Number(accountSummary.dayPnl) : null,
    tradesToday: getTodayStrategyEntryCount(),
    openPositions: getKnownOpenPositionCount({ includeStrategyPosition: signal && signal.type !== 'ENTRY' })
  };
  if (isRiskReducingSignal(signal)) return { ok: true, risk, metrics, reason: '' };
  if (risk.emergencyStop) return { ok: false, risk, metrics, reason: 'emergency stop is enabled' };
  if (risk.dailyLossLimit > 0 && Number.isFinite(metrics.dayPnl) && metrics.dayPnl <= -risk.dailyLossLimit) {
    return { ok: false, risk, metrics, reason: `daily loss limit reached (${metrics.dayPnl})` };
  }
  if (risk.maxTradesPerDay > 0 && metrics.tradesToday >= risk.maxTradesPerDay) {
    return { ok: false, risk, metrics, reason: `max trades per day reached (${metrics.tradesToday}/${risk.maxTradesPerDay})` };
  }
  if (risk.maxOpenPositions > 0 && metrics.openPositions >= risk.maxOpenPositions) {
    return { ok: false, risk, metrics, reason: `max open positions reached (${metrics.openPositions}/${risk.maxOpenPositions})` };
  }
  return { ok: true, risk, metrics, reason: '' };
}

async function executeStrategyOrder(signal) {
  validateOrder(signal.order);
  const riskDecision = evaluateStrategyRisk(signal);
  if (!riskDecision.ok) {
    if (signal.type === 'ENTRY' && reversalStrategy && typeof reversalStrategy.cancelOpenPosition === 'function') {
      reversalStrategy.cancelOpenPosition(`risk guard rejected entry: ${riskDecision.reason}`);
    }
    writeStrategyEvent('ORDER_SKIPPED', {
      signalType: signal.type,
      strategyId: signal.strategyId,
      strategyName: signal.strategyName,
      strategySource: signal.strategySource,
      featureId: signal.featureId,
      direction: signal.direction,
      optionType: signal.optionType,
      setupKey: signal.setupKey || '',
      reason: `risk guard: ${riskDecision.reason}`,
      order: redactOrderForJournal(signal.order),
      risk: riskDecision.risk,
      metrics: riskDecision.metrics
    });
    send('strategy-signal', {
      ...signal,
      type: 'RISK_REJECTED',
      autoTrade: false,
      reason: `Risk guard blocked order: ${riskDecision.reason}`,
      risk: riskDecision.risk,
      metrics: riskDecision.metrics
    });
    return false;
  }
  if (signal.type === 'PROTECTIVE_SL_MODIFY' && !await preflightProtectiveSlModify(signal)) {
    return;
  }
  writeStrategyEvent('ORDER_ATTEMPT', {
    signalType: signal.type,
    strategyId: signal.strategyId,
    strategyName: signal.strategyName,
    strategySource: signal.strategySource,
    featureId: signal.featureId,
    direction: signal.direction,
    optionType: signal.optionType,
    setupKey: signal.setupKey || '',
    order: redactOrderForJournal(signal.order)
  });
  if (signal.type === 'PROTECTIVE_SL_MODIFY' && typeof brokerAdapter.modifyOrder !== 'function') {
    throw new Error(`${brokerAdapter.name || 'Broker'} does not support modifying protective SL orders yet.`);
  }
  const result = signal.type === 'PROTECTIVE_SL_MODIFY'
    ? await brokerAdapter.modifyOrder(signal.order)
    : await brokerAdapter.placeOrder(signal.order);
  if (signal.type === 'PROTECTIVE_SL' && reversalStrategy && typeof reversalStrategy.markProtectiveSlPlaced === 'function') {
    reversalStrategy.markProtectiveSlPlaced(result && result.result);
  }
  if (signal.type === 'PROTECTIVE_SL_MODIFY' && reversalStrategy && typeof reversalStrategy.markProtectiveSlModified === 'function') {
    reversalStrategy.markProtectiveSlModified(result && result.result, signal.protectiveSl);
  }
  writeStrategyEvent('ORDER_RESULT', {
    signalType: signal.type,
    strategyId: signal.strategyId,
    strategyName: signal.strategyName,
    strategySource: signal.strategySource,
    featureId: signal.featureId,
    direction: signal.direction,
    optionType: signal.optionType,
    setupKey: signal.setupKey || '',
    order: redactOrderForJournal(signal.order),
    ok: Boolean(result && result.ok),
    result: trimJournalValue(result && result.result)
  });
  send('trade-result', result);
  send('strategy-signal', {
    ...signal,
    type: `${signal.type}_ORDERED`,
    result
  });
}

function redactOrderForJournal(order) {
  if (!order) return null;
  return {
    action: order.action,
    symbol: order.symbol,
    token: order.token,
    exchange: order.exchange,
    product: order.product,
    quantity: order.quantity,
    orderType: order.orderType,
    price: order.price,
    triggerPrice: order.triggerPrice,
    source: order.source
  };
}

function trimJournalValue(value) {
  if (value == null) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 2000 ? `${text.slice(0, 2000)}...` : value;
}

function getOrCreateEngine(tick) {
  const existing = candleEngines.get(tick.token);
  const meta = instrumentMetadata.get(tick.token) || {};
  if (existing) {
    if ((meta.symbol || tick.symbol) && existing.symbol.startsWith('Token ')) existing.symbol = meta.symbol || tick.symbol;
    if (meta.exchange || tick.exchange) existing.exchange = meta.exchange || tick.exchange;
    if (meta.segment || tick.segment) existing.segment = meta.segment || tick.segment;
    return existing;
  }

  const engine = new CandleEngine({
    dataDir: path.join(app.getPath('userData'), 'data'),
    symbol: meta.symbol || tick.symbol,
    token: tick.token,
    intervalMs: Number(config.candleIntervalMs || DEFAULT_INTERVAL_MS)
  });
  engine.exchange = tick.exchange;
  engine.segment = tick.segment;
  candleEngines.set(tick.token, engine);
  return engine;
}

function normalizeTimestamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Date.now();
  return number < 10_000_000_000 ? number * 1000 : number;
}

function cleanSymbol(value, token) {
  const symbol = String(value || '').replace('#', '').trim();
  return symbol || `Token ${token}`;
}

function validateOrder(order) {
  const symbol = String(order.symbol || '').trim();
  const exchange = String(order.exchange || '').toUpperCase();
  if (!symbol) {
    throw new Error('Trading symbol is required for order execution.');
  }
  if (!exchange) {
    throw new Error('Exchange is required for order execution.');
  }
  if (!order.token) {
    throw new Error('Alice instrument token is required for order execution.');
  }
  if (!Number(order.quantity || order.qty)) {
    throw new Error('Quantity is required.');
  }
}

function getStrategyEvaluationReportPath() {
  return path.join(__dirname, 'docs', 'trailing_strategy_evaluation.md');
}

function getStrategyEvaluationJsonPath() {
  return path.join(__dirname, 'data', 'strategy_training', 'trailing_strategy_evaluation.json');
}

function compactStrategyEvaluationResult(result) {
  const summary = result && result.summary || {};
  const rows = Array.isArray(result && result.rows) ? result.rows : [];
  return {
    generatedAt: summary.generatedAt || '',
    limitation: summary.limitation || '',
    trailing: summary.trailing || {},
    totals: summary.totals || {},
    days: Array.isArray(summary.days) ? summary.days.slice(-8).reverse() : [],
    setupStats: Array.isArray(summary.setupStats) ? summary.setupStats.slice(0, 8) : [],
    recentTrades: rows.slice(-10).reverse(),
    files: result.files || {
      json: getStrategyEvaluationJsonPath(),
      report: getStrategyEvaluationReportPath()
    }
  };
}

function loadStrategyEvaluationReport() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getStrategyEvaluationJsonPath(), 'utf8'));
    return compactStrategyEvaluationResult({
      summary: parsed.summary,
      rows: parsed.rows,
      files: {
        json: getStrategyEvaluationJsonPath(),
        report: getStrategyEvaluationReportPath()
      }
    });
  } catch (_) {
    return null;
  }
}

ipcMain.handle('app-ready', async () => {
  await refreshAccountSummary();
  bindAccountSummaryFromDiscoveryLog();
  return getState();
});

ipcMain.handle('save-config', async (_event, partialConfig) => {
  const nextPartial = filterConfigUpdateForPolicy({ ...partialConfig }, runtimePolicy);
  if (nextPartial.featureModuleLicenseKey === '********') {
    nextPartial.featureModuleLicenseKey = config.featureModuleLicenseKey || '';
  }
  if (nextPartial.featureModulePublicKeyPem === '[configured]') {
    nextPartial.featureModulePublicKeyPem = config.featureModulePublicKeyPem || '';
  }
  if (Object.prototype.hasOwnProperty.call(nextPartial, 'sessionToken') || Object.prototype.hasOwnProperty.call(nextPartial, 'apiKey')) {
    setActiveBrokerCredentials({
      sessionToken: String(nextPartial.sessionToken || '').trim(),
      apiKey: String(nextPartial.apiKey || '').trim()
    });
  }
  const nextConfig = saveConfig({ ...config, ...nextPartial, selectedBroker: config.selectedBroker });
  if (reversalStrategy && typeof reversalStrategy.updateTrailingOptions === 'function') {
    reversalStrategy.updateTrailingOptions(getStrategyTrailingConfig());
  }
  if (reversalStrategy && typeof reversalStrategy.updateOptionPremiumConfirmationOptions === 'function') {
    reversalStrategy.updateOptionPremiumConfirmationOptions(getStrategyOptionPremiumConfirmationConfig());
  }
  if (reversalStrategy && typeof reversalStrategy.updateFailedReversalCooldownOptions === 'function') {
    reversalStrategy.updateFailedReversalCooldownOptions(getStrategyFailedReversalCooldownConfig());
  }
  broadcastBrokerStatus();
  await refreshAccountSummary();
  return { ok: true, config: sanitizeConfigForRenderer(nextConfig), accountSummary, featureModules: getFeatureModuleStatus() };
});

ipcMain.handle('restart-app', async (_event, options = {}) => {
  const safety = getRestartSafetyStatus();
  if (!safety.safe && !(options && options.force)) {
    return {
      ok: false,
      blocked: true,
      reason: 'A strategy position is active. Confirm force restart only after broker SL/exit protection is safe.',
      safety
    };
  }
  scheduleAppRestart(options && options.force ? 'forced from app settings' : 'requested from app settings');
  return {
    ok: true,
    restarting: true,
    safety
  };
});

ipcMain.handle('set-session-token', async (_event, token) => {
  setActiveBrokerCredentials({ sessionToken: String(token || '').trim() });
  saveConfig(config);
  broadcastBrokerStatus();
  const credentials = getActiveBrokerCredentials();
  await refreshAccountSummary();
  return { ok: true, masked: maskToken(credentials.sessionToken), hasSessionToken: Boolean(credentials.sessionToken), accountSummary };
});

ipcMain.handle('open-broker', async () => {
  if (!brokerView) throw new Error('Broker view is not available.');
  await brokerView.webContents.loadURL(brokerAdapter.loginUrl);
  brokerVisible = true;
  saveConfig({ ...config, showBrokerPanel: true });
  applyLayout();
  broadcastBrokerStatus();
  return { ok: true };
});

ipcMain.handle('open-watchlist', async () => {
  if (!brokerView) throw new Error('Broker view is not available.');
  await brokerView.webContents.loadURL(brokerAdapter.watchlistUrl);
  brokerVisible = true;
  saveConfig({ ...config, showBrokerPanel: true });
  applyLayout();
  broadcastBrokerStatus();
  return { ok: true };
});

ipcMain.handle('toggle-broker', () => {
  brokerVisible = !brokerVisible;
  saveConfig({ ...config, showBrokerPanel: brokerVisible });
  applyLayout();
  broadcastBrokerStatus();
  return { ok: true, visible: brokerVisible };
});

ipcMain.handle('set-broker-visible', (_event, visible) => {
  brokerVisible = Boolean(visible);
  saveConfig({ ...config, showBrokerPanel: brokerVisible });
  applyLayout();
  broadcastBrokerStatus();
  return { ok: true, visible: brokerVisible };
});

ipcMain.handle('set-broker-bounds', (_event, bounds) => {
  const nextBounds = normalizeBounds(bounds);
  brokerBounds = nextBounds;
  applyLayout();
  return { ok: true };
});

ipcMain.handle('subscribe-sensex', async () => trackMarketWatch());
ipcMain.handle('track-market-watch', async () => trackMarketWatch());

ipcMain.handle('refresh-account', async () => {
  const summary = await refreshAccountSummary();
  return { ok: Boolean(summary && summary.ok), accountSummary: summary };
});

ipcMain.handle('add-instrument-metadata', (_event, metadata) => upsertManualInstrumentMetadata(metadata));

ipcMain.handle('sync-instrument-metadata', async () => {
  await refreshAccountSummary({ source: 'metadata-sync' });
  let orderBookLearning = { changed: 0, candidates: 0 };
  if (brokerAdapter && typeof brokerAdapter.getOrderBook === 'function') {
    try {
      const orderBook = await brokerAdapter.getOrderBook();
      orderBookLearning = learnInstrumentMetadataFromBrokerRows(orderBook, 'manual-orderbook-sync');
    } catch (error) {
      writeStrategyEvent('INSTRUMENT_METADATA_SYNC_ERROR', {
        source: 'manual-orderbook-sync',
        error: error.message
      });
    }
  }
  return {
    ok: true,
    accountSummary,
    orderBookLearning,
    instrumentMetadataHealth: getInstrumentMetadataHealth()
  };
});

ipcMain.handle('set-strategy-auto-trade', (_event, enabled) => {
  config.strategyAutoTrade = Boolean(enabled);
  saveConfig(config);
  return { ok: true, strategyAutoTrade: config.strategyAutoTrade };
});

ipcMain.handle('sync-feature-modules', async () => {
  if (!featureModuleManager) throw new Error('Feature module manager is not available.');
  const status = await featureModuleManager.sync();
  const safeStatus = sanitizeFeatureModuleStatus(status, runtimePolicy);
  send('feature-modules-status', safeStatus);
  return { ok: true, featureModules: safeStatus };
});

ipcMain.handle('cleanup-feature-modules', () => {
  assertInternalAdmin(runtimePolicy, 'Feature module cleanup');
  if (!featureModuleManager) throw new Error('Feature module manager is not available.');
  const status = featureModuleManager.cleanupCachedModules('manual admin cleanup');
  const safeStatus = sanitizeFeatureModuleStatus(status, runtimePolicy);
  send('feature-modules-status', safeStatus);
  return { ok: true, featureModules: safeStatus };
});

ipcMain.handle('validate-feature-modules', () => {
  assertInternalAdmin(runtimePolicy, 'Feature module validation');
  if (!featureModuleManager) throw new Error('Feature module manager is not available.');
  return { ok: true, modules: featureModuleManager.validateRuntimeModules() };
});

ipcMain.handle('evaluate-feature-modules', () => {
  assertInternalAdmin(runtimePolicy, 'Feature module evaluation');
  if (!featureModuleManager) throw new Error('Feature module manager is not available.');
  const indexCandle = getLatestIndexCandle();
  const context = buildFeatureModuleStrategyContext(indexCandle, getActiveSnapshot());
  const results = featureModuleManager.evaluateGatedRuntimeModules(context, {
    minEntryConfidence: 50
  });
  const acceptedCount = results.reduce((total, row) => total + ((row.gated && row.gated.accepted || []).length), 0);
  const rejectedCount = results.reduce((total, row) => total + ((row.gated && row.gated.rejected || []).length), 0);
  writeFeatureModuleAudit('EVALUATE_PROPOSALS', {
    acceptedCount,
    rejectedCount,
    moduleCount: results.length,
    strategyIntegrationEnabled: Boolean(config.featureModuleStrategyEnabled),
    context: summarizeFeatureModuleContext(context),
    results
  });
  return { ok: true, results };
});

ipcMain.handle('run-strategy-evaluation', () => {
  assertInternalAdmin(runtimePolicy, 'Strategy evaluation refresh');
  if (!MomentumReversalStrategy) {
    return {
      ok: false,
      report: null,
      reason: 'Local strategy evaluation is not included in the public bare-shell source branch.'
    };
  }
  try {
    const { runEvaluation } = require('./scripts/evaluate_trailing_strategy');
    const result = runEvaluation();
    return { ok: true, report: compactStrategyEvaluationResult(result) };
  } catch (_) {
    return {
      ok: false,
      report: null,
      reason: 'Local strategy evaluation tools are not available in this build.'
    };
  }
});

ipcMain.handle('get-strategy-evaluation-report', () => {
  if (!runtimePolicy.internalAdminEnabled) {
    return {
      ok: false,
      report: null,
      reason: 'Strategy evaluation report is available only in internal support mode.'
    };
  }
  return { ok: true, report: loadStrategyEvaluationReport() };
});

ipcMain.handle('open-strategy-evaluation-report', async () => {
  assertInternalAdmin(runtimePolicy, 'Strategy evaluation report');
  if (!MomentumReversalStrategy) {
    throw new Error('Local strategy evaluation is not included in the public bare-shell source branch.');
  }
  const reportPath = getStrategyEvaluationReportPath();
  if (!fs.existsSync(reportPath)) {
    throw new Error('Strategy report is not generated yet. Refresh Strategy Report first.');
  }
  const error = await shell.openPath(reportPath);
  if (error) throw new Error(error);
  return { ok: true, path: reportPath };
});

ipcMain.handle('start-discovery', () => {
  assertInternalAdmin(runtimePolicy, 'Broker API discovery');
  setDiscoveryMode(true);
  return { ok: true, enabled: true, path: getDiscoveryLogPath() };
});

ipcMain.handle('stop-discovery', () => {
  assertInternalAdmin(runtimePolicy, 'Broker API discovery');
  setDiscoveryMode(false);
  const summary = bindAccountSummaryFromDiscoveryLog();
  return { ok: true, enabled: false, path: getDiscoveryLogPath(), accountSummary: summary };
});

ipcMain.handle('open-discovery-log', async () => {
  assertInternalAdmin(runtimePolicy, 'Broker API discovery log');
  const logPath = getDiscoveryLogPath();
  if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, '');
  await shell.openPath(logPath);
  return { ok: true, path: logPath };
});

ipcMain.handle('export-support-bundle', async () => {
  const userDataDir = app.getPath('userData');
  const featureModules = getFeatureModuleStatus();
  const strategyState = {
    position: getCompactStrategyPosition(),
    cooldown: getCompactStrategyCooldown()
  };
  const brokerStatus = getBrokerObservabilityStatus();
  const safeConfig = sanitizeConfigForRenderer();
  const result = buildSupportBundle({
    appName: APP_DISPLAY_NAME,
    appVersion: require('./package.json').version,
    userDataDir,
    dataDir: path.join(userDataDir, 'data'),
    configPath,
    config: safeConfig,
    selectedBroker: config && config.selectedBroker,
    runtimePolicy,
    dataStore: dataStoreState,
    accountSummary,
    featureModules,
    strategyState,
    brokerStatus,
    observability: buildObservabilitySnapshot({
      appName: APP_DISPLAY_NAME,
      appVersion: require('./package.json').version,
      config: safeConfig,
      selectedBroker: config && config.selectedBroker,
      runtimePolicy,
      dataStore: dataStoreState,
      accountSummary,
      featureModules,
      strategyState,
      brokerStatus
    })
  });
  await shell.openPath(result.bundleDir);
  return result;
});

ipcMain.handle('set-broker', async (_event, brokerId) => {
  const nextBroker = normalizeBrokerId(brokerId);
  if (nextBroker === config.selectedBroker) {
    return {
      ok: true,
      selectedBroker: nextBroker,
      brokers: listBrokers(),
      instrumentMetadataHealth: getInstrumentMetadataHealth()
    };
  }
  config.selectedBroker = nextBroker;
  config.brokerCredentials = normalizeBrokerCredentials(config.brokerCredentials, config);
  const credentials = getActiveBrokerCredentials();
  config.sessionToken = credentials.sessionToken || '';
  config.apiKey = credentials.apiKey || '';
  brokerAdapter = createBrokerAdapter(nextBroker, { config: getActiveBrokerConfig() });
  loadInstrumentMetadata(path.join(app.getPath('userData'), 'data'));
  reversalStrategy = createLocalReversalStrategy(path.join(app.getPath('userData'), 'data'));
  accountSummary = null;
  createBrokerBrowserView();
  saveConfig(config);
  await refreshAccountSummary();
  broadcastBrokerStatus();
  return {
    ok: true,
    selectedBroker: nextBroker,
    brokers: listBrokers(),
    config: sanitizeConfigForRenderer(config),
    featureModules: getFeatureModuleStatus(),
    instrumentMetadataHealth: getInstrumentMetadataHealth(),
    accountSummary
  };
});

ipcMain.handle('set-active-instrument', (_event, token) => {
  const nextToken = String(token || '').trim();
  if (nextToken && candleEngines.has(nextToken)) activeToken = nextToken;
  return {
    ok: true,
    activeToken,
    instruments: getInstrumentSummaries(),
    candles: getActiveSnapshot() || emptySnapshot()
  };
});

ipcMain.handle('place-order', async (_event, order) => {
  assertInternalAdmin(runtimePolicy, 'Manual order ticket');
  validateOrder(order);
  const mergedOrder = {
    exchange: config.defaultExchange,
    product: config.defaultProduct,
    orderType: config.defaultOrderType,
    ...order
  };
  const result = await brokerAdapter.placeOrder(mergedOrder);
  send('trade-result', result);
  return result;
});

ipcMain.handle('get-candles', (_event, token) => {
  const requestedToken = String(token || activeToken || '').trim();
  if (requestedToken && candleEngines.has(requestedToken)) {
    return candleEngines.get(requestedToken).getSnapshot();
  }
  return getActiveSnapshot() || emptySnapshot();
});

ipcMain.handle('check-candle-integrity', () => {
  const dataDir = path.join(app.getPath('userData'), 'data');
  return {
    ok: true,
    report: scanCandleIntegrity({
      dataDir,
      intervalMs: Number(config && config.candleIntervalMs || DEFAULT_INTERVAL_MS)
    })
  };
});

ipcMain.handle('open-data-dir', async () => {
  assertInternalAdmin(runtimePolicy, 'Data folder access');
  await shell.openPath(path.join(app.getPath('userData'), 'data'));
  return { ok: true };
});

ipcMain.on('broker-ticks', (_event, ticks) => handleBrokerTicks(ticks));

ipcMain.on('broker-api-candidate', (_event, candidate) => handleBrokerApiCandidate(candidate));

ipcMain.on('broker-instrument-candidates', (_event, rows) => handleBrokerInstrumentCandidates(rows));

ipcMain.on('broker-session-token', (_event, payload) => {
  const cleanToken = String(payload && typeof payload === 'object' ? payload.token : payload || '').trim();
  const tokenKey = String(payload && typeof payload === 'object' ? payload.key || payload.tokenKey || '' : '').trim();
  const credentials = getActiveBrokerCredentials();
  if (!cleanToken || (cleanToken === credentials.sessionToken && (!tokenKey || tokenKey === credentials.sessionTokenKey))) return;
  setActiveBrokerCredentials({ sessionToken: cleanToken, sessionTokenKey: tokenKey });
  saveConfig(config);
  refreshAccountSummary().catch(() => {});
  send('session-token-detected', { masked: maskToken(cleanToken) });
  broadcastBrokerStatus({ sessionKey: tokenKey });
});

app.whenReady().then(() => {
  createWindow();
  registerViewShortcuts();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
