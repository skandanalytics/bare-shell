const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const FeatureModuleRuntime = require('./feature_module_runtime');
const { gateEvaluationResults } = require('./feature_proposal_gate');
const { checkAppCompatibility } = require('./version_compatibility');

const DEFAULT_CLEANUP_HOUR = 19;
const REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_OFFLINE_GRACE_HOURS = 24;
const DEFAULT_MODULE_CACHE_MAX_HOURS = 24;
const DEFAULT_SYNC_JITTER_MS = 30_000;

class FeatureModuleManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir;
    this.cacheDir = path.join(this.baseDir, 'feature_modules');
    this.manifestPath = path.join(this.baseDir, 'feature_modules_manifest.json');
    this.statusPath = path.join(this.baseDir, 'feature_modules_status.json');
    this.config = normalizeConfig(options.config);
    this.runtime = new FeatureModuleRuntime(options.runtime || {});
    this.fetchText = options.fetchText || fetchText;
    this.status = {
      configured: Boolean(this.config.manifestUrl),
      lastSyncAt: '',
      lastCleanupAt: '',
      userId: this.config.userId,
      deviceId: this.config.deviceId,
      licenseKeyMasked: maskLicense(this.config.licenseKey),
      entitlements: [],
      modules: [],
      offlineGrace: {
        enabled: this.config.offlineGraceEnabled,
        active: false,
        expiresAt: '',
        reason: ''
      },
      lastStartupCleanupAt: '',
      errors: []
    };
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.loadStatus();
  }

  updateConfig(config = {}) {
    this.config = normalizeConfig(config);
    this.status.configured = Boolean(this.config.manifestUrl);
    this.status.userId = this.config.userId;
    this.status.deviceId = this.config.deviceId;
    this.status.licenseKeyMasked = maskLicense(this.config.licenseKey);
    this.status.offlineGrace = offlineGraceStatus(this.status, this.config);
    this.saveStatus();
  }

  getStatus() {
    this.cleanupIfDue();
    this.status.offlineGrace = offlineGraceStatus(this.status, this.config);
    this.enforceOfflineGraceExpiry();
    return {
      ...this.status,
      configured: Boolean(this.config.manifestUrl),
      userId: this.config.userId,
      deviceId: this.config.deviceId,
      licenseKeyMasked: maskLicense(this.config.licenseKey),
      appVersion: this.config.appVersion,
      cacheDir: this.cacheDir
    };
  }

  async sync(options = {}) {
    this.status.errors = [];
    if (!this.config.manifestUrl) {
      this.status.configured = false;
      this.status.lastSyncAt = new Date().toISOString();
      this.status.entitlements = [];
      this.status.modules = [];
      this.status.errors.push('Feature module manifest URL is not configured.');
      this.saveStatus();
      return this.getStatus();
    }

    try {
      const manifestEnvelope = await fetchJson(this.config.manifestUrl, {
        userId: this.config.userId,
        licenseKey: this.config.licenseKey,
        appVersion: this.config.appVersion,
        deviceId: this.config.deviceId,
        syncJitterMs: options.jitter === true ? this.config.syncJitterMs : 0
      }, this.fetchText);
      const manifest = unwrapSignedPayload(manifestEnvelope);
      this.verifyManifest(manifestEnvelope, manifest);
      validateManifest(manifest, this.config.appVersion);

      const activeFeatures = (manifest.features || [])
        .filter((feature) => feature && feature.enabled !== false)
        .map((feature) => ({
          id: String(feature.id || '').trim(),
          name: String(feature.name || feature.id || '').trim(),
          expiresAt: feature.expiresAt || manifest.expiresAt || ''
        }))
        .filter((feature) => feature.id);

      const modules = [];
      for (const item of manifest.modules || []) {
        const moduleStatus = await this.installModule(item, manifest);
        modules.push(moduleStatus);
      }

      this.status = {
        ...this.status,
        configured: true,
        lastSyncAt: new Date().toISOString(),
        lastSuccessfulSyncAt: new Date().toISOString(),
        manifestExpiresAt: manifest.expiresAt || '',
        userId: manifest.userId || this.config.userId,
        deviceId: this.config.deviceId,
        licenseKeyMasked: maskLicense(this.config.licenseKey),
        entitlements: activeFeatures,
        modules,
        offlineGrace: offlineGraceStatus({
          ...this.status,
          lastSuccessfulSyncAt: new Date().toISOString(),
          manifestExpiresAt: manifest.expiresAt || '',
          offlineGrace: { reason: '' }
        }, this.config),
        errors: modules.filter((item) => item.error).map((item) => `${item.id}: ${item.error}`)
      };
      fs.writeFileSync(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      this.saveStatus();
      this.cleanupExpired();
      return this.getStatus();
    } catch (error) {
      return this.handleSyncFailure(error);
    }
  }

  handleSyncFailure(error) {
    const grace = offlineGraceStatus(this.status, this.config, error.message);
    const installedModules = (this.status.modules || []).filter((item) => item.status === 'installed');
    this.status = {
      ...this.status,
      configured: Boolean(this.config.manifestUrl),
      lastSyncAt: new Date().toISOString(),
      offlineGrace: grace,
      errors: [error.message]
    };
    if (!grace.active) {
      this.status.modules = installedModules.map((item) => ({
        ...item,
        status: 'offline-disabled',
        error: grace.reason || 'Offline grace is not active.'
      }));
    }
    this.saveStatus();
    return this.getStatus();
  }

  enforceOfflineGraceExpiry() {
    const grace = this.status.offlineGrace || offlineGraceStatus(this.status, this.config);
    const allowed = hasFreshSuccessfulSync(this.status, this.config) || grace.active;
    if (allowed) return false;

    let changed = false;
    const reason = grace.reason || 'Offline grace is not active.';
    this.status.modules = (this.status.modules || []).map((item) => {
      if (!item || item.status !== 'installed') return item;
      changed = true;
      return {
        ...item,
        status: 'offline-disabled',
        error: reason,
        offlineDisabledAt: new Date().toISOString()
      };
    });

    if (changed) {
      this.status.offlineGrace = grace;
      this.status.errors = Array.from(new Set([...(this.status.errors || []), reason]));
      this.saveStatus();
    }
    return changed;
  }

  cleanupIfDue(now = new Date()) {
    if (!this.config.cleanupEnabled) return false;
    if (hourInIndia(now) < this.config.cleanupHour) return false;
    const today = indiaDate(now);
    if (this.status.lastCleanupAt && indiaDate(new Date(this.status.lastCleanupAt)) === today) return false;
    this.cleanupCachedModules('daily cleanup after market close', { now });
    return true;
  }

  cleanupStaleCacheOnStartup(now = new Date()) {
    if (!this.config.cleanupEnabled) return false;
    const today = indiaDate(now);
    if (this.status.lastStartupCleanupAt && indiaDate(new Date(this.status.lastStartupCleanupAt)) === today) return false;

    const cleanedToday = this.status.lastCleanupAt && indiaDate(new Date(this.status.lastCleanupAt)) === today;
    if (!cleanedToday && hasCachedModuleState(this.cacheDir, this.status)) {
      this.cleanupCachedModules('startup cleanup before daily module sync', { now, startup: true });
      return true;
    }

    this.status.lastStartupCleanupAt = now.toISOString();
    this.saveStatus();
    return false;
  }

  cleanupCachedModules(reason = 'manual cleanup', options = {}) {
    const now = options.now || new Date();
    fs.rmSync(this.cacheDir, { recursive: true, force: true });
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.status.modules = [];
    this.status.lastCleanupAt = now.toISOString();
    if (options.startup) this.status.lastStartupCleanupAt = now.toISOString();
    this.status.cleanupReason = reason;
    this.saveStatus();
    return this.getStatus();
  }

  cleanupExpired() {
    const now = Date.now();
    for (const moduleStatus of this.status.modules || []) {
      const expiry = Date.parse(moduleStatus.expiresAt);
      const compatibility = checkAppCompatibility(moduleStatus, this.config.appVersion);
      if ((Number.isFinite(expiry) && expiry <= now) || !isModuleCacheFresh(moduleStatus, this.config, now)) {
        if (!moduleStatus.cachePath) continue;
        fs.rmSync(path.dirname(moduleStatus.cachePath), { recursive: true, force: true });
        moduleStatus.status = Number.isFinite(expiry) && expiry <= now ? 'expired-removed' : 'cache-expired-removed';
      } else if (!compatibility.ok) {
        moduleStatus.status = 'app-incompatible-disabled';
        moduleStatus.error = compatibility.reason;
      }
    }
    this.saveStatus();
  }

  validateRuntimeModules() {
    const modules = this.getInstalledModules();
    return modules.map((item) => {
      try {
        return {
          ...item,
          runtime: this.runtime.validate(item),
          runtimeStatus: 'valid'
        };
      } catch (error) {
        return {
          ...item,
          runtimeStatus: 'invalid',
          runtimeError: error.message
        };
      }
    });
  }

  evaluateRuntimeModules(context = {}) {
    const modules = this.getInstalledModules();
    return modules.map((item) => {
      try {
        return {
          ...this.runtime.evaluate(item, {
            ...context,
            entitlements: this.status.entitlements || []
          }),
          status: 'evaluated'
        };
      } catch (error) {
        return {
          moduleId: item.id,
          version: item.version,
          status: 'failed',
          error: error.message,
          proposals: []
        };
      }
    });
  }

  evaluateGatedRuntimeModules(context = {}, options = {}) {
    const modules = this.getInstalledModules();
    const evaluations = this.evaluateRuntimeModules(context);
    return gateEvaluationResults(evaluations, {
      ...context,
      entitlements: this.status.entitlements || []
    }, {
      ...options,
      modules,
      entitlements: this.status.entitlements || []
    });
  }

  getInstalledModules() {
    const grace = offlineGraceStatus(this.status, this.config);
    const allowed = hasFreshSuccessfulSync(this.status, this.config) || grace.active;
    if (!allowed) return [];
    return (this.status.modules || []).filter((item) => item.status === 'installed' && isModuleUsable(item, Date.now(), this.config));
  }

  verifyManifest(envelope, manifest) {
    if (this.config.allowUnsignedModules) return true;
    if (!this.config.publicKeys.length) {
      throw new Error('Feature module public key is required before signed modules can be trusted.');
    }
    const signature = envelope && envelope.signature;
    if (!signature) throw new Error('Feature manifest is missing a signature.');
    verifySignature(JSON.stringify(manifest), signature, this.config.publicKeys);
    return true;
  }

  async installModule(item, manifest) {
    const id = safePart(item && item.id);
    const version = safePart(item && item.version || '0.0.0');
    if (!id) return { id: '', status: 'rejected', error: 'missing module id' };
    if (!item.url) return { id, version, status: 'rejected', error: 'missing module URL' };
    const compatibility = checkAppCompatibility(item, this.config.appVersion);
    if (!compatibility.ok) {
      return {
        id,
        version,
        status: 'rejected',
        error: compatibility.reason,
        minAppVersion: compatibility.minAppVersion,
        maxAppVersion: compatibility.maxAppVersion
      };
    }

    const moduleDir = path.join(this.cacheDir, id, version);
    const entryName = safePart(item.entry || 'module.js');
    const cachePath = path.join(moduleDir, entryName);
    fs.mkdirSync(moduleDir, { recursive: true });

    try {
      const source = await this.fetchText(item.url);
      const sha256 = sha256Hex(source);
      if (item.sha256 && sha256 !== String(item.sha256).toLowerCase()) {
        throw new Error(`sha256 mismatch ${sha256}`);
      }
      if (!this.config.allowUnsignedModules) {
        verifySignature(source, item.signature, this.config.publicKeys);
      }
      fs.writeFileSync(cachePath, source, { mode: 0o600 });
      const descriptor = {
        id,
        version,
        entry: entryName,
        featureIds: (item.featureIds || item.features || []).map(String),
        expiresAt: item.expiresAt || manifest.expiresAt || '',
        minAppVersion: item.minAppVersion || '',
        maxAppVersion: item.maxAppVersion || '',
        sha256,
        installedAt: new Date().toISOString()
      };
      fs.writeFileSync(path.join(moduleDir, 'module.json'), `${JSON.stringify(descriptor, null, 2)}\n`);
      return { ...descriptor, status: 'installed', cachePath };
    } catch (error) {
      const cached = this.reuseCachedModule(item, manifest, {
        id,
        version,
        entryName,
        cachePath,
        error
      });
      if (cached) return cached;
      return {
        id,
        version,
        status: 'failed',
        error: error.message
      };
    }
  }

  reuseCachedModule(item, manifest, context = {}) {
    const previous = (this.status.modules || []).find((row) => {
      return row
        && row.status === 'installed'
        && row.id === context.id
        && row.version === context.version;
    });
    const cachePath = previous && previous.cachePath || context.cachePath;
    if (!cachePath || !fs.existsSync(cachePath)) return null;

    try {
      const source = fs.readFileSync(cachePath, 'utf8');
      const sha256 = sha256Hex(source);
      if (item.sha256 && sha256 !== String(item.sha256).toLowerCase()) {
        throw new Error(`cached sha256 mismatch ${sha256}`);
      }
      if (!this.config.allowUnsignedModules) {
        verifySignature(source, item.signature, this.config.publicKeys);
      }
      const installedAt = previous && previous.installedAt || new Date().toISOString();
      const descriptor = {
        id: context.id,
        version: context.version,
        entry: context.entryName,
        featureIds: (item.featureIds || item.features || previous && previous.featureIds || []).map(String),
        expiresAt: item.expiresAt || manifest.expiresAt || previous && previous.expiresAt || '',
        minAppVersion: item.minAppVersion || previous && previous.minAppVersion || '',
        maxAppVersion: item.maxAppVersion || previous && previous.maxAppVersion || '',
        sha256,
        installedAt,
        cachePath,
        status: 'installed',
        cacheSource: 'cached-after-download-failure',
        downloadError: context.error ? context.error.message : '',
        error: context.error ? `Module download failed; using verified cached copy: ${context.error.message}` : ''
      };
      fs.writeFileSync(path.join(path.dirname(cachePath), 'module.json'), `${JSON.stringify({
        id: descriptor.id,
        version: descriptor.version,
        entry: descriptor.entry,
        featureIds: descriptor.featureIds,
        expiresAt: descriptor.expiresAt,
        minAppVersion: descriptor.minAppVersion,
        maxAppVersion: descriptor.maxAppVersion,
        sha256: descriptor.sha256,
        installedAt: descriptor.installedAt
      }, null, 2)}\n`);
      return descriptor;
    } catch (_) {
      return null;
    }
  }

  loadStatus() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statusPath, 'utf8'));
      this.status = { ...this.status, ...parsed };
    } catch (_) {}
  }

  saveStatus() {
    fs.mkdirSync(this.baseDir, { recursive: true });
    fs.writeFileSync(this.statusPath, `${JSON.stringify(this.status, null, 2)}\n`);
  }
}

function normalizeConfig(config = {}) {
  const syncJitterMs = config.featureModuleSyncJitterMs ?? config.syncJitterMs ?? DEFAULT_SYNC_JITTER_MS;
  const publicKeyPem = String(config.featureModulePublicKeyPem || config.publicKeyPem || '').trim();
  return {
    manifestUrl: String(config.featureModuleManifestUrl || config.manifestUrl || '').trim(),
    userId: String(config.featureModuleUserId || config.userId || '').trim(),
    licenseKey: String(config.featureModuleLicenseKey || config.licenseKey || '').trim(),
    publicKeyPem,
    publicKeys: splitPublicKeyPemBundle(config.featureModuleTrustedPublicKeys || config.publicKeys || publicKeyPem),
    allowUnsignedModules: Boolean(config.featureModuleAllowUnsigned || config.allowUnsignedModules),
    cleanupEnabled: config.featureModuleCleanupEnabled !== false,
    cleanupHour: clampHour(config.featureModuleCleanupHour || config.cleanupHour || DEFAULT_CLEANUP_HOUR),
    offlineGraceEnabled: config.featureModuleOfflineGraceEnabled !== false && config.offlineGraceEnabled !== false,
    offlineGraceHours: clampPositiveHours(config.featureModuleOfflineGraceHours || config.offlineGraceHours || DEFAULT_OFFLINE_GRACE_HOURS),
    moduleCacheMaxHours: clampPositiveHours(config.featureModuleCacheMaxHours || config.moduleCacheMaxHours || DEFAULT_MODULE_CACHE_MAX_HOURS),
    deviceId: String(config.featureModuleDeviceId || config.deviceId || '').trim(),
    syncJitterMs: clampNonNegativeMs(syncJitterMs),
    syncOnStartup: config.featureModuleSyncOnStartup !== false && config.syncOnStartup !== false,
    appVersion: String(config.appVersion || '')
  };
}

function hasCachedModuleState(cacheDir, status = {}) {
  if ((status.modules || []).length) return true;
  try {
    return fs.readdirSync(cacheDir).length > 0;
  } catch (_) {
    return false;
  }
}

function offlineGraceStatus(status = {}, config = {}, reason = '') {
  const enabled = config.offlineGraceEnabled !== false;
  const hours = clampPositiveHours(config.offlineGraceHours || DEFAULT_OFFLINE_GRACE_HOURS);
  const lastSuccess = Date.parse(status.lastSuccessfulSyncAt || '');
  const manifestExpiry = Date.parse(status.manifestExpiresAt || '');
  const graceExpiry = Number.isFinite(lastSuccess) ? lastSuccess + hours * 60 * 60 * 1000 : NaN;
  const boundedExpiry = [graceExpiry, manifestExpiry].filter(Number.isFinite).sort((a, b) => a - b)[0];
  const active = Boolean(enabled && Number.isFinite(lastSuccess) && Number.isFinite(boundedExpiry) && boundedExpiry > Date.now());
  return {
    enabled,
    active,
    hours,
    startedAt: Number.isFinite(lastSuccess) ? new Date(lastSuccess).toISOString() : '',
    expiresAt: Number.isFinite(lastSuccess) && Number.isFinite(boundedExpiry) ? new Date(boundedExpiry).toISOString() : '',
    reason: active
      ? reason || status.offlineGrace && status.offlineGrace.reason || ''
      : reason || offlineGraceInactiveReason(enabled, lastSuccess, boundedExpiry)
  };
}

function offlineGraceInactiveReason(enabled, lastSuccess, boundedExpiry) {
  if (!enabled) return 'Offline grace is disabled.';
  if (!Number.isFinite(lastSuccess)) return 'No successful module sync is available for offline grace.';
  if (Number.isFinite(boundedExpiry) && boundedExpiry <= Date.now()) return 'Offline grace has expired.';
  return '';
}

function hasFreshSuccessfulSync(status = {}, config = {}) {
  const lastSuccess = Date.parse(status.lastSuccessfulSyncAt || '');
  if (!Number.isFinite(lastSuccess)) return false;
  const manifestExpiry = Date.parse(status.manifestExpiresAt || '');
  if (Number.isFinite(manifestExpiry) && manifestExpiry <= Date.now()) return false;
  const hours = clampPositiveHours(config.offlineGraceHours || DEFAULT_OFFLINE_GRACE_HOURS);
  return lastSuccess + hours * 60 * 60 * 1000 > Date.now();
}

function isModuleUsable(moduleStatus = {}, now = Date.now(), config = {}) {
  const expiry = Date.parse(moduleStatus.expiresAt || '');
  const compatibility = checkAppCompatibility(moduleStatus, config.appVersion);
  return compatibility.ok && (!Number.isFinite(expiry) || expiry > now) && isModuleCacheFresh(moduleStatus, config, now);
}

function isModuleCacheFresh(moduleStatus = {}, config = {}, now = Date.now()) {
  const maxHours = clampPositiveHours(config.moduleCacheMaxHours || DEFAULT_MODULE_CACHE_MAX_HOURS);
  const installedAt = Date.parse(moduleStatus.installedAt || '');
  if (!Number.isFinite(installedAt)) return false;
  return installedAt + maxHours * 60 * 60 * 1000 > now;
}

function validateManifest(manifest, appVersion = '') {
  if (!manifest || typeof manifest !== 'object') throw new Error('Feature manifest must be an object.');
  if (manifest.expiresAt) {
    const expiry = Date.parse(manifest.expiresAt);
    if (!Number.isFinite(expiry)) throw new Error('Feature manifest expiresAt is invalid.');
    if (expiry <= Date.now()) throw new Error('Feature manifest is expired.');
  }
  const compatibility = checkAppCompatibility(manifest, appVersion);
  if (!compatibility.ok) throw new Error(`Feature manifest is incompatible: ${compatibility.reason}.`);
  if (!Array.isArray(manifest.features)) manifest.features = [];
  if (!Array.isArray(manifest.modules)) manifest.modules = [];
}

function unwrapSignedPayload(value) {
  if (value && value.payload && typeof value.payload === 'object') return value.payload;
  return value;
}

function splitPublicKeyPemBundle(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const text = String(value || '').trim();
  if (!text) return [];
  const matches = text.match(/-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/g);
  if (matches && matches.length) return matches.map((item) => item.trim()).filter(Boolean);
  return [text];
}

function verifySignature(content, signature, publicKeys) {
  if (!signature) throw new Error('Signature is required.');
  const keys = splitPublicKeyPemBundle(publicKeys);
  if (!keys.length) throw new Error('Feature module public key is required before signed modules can be trusted.');
  const errors = [];
  for (const publicKeyPem of keys) {
    try {
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(content);
      verifier.end();
      if (verifier.verify(publicKeyPem, String(signature), 'base64')) return true;
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(errors.length ? `Signature verification failed. ${errors[0]}` : 'Signature verification failed.');
}

function fetchJson(url, context, fetcher = fetchText) {
  const { syncJitterMs, ...query } = context || {};
  const target = appendQuery(url, query);
  return delay(randomJitter(syncJitterMs)).then(() => fetcher(target)).then((text) => JSON.parse(text));
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.get(parsed, { timeout: REQUEST_TIMEOUT_MS }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    request.on('timeout', () => {
      request.destroy(new Error(`Request timed out for ${url}`));
    });
    request.on('error', reject);
  });
}

function appendQuery(url, context = {}) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(context)) {
    if (value) parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safePart(value) {
  return String(value || '').replace(/[^a-z0-9_.-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 120);
}

function clampHour(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_CLEANUP_HOUR;
  return Math.min(23, Math.max(0, Math.floor(number)));
}

function clampPositiveHours(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_OFFLINE_GRACE_HOURS;
  return Math.min(168, Math.max(1, Math.floor(number)));
}

function clampNonNegativeMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return DEFAULT_SYNC_JITTER_MS;
  return Math.min(300_000, Math.max(0, Math.floor(number)));
}

function randomJitter(maxMs) {
  const number = Number(maxMs);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.floor(Math.random() * number);
}

function delay(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hourInIndia(date) {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit'
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === 'hour')?.value || 0);
}

function indiaDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function maskLicense(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 6) return '******';
  return `${text.slice(0, 3)}...${text.slice(-3)}`;
}

module.exports = FeatureModuleManager;
