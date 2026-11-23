const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

function on(channel, listener) {
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('algoAlice', {
  ready: () => invoke('app-ready'),
  saveConfig: (config) => invoke('save-config', config),
  setSessionToken: (token) => invoke('set-session-token', token),
  setBroker: (brokerId) => invoke('set-broker', brokerId),
  refreshAccount: () => invoke('refresh-account'),
  addInstrumentMetadata: (metadata) => invoke('add-instrument-metadata', metadata),
  syncInstrumentMetadata: () => invoke('sync-instrument-metadata'),
  openBroker: () => invoke('open-broker'),
  openWatchlist: () => invoke('open-watchlist'),
  toggleBroker: () => invoke('toggle-broker'),
  setBrokerVisible: (visible) => invoke('set-broker-visible', visible),
  setBrokerBounds: (bounds) => invoke('set-broker-bounds', bounds),
  subscribeSensex: () => invoke('subscribe-sensex'),
  trackMarketWatch: () => invoke('track-market-watch'),
  setStrategyAutoTrade: (enabled) => invoke('set-strategy-auto-trade', enabled),
  syncFeatureModules: () => invoke('sync-feature-modules'),
  cleanupFeatureModules: () => invoke('cleanup-feature-modules'),
  validateFeatureModules: () => invoke('validate-feature-modules'),
  evaluateFeatureModules: () => invoke('evaluate-feature-modules'),
  runStrategyEvaluation: () => invoke('run-strategy-evaluation'),
  getStrategyEvaluationReport: () => invoke('get-strategy-evaluation-report'),
  openStrategyEvaluationReport: () => invoke('open-strategy-evaluation-report'),
  restartApp: (options) => invoke('restart-app', options),
  setActiveInstrument: (token) => invoke('set-active-instrument', token),
  placeOrder: (order) => invoke('place-order', order),
  getCandles: (token) => invoke('get-candles', token),
  checkCandleIntegrity: () => invoke('check-candle-integrity'),
  openDataDir: () => invoke('open-data-dir'),
  startDiscovery: () => invoke('start-discovery'),
  stopDiscovery: () => invoke('stop-discovery'),
  openDiscoveryLog: () => invoke('open-discovery-log'),
  exportSupportBundle: () => invoke('export-support-bundle'),
  onMarketTick: (listener) => on('market-tick', listener),
  onCandleClosed: (listener) => on('candle-closed', listener),
  onStrategySignal: (listener) => on('strategy-signal', listener),
  onBrokerStatus: (listener) => on('broker-status', listener),
  onTradeResult: (listener) => on('trade-result', listener),
  onSessionTokenDetected: (listener) => on('session-token-detected', listener),
  onAccountSummary: (listener) => on('account-summary', listener),
  onDiscoveryStatus: (listener) => on('discovery-status', listener),
  onFeatureModulesStatus: (listener) => on('feature-modules-status', listener),
  onViewModeRequest: (listener) => on('view-mode-request', listener)
});
