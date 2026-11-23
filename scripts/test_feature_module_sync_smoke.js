const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FeatureModuleManager = require('../src/feature_module_manager');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-sync-'));
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const moduleSource = `
module.exports = {
  id: 'remote-momentum',
  version: '2026.11.19',
  kind: 'strategy',
  capabilities: ['proposal.entry', 'proposal.exit'],
  evaluate(context) {
    if (context.openPosition) {
      return {
        type: 'EXIT',
        confidence: 88,
        reason: 'remote smoke exit proposal'
      };
    }
    return {
      type: 'ENTRY',
      direction: 'bullish',
      optionType: 'CE',
      confidence: 82,
      reason: 'remote smoke entry proposal',
      data: { candleClose: context.indexCandle && context.indexCandle.close }
    };
  }
};
`;

async function main() {
  try {
    const manager = new FeatureModuleManager({
      baseDir: path.join(tempDir, 'app-data'),
      fetchText: async (url) => {
        const parsed = new URL(url);
        if (parsed.hostname !== 'license.test') throw new Error(`Unexpected smoke URL ${url}`);
        if (parsed.pathname === '/manifest') {
          assert.equal(parsed.searchParams.get('userId'), 'smoke-user');
          assert.equal(parsed.searchParams.get('licenseKey'), 'smoke-license');
          assert.equal(parsed.searchParams.get('deviceId'), 'device-smoke');
          assert.equal(parsed.searchParams.get('syncJitterMs'), null);
          const manifest = manifestPayload();
          return JSON.stringify({
            payload: manifest,
            signature: sign(JSON.stringify(manifest))
          });
        }
        if (parsed.pathname === '/remote-momentum.js') return moduleSource;
        throw new Error(`Unexpected smoke path ${parsed.pathname}`);
      },
      config: {
        featureModuleManifestUrl: 'https://license.test/manifest',
        featureModuleUserId: 'smoke-user',
        featureModuleLicenseKey: 'smoke-license',
        featureModuleDeviceId: 'device-smoke',
        featureModulePublicKeyPem: publicKey,
        featureModuleAllowUnsigned: false,
        featureModuleCleanupEnabled: false,
        appVersion: '0.1.0'
      }
    });

    const status = await manager.sync();
    assert.equal(status.configured, true);
    assert.equal(status.errors.length, 0);
    assert.equal(status.entitlements.length, 1);
    assert.equal(status.entitlements[0].id, 'strategy.remoteMomentum');
    assert.equal(status.modules.length, 1);
    assert.equal(status.modules[0].status, 'installed');
    assert.ok(fs.existsSync(status.modules[0].cachePath));
    assert.equal(fs.readFileSync(status.modules[0].cachePath, 'utf8'), moduleSource);

    const savedManifest = JSON.parse(fs.readFileSync(path.join(tempDir, 'app-data', 'feature_modules_manifest.json'), 'utf8'));
    assert.equal(savedManifest.userId, 'smoke-user');
    assert.equal(savedManifest.modules[0].id, 'remote-momentum');

    const savedStatus = JSON.parse(fs.readFileSync(path.join(tempDir, 'app-data', 'feature_modules_status.json'), 'utf8'));
    assert.equal(savedStatus.modules[0].status, 'installed');

    const runtimeValidation = manager.validateRuntimeModules();
    assert.equal(runtimeValidation.length, 1);
    assert.equal(runtimeValidation[0].runtimeStatus, 'valid');
    assert.equal(runtimeValidation[0].runtime.canEvaluate, true);

    const gated = manager.evaluateGatedRuntimeModules({
      indexCandle: { open: 100, high: 112, low: 98, close: 109 },
      openPosition: null
    }, {
      minEntryConfidence: 50
    });
    assert.equal(gated.length, 1);
    assert.equal(gated[0].gated.accepted.length, 1);
    assert.equal(gated[0].gated.accepted[0].type, 'ENTRY');
    assert.equal(gated[0].gated.rejected.length, 0);

    manager.fetchText = async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/manifest') {
        const manifest = manifestPayload();
        return JSON.stringify({
          payload: manifest,
          signature: sign(JSON.stringify(manifest))
        });
      }
      if (parsed.pathname === '/remote-momentum.js') {
        throw new Error('simulated CDN module storage outage');
      }
      throw new Error(`Unexpected CDN outage URL ${url}`);
    };
    const cdnOutageStatus = await manager.sync();
    assert.equal(cdnOutageStatus.modules[0].status, 'installed');
    assert.equal(cdnOutageStatus.modules[0].cacheSource, 'cached-after-download-failure');
    assert.match(cdnOutageStatus.modules[0].error, /using verified cached copy/);
    assert.match(cdnOutageStatus.errors[0], /simulated CDN module storage outage/);
    assert.equal(manager.getInstalledModules().length, 1);
    assert.equal(manager.validateRuntimeModules().length, 1);

    manager.fetchText = async () => {
      throw new Error('simulated offline license sync failure');
    };
    const offlineStatus = await manager.sync();
    assert.equal(offlineStatus.offlineGrace.active, true);
    assert.match(offlineStatus.offlineGrace.reason, /simulated offline/);
    assert.equal(offlineStatus.modules[0].status, 'installed');
    assert.equal(manager.getInstalledModules().length, 1);
    assert.equal(manager.validateRuntimeModules().length, 1);

    manager.status.lastSuccessfulSyncAt = '2020-01-01T00:00:00.000Z';
    const expiredOfflineStatus = manager.handleSyncFailure(new Error('simulated expired offline sync failure'));
    assert.equal(expiredOfflineStatus.offlineGrace.active, false);
    assert.equal(expiredOfflineStatus.modules[0].status, 'offline-disabled');
    assert.equal(manager.getInstalledModules().length, 0);
    assert.equal(manager.validateRuntimeModules().length, 0);

    const passiveExpiryManager = createOfflineProbeManager('passive-grace-expiry', { featureModuleOfflineGraceHours: 1 });
    passiveExpiryManager.status.lastSuccessfulSyncAt = '2020-01-01T00:00:00.000Z';
    passiveExpiryManager.status.manifestExpiresAt = '2099-01-01T00:00:00.000Z';
    const passiveExpiryStatus = passiveExpiryManager.getStatus();
    assert.equal(passiveExpiryStatus.offlineGrace.active, false);
    assert.equal(passiveExpiryStatus.modules[0].status, 'offline-disabled');
    assert.match(passiveExpiryStatus.modules[0].error, /Offline grace has expired/);
    assert.equal(passiveExpiryManager.getInstalledModules().length, 0);

    manager.status.modules = [{ ...status.modules[0], status: 'installed', expiresAt: '2000-01-01T00:00:00.000Z' }];
    manager.status.lastSuccessfulSyncAt = new Date().toISOString();
    manager.status.manifestExpiresAt = '2099-01-01T00:00:00.000Z';
    assert.equal(manager.getInstalledModules().length, 0, 'expired cached module must not run inside offline grace');

    manager.status.modules = [{
      ...status.modules[0],
      status: 'installed',
      expiresAt: '2099-01-01T00:00:00.000Z',
      installedAt: '2020-01-01T00:00:00.000Z'
    }];
    assert.equal(manager.getInstalledModules().length, 0, 'stale cached module must not run past cache lifetime');

    const staleManager = createOfflineProbeManager('stale-cache', { featureModuleCacheMaxHours: 1 });
    const staleModuleDir = path.dirname(staleManager.status.modules[0].cachePath);
    fs.mkdirSync(staleModuleDir, { recursive: true });
    fs.writeFileSync(staleManager.status.modules[0].cachePath, moduleSource);
    staleManager.status.modules[0].installedAt = '2020-01-01T00:00:00.000Z';
    staleManager.cleanupExpired();
    assert.equal(staleManager.status.modules[0].status, 'cache-expired-removed');
    assert.equal(fs.existsSync(staleManager.status.modules[0].cachePath), false);

    const startupManager = createOfflineProbeManager('startup-cleanup', { featureModuleCleanupEnabled: true });
    const startupModule = startupManager.status.modules[0];
    fs.mkdirSync(path.dirname(startupModule.cachePath), { recursive: true });
    fs.writeFileSync(startupModule.cachePath, moduleSource);
    startupManager.status.lastCleanupAt = '2026-11-19T13:30:00.000Z';
    startupManager.status.lastStartupCleanupAt = '2026-11-19T03:30:00.000Z';
    const startupNow = new Date('2026-11-20T04:00:00.000Z');
    assert.equal(startupManager.cleanupStaleCacheOnStartup(startupNow), true);
    assert.equal(startupManager.status.modules.length, 0);
    assert.equal(fs.existsSync(startupModule.cachePath), false);
    assert.equal(startupManager.status.lastStartupCleanupAt, startupNow.toISOString());
    assert.equal(startupManager.status.cleanupReason, 'startup cleanup before daily module sync');

    startupManager.status.modules = [{
      ...startupModule,
      status: 'installed',
      installedAt: startupNow.toISOString()
    }];
    fs.mkdirSync(path.dirname(startupModule.cachePath), { recursive: true });
    fs.writeFileSync(startupModule.cachePath, moduleSource);
    assert.equal(startupManager.cleanupStaleCacheOnStartup(startupNow), false);
    assert.equal(startupManager.status.modules.length, 1, 'startup cleanup must run only once per IST day');
    assert.equal(fs.existsSync(startupModule.cachePath), true);

    const incompatibleCacheManager = createOfflineProbeManager('incompatible-cache', { appVersion: '0.1.0' });
    incompatibleCacheManager.status.modules[0].minAppVersion = '0.2.0';
    assert.equal(incompatibleCacheManager.getInstalledModules().length, 0, 'cached modules must be rechecked against current app version');
    assert.equal(incompatibleCacheManager.validateRuntimeModules().length, 0);
    incompatibleCacheManager.cleanupExpired();
    assert.equal(incompatibleCacheManager.status.modules[0].status, 'app-incompatible-disabled');
    assert.match(incompatibleCacheManager.status.modules[0].error, /below required/);

    const disabledGraceManager = createOfflineProbeManager('disabled-grace', { featureModuleOfflineGraceEnabled: false });
    const disabledStatus = disabledGraceManager.handleSyncFailure(new Error('offline with grace disabled'));
    assert.equal(disabledStatus.offlineGrace.enabled, false);
    assert.equal(disabledStatus.offlineGrace.active, false);
    assert.equal(disabledStatus.modules[0].status, 'offline-disabled');
    assert.equal(disabledGraceManager.getInstalledModules().length, 0);

    disabledGraceManager.status.modules = [{
      ...status.modules[0],
      status: 'installed',
      installedAt: new Date().toISOString()
    }];
    disabledGraceManager.status.lastSuccessfulSyncAt = '';
    disabledGraceManager.status.manifestExpiresAt = '';
    assert.equal(
      disabledGraceManager.getInstalledModules().length,
      0,
      'offline grace disabled must not allow activation without a valid signed manifest sync'
    );

    const noSyncManager = createOfflineProbeManager('no-successful-sync');
    noSyncManager.status.lastSuccessfulSyncAt = '';
    const noSyncStatus = noSyncManager.handleSyncFailure(new Error('offline before first signed sync'));
    assert.equal(noSyncStatus.offlineGrace.active, false);
    assert.match(noSyncStatus.offlineGrace.reason, /No successful module sync|offline before first/);
    assert.equal(noSyncManager.getInstalledModules().length, 0);

    const firstRunOutageManager = new FeatureModuleManager({
      baseDir: path.join(tempDir, 'first-run-outage'),
      fetchText: async () => {
        throw new Error('license API unavailable on first activation');
      },
      config: {
        featureModuleManifestUrl: 'https://license.test/manifest',
        featureModuleUserId: 'new-user',
        featureModuleLicenseKey: 'new-license',
        featureModuleDeviceId: 'device-new',
        featureModulePublicKeyPem: publicKey,
        featureModuleAllowUnsigned: false,
        featureModuleCleanupEnabled: false,
        appVersion: '0.1.0'
      }
    });
    const firstRunOutageStatus = await firstRunOutageManager.sync();
    assert.equal(firstRunOutageStatus.offlineGrace.active, false);
    assert.match(firstRunOutageStatus.offlineGrace.reason, /license API unavailable|No successful module sync/);
    assert.equal(firstRunOutageStatus.entitlements.length, 0);
    assert.equal(firstRunOutageStatus.modules.length, 0);
    assert.equal(firstRunOutageManager.getInstalledModules().length, 0);

    manager.cleanupCachedModules('smoke cleanup');
    const cleaned = manager.getStatus();
    assert.equal(cleaned.modules.length, 0);
    assert.equal(cleaned.cleanupReason, 'smoke cleanup');

    console.log('feature module sync smoke passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function createOfflineProbeManager(folderName, extraConfig = {}) {
  const manager = new FeatureModuleManager({
    baseDir: path.join(tempDir, folderName),
    fetchText: async () => moduleSource,
    config: {
      featureModuleManifestUrl: 'https://license.test/manifest',
      featureModuleUserId: 'smoke-user',
      featureModuleLicenseKey: 'smoke-license',
      featureModuleDeviceId: 'device-smoke',
      featureModulePublicKeyPem: publicKey,
      featureModuleAllowUnsigned: false,
      featureModuleCleanupEnabled: false,
      appVersion: '0.1.0',
      ...extraConfig
    }
  });
  manager.status.modules = [{
    id: 'remote-momentum',
    version: '2026.11.19',
    status: 'installed',
    featureIds: ['strategy.remoteMomentum'],
    expiresAt: '2099-01-01T00:00:00.000Z',
    installedAt: new Date().toISOString(),
    cachePath: path.join(tempDir, folderName, 'feature_modules', 'remote-momentum', '2026.11.19', 'module.js')
  }];
  manager.status.lastSuccessfulSyncAt = new Date().toISOString();
  manager.status.manifestExpiresAt = '2099-01-01T00:00:00.000Z';
  return manager;
}

function manifestPayload() {
  return {
    userId: 'smoke-user',
    expiresAt: '2099-01-01T00:00:00.000Z',
    features: [{
      id: 'strategy.remoteMomentum',
      name: 'Remote Momentum',
      enabled: true,
      expiresAt: '2099-01-01T00:00:00.000Z'
    }],
    modules: [{
      id: 'remote-momentum',
      version: '2026.11.19',
      url: 'https://license.test/remote-momentum.js',
      entry: 'module.js',
      sha256: sha256(moduleSource),
      signature: sign(moduleSource),
      featureIds: ['strategy.remoteMomentum'],
      expiresAt: '2099-01-01T00:00:00.000Z'
    }]
  };
}

function sign(value) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(value);
  signer.end();
  return signer.sign(privateKey, 'base64');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
