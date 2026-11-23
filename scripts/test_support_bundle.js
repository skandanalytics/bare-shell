const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildSupportBundle,
  redactText,
  sanitizeForSupport
} = require('../src/support_bundle');
const { buildObservabilitySnapshot } = require('../src/observability_snapshot');

function main() {
  assertRedactionHelpers();
  assertSupportBundle();
  console.log('support bundle tests passed');
}

function assertRedactionHelpers() {
  const sanitized = sanitizeForSupport({
    sessionToken: 'secret-session',
    apiKey: 'secret-api-key',
    licenseKey: 'secret-license',
    clientId: 'AB123',
    clientName: 'Customer Name',
    balance: 1000,
    nested: {
      signature: 'module-signature'
    },
    manifestPath: path.join(os.homedir(), 'Library', 'Application Support', 'Trade Assist', 'data_store_manifest.json')
  });
  assert.equal(sanitized.sessionToken, '[REDACTED]');
  assert.equal(sanitized.apiKey, '[REDACTED]');
  assert.equal(sanitized.licenseKey, '[REDACTED]');
  assert.match(sanitized.clientId, /^\[HASH:/);
  assert.equal(sanitized.clientName, '[REDACTED_NAME]');
  assert.equal(sanitized.balance, 1000);
  assert.equal(sanitized.nested.signature, '[REDACTED]');
  assert.equal(sanitized.manifestPath.startsWith('~'), true);
  assert.equal(redactText('token=abc123&x=1').includes('abc123'), false);
}

function assertSupportBundle() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'support-bundle-test-'));
  const userDataDir = path.join(root, 'userData');
  const dataDir = path.join(userDataDir, 'data');
  fs.mkdirSync(path.join(dataDir, 'market_candles', 'SENSEX_1'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'modules', 'premium', '2026.11.19'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'strategy_events_aliceblue.jsonl'), `${JSON.stringify({
    type: 'ENTRY_SIGNAL',
    sessionToken: 'secret-session',
    clientId: 'AB123'
  })}\n`);
  fs.writeFileSync(path.join(dataDir, 'broker_api_discovery_2026-11-19.jsonl'), `${JSON.stringify({
    capturedAt: '2026-11-19T09:30:00.000Z',
    method: 'POST',
    status: 200,
    url: 'https://broker.example.test/account?token=secret-token&clientId=AB123',
    requestHeaders: { authorization: 'Bearer secret-token', accept: 'application/json' },
    bodyPreview: '{"sessionToken":"secret-session","balance":1000}'
  })}\n`);
  fs.writeFileSync(path.join(dataDir, 'market_candles', 'SENSEX_1', '2026-11-19.jsonl'), [
    JSON.stringify({ bucket: '2026-11-19T09:30:00.000Z', open: 1, close: 2 }),
    JSON.stringify({ bucket: '2026-11-19T09:31:00.000Z', open: 2, close: 3 })
  ].join('\n'));
  fs.writeFileSync(path.join(dataDir, 'modules', 'premium', '2026.11.19', 'module.js'), 'const secret = "premium source";');
  const configPath = path.join(userDataDir, 'algo_alice_blue_config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    sessionToken: 'secret-session',
    apiKey: 'secret-api-key',
    featureModuleLicenseKey: 'secret-license',
    selectedBroker: 'aliceblue'
  }));

  const result = buildSupportBundle({
    appVersion: '0.1.0',
    userDataDir,
    dataDir,
    configPath,
    config: {
      sessionToken: 'secret-session',
      apiKey: 'secret-api-key',
      featureModuleLicenseKey: 'secret-license',
      selectedBroker: 'aliceblue'
    },
    accountSummary: {
      clientId: 'AB123',
      clientName: 'Customer Name',
      balance: 1000
    },
    featureModules: {
      configured: true,
      userId: 'customer-001',
      deviceId: 'device-secret',
      licenseKeyMasked: 'lic...001',
      lastSyncAt: '2026-11-19T09:45:00.000Z',
      manifestExpiresAt: '2026-11-20T09:45:00.000Z',
      offlineGrace: { active: false },
      modules: [{
        id: 'premium',
        version: '2026.11.19',
        status: 'installed',
        installedAt: '2026-11-19T09:45:00.000Z',
        expiresAt: '2026-11-20T09:45:00.000Z',
        signature: 'module-signature'
      }]
    },
    strategyState: {
      position: { instrument: { symbol: 'SENSEX', token: '1' } }
    },
    brokerStatus: {
      hasSessionToken: true
    },
    observability: buildObservabilitySnapshot({
      appName: 'Trade Assist',
      appVersion: '0.1.0',
      config: {
        selectedBroker: 'aliceblue',
        featureModuleCacheMaxHours: 24,
        strategyAutoTrade: false
      },
      accountSummary: {
        clientId: 'AB123',
        balance: 1000,
        positions: []
      },
      featureModules: {
        configured: true,
        userId: 'customer-001',
        deviceId: 'device-secret',
        licenseKeyMasked: 'lic...001',
        lastSyncAt: '2026-11-19T09:45:00.000Z',
        manifestExpiresAt: '2026-11-20T09:45:00.000Z',
        offlineGrace: { active: false },
        modules: [{
          id: 'premium',
          version: '2026.11.19',
          status: 'installed',
          installedAt: '2026-11-19T09:45:00.000Z',
          expiresAt: '2026-11-20T09:45:00.000Z'
        }]
      },
      strategyState: {
        position: { strategyName: 'Momentum Reversal V1' }
      },
      brokerStatus: {
        ready: true,
        visible: true,
        hasSessionToken: true,
        selectedBroker: 'aliceblue'
      },
      now: new Date('2026-11-19T10:00:00.000Z')
    }),
    now: new Date('2026-11-19T10:00:00.000Z')
  });

  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(result.bundleDir, 'summary.json')), true);
  assert.equal(fs.existsSync(path.join(result.bundleDir, 'observability_snapshot.redacted.json')), true);
  assert.equal(fs.existsSync(path.join(result.bundleDir, 'candle_summary.json')), true);
  assert.equal(fs.existsSync(path.join(result.bundleDir, 'logs', 'broker_api_discovery_2026-11-19.jsonl.summary.json')), true);

  const allText = readAllFiles(result.bundleDir).join('\n');
  assert.equal(allText.includes('secret-session'), false);
  assert.equal(allText.includes('secret-api-key'), false);
  assert.equal(allText.includes('secret-license'), false);
  assert.equal(allText.includes('secret-token'), false);
  assert.equal(allText.includes('module-signature'), false);
  assert.equal(allText.includes('premium source'), false);
  assert.match(allText, /SENSEX_1/);
  assert.match(allText, /"balance": 1000/);
  assert.match(allText, /"appVersion": "0.1.0"/);
  assert.match(allText, /"version": "2026.11.19"/);
  assert.match(allText, /"cacheMaxHours": 24/);
}

function readAllFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(filePath);
      else out.push(fs.readFileSync(filePath, 'utf8'));
    }
  }
  return out;
}

main();
