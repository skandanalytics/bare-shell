const els = {
  brokerStatus: document.getElementById('brokerStatus'),
  sessionStatus: document.getElementById('sessionStatus'),
  sensexStatus: document.getElementById('sensexStatus'),
  candleCount: document.getElementById('candleCount'),
  lastTickAge: document.getElementById('lastTickAge'),
  instrumentSelect: document.getElementById('instrumentSelect'),
  statsInstrumentLabel: document.getElementById('statsInstrumentLabel'),
  candleStatsBody: document.getElementById('candleStatsBody'),
  canvas: document.getElementById('candleCanvas'),
  candleFocus: document.getElementById('candleFocus'),
  focusTime: document.getElementById('focusTime'),
  focusPattern: document.getElementById('focusPattern'),
  focusBias: document.getElementById('focusBias'),
  focusOpen: document.getElementById('focusOpen'),
  focusHigh: document.getElementById('focusHigh'),
  focusLow: document.getElementById('focusLow'),
  focusClose: document.getElementById('focusClose'),
  focusTicks: document.getElementById('focusTicks'),
  focusRange: document.getElementById('focusRange'),
  focusHighBreaks: document.getElementById('focusHighBreaks'),
  focusLowBreaks: document.getElementById('focusLowBreaks'),
  focusZones: document.getElementById('focusZones'),
  eventLog: document.getElementById('eventLog'),
  liveTradeTitle: document.getElementById('liveTradeTitle'),
  liveTradeStatus: document.getElementById('liveTradeStatus'),
  liveTradeSide: document.getElementById('liveTradeSide'),
  liveTradeEntry: document.getElementById('liveTradeEntry'),
  liveTradeLtp: document.getElementById('liveTradeLtp'),
  liveTradePeak: document.getElementById('liveTradePeak'),
  liveTradeTrail: document.getElementById('liveTradeTrail'),
  liveTradePnl: document.getElementById('liveTradePnl'),
  liveTradeSl: document.getElementById('liveTradeSl'),
  liveTradeUpdated: document.getElementById('liveTradeUpdated'),
  liveTradeReason: document.getElementById('liveTradeReason'),
  liveTradeEvents: document.getElementById('liveTradeEvents'),
  openBrokerBtn: document.getElementById('openBrokerBtn'),
  openWatchlistBtn: document.getElementById('openWatchlistBtn'),
  subscribeBtn: document.getElementById('subscribeBtn'),
  syncMetadataBtn: document.getElementById('syncMetadataBtn'),
  strategyAutoTradeToggle: document.getElementById('strategyAutoTradeToggle'),
  metadataHealth: document.getElementById('metadataHealth'),
  toggleViewBtn: document.getElementById('toggleViewBtn'),
  openDataBtn: document.getElementById('openDataBtn'),
  startDiscoveryBtn: document.getElementById('startDiscoveryBtn'),
  stopDiscoveryBtn: document.getElementById('stopDiscoveryBtn'),
  openDiscoveryBtn: document.getElementById('openDiscoveryBtn'),
  syncModulesBtn: document.getElementById('syncModulesBtn'),
  exportSupportBundleBtn: document.getElementById('exportSupportBundleBtn'),
  restartAppBtn: document.getElementById('restartAppBtn'),
  validateModulesBtn: document.getElementById('validateModulesBtn'),
  evaluateModulesBtn: document.getElementById('evaluateModulesBtn'),
  cleanupModulesBtn: document.getElementById('cleanupModulesBtn'),
  runStrategyReportBtn: document.getElementById('runStrategyReportBtn'),
  openStrategyReportBtn: document.getElementById('openStrategyReportBtn'),
  checkCandlesBtn: document.getElementById('checkCandlesBtn'),
  moduleManifestUrlInput: document.getElementById('moduleManifestUrlInput'),
  moduleUserIdInput: document.getElementById('moduleUserIdInput'),
  moduleLicenseKeyInput: document.getElementById('moduleLicenseKeyInput'),
  moduleDeviceIdInput: document.getElementById('moduleDeviceIdInput'),
  moduleCleanupHourInput: document.getElementById('moduleCleanupHourInput'),
  moduleSyncJitterMsInput: document.getElementById('moduleSyncJitterMsInput'),
  moduleOfflineGraceHoursInput: document.getElementById('moduleOfflineGraceHoursInput'),
  modulePublicKeyInput: document.getElementById('modulePublicKeyInput'),
  moduleOfflineGraceEnabledInput: document.getElementById('moduleOfflineGraceEnabledInput'),
  moduleAllowUnsignedInput: document.getElementById('moduleAllowUnsignedInput'),
  moduleStrategyEnabledInput: document.getElementById('moduleStrategyEnabledInput'),
  metadataSymbolInput: document.getElementById('metadataSymbolInput'),
  metadataTokenInput: document.getElementById('metadataTokenInput'),
  metadataExchangeInput: document.getElementById('metadataExchangeInput'),
  addMetadataBtn: document.getElementById('addMetadataBtn'),
  metadataRepairStatus: document.getElementById('metadataRepairStatus'),
  moduleValidationBody: document.getElementById('moduleValidationBody'),
  strategyReport: document.getElementById('strategyReport'),
  candleIntegrityReport: document.getElementById('candleIntegrityReport'),
  riskEmergencyStopInput: document.getElementById('riskEmergencyStopInput'),
  riskDailyLossLimitInput: document.getElementById('riskDailyLossLimitInput'),
  riskMaxTradesInput: document.getElementById('riskMaxTradesInput'),
  riskMaxOpenPositionsInput: document.getElementById('riskMaxOpenPositionsInput'),
  fastHardSlCooldownInput: document.getElementById('fastHardSlCooldownInput'),
  dataRetentionEnabledInput: document.getElementById('dataRetentionEnabledInput'),
  dataRetentionCandleDaysInput: document.getElementById('dataRetentionCandleDaysInput'),
  dataRetentionJournalDaysInput: document.getElementById('dataRetentionJournalDaysInput'),
  dataRetentionSupportBundleDaysInput: document.getElementById('dataRetentionSupportBundleDaysInput'),
  moduleStatus: document.getElementById('moduleStatus'),
  settingsBtn: document.getElementById('settingsBtn'),
  adminPanel: document.getElementById('adminPanel'),
  adminUnlock: document.getElementById('adminUnlock'),
  adminPasswordInput: document.getElementById('adminPasswordInput'),
  adminUnlockBtn: document.getElementById('adminUnlockBtn'),
  adminContent: document.getElementById('adminContent'),
  adminTools: document.getElementById('adminTools'),
  adminPanelTitle: document.getElementById('adminPanelTitle'),
  brokerSelect: document.getElementById('brokerSelect'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  overlayToggleViewBtn: document.getElementById('overlayToggleViewBtn'),
  brokerHost: document.getElementById('brokerHost'),
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  sessionTokenInput: document.getElementById('sessionTokenInput'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  symbolInput: document.getElementById('symbolInput'),
  tokenInput: document.getElementById('tokenInput'),
  exchangeInput: document.getElementById('exchangeInput'),
  productInput: document.getElementById('productInput'),
  quantityInput: document.getElementById('quantityInput'),
  orderTypeInput: document.getElementById('orderTypeInput'),
  priceInput: document.getElementById('priceInput'),
  triggerInput: document.getElementById('triggerInput'),
  buyBtn: document.getElementById('buyBtn'),
  sellBtn: document.getElementById('sellBtn'),
  exitBtn: document.getElementById('exitBtn'),
  selectedInstrumentLabel: document.getElementById('selectedInstrumentLabel'),
  positionQty: document.getElementById('positionQty'),
  positionAvg: document.getElementById('positionAvg'),
  positionLtp: document.getElementById('positionLtp'),
  positionPnl: document.getElementById('positionPnl'),
  patternLabel: document.getElementById('patternLabel')
};

const state = {
  candles: [],
  current: null,
  hitBoxes: [],
  lastTickTs: null,
  lastPrice: null,
  focusedCandle: null,
  brokerReady: false,
  brokerVisible: false,
  hasSessionToken: false,
  accountSummary: null,
  brokers: [],
  selectedBroker: 'aliceblue',
  theme: 'dark',
  viewMode: 'app',
  strategyAutoTrade: false,
  instrumentMetadataHealth: null,
  featureModules: null,
  moduleValidationRows: [],
  strategyEvaluationReport: null,
  candleIntegrityReport: null,
  liveTrade: null,
  liveTradeEvents: [],
  activeToken: '',
  instruments: [],
  positions: {}
};

const ctx = els.canvas.getContext('2d');

async function init() {
  wireEvents();
  const boot = await window.algoAlice.ready();
  applyBootState(boot);
  if (isInternalAdminMode()) loadStrategyEvaluationReport();
  draw();
  log('App ready. Login to Alice and track Market Watch 1.', 'ok');
  setInterval(updateTickAge, 1000);
  setInterval(refreshAccountSummary, 15 * 60 * 1000);
}

function applyBootState(boot) {
  state.runtimePolicy = boot.runtimePolicy || { customerMode: true, internalAdminEnabled: false };
  applyRuntimePolicy();
  state.candles = boot.candles.closed || [];
  state.current = boot.candles.current || null;
  state.lastPrice = boot.lastMarketTick && boot.lastMarketTick.price;
  state.lastTickTs = boot.lastMarketTick && boot.lastMarketTick.ts;
  state.brokerReady = boot.brokerReady;
  state.brokerVisible = boot.brokerVisible;
  state.hasSessionToken = boot.hasSessionToken;
  state.accountSummary = boot.accountSummary || null;
  state.brokers = boot.brokers || [];
  state.selectedBroker = boot.selectedBroker || boot.config.selectedBroker || 'aliceblue';
  state.strategyAutoTrade = Boolean(boot.config.strategyAutoTrade);
  state.instrumentMetadataHealth = boot.instrumentMetadataHealth || null;
  state.featureModules = boot.featureModules || null;
  state.liveTrade = hydrateLiveTradeFromPosition(boot.strategyPosition);
  if (!state.liveTrade && boot.strategyCooldown) state.liveTrade = hydrateLiveTradeFromCooldown(boot.strategyCooldown);
  state.activeToken = boot.activeToken || boot.candles.token || '';
  state.instruments = boot.instruments || [];
  els.strategyAutoTradeToggle.checked = state.strategyAutoTrade;
  els.apiKeyInput.value = boot.config.apiKey || '';
  els.moduleManifestUrlInput.value = boot.config.featureModuleManifestUrl || '';
  els.moduleUserIdInput.value = boot.config.featureModuleUserId || '';
  els.moduleLicenseKeyInput.value = boot.config.featureModuleLicenseKey || '';
  els.moduleDeviceIdInput.value = boot.config.featureModuleDeviceId || '';
  els.moduleCleanupHourInput.value = boot.config.featureModuleCleanupHour || 19;
  els.moduleSyncJitterMsInput.value = boot.config.featureModuleSyncJitterMs == null ? 30000 : boot.config.featureModuleSyncJitterMs;
  els.moduleOfflineGraceHoursInput.value = boot.config.featureModuleOfflineGraceHours || 24;
  els.modulePublicKeyInput.value = boot.config.featureModulePublicKeyPem || '';
  els.moduleOfflineGraceEnabledInput.checked = boot.config.featureModuleOfflineGraceEnabled !== false;
  els.moduleAllowUnsignedInput.checked = Boolean(boot.config.featureModuleAllowUnsigned);
  els.moduleStrategyEnabledInput.checked = Boolean(boot.config.featureModuleStrategyEnabled);
  els.riskEmergencyStopInput.checked = Boolean(boot.config.riskEmergencyStop);
  els.riskDailyLossLimitInput.value = Number(boot.config.riskDailyLossLimit || 0);
  els.riskMaxTradesInput.value = Number(boot.config.riskMaxTradesPerDay || 0);
  els.riskMaxOpenPositionsInput.value = Number(boot.config.riskMaxOpenPositions || 1);
  els.fastHardSlCooldownInput.value = Math.round(Number(boot.config.strategyFastHardSlCooldownMs || 0) / 60000);
  els.dataRetentionEnabledInput.checked = boot.config.dataRetentionEnabled !== false;
  els.dataRetentionCandleDaysInput.value = Number(boot.config.dataRetentionCandleDays || 30);
  els.dataRetentionJournalDaysInput.value = Number(boot.config.dataRetentionJournalDays || 14);
  els.dataRetentionSupportBundleDaysInput.value = Number(boot.config.dataRetentionSupportBundleDays || 7);
  els.exchangeInput.value = boot.config.defaultExchange || 'BFO';
  els.productInput.value = boot.config.defaultProduct || 'MIS';
  els.orderTypeInput.value = boot.config.defaultOrderType || 'MARKET';
  els.quantityInput.value = boot.config.defaultQuantity || 10;
  applyStoredTheme();
  applyStoredViewMode();
  renderBrokerOptions();
  updateBrokerButtons();
  syncTicketFromSelectedInstrument();
  renderStatus();
}

function applyRuntimePolicy() {
  const customerMode = !state.runtimePolicy || state.runtimePolicy.customerMode !== false;
  document.body.classList.toggle('customer-mode', customerMode);
  document.body.classList.toggle('internal-admin-mode', !customerMode);
  if (customerMode) {
    els.adminPanelTitle.textContent = 'License And Safety';
    els.adminUnlock.classList.add('hidden');
    els.adminContent.classList.remove('hidden');
  } else {
    els.adminPanelTitle.textContent = 'Broker API Discovery';
    els.adminUnlock.classList.remove('hidden');
    els.adminContent.classList.add('hidden');
  }
}

function isInternalAdminMode() {
  return Boolean(state.runtimePolicy && state.runtimePolicy.internalAdminEnabled);
}

function wireEvents() {
  els.openBrokerBtn.addEventListener('click', () => openBrokerSurface('Broker login opened', () => window.algoAlice.openBroker()));
  els.openWatchlistBtn.addEventListener('click', () => openBrokerSurface('Watchlist opened', () => window.algoAlice.openWatchlist()));
  els.subscribeBtn.addEventListener('click', () => runAction('Market feed websocket is active', () => window.algoAlice.trackMarketWatch()));
  els.syncMetadataBtn.addEventListener('click', syncInstrumentMetadata);
  els.strategyAutoTradeToggle.addEventListener('change', toggleStrategyAutoTrade);
  els.toggleViewBtn.addEventListener('click', cycleViewMode);
  els.openDataBtn.addEventListener('click', () => runAction('Data folder opened', () => window.algoAlice.openDataDir()));
  els.startDiscoveryBtn.addEventListener('click', startDiscovery);
  els.stopDiscoveryBtn.addEventListener('click', stopDiscovery);
  els.openDiscoveryBtn.addEventListener('click', () => runAction('Discovery log opened', () => window.algoAlice.openDiscoveryLog()));
  els.syncModulesBtn.addEventListener('click', syncFeatureModules);
  els.exportSupportBundleBtn.addEventListener('click', exportSupportBundle);
  els.restartAppBtn.addEventListener('click', restartApp);
  els.validateModulesBtn.addEventListener('click', validateFeatureModules);
  els.evaluateModulesBtn.addEventListener('click', evaluateFeatureModules);
  els.cleanupModulesBtn.addEventListener('click', cleanupFeatureModules);
  els.runStrategyReportBtn.addEventListener('click', runStrategyEvaluationReport);
  els.openStrategyReportBtn.addEventListener('click', () => runAction('Strategy report opened', () => window.algoAlice.openStrategyEvaluationReport()));
  els.checkCandlesBtn.addEventListener('click', checkCandleIntegrity);
  els.settingsBtn.addEventListener('click', (event) => {
    event.preventDefault();
    toggleAdminPanel();
  });
  els.adminUnlockBtn.addEventListener('click', unlockAdminTools);
  els.adminPasswordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') unlockAdminTools();
  });
  els.brokerSelect.addEventListener('change', selectBroker);
  els.themeToggleBtn.addEventListener('click', toggleTheme);
  els.overlayToggleViewBtn.addEventListener('click', cycleViewMode);
  els.instrumentSelect.addEventListener('change', selectInstrument);
  els.addMetadataBtn.addEventListener('click', addInstrumentMetadata);
  els.saveConfigBtn.addEventListener('click', saveConfig);
  els.buyBtn.addEventListener('click', () => placeOrder('BUY'));
  els.sellBtn.addEventListener('click', () => placeOrder('SELL'));
  els.exitBtn.addEventListener('click', exitPosition);
  els.canvas.addEventListener('mousemove', focusCandleFromPointer);
  els.canvas.addEventListener('mouseleave', showLatestFocusCandle);
  window.addEventListener('resize', () => {
    draw();
    syncBrokerBounds();
  });
  window.addEventListener('scroll', syncBrokerBounds, { passive: true });
  window.addEventListener('keydown', handleViewShortcut);

  window.algoAlice.onMarketTick((payload) => {
    state.instruments = payload.instruments || state.instruments;
    state.instrumentMetadataHealth = payload.instrumentMetadataHealth || state.instrumentMetadataHealth;
    if (!state.activeToken) state.activeToken = payload.activeToken || payload.token;
    const isActiveTick = payload.token === state.activeToken;
    if (isActiveTick) {
      state.lastPrice = payload.price;
      state.lastTickTs = payload.ts;
      state.current = payload.currentCandle;
      state.candles = payload.candles.closed || [];
      syncTicketFromSelectedInstrument();
    }
    renderStatus();
    renderLiveTradeMonitor();
    if (isActiveTick) draw();
  });

  window.algoAlice.onCandleClosed((candle) => {
    log(`${candle.symbol || candle.token} ${formatTime(candle.bucket)} ${candle.pattern || candle.direction} O:${fmt(candle.open)} C:${fmt(candle.close)}`, 'ok');
  });

  window.algoAlice.onStrategySignal((signal) => {
    updateLiveTradeFromSignal(signal);
    log(formatStrategySignal(signal), signal.type === 'ERROR' ? 'error' : 'ok');
  });

  window.algoAlice.onBrokerStatus((status) => {
    state.brokerReady = status.ready;
    state.brokerVisible = status.visible;
    state.selectedBroker = status.selectedBroker || state.selectedBroker;
    state.hasSessionToken = status.hasSessionToken;
    updateBrokerButtons();
    renderStatus();
    syncBrokerBounds();
    if (status.error) log(`Broker load issue: ${status.error}`, 'error');
    else if (status.marketFeed === 'reconnecting') log(status.message || 'Reconnecting market feed', 'ok');
    else if (status.marketFeed === 'connected') log(`Market feed connected${status.token ? ` for token ${status.token}` : ''}`, 'ok');
  });

  window.algoAlice.onSessionTokenDetected((payload) => {
    state.hasSessionToken = true;
    renderStatus();
    log(`Alice session token detected ${payload.masked}`, 'ok');
    refreshAccountSummary();
  });

  window.algoAlice.onAccountSummary((summary) => {
    state.accountSummary = summary;
    renderStatus();
    if (summary && summary.message && !summary.ok) log(`Account summary unavailable: ${summary.message}`, 'error');
  });

  window.algoAlice.onDiscoveryStatus((status) => {
    state.instrumentMetadataHealth = status.instrumentMetadataHealth || state.instrumentMetadataHealth;
    renderInstrumentMetadataHealth();
    const count = status.captured != null ? ` | captured ${status.captured}` : '';
    const latest = status.latestUrl ? ` | latest ${status.latestStatus || ''} ${status.latestUrl}` : '';
    log(`Discovery ${status.enabled ? 'active' : 'stopped'}: ${status.path}${count}${latest}`, status.enabled ? 'ok' : '');
  });

  window.algoAlice.onFeatureModulesStatus((status) => {
    state.featureModules = status;
    renderFeatureModules();
  });

  window.algoAlice.onTradeResult((result) => {
    recordLiveTradeEvent(result && result.ok ? 'Order accepted by broker' : 'Order response error', result && result.ok ? 'ok' : 'error');
    renderLiveTradeMonitor();
    log(`Order response: ${JSON.stringify(result.result || result).slice(0, 220)}`, result.ok ? 'ok' : 'error');
  });

  window.algoAlice.onViewModeRequest((payload) => {
    if (payload && payload.mode) setViewMode(payload.mode);
  });
}

async function openBrokerSurface(successMessage, action) {
  const ok = await runAction(successMessage, action);
  if (ok) {
    setViewMode('split');
    setTimeout(refreshAccountSummary, 3000);
  }
}

async function startDiscovery() {
  try {
    const result = await window.algoAlice.startDiscovery();
    log(`Discovery started. Walk through account, funds, positions, orders pages. Log: ${result.path}`, 'ok');
  } catch (error) {
    log(error.message, 'error');
  }
}

async function stopDiscovery() {
  try {
    const result = await window.algoAlice.stopDiscovery();
    if (result.accountSummary) {
      state.accountSummary = result.accountSummary;
      renderStatus();
    }
    log(`Discovery stopped. Log saved: ${result.path}`, 'ok');
  } catch (error) {
    log(error.message, 'error');
  }
}

function cycleViewMode() {
  const nextMode = state.viewMode === 'app'
    ? 'broker'
    : state.viewMode === 'broker'
      ? 'split'
      : 'app';
  setViewMode(nextMode);
}

function toggleAdminPanel() {
  if (!els.adminPanel.classList.contains('hidden')) {
    els.adminPanel.classList.add('hidden');
    els.adminPanel.setAttribute('aria-hidden', 'true');
    els.adminPasswordInput.value = '';
    log('Admin settings hidden.', 'ok');
    return;
  }
  els.adminPanel.classList.remove('hidden');
  els.adminPanel.setAttribute('aria-hidden', 'false');
  if (els.adminContent.classList.contains('hidden') && !els.adminUnlock.classList.contains('hidden')) {
    requestAnimationFrame(() => els.adminPasswordInput.focus());
  }
  log(state.runtimePolicy && state.runtimePolicy.customerMode === false ? 'Admin settings opened.' : 'License and safety settings opened.', 'ok');
}

function unlockAdminTools() {
  if (els.adminPasswordInput.value !== 'Happy2026') {
    log('Admin password rejected.', 'error');
    els.adminPasswordInput.select();
    return;
  }
  els.adminUnlock.classList.add('hidden');
  els.adminContent.classList.remove('hidden');
  els.adminPasswordInput.value = '';
  log('Admin settings unlocked.', 'ok');
}

async function runAction(successMessage, action) {
  try {
    await action();
    log(successMessage, 'ok');
    return true;
  } catch (error) {
    log(error.message, 'error');
    return false;
  }
}

async function toggleStrategyAutoTrade() {
  const enabled = els.strategyAutoTradeToggle.checked;
  els.strategyAutoTradeToggle.disabled = true;
  try {
    const result = await window.algoAlice.setStrategyAutoTrade(enabled);
    state.strategyAutoTrade = Boolean(result.strategyAutoTrade);
    els.strategyAutoTradeToggle.checked = state.strategyAutoTrade;
    log(`Auto Trade ${state.strategyAutoTrade ? 'enabled' : 'disabled'}.`, state.strategyAutoTrade ? 'ok' : '');
  } catch (error) {
    els.strategyAutoTradeToggle.checked = state.strategyAutoTrade;
    log(error.message, 'error');
  } finally {
    els.strategyAutoTradeToggle.disabled = false;
  }
}

async function saveConfig() {
  try {
    const sessionToken = els.sessionTokenInput.value.trim();
    const result = await window.algoAlice.saveConfig({
      sessionToken,
      apiKey: els.apiKeyInput.value.trim(),
      featureModuleManifestUrl: els.moduleManifestUrlInput.value.trim(),
      featureModuleUserId: els.moduleUserIdInput.value.trim(),
      featureModuleLicenseKey: els.moduleLicenseKeyInput.value.trim(),
      featureModuleDeviceId: els.moduleDeviceIdInput.value.trim(),
      featureModuleCleanupHour: Number(els.moduleCleanupHourInput.value || 19),
      featureModuleSyncJitterMs: Number(els.moduleSyncJitterMsInput.value || 0),
      featureModuleOfflineGraceEnabled: Boolean(els.moduleOfflineGraceEnabledInput.checked),
      featureModuleOfflineGraceHours: Number(els.moduleOfflineGraceHoursInput.value || 24),
      featureModulePublicKeyPem: normalizeConfiguredSecret(els.modulePublicKeyInput.value),
      featureModuleAllowUnsigned: Boolean(els.moduleAllowUnsignedInput.checked),
      featureModuleStrategyEnabled: Boolean(els.moduleStrategyEnabledInput.checked),
      riskEmergencyStop: Boolean(els.riskEmergencyStopInput.checked),
      riskDailyLossLimit: Number(els.riskDailyLossLimitInput.value || 0),
      riskMaxTradesPerDay: Number(els.riskMaxTradesInput.value || 0),
      riskMaxOpenPositions: Number(els.riskMaxOpenPositionsInput.value || 0),
      strategyFastHardSlCooldownMs: Number(els.fastHardSlCooldownInput.value || 0) * 60000,
      dataRetentionEnabled: Boolean(els.dataRetentionEnabledInput.checked),
      dataRetentionCandleDays: Number(els.dataRetentionCandleDaysInput.value || 30),
      dataRetentionJournalDays: Number(els.dataRetentionJournalDaysInput.value || 14),
      dataRetentionSupportBundleDays: Number(els.dataRetentionSupportBundleDaysInput.value || 7),
      defaultExchange: els.exchangeInput.value,
      defaultProduct: els.productInput.value,
      defaultOrderType: els.orderTypeInput.value,
      defaultQuantity: Number(els.quantityInput.value || 0)
    });
    state.featureModules = result.featureModules || state.featureModules;
    if (sessionToken) state.hasSessionToken = true;
    await refreshAccountSummary();
    renderStatus();
    log('Session/config saved locally.', 'ok');
  } catch (error) {
    log(error.message, 'error');
  }
}

async function syncFeatureModules() {
  els.syncModulesBtn.disabled = true;
  try {
    await saveConfig();
    const result = await window.algoAlice.syncFeatureModules();
    state.featureModules = result.featureModules;
    state.moduleValidationRows = [];
    renderFeatureModules();
    const installed = (state.featureModules.modules || []).filter((item) => item.status === 'installed').length;
    const syncErrors = state.featureModules.errors || [];
    if (syncErrors.length) {
      log(`Feature module sync failed: ${syncErrors.join('; ')}`, 'error');
    } else {
      log(`Feature module sync complete. Installed ${installed} module${installed === 1 ? '' : 's'}.`, 'ok');
    }
  } catch (error) {
    log(`Feature module sync failed: ${error.message}`, 'error');
  } finally {
    els.syncModulesBtn.disabled = false;
  }
}

async function exportSupportBundle() {
  els.exportSupportBundleBtn.disabled = true;
  try {
    const result = await window.algoAlice.exportSupportBundle();
    log(`Support bundle exported: ${result.bundleDir}`, 'ok');
  } catch (error) {
    log(`Support bundle failed: ${error.message}`, 'error');
  } finally {
    els.exportSupportBundleBtn.disabled = false;
  }
}

async function restartApp() {
  if (!window.confirm('Restart Trade Assist now?')) return;
  els.restartAppBtn.disabled = true;
  try {
    let result = await window.algoAlice.restartApp({ force: false });
    if (result && result.blocked) {
      const position = result.safety && result.safety.position || {};
      const symbol = position.instrument && position.instrument.symbol || 'active strategy position';
      const force = window.confirm(`A strategy trade is active: ${symbol}. Restart only if broker SL/exit protection is already safe. Force restart now?`);
      if (!force) {
        log('Restart cancelled because a strategy position is active.', 'error');
        return;
      }
      result = await window.algoAlice.restartApp({ force: true });
    }
    if (result && result.restarting) {
      log('Restarting Trade Assist...', 'ok');
    }
  } catch (error) {
    log(`Restart failed: ${error.message}`, 'error');
  } finally {
    els.restartAppBtn.disabled = false;
  }
}

async function cleanupFeatureModules() {
  els.cleanupModulesBtn.disabled = true;
  try {
    const result = await window.algoAlice.cleanupFeatureModules();
    state.featureModules = result.featureModules;
    state.moduleValidationRows = [];
    renderFeatureModules();
    log('Feature module cache cleaned.', 'ok');
  } catch (error) {
    log(`Feature module cleanup failed: ${error.message}`, 'error');
  } finally {
    els.cleanupModulesBtn.disabled = false;
  }
}

async function validateFeatureModules() {
  els.validateModulesBtn.disabled = true;
  try {
    const result = await window.algoAlice.validateFeatureModules();
    const modules = result.modules || [];
    state.moduleValidationRows = modules;
    renderFeatureModules();
    const valid = modules.filter((item) => item.runtimeStatus === 'valid').length;
    const invalid = modules.length - valid;
    log(`Feature module runtime validation: ${valid} valid, ${invalid} invalid.`, invalid ? 'error' : 'ok');
    for (const item of modules.filter((row) => row.runtimeStatus === 'invalid').slice(0, 4)) {
      log(`${item.id || 'module'} invalid: ${item.runtimeError}`, 'error');
    }
  } catch (error) {
    log(`Feature module validation failed: ${error.message}`, 'error');
  } finally {
    els.validateModulesBtn.disabled = false;
  }
}

async function evaluateFeatureModules() {
  els.evaluateModulesBtn.disabled = true;
  try {
    const result = await window.algoAlice.evaluateFeatureModules();
    const rows = result.results || [];
    const accepted = rows.reduce((total, row) => total + ((row.gated && row.gated.accepted || []).length), 0);
    const rejected = rows.reduce((total, row) => total + ((row.gated && row.gated.rejected || []).length), 0);
    log(`Feature module proposals: ${accepted} accepted, ${rejected} rejected by shell gate.`, rejected ? 'error' : 'ok');
    for (const row of rows.slice(0, 4)) {
      const rejectedRows = row.gated && row.gated.rejected || [];
      for (const rejection of rejectedRows.slice(0, 2)) {
        log(`${row.moduleId || 'module'} proposal rejected: ${rejection.reasons.join(', ')}`, 'error');
      }
    }
  } catch (error) {
    log(`Feature module evaluation failed: ${error.message}`, 'error');
  } finally {
    els.evaluateModulesBtn.disabled = false;
  }
}

async function loadStrategyEvaluationReport() {
  if (!isInternalAdminMode()) {
    state.strategyEvaluationReport = null;
    renderStrategyEvaluationReport();
    return;
  }
  try {
    const result = await window.algoAlice.getStrategyEvaluationReport();
    state.strategyEvaluationReport = result.report || null;
    renderStrategyEvaluationReport();
  } catch (_) {
    renderStrategyEvaluationReport();
  }
}

async function runStrategyEvaluationReport() {
  els.runStrategyReportBtn.disabled = true;
  try {
    const result = await window.algoAlice.runStrategyEvaluation();
    state.strategyEvaluationReport = result.report || null;
    renderStrategyEvaluationReport();
    const totals = state.strategyEvaluationReport && state.strategyEvaluationReport.totals || {};
    log(`Strategy report refreshed. Trades ${totals.trades || 0}, premium total ${formatMetric(totals.premiumTotalPoints)}.`, 'ok');
  } catch (error) {
    log(`Strategy report failed: ${error.message}`, 'error');
  } finally {
    els.runStrategyReportBtn.disabled = false;
  }
}

async function checkCandleIntegrity() {
  els.checkCandlesBtn.disabled = true;
  try {
    const result = await window.algoAlice.checkCandleIntegrity();
    state.candleIntegrityReport = result.report || null;
    renderCandleIntegrityReport();
    const totals = state.candleIntegrityReport && state.candleIntegrityReport.totals || {};
    const issueCount = (state.candleIntegrityReport && state.candleIntegrityReport.issues || []).length;
    log(`Candle check complete. Files ${totals.files || 0}, candles ${totals.candles || 0}, issues ${issueCount}.`, issueCount ? 'error' : 'ok');
  } catch (error) {
    log(`Candle check failed: ${error.message}`, 'error');
  } finally {
    els.checkCandlesBtn.disabled = false;
  }
}

async function selectBroker() {
  try {
    const result = await window.algoAlice.setBroker(els.brokerSelect.value);
    state.selectedBroker = result.selectedBroker || els.brokerSelect.value;
    state.brokers = result.brokers || state.brokers;
    state.hasSessionToken = false;
    state.accountSummary = result.accountSummary || null;
    state.instrumentMetadataHealth = result.instrumentMetadataHealth || state.instrumentMetadataHealth;
    els.sessionTokenInput.value = '';
    els.apiKeyInput.value = result.config && result.config.apiKey ? result.config.apiKey : '';
    renderBrokerOptions();
    updateBrokerButtons();
    renderStatus();
    log(`${getSelectedBrokerName()} selected. Login portal loaded.`, 'ok');
  } catch (error) {
    log(error.message, 'error');
  }
}

async function refreshAccountSummary() {
  if (!window.algoAlice) return;
  try {
    const result = await window.algoAlice.refreshAccount();
    state.accountSummary = result.accountSummary || null;
    renderStatus();
  } catch (error) {
    log(`Account refresh failed: ${error.message}`, 'error');
  }
}

async function syncInstrumentMetadata() {
  els.syncMetadataBtn.disabled = true;
  try {
    const result = await window.algoAlice.syncInstrumentMetadata();
    state.accountSummary = result.accountSummary || state.accountSummary;
    state.instrumentMetadataHealth = result.instrumentMetadataHealth || state.instrumentMetadataHealth;
    renderStatus();
    const learned = result.orderBookLearning && result.orderBookLearning.changed || 0;
    const health = state.instrumentMetadataHealth || {};
    log(`Metadata sync complete. CE ${health.ceCount || 0}, PE ${health.peCount || 0}, learned ${learned}.`, health.ok ? 'ok' : 'error');
  } catch (error) {
    log(`Metadata sync failed: ${error.message}`, 'error');
  } finally {
    els.syncMetadataBtn.disabled = false;
  }
}

function renderBrokerOptions() {
  const brokers = state.brokers.length > 0 ? state.brokers : [{ id: 'aliceblue', name: 'Alice Blue' }];
  const html = brokers.map((broker) => `<option value="${escapeHtml(broker.id)}">${escapeHtml(broker.name)}</option>`).join('');
  if (els.brokerSelect.innerHTML !== html) els.brokerSelect.innerHTML = html;
  els.brokerSelect.value = state.selectedBroker;
}

function updateBrokerButtons() {
  const brokerName = getSelectedBrokerName();
  els.openBrokerBtn.textContent = `Open ${brokerName} Login`;
  els.openWatchlistBtn.textContent = `Open ${brokerName} Watchlist`;
}

function getSelectedBrokerName() {
  const broker = state.brokers.find((item) => item.id === state.selectedBroker);
  return broker ? broker.name : 'Broker';
}

function formatStrategySignal(signal) {
  if (!signal) return 'Strategy signal received.';
  if (signal.type === 'ERROR') return `Strategy order failed: ${signal.error || 'unknown error'}`;
  if (signal.type === 'MODULE_PROPOSALS') {
    const time = signal.candle ? formatTime(signal.candle.bucket) : '--';
    return `Module proposals ${time}: accepted ${signal.acceptedCount || 0}, rejected ${signal.rejectedCount || 0}; ${signal.reason || ''}`;
  }
  if (signal.type === 'MODULE_PROPOSAL') {
    const time = signal.candle ? formatTime(signal.candle.bucket) : '--';
    return `Module ${signal.proposalType || 'proposal'} ${time}: ${signal.direction || ''} ${signal.optionType || ''}; confidence ${signal.confidence || 0}; ${signal.moduleId || ''}; ${signal.reason || ''}`;
  }
  const time = signal.candle ? formatTime(signal.candle.bucket) : '--';
  const target = signal.instrument
    ? `${signal.instrument.symbol || signal.instrument.token} (${signal.instrument.token})`
    : 'no tracked ITM option found';
  const orderState = signal.autoTrade
    ? signal.order ? 'auto order enabled' : 'auto order skipped'
    : 'signal only';
  return `ML reversal ${signal.type} ${time}: ${signal.direction || ''} ${signal.optionType || ''} ${target}; ${orderState}; ${signal.reason || ''}`;
}

function applyStoredTheme() {
  state.theme = localStorage.getItem('algoAliceTheme') || 'dark';
  applyTheme();
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('algoAliceTheme', state.theme);
  applyTheme();
}

function applyTheme() {
  document.body.dataset.theme = state.theme;
  els.themeToggleBtn.textContent = state.theme === 'dark' ? '☀' : '☾';
  els.themeToggleBtn.title = state.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  draw();
}

function applyStoredViewMode() {
  state.viewMode = localStorage.getItem('algoAliceViewMode') || (state.brokerVisible ? 'split' : 'app');
  applyViewMode();
}

function handleViewShortcut(event) {
  if (!event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (event.key === '1') {
    event.preventDefault();
    setViewMode('app');
  } else if (event.key === '2') {
    event.preventDefault();
    setViewMode('broker');
  } else if (event.key === '3') {
    event.preventDefault();
    setViewMode('split');
  }
}

function setViewMode(mode) {
  state.viewMode = mode;
  localStorage.setItem('algoAliceViewMode', mode);
  applyViewMode();
}

function applyViewMode() {
  document.body.dataset.viewMode = state.viewMode;
  const nextMode = state.viewMode === 'app'
    ? 'Broker'
    : state.viewMode === 'broker'
      ? 'Split'
      : 'App';
  els.toggleViewBtn.textContent = '⇄';
  els.toggleViewBtn.title = `Toggle view: ${nextMode}`;
  els.overlayToggleViewBtn.textContent = `Toggle View: ${nextMode}`;
  const brokerShouldShow = state.viewMode !== 'app';
  state.brokerVisible = brokerShouldShow;
  if (window.algoAlice) {
    window.algoAlice.setBrokerVisible(brokerShouldShow).catch(() => {});
  }
  requestAnimationFrame(() => {
    syncBrokerBounds();
    draw();
  });
}

async function selectInstrument() {
  const token = els.instrumentSelect.value;
  if (!token) return;
  try {
    const result = await window.algoAlice.setActiveInstrument(token);
    const candles = result.candles || {};
    const latest = (result.instruments || []).find((item) => item.token === result.activeToken);
    state.activeToken = result.activeToken || token;
    state.instruments = result.instruments || state.instruments;
    state.current = candles.current || null;
    state.candles = candles.closed || [];
    state.lastPrice = latest && latest.lastPrice;
    state.lastTickTs = latest && latest.lastTickTs;
    syncTicketFromSelectedInstrument();
    renderStatus();
    draw();
  } catch (error) {
    log(error.message, 'error');
  }
}

function syncTicketFromSelectedInstrument() {
  const selected = getSelectedInstrument();
  if (!selected || !selected.token) return;
  els.symbolInput.value = selected.symbol || '';
  els.tokenInput.value = selected.token || '';
  if (selected.exchange) setSelectValue(els.exchangeInput, selected.exchange);
}

async function placeOrder(action) {
  const order = {
    action,
    symbol: els.symbolInput.value.trim(),
    token: els.tokenInput.value.trim(),
    exchange: els.exchangeInput.value,
    product: els.productInput.value,
    quantity: Number(els.quantityInput.value || 0),
    orderType: els.orderTypeInput.value,
    price: Number(els.priceInput.value || 0),
    triggerPrice: Number(els.triggerInput.value || 0)
  };

  try {
    const result = await window.algoAlice.placeOrder(order);
    recordLocalPosition(order);
    log(`${action} order submitted. ${JSON.stringify(result.result || result).slice(0, 180)}`, 'ok');
    renderStatus();
  } catch (error) {
    log(error.message, 'error');
  }
}

async function addInstrumentMetadata() {
  const metadata = {
    symbol: els.metadataSymbolInput.value.trim(),
    token: els.metadataTokenInput.value.trim(),
    exchange: els.metadataExchangeInput.value
  };
  try {
    const result = await window.algoAlice.addInstrumentMetadata(metadata);
    state.instrumentMetadataHealth = result.instrumentMetadataHealth || state.instrumentMetadataHealth;
    renderInstrumentMetadataHealth();
    if (els.metadataRepairStatus) {
      els.metadataRepairStatus.classList.remove('error');
      els.metadataRepairStatus.innerHTML = '<strong>Broker metadata saved</strong><span>CE/PE mapping health refreshed for the selected broker.</span>';
    }
    log(`Metadata saved for ${metadata.symbol} (${metadata.token})`, 'ok');
  } catch (error) {
    if (els.metadataRepairStatus) {
      els.metadataRepairStatus.classList.add('error');
      els.metadataRepairStatus.innerHTML = `<strong>Metadata not saved</strong><span>${escapeHtml(error.message)}</span>`;
    }
    log(error.message, 'error');
  }
}

async function exitPosition() {
  const selected = getSelectedInstrument();
  const position = selected && state.positions[selected.token];
  const netQty = position ? Number(position.netQty || 0) : 0;
  if (!selected || !selected.token) {
    log('Select a tracked token before exiting a position.', 'error');
    return;
  }
  if (!netQty) {
    log('No local open position for the selected token.', 'error');
    return;
  }

  const previousQty = els.quantityInput.value;
  els.quantityInput.value = Math.abs(netQty);
  await placeOrder(netQty > 0 ? 'SELL' : 'BUY');
  els.quantityInput.value = previousQty;
}

function renderStatus() {
  const account = state.accountSummary || {};
  const accountLabel = account.clientName || account.clientId || account.accountStatus;
  els.brokerStatus.querySelector('strong').textContent = accountLabel ||
    (state.hasSessionToken ? `${getSelectedBrokerName()} Login` : 'Not logged in');
  els.sessionStatus.querySelector('strong').textContent = account.balance != null ? fmt(account.balance) : '--';
  const dayPnl = account.dayPnl != null ? Number(account.dayPnl) : calculateLocalDayPnl();
  els.sensexStatus.querySelector('strong').textContent = Number.isFinite(dayPnl) ? fmt(dayPnl) : '--';
  els.sensexStatus.querySelector('strong').classList.toggle('positive', dayPnl > 0);
  els.sensexStatus.querySelector('strong').classList.toggle('negative', dayPnl < 0);
  const count = state.candles.length + (state.current ? 1 : 0);
  els.candleCount.textContent = `${count} candle${count === 1 ? '' : 's'}`;
  renderInstrumentOptions();
  renderPositionMonitor();
  renderCandleStats();
  renderCandleFocus();
  renderFeatureModules();
  renderInstrumentMetadataHealth();
  renderStrategyEvaluationReport();
  renderLiveTradeMonitor();
  updateTickAge();
  setBrokerPanelVisibility();
}

function renderInstrumentMetadataHealth() {
  if (!els.metadataHealth) return;
  const health = state.instrumentMetadataHealth || {};
  const ceCount = Number(health.ceCount || 0);
  const peCount = Number(health.peCount || 0);
  const missing = Array.isArray(health.missingOptionTypes) ? health.missingOptionTypes : [];
  const title = health.message || 'Broker metadata health is not available yet.';
  const broker = health.broker || state.selectedBroker || 'broker';
  els.metadataHealth.classList.toggle('error', missing.length > 0);
  els.metadataHealth.innerHTML = `
    <div>
      <span class="eyebrow">Broker Metadata</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(String(broker).toUpperCase())} mappings ${escapeHtml(health.total == null ? '--' : health.total)}</small>
    </div>
    <div class="metadata-pills">
      <span data-state="${ceCount > 0 ? 'ready' : 'missing'}">CE ${escapeHtml(ceCount)}</span>
      <span data-state="${peCount > 0 ? 'ready' : 'missing'}">PE ${escapeHtml(peCount)}</span>
    </div>
  `;
}

function hydrateLiveTradeFromPosition(position) {
  if (!position) return null;
  return {
    status: position.status || 'active',
    title: instrumentLabel(position.instrument),
    direction: position.direction || '',
    optionType: position.optionType || '',
    setupKey: position.setupKey || '',
    instrument: position.instrument || null,
    entryTime: position.entryTime || '',
    entryPrice: numberOrNull(position.entryPrice),
    entryPremium: numberOrNull(position.optionEntryPrice),
    peakPremium: numberOrNull(position.optionPeakPrice),
    trailingStop: numberOrNull(position.optionTrailingStop),
    trailingActive: Boolean(position.optionTrailingActive),
    protectiveSl: position.protectiveSl || null,
    reason: 'Restored open strategy position from shell.',
    updatedAt: Date.now()
  };
}

function hydrateLiveTradeFromCooldown(cooldown) {
  if (!cooldown) return null;
  return {
    status: 'blocked',
    title: 'Entry Cooldown Active',
    direction: cooldown.direction || '',
    optionType: cooldown.optionType || '',
    setupKey: cooldown.setupKey || '',
    reason: `${cooldown.reason || 'cooldown'} until ${formatTime(cooldown.expiresAt)}`,
    updatedAt: cooldown.startedAt || Date.now()
  };
}

function updateLiveTradeFromSignal(signal) {
  if (!signal || signal.type === 'MODULE_PROPOSAL' || signal.type === 'MODULE_PROPOSALS') return;
  const type = String(signal.type || '');
  const baseTrade = state.liveTrade || {};
  const instrument = signal.instrument || baseTrade.instrument || null;
  const optionPerformance = signal.optionPerformance || {};
  const performance = signal.performance || {};
  const protectiveSl = signal.protectiveSl || baseTrade.protectiveSl || null;
  const now = Date.now();

  if (type === 'ENTRY' || type === 'ENTRY_ORDERED') {
    state.liveTrade = {
      ...baseTrade,
      status: type === 'ENTRY_ORDERED' ? 'ordered' : 'entry signal',
      title: instrumentLabel(instrument),
      direction: signal.direction || baseTrade.direction || '',
      optionType: signal.optionType || baseTrade.optionType || '',
      setupKey: signal.setupKey || baseTrade.setupKey || '',
      instrument,
      entryTime: signal.candle && signal.candle.bucket || baseTrade.entryTime || now,
      entryPrice: numberOrNull(signal.candle && signal.candle.close) ?? baseTrade.entryPrice,
      entryPremium: numberOrNull(optionPerformance.entryPremium) ?? baseTrade.entryPremium,
      peakPremium: numberOrNull(optionPerformance.entryPremium) ?? baseTrade.peakPremium,
      trailingStop: trailingInitialStop(optionPerformance) ?? baseTrade.trailingStop,
      trailingActive: false,
      protectiveSl,
      result: signal.result || baseTrade.result,
      reason: signal.reason || baseTrade.reason || '',
      updatedAt: now
    };
    recordLiveTradeEvent(type === 'ENTRY_ORDERED' ? 'Entry order submitted' : 'Entry signal detected', 'ok');
  } else if (type === 'PROTECTIVE_SL' || type === 'PROTECTIVE_SL_ORDERED' || type === 'PROTECTIVE_SL_MODIFY' || type === 'PROTECTIVE_SL_MODIFY_ORDERED') {
    state.liveTrade = {
      ...baseTrade,
      status: type.includes('MODIFY') ? 'SL trailing' : 'SL protected',
      protectiveSl,
      trailingStop: numberOrNull(protectiveSl && (protectiveSl.triggerPrice || protectiveSl.pendingTriggerPrice)) ?? baseTrade.trailingStop,
      trailingActive: true,
      reason: signal.reason || baseTrade.reason || '',
      updatedAt: now
    };
    recordLiveTradeEvent(formatProtectiveSlEvent(type, protectiveSl), 'ok');
  } else if (type === 'EXIT' || type === 'EXIT_ORDERED' || type === 'PROTECTIVE_SL_CLOSED') {
    state.liveTrade = {
      ...baseTrade,
      status: type === 'PROTECTIVE_SL_CLOSED' ? 'closed by SL' : 'exit',
      exitTime: signal.candle && signal.candle.bucket || now,
      exitPrice: numberOrNull(performance.exitPrice),
      targetPoints: numberOrNull(performance.indexPoints),
      optionExitPremium: numberOrNull(performance.optionExitPrice || signal.exitPremium),
      reason: signal.reason || signal.error || baseTrade.reason || '',
      updatedAt: now
    };
    recordLiveTradeEvent(type === 'PROTECTIVE_SL_CLOSED' ? 'Protective SL closed position' : 'Exit signal/order emitted', 'ok');
  } else if (type === 'RISK_REJECTED' || type === 'ORDER_RATE_LIMITED' || type === 'ERROR') {
    state.liveTrade = {
      ...baseTrade,
      status: type === 'ERROR' ? 'error' : 'blocked',
      reason: signal.reason || signal.error || baseTrade.reason || '',
      updatedAt: now
    };
    recordLiveTradeEvent(signal.reason || signal.error || type, 'error');
  }

  renderLiveTradeMonitor();
}

function renderLiveTradeMonitor() {
  if (!els.liveTradeTitle) return;
  const trade = state.liveTrade;
  if (!trade) {
    els.liveTradeTitle.textContent = 'No Active Strategy Trade';
    setTradeStatus('Idle', 'idle');
    els.liveTradeSide.textContent = '--';
    els.liveTradeEntry.textContent = '--';
    els.liveTradeLtp.textContent = '--';
    els.liveTradePeak.textContent = '--';
    els.liveTradeTrail.textContent = '--';
    els.liveTradePnl.textContent = '--';
    els.liveTradeSl.textContent = '--';
    els.liveTradeUpdated.textContent = '--';
    els.liveTradeReason.textContent = 'Waiting for strategy activity.';
    renderLiveTradeEvents();
    return;
  }

  const ltp = latestPriceForInstrument(trade.instrument);
  const entryPremium = numberOrNull(trade.entryPremium);
  const peakPremium = Math.max(
    numberOrNull(trade.peakPremium) ?? entryPremium ?? 0,
    Number.isFinite(ltp) ? ltp : 0
  );
  if (Number.isFinite(peakPremium) && peakPremium > 0) trade.peakPremium = peakPremium;
  const closed = ['exit', 'closed by SL'].includes(trade.status);
  const pnlPoints = closed && Number.isFinite(Number(trade.optionExitPremium)) && Number.isFinite(entryPremium)
    ? Number(trade.optionExitPremium) - entryPremium
    : Number.isFinite(ltp) && Number.isFinite(entryPremium)
      ? ltp - entryPremium
      : trade.targetPoints;
  const statusClass = trade.status === 'error' || trade.status === 'blocked'
    ? 'error'
    : closed
      ? 'closed'
      : trade.status === 'idle'
        ? 'idle'
        : 'active';

  els.liveTradeTitle.textContent = trade.title || instrumentLabel(trade.instrument) || 'Strategy Trade';
  setTradeStatus(statusLabel(trade.status), statusClass);
  els.liveTradeSide.textContent = `${trade.direction || '--'} ${trade.optionType || ''}`.trim();
  els.liveTradeEntry.textContent = formatTradeEntry(trade);
  els.liveTradeLtp.textContent = Number.isFinite(ltp) ? fmt(ltp) : '--';
  els.liveTradePeak.textContent = Number.isFinite(peakPremium) && peakPremium > 0 ? fmt(peakPremium) : '--';
  els.liveTradeTrail.textContent = formatTrail(trade);
  els.liveTradePnl.textContent = Number.isFinite(pnlPoints) ? fmt(pnlPoints) : '--';
  els.liveTradePnl.classList.toggle('positive', Number(pnlPoints) > 0);
  els.liveTradePnl.classList.toggle('negative', Number(pnlPoints) < 0);
  els.liveTradeSl.textContent = formatProtectiveSl(trade.protectiveSl);
  els.liveTradeUpdated.textContent = trade.updatedAt ? formatTime(trade.updatedAt) : '--';
  els.liveTradeReason.textContent = trade.reason || 'Strategy trade is being monitored.';
  renderLiveTradeEvents();
}

function setTradeStatus(label, statusClass) {
  els.liveTradeStatus.textContent = label;
  els.liveTradeStatus.className = `trade-state ${statusClass || 'idle'}`;
}

function renderLiveTradeEvents() {
  if (!els.liveTradeEvents) return;
  const rows = state.liveTradeEvents.slice(0, 6);
  els.liveTradeEvents.innerHTML = rows.length
    ? rows.map((event) => `<span class="${escapeAttr(event.tone || '')}">${escapeHtml(formatTime(event.ts))} ${escapeHtml(event.message)}</span>`).join('')
    : '<span>Waiting for order activity</span>';
}

function recordLiveTradeEvent(message, tone = '') {
  if (!message) return;
  state.liveTradeEvents.unshift({ message, tone, ts: Date.now() });
  state.liveTradeEvents = state.liveTradeEvents.slice(0, 20);
}

function latestPriceForInstrument(instrument) {
  const token = String(instrument && (instrument.token || instrument.instrument_token) || '').trim();
  const found = token ? state.instruments.find((item) => String(item.token) === token) : null;
  if (found && found.lastPrice != null) return Number(found.lastPrice);
  if (token && state.activeToken === token && state.lastPrice != null) return Number(state.lastPrice);
  return null;
}

function instrumentLabel(instrument) {
  if (!instrument) return '';
  return instrument.symbol || instrument.trading_symbol || instrument.token || instrument.instrument_token || '';
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function trailingInitialStop(optionPerformance = {}) {
  const entryPremium = numberOrNull(optionPerformance.entryPremium);
  const initialStopLossPoints = numberOrNull(optionPerformance.trailingConfig && optionPerformance.trailingConfig.initialStopLossPoints);
  if (!Number.isFinite(entryPremium) || !Number.isFinite(initialStopLossPoints)) return null;
  return entryPremium - initialStopLossPoints;
}

function formatTradeEntry(trade) {
  const premium = Number.isFinite(Number(trade.entryPremium)) ? fmt(trade.entryPremium) : '--';
  const time = trade.entryTime ? formatTime(trade.entryTime) : '--';
  return `${premium} @ ${time}`;
}

function formatTrail(trade) {
  const stop = Number.isFinite(Number(trade.trailingStop)) ? fmt(trade.trailingStop) : '--';
  return trade.trailingActive ? `${stop} active` : stop;
}

function formatProtectiveSl(sl) {
  if (!sl) return 'not placed';
  const trigger = sl.pendingTriggerPrice || sl.triggerPrice;
  const orderNo = sl.orderNo ? ` #${sl.orderNo}` : '';
  return `${sl.status || 'pending'}${trigger ? ` @ ${fmt(trigger)}` : ''}${orderNo}`;
}

function formatProtectiveSlEvent(type, sl) {
  const label = type.includes('MODIFY') ? 'Protective SL modify' : 'Protective SL';
  return `${label} ${formatProtectiveSl(sl)}`;
}

function statusLabel(status) {
  if (!status) return 'Active';
  return status.replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderFeatureModules() {
  if (!els.moduleStatus) return;
  const status = state.featureModules || {};
  const entitlements = status.entitlements || [];
  const modules = status.modules || [];
  const errors = status.errors || [];
  const installed = status.moduleSummary
    ? Number(status.moduleSummary.installed || 0)
    : modules.filter((item) => item.status === 'installed').length;
  const title = status.configured
    ? `${entitlements.length} feature${entitlements.length === 1 ? '' : 's'} entitled, ${installed} module${installed === 1 ? '' : 's'} cached`
    : 'Feature modules not configured';
  const lines = [];
  if (status.lastSyncAt) lines.push(`Last sync ${formatDateTime(status.lastSyncAt)}`);
  if (status.deviceId) lines.push(`Device ${status.deviceId}`);
  if (status.offlineGrace && status.offlineGrace.active) lines.push(`Offline grace until ${formatDateTime(status.offlineGrace.expiresAt)}`);
  else if (status.offlineGrace && status.offlineGrace.reason) lines.push(`Offline grace: ${status.offlineGrace.reason}`);
  if (status.manifestExpiresAt) lines.push(`License expires ${formatDateTime(status.manifestExpiresAt)}`);
  if (status.lastStartupCleanupAt) lines.push(`Startup cleanup ${formatDateTime(status.lastStartupCleanupAt)}`);
  if (status.lastCleanupAt) lines.push(`Last cleanup ${formatDateTime(status.lastCleanupAt)}`);
  if (entitlements.length) lines.push(`Features: ${entitlements.map((item) => item.name || item.id).join(', ')}`);
  if (errors.length) lines.push(`Errors: ${errors.join(' | ')}`);
  els.moduleStatus.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(lines.join(' | ') || 'Remote strategy features will stay disabled until license sync succeeds.')}</span>`;
  els.moduleStatus.classList.toggle('error', errors.length > 0);
  renderModuleValidationTable(modules);
}

function renderModuleValidationTable(modules = []) {
  if (!els.moduleValidationBody) return;
  const validationByKey = new Map((state.moduleValidationRows || []).map((row) => [`${row.id || ''}:${row.version || ''}`, row]));
  if (!modules.length) {
    els.moduleValidationBody.innerHTML = '<tr><td colspan="6">No modules cached</td></tr>';
    return;
  }
  els.moduleValidationBody.innerHTML = modules.map((module) => {
    const validation = validationByKey.get(`${module.id || ''}:${module.version || ''}`) || {};
    const runtimeStatus = validation.runtimeStatus || 'not checked';
    const runtimeError = validation.runtimeError || module.error || '';
    const featureIds = (module.featureIds || []).join(', ') || '--';
    const expiresAt = module.expiresAt ? formatDateTime(module.expiresAt) : '--';
    const cacheStatus = module.status || '--';
    const runtimeClass = runtimeStatus === 'valid'
      ? 'ok'
      : runtimeStatus === 'invalid' || runtimeError
        ? 'error'
        : '';
    return `
      <tr>
        <td>${escapeHtml(module.id || '--')}</td>
        <td>${escapeHtml(module.version || '--')}</td>
        <td>${escapeHtml(featureIds)}</td>
        <td>${escapeHtml(cacheStatus)}</td>
        <td class="${runtimeClass}">${escapeHtml(runtimeError || runtimeStatus)}</td>
        <td>${escapeHtml(expiresAt)}</td>
      </tr>
    `;
  }).join('');
}

function renderStrategyEvaluationReport() {
  if (!els.strategyReport) return;
  const report = state.strategyEvaluationReport;
  if (!report) {
    els.strategyReport.innerHTML = '<strong>Strategy evaluation not loaded</strong><span>Refresh the report to replay saved candle days and inspect premium P&L metrics.</span>';
    return;
  }
  const totals = report.totals || {};
  const days = report.days || [];
  const setups = report.setupStats || [];
  const trades = report.recentTrades || [];
  const metricCards = [
    ['Trades', totals.trades],
    ['Premium Rows', totals.premiumEvaluated],
    ['Premium Win %', `${formatMetric(totals.premiumWinRatePct)}%`],
    ['Premium Total', formatMetric(totals.premiumTotalPoints)],
    ['Premium Avg', formatMetric(totals.premiumAvgPoints)],
    ['Best/Worst', `${formatMetric(totals.bestPremiumPoints)} / ${formatMetric(totals.worstPremiumPoints)}`],
    ['Trail/Initial SL', `${totals.trailingExits || 0} / ${totals.initialSlExits || 0}`],
    ['Index Total', formatMetric(totals.indexTotalPoints)]
  ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value == null ? '--' : value)}</strong></div>`).join('');
  const dayRows = days.slice(0, 5).map((day) => `
    <tr>
      <td>${escapeHtml(day.day || '--')}</td>
      <td>${escapeHtml(day.trades || 0)}</td>
      <td>${escapeHtml(`${formatMetric(day.premiumWinRatePct)}%`)}</td>
      <td>${escapeHtml(formatMetric(day.premiumTotalPoints))}</td>
    </tr>
  `).join('');
  const setupRows = setups.slice(0, 5).map((setup) => `
    <tr>
      <td>${escapeHtml(setup.setupKey || '--')}</td>
      <td>${escapeHtml(setup.trades || 0)}</td>
      <td>${escapeHtml(`${formatMetric(setup.premiumWinRatePct)}%`)}</td>
      <td>${escapeHtml(formatMetric(setup.premiumAvgPoints))}</td>
    </tr>
  `).join('');
  const tradeRows = trades.slice(0, 5).map((trade) => `
    <tr>
      <td>${escapeHtml(trade.day || '--')}</td>
      <td>${escapeHtml(trade.entryTime || '--')}</td>
      <td>${escapeHtml(`${trade.direction || ''} ${trade.optionType || ''}`.trim() || '--')}</td>
      <td>${escapeHtml(formatMetric(trade.targetPremiumPoints))}</td>
      <td>${escapeHtml(trade.premiumExitMode || '--')}</td>
    </tr>
  `).join('');

  els.strategyReport.innerHTML = `
    <div class="strategy-report-head">
      <strong>Strategy Evaluation</strong>
      <span>${escapeHtml(report.generatedAt ? `Generated ${formatDateTime(report.generatedAt)}` : 'Generated time unavailable')}</span>
    </div>
    <div class="strategy-report-metrics">${metricCards}</div>
    <div class="strategy-report-tables">
      ${renderMiniReportTable('Recent Days', ['Day', 'Trades', 'Win %', 'Premium'], dayRows)}
      ${renderMiniReportTable('Best Setups', ['Setup', 'Trades', 'Win %', 'Avg'], setupRows)}
      ${renderMiniReportTable('Recent Trades', ['Day', 'Entry', 'Side', 'Pts', 'Exit'], tradeRows)}
    </div>
  `;
}

function renderCandleIntegrityReport() {
  if (!els.candleIntegrityReport) return;
  const report = state.candleIntegrityReport;
  if (!report) {
    els.candleIntegrityReport.innerHTML = '<strong>Candle integrity not checked</strong><span>Run Check Candles to inspect saved candle files for gaps, duplicates, malformed rows, and stale instruments.</span>';
    return;
  }
  const totals = report.totals || {};
  const issues = report.issues || [];
  const instruments = report.instruments || [];
  const metricCards = [
    ['Files', totals.files],
    ['Candles', totals.candles],
    ['Parse', totals.parseErrors],
    ['Invalid', totals.invalidRows],
    ['Duplicate', totals.duplicateBuckets],
    ['Gaps', totals.gaps],
    ['Stale', totals.staleInstruments],
    ['Issues', issues.length]
  ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value == null ? '--' : value)}</strong></div>`).join('');
  const instrumentRows = instruments.slice(0, 8).map((item) => `
    <tr>
      <td>${escapeHtml(item.instrument || '--')}</td>
      <td>${escapeHtml(item.files || 0)}</td>
      <td>${escapeHtml(item.candles || 0)}</td>
      <td>${escapeHtml(item.lastBucket ? formatDateTime(item.lastBucket) : '--')}</td>
      <td>${escapeHtml(item.stale ? `${item.staleMinutes || 0}m` : 'fresh')}</td>
    </tr>
  `).join('');
  const issueRows = issues.slice(0, 8).map((issue) => `
    <tr>
      <td>${escapeHtml(issue.type || '--')}</td>
      <td>${escapeHtml(issue.instrument || '--')}</td>
      <td>${escapeHtml(issue.file || '--')}</td>
      <td>${escapeHtml(issue.message || '--')}</td>
    </tr>
  `).join('');

  els.candleIntegrityReport.innerHTML = `
    <div class="strategy-report-head">
      <strong>Candle Integrity</strong>
      <span>${escapeHtml(report.checkedAt ? `Checked ${formatDateTime(report.checkedAt)}` : 'Checked time unavailable')}</span>
    </div>
    <div class="strategy-report-metrics">${metricCards}</div>
    <div class="strategy-report-tables">
      ${renderMiniReportTable('Latest Instruments', ['Instrument', 'Files', 'Candles', 'Latest', 'Stale'], instrumentRows)}
      ${renderMiniReportTable('Issues', ['Type', 'Instrument', 'File', 'Message'], issueRows)}
    </div>
  `;
  els.candleIntegrityReport.classList.toggle('error', issues.length > 0);
}

function renderMiniReportTable(title, headings, rows) {
  return `
    <div>
      <strong>${escapeHtml(title)}</strong>
      <table>
        <thead><tr>${headings.map((heading) => `<th>${escapeHtml(heading)}</th>`).join('')}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${headings.length}">No rows</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function formatMetric(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function normalizeConfiguredSecret(value) {
  const text = String(value || '').trim();
  return text === '[configured]' ? text : text;
}

function calculateLocalDayPnl() {
  return Object.values(state.positions).reduce((total, position) => {
    const instrument = state.instruments.find((item) => item.token === position.symbol_id || item.token === position.token);
    const selected = getSelectedInstrument();
    const ltp = instrument && instrument.lastPrice != null
      ? Number(instrument.lastPrice)
      : selected && selected.token === position.token && selected.lastPrice != null
        ? Number(selected.lastPrice)
        : Number(state.lastPrice);
    const netQty = Number(position.netQty || 0);
    if (!netQty || !Number.isFinite(ltp)) return total;
    return total + ((ltp - Number(position.avgPrice || 0)) * netQty);
  }, 0);
}

function renderInstrumentOptions() {
  const currentValue = els.instrumentSelect.value;
  const nextValue = state.activeToken || currentValue;
  const options = state.instruments.length > 0
    ? state.instruments
    : [{ token: '', symbol: 'Waiting for ticks' }];
  const html = options.map((item) => {
    const value = escapeHtml(item.token || '');
    const label = item.token
      ? `${item.symbol || item.token} ${item.lastPrice != null ? fmt(item.lastPrice) : ''}`.trim()
      : item.symbol;
    return `<option value="${value}">${escapeHtml(label)}</option>`;
  }).join('');

  if (els.instrumentSelect.innerHTML !== html) {
    els.instrumentSelect.innerHTML = html;
  }
  els.instrumentSelect.value = nextValue;
}

function renderPositionMonitor() {
  const selected = getSelectedInstrument();
  const token = selected && selected.token;
  const position = token && state.positions[token] ? state.positions[token] : { netQty: 0, avgPrice: 0 };
  const ltp = selected && selected.lastPrice != null ? Number(selected.lastPrice) : Number(state.lastPrice);
  const latestCandle = state.current || state.candles[state.candles.length - 1] || null;
  const netQty = Number(position.netQty || 0);
  const pnl = Number.isFinite(ltp) && netQty ? (ltp - Number(position.avgPrice || 0)) * netQty : 0;

  els.selectedInstrumentLabel.textContent = selected && selected.token
    ? `${selected.symbol || selected.token} (${selected.exchange || 'EXCH --'})`
    : 'Waiting for token';
  els.positionQty.textContent = String(netQty);
  els.positionAvg.textContent = position.avgPrice ? fmt(position.avgPrice) : '--';
  els.positionLtp.textContent = Number.isFinite(ltp) ? fmt(ltp) : '--';
  els.positionPnl.textContent = netQty ? fmt(pnl) : '--';
  els.positionPnl.classList.toggle('positive', pnl > 0);
  els.positionPnl.classList.toggle('negative', pnl < 0);
  els.patternLabel.textContent = latestCandle && latestCandle.pattern
    ? `${latestCandle.pattern} (${latestCandle.patternBias || 'neutral'})`
    : '--';
  els.patternLabel.classList.toggle('bullish', latestCandle && latestCandle.patternBias === 'bullish');
  els.patternLabel.classList.toggle('bearish', latestCandle && latestCandle.patternBias === 'bearish');
  els.patternLabel.classList.toggle('neutral', !latestCandle || latestCandle.patternBias === 'neutral');
}

function renderCandleStats() {
  const selected = getSelectedInstrument();
  els.statsInstrumentLabel.textContent = selected && selected.token
    ? `${selected.symbol || selected.token} (${selected.token})`
    : 'Waiting for ticks';

  const rows = [...state.candles, state.current]
    .filter(Boolean)
    .slice(-8)
    .reverse();

  if (rows.length === 0) {
    els.candleStatsBody.innerHTML = '<tr><td colspan="13">Waiting for Market Watch ticks</td></tr>';
    return;
  }

  els.candleStatsBody.innerHTML = rows.map((candle) => {
    const isLive = state.current && candle.bucket === state.current.bucket;
    const bias = candle.patternBias || candle.direction || 'neutral';
    return `
      <tr class="${isLive ? 'live-row' : ''}">
        <td>${formatTime(candle.bucket)}</td>
        <td>${isLive ? 'Live' : 'Closed'}</td>
        <td class="bias-${escapeAttr(bias)}">${escapeHtml(candle.pattern || candle.direction || '--')}</td>
        <td>${fmt(candle.open)}</td>
        <td>${fmt(candle.high)}</td>
        <td>${fmt(candle.low)}</td>
        <td>${fmt(candle.close)}</td>
        <td>${candle.tickCount || 0}</td>
        <td>${fmt(candle.range || 0)}</td>
        <td>${fmt(candle.body || 0)}</td>
        <td>${candle.highBreaks || 0} (${fmtPct(candle.highBreakPct)})</td>
        <td>${candle.lowBreaks || 0} (${fmtPct(candle.lowBreakPct)})</td>
        <td>${fmtPct(candle.topPct)} / ${fmtPct(candle.midPct)} / ${fmtPct(candle.bottomPct)}</td>
      </tr>
    `;
  }).join('');
}

function showLatestFocusCandle() {
  state.focusedCandle = state.current || state.candles[state.candles.length - 1] || null;
  renderCandleFocus();
}

function focusCandleFromPointer(event) {
  const rect = els.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hit = state.hitBoxes.find((box) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
  if (!hit) return;
  state.focusedCandle = hit.candle;
  renderCandleFocus();
}

function renderCandleFocus() {
  const candle = state.focusedCandle || state.current || state.candles[state.candles.length - 1] || null;
  if (!candle) {
    els.focusTime.textContent = '--';
    els.focusPattern.textContent = 'Hover a candle';
    els.focusBias.textContent = 'Waiting for chart data';
    [els.focusOpen, els.focusHigh, els.focusLow, els.focusClose, els.focusTicks, els.focusRange, els.focusHighBreaks, els.focusLowBreaks, els.focusZones]
      .forEach((el) => { el.textContent = '--'; });
    els.candleFocus.dataset.bias = 'neutral';
    return;
  }

  const bias = candle.patternBias || candle.direction || 'neutral';
  els.candleFocus.dataset.bias = bias;
  els.focusTime.textContent = formatTime(candle.bucket);
  els.focusPattern.textContent = candle.pattern || candle.direction || 'Candle';
  els.focusBias.textContent = `${bias} | strength ${candle.patternStrength || 0}/5`;
  els.focusOpen.textContent = fmt(candle.open);
  els.focusHigh.textContent = fmt(candle.high);
  els.focusLow.textContent = fmt(candle.low);
  els.focusClose.textContent = fmt(candle.close);
  els.focusTicks.textContent = String(candle.tickCount || 0);
  els.focusRange.textContent = fmt(candle.range || 0);
  els.focusHighBreaks.textContent = `${candle.highBreaks || 0} (${fmtPct(candle.highBreakPct)})`;
  els.focusLowBreaks.textContent = `${candle.lowBreaks || 0} (${fmtPct(candle.lowBreakPct)})`;
  els.focusZones.textContent = `${fmtPct(candle.topPct)} / ${fmtPct(candle.midPct)} / ${fmtPct(candle.bottomPct)}`;
}

function recordLocalPosition(order) {
  const token = String(order.token || '').trim();
  const qty = Number(order.quantity || 0);
  if (!token || !qty) return;

  const side = String(order.action || '').toUpperCase();
  const signedQty = side === 'SELL' ? -qty : qty;
  const fillPrice = estimatedFillPrice(order);
  const current = state.positions[token] || { netQty: 0, avgPrice: 0 };
  const nextQty = Number(current.netQty || 0) + signedQty;
  const currentQty = Number(current.netQty || 0);
  let nextAvg = Number(current.avgPrice || 0);

  if (nextQty === 0) {
    nextAvg = 0;
  } else if (currentQty === 0 || Math.sign(currentQty) !== Math.sign(nextQty)) {
    nextAvg = fillPrice;
  } else if (Math.sign(currentQty) === Math.sign(signedQty)) {
    nextAvg = ((Math.abs(currentQty) * nextAvg) + (Math.abs(signedQty) * fillPrice)) / Math.abs(nextQty);
  }

  state.positions[token] = {
    symbol: order.symbol,
    token,
    exchange: order.exchange,
    netQty: nextQty,
    avgPrice: nextAvg
  };
}

function estimatedFillPrice(order) {
  const explicitPrice = Number(order.price || 0);
  if (explicitPrice > 0) return explicitPrice;
  const selected = getSelectedInstrument();
  const ltp = selected && selected.lastPrice != null ? Number(selected.lastPrice) : Number(state.lastPrice);
  return Number.isFinite(ltp) ? ltp : 0;
}

function getSelectedInstrument() {
  return state.instruments.find((item) => item.token === state.activeToken) || null;
}

function setSelectValue(select, value) {
  const normalized = String(value || '').toUpperCase();
  if (!normalized) return;
  const exists = Array.from(select.options).some((option) => option.value === normalized);
  if (!exists) select.add(new Option(normalized, normalized));
  select.value = normalized;
}

function setBrokerPanelVisibility() {
  document.body.classList.toggle('broker-visible', state.brokerVisible);
  requestAnimationFrame(syncBrokerBounds);
}

function syncBrokerBounds() {
  if (!window.algoAlice || !els.brokerHost) return;
  if (state.viewMode === 'app' || !state.brokerVisible) {
    window.algoAlice.setBrokerBounds({ x: 0, y: 0, width: 1, height: 1 }).catch(() => {});
    return;
  }

  const rect = state.viewMode === 'broker'
    ? { left: 0, top: 48, right: window.innerWidth, bottom: window.innerHeight }
    : els.brokerHost.getBoundingClientRect();
  const x = Math.max(0, rect.left);
  const y = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  if (right <= x || bottom <= y) {
    window.algoAlice.setBrokerBounds({ x: 0, y: 0, width: 1, height: 1 }).catch(() => {});
    return;
  }

  window.algoAlice.setBrokerBounds({
    x,
    y,
    width: right - x,
    height: bottom - y
  }).catch(() => {});
}

function updateTickAge() {
  if (!state.lastTickTs) {
    els.lastTickAge.textContent = 'no ticks';
    return;
  }
  const age = Math.max(0, Math.floor((Date.now() - state.lastTickTs) / 1000));
  els.lastTickAge.textContent = age < 2 ? 'live' : `${age}s ago`;
}

function draw() {
  const size = resizeCanvas();
  const width = size.width;
  const height = size.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = cssVar('--canvas-bg', '#04070e');
  ctx.fillRect(0, 0, width, height);

  const candles = [...state.candles, state.current].filter(Boolean).slice(-36);
  state.hitBoxes = [];
  if (candles.length === 0) {
    drawEmpty(width, height);
    return;
  }

  const pad = { left: 70, right: 28, top: 34, bottom: 62 };
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const range = Math.max(max - min, 1);
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const slot = plotW / Math.max(candles.length, 1);
  const candleW = Math.min(42, Math.max(14, slot * 0.52));

  drawGrid(pad, width, height, min, max);

  candles.forEach((candle, index) => {
    const x = pad.left + slot * index + slot / 2;
    const yHigh = yFor(candle.high, min, range, pad, plotH);
    const yLow = yFor(candle.low, min, range, pad, plotH);
    const yOpen = yFor(candle.open, min, range, pad, plotH);
    const yClose = yFor(candle.close, min, range, pad, plotH);
    const bull = candle.close >= candle.open;
    const color = bull ? '#24d77f' : '#ff4d5e';
    const fill = bull ? 'rgba(36, 215, 127, 0.22)' : 'rgba(255, 77, 94, 0.25)';
    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(Math.abs(yClose - yOpen), 4);

    drawZones(candle, x, yHigh, yLow, candleW);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    ctx.fillStyle = fill;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    roundRect(ctx, x - candleW / 2, bodyTop, candleW, bodyH, 5, true, true);

    ctx.fillStyle = '#73809a';
    ctx.font = '700 11px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(formatTime(candle.bucket), x, height - 28);

    state.hitBoxes.push({
      x: x - slot / 2,
      y: pad.top,
      w: slot,
      h: plotH,
      candle
    });
  });
}

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const nextW = Math.floor(rect.width * dpr);
  const nextH = Math.floor(rect.height * dpr);
  if (els.canvas.width !== nextW || els.canvas.height !== nextH) {
    els.canvas.width = nextW;
    els.canvas.height = nextH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

function drawGrid(pad, width, height, min, max) {
  const plotH = height - pad.top - pad.bottom;
  const logicalW = width;
  ctx.strokeStyle = 'rgba(89, 105, 139, 0.18)';
  ctx.fillStyle = '#8b96ad';
  ctx.font = '700 12px ui-sans-serif, system-ui';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i += 1) {
    const y = pad.top + (plotH / 5) * i;
    const price = max - ((max - min) / 5) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(logicalW - pad.right, y);
    ctx.stroke();
    ctx.fillText(fmt(price), pad.left - 10, y + 4);
  }
}

function drawZones(candle, x, yHigh, yLow, candleW) {
  const h = Math.max(yLow - yHigh, 6);
  const zoneX = x - candleW / 2 - 13;
  const zoneW = 8;
  const bottomH = h * ((candle.bottomPct || 0) / 100);
  const midH = h * ((candle.midPct || 0) / 100);
  const topH = h * ((candle.topPct || 0) / 100);
  ctx.fillStyle = 'rgba(79, 140, 255, 0.75)';
  roundRect(ctx, zoneX, yLow - bottomH, zoneW, bottomH, 3, true, false);
  ctx.fillStyle = 'rgba(141, 99, 255, 0.75)';
  roundRect(ctx, zoneX, yLow - bottomH - midH, zoneW, midH, 3, true, false);
  ctx.fillStyle = 'rgba(255, 173, 51, 0.75)';
  roundRect(ctx, zoneX, yHigh, zoneW, topH, 3, true, false);
}

function drawEmpty(width, height) {
  ctx.fillStyle = '#7f8aa2';
  ctx.font = '800 18px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(`Waiting for Market Watch ticks from ${getSelectedBrokerName()}...`, width / 2, height / 2);
}

function yFor(price, min, range, pad, plotH) {
  return pad.top + (1 - (price - min) / range) * plotH;
}

function log(message, tone = '') {
  const line = document.createElement('div');
  line.className = `log-line ${tone}`.trim();
  line.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  els.eventLog.prepend(line);
  while (els.eventLog.children.length > 80) {
    els.eventLog.lastElementChild.remove();
  }
}

function formatTime(ts) {
  if (!ts) return '--';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function fmt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return number.toFixed(2);
}

function fmtPct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return `${number.toFixed(1)}%`;
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function escapeAttr(value) {
  return String(value || '').replace(/[^a-z0-9_-]/gi, '');
}

function cssVar(name, fallback) {
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();
  return value || fallback;
}

function roundRect(context, x, y, width, height, radius, fill, stroke) {
  const safeH = Math.max(height, 1);
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(safeH) / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + safeH, r);
  context.arcTo(x + width, y + safeH, x, y + safeH, r);
  context.arcTo(x, y + safeH, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
  if (fill) context.fill();
  if (stroke) context.stroke();
}

init().catch((error) => log(error.message, 'error'));
