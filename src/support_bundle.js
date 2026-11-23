const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_MAX_JSONL_ROWS = 250;
const DEFAULT_MAX_TEXT_BYTES = 256 * 1024;

const SENSITIVE_KEY_RE = /token|password|secret|authorization|cookie|session|api.?key|license.?key|private.?key|public.?key|signature|enctoken/i;
const ID_KEY_RE = /client.?id|account.?id|login.?id|user.?id|uid|device.?id/i;
const NAME_KEY_RE = /client.?name|account.?name|user.?name|customer.?name|^name$/i;
const PATH_KEY_RE = /path|dir|file/i;

function buildSupportBundle(options = {}) {
  const now = options.now || new Date();
  const generatedAt = now.toISOString();
  const userDataDir = path.resolve(required(options.userDataDir, 'userDataDir'));
  const dataDir = path.resolve(options.dataDir || path.join(userDataDir, 'data'));
  const supportRoot = path.resolve(options.outputDir || path.join(userDataDir, 'support_bundles'));
  const bundleName = `support_${safeFilePart(generatedAt)}_${crypto.randomBytes(3).toString('hex')}`;
  const bundleDir = path.join(supportRoot, bundleName);
  const logsDir = path.join(bundleDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const written = [];
  writeJson(bundleDir, 'summary.json', buildSummary(options, generatedAt), written);
  if (options.config) writeJson(bundleDir, 'config.redacted.json', sanitizeForSupport(options.config), written);
  if (options.accountSummary) writeJson(bundleDir, 'account_summary.redacted.json', sanitizeForSupport(options.accountSummary), written);
  if (options.featureModules) writeJson(bundleDir, 'feature_modules.redacted.json', sanitizeForSupport(options.featureModules), written);
  if (options.observability) writeJson(bundleDir, 'observability_snapshot.redacted.json', sanitizeForSupport(options.observability), written);
  if (options.strategyState) writeJson(bundleDir, 'strategy_state.redacted.json', sanitizeForSupport(options.strategyState), written);
  if (options.dataStore) writeJson(bundleDir, 'data_store.redacted.json', sanitizeForSupport(options.dataStore), written);

  if (fs.existsSync(dataDir)) {
    writeJson(bundleDir, 'file_inventory.json', inventoryDataDir(dataDir), written);
    writeJson(bundleDir, 'candle_summary.json', summarizeCandles(dataDir), written);
    copySupportDataFiles(dataDir, logsDir, written, options);
  }

  if (options.configPath && fs.existsSync(options.configPath)) {
    writeRedactedJsonFile(options.configPath, bundleDir, 'disk_config.redacted.json', written);
  }

  writeJson(bundleDir, 'manifest.json', {
    generatedAt,
    bundleName,
    fileCount: written.length,
    files: written.map((filePath) => path.relative(bundleDir, filePath).replace(/\\/g, '/'))
  }, written);

  return {
    ok: true,
    bundleDir,
    generatedAt,
    fileCount: written.length
  };
}

function buildSummary(options, generatedAt) {
  return sanitizeForSupport({
    generatedAt,
    appName: options.appName || 'Trade Assist',
    appVersion: options.appVersion || '',
    selectedBroker: options.selectedBroker || '',
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    electron: process.versions.electron || '',
    hostnameHash: supportHash(os.hostname()),
    runtimePolicy: options.runtimePolicy || {},
    brokerStatus: options.brokerStatus || {}
  });
}

function copySupportDataFiles(dataDir, logsDir, written, options = {}) {
  const maxRows = Number(options.maxJsonlRows || DEFAULT_MAX_JSONL_ROWS);
  const maxTextBytes = Number(options.maxTextBytes || DEFAULT_MAX_TEXT_BYTES);
  const files = walkFiles(dataDir)
    .filter((filePath) => !isModuleSourcePath(filePath))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  for (const filePath of files) {
    const relative = path.relative(dataDir, filePath).replace(/\\/g, '/');
    const safeName = safeFilePart(relative);
    if (/broker_api_discovery_.*\.jsonl$/i.test(relative)) {
      writeJson(logsDir, `${safeName}.summary.json`, summarizeDiscoveryLog(filePath, maxRows), written);
      continue;
    }
    if (/\.jsonl$/i.test(filePath)) {
      writeJson(logsDir, `${safeName}.redacted.json`, readRedactedJsonl(filePath, maxRows), written);
      continue;
    }
    if (/\.json$/i.test(filePath) && isSupportJsonFile(relative)) {
      writeRedactedJsonFile(filePath, logsDir, `${safeName}.redacted.json`, written);
      continue;
    }
    if (isSupportTextFile(relative)) {
      writeText(logsDir, `${safeName}.redacted.txt`, redactText(readTail(filePath, maxTextBytes)), written);
    }
  }
}

function inventoryDataDir(dataDir) {
  return walkFiles(dataDir)
    .filter((filePath) => !isModuleSourcePath(filePath))
    .map((filePath) => {
      const stat = fs.statSync(filePath);
      return {
        path: path.relative(dataDir, filePath).replace(/\\/g, '/'),
        bytes: stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function summarizeCandles(dataDir) {
  const candlesDir = path.join(dataDir, 'market_candles');
  if (!fs.existsSync(candlesDir)) return { instruments: [] };
  const files = walkFiles(candlesDir).filter((filePath) => /\.jsonl$/i.test(filePath));
  const byInstrument = new Map();

  for (const filePath of files) {
    const relative = path.relative(candlesDir, filePath).replace(/\\/g, '/');
    const [instrument, dayFile] = relative.split('/');
    const rows = readJsonl(filePath);
    const first = rows[0] || {};
    const last = rows[rows.length - 1] || {};
    const item = byInstrument.get(instrument) || {
      instrument,
      days: [],
      candleCount: 0,
      firstBucket: '',
      lastBucket: ''
    };
    item.days.push({
      date: String(dayFile || '').replace(/\.jsonl$/i, ''),
      candles: rows.length,
      firstBucket: first.bucket || first.time || '',
      lastBucket: last.bucket || last.time || ''
    });
    item.candleCount += rows.length;
    item.firstBucket = earlierBucket(item.firstBucket, first.bucket || first.time || '');
    item.lastBucket = laterBucket(item.lastBucket, last.bucket || last.time || '');
    byInstrument.set(instrument, item);
  }

  return {
    instruments: Array.from(byInstrument.values())
      .map((item) => ({
        ...item,
        days: item.days.sort((a, b) => a.date.localeCompare(b.date))
      }))
      .sort((a, b) => a.instrument.localeCompare(b.instrument))
  };
}

function summarizeDiscoveryLog(filePath, maxRows = DEFAULT_MAX_JSONL_ROWS) {
  const rows = readJsonl(filePath).slice(-maxRows);
  return {
    sourceFile: path.basename(filePath),
    rowCount: rows.length,
    rows: rows.map((row) => {
      const url = safeUrl(row.url || row.pageUrl || '');
      return sanitizeForSupport({
        capturedAt: row.capturedAt || '',
        method: row.method || '',
        status: row.status || '',
        contentType: row.contentType || '',
        durationMs: row.durationMs || '',
        url,
        requestHeaderKeys: Object.keys(row.requestHeaders || {}).sort(),
        responseHeaderKeys: Object.keys(row.responseHeaders || {}).sort(),
        requestPreviewBytes: byteLength(row.requestPreview),
        bodyPreviewBytes: byteLength(row.bodyPreview)
      });
    })
  };
}

function readRedactedJsonl(filePath, maxRows = DEFAULT_MAX_JSONL_ROWS) {
  return readJsonl(filePath).slice(-maxRows).map((row) => sanitizeForSupport(row));
}

function writeRedactedJsonFile(sourcePath, targetDir, filename, written) {
  try {
    const parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    writeJson(targetDir, filename, sanitizeForSupport(parsed), written);
  } catch (_error) {
    writeText(targetDir, filename.replace(/\.json$/i, '.txt'), redactText(readTail(sourcePath, DEFAULT_MAX_TEXT_BYTES)), written);
  }
}

function sanitizeForSupport(value, key = '') {
  if (value == null) return value;
  if (SENSITIVE_KEY_RE.test(key)) return '[REDACTED]';
  if (ID_KEY_RE.test(key)) return value ? `[HASH:${supportHash(value)}]` : value;
  if (NAME_KEY_RE.test(key) && typeof value === 'string') return value ? '[REDACTED_NAME]' : value;
  if (PATH_KEY_RE.test(key) && typeof value === 'string') return redactLocalPath(redactText(value));
  if (typeof value === 'string') return redactText(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeForSupport(item, key));
  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = sanitizeForSupport(childValue, childKey);
  }
  return output;
}

function redactLocalPath(value) {
  const text = String(value == null ? '' : value);
  const home = os.homedir();
  if (home && text.startsWith(home)) return `~${text.slice(home.length)}`;
  return text;
}

function redactText(value) {
  return String(value == null ? '' : value)
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s'",}]+/gi, '$1[REDACTED]')
    .replace(/(cookie\s*[:=]\s*)[^'",}]+/gi, '$1[REDACTED]')
    .replace(/((?:token|session|password|secret|api[_-]?key|license[_-]?key|enctoken)\s*[:=]\s*)[^&\s'",}]+/gi, '$1[REDACTED]')
    .replace(/("?(?:token|sessionToken|apiKey|licenseKey|password|secret|signature|privateKeyPem|publicKeyPem)"?\s*:\s*")[^"]+"/gi, '$1[REDACTED]"');
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_KEY_RE.test(key) || ID_KEY_RE.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return redactText(`${url.origin}${url.pathname}${url.search}`);
  } catch (_error) {
    return redactText(value);
  }
}

function readJsonl(filePath) {
  return readTail(filePath, DEFAULT_MAX_TEXT_BYTES * 2)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return { parseError: true, raw: redactText(line.slice(0, 500)) };
      }
    });
}

function readTail(filePath, maxBytes) {
  const stat = fs.statSync(filePath);
  const size = Math.min(stat.size, maxBytes);
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(size);
    fs.readSync(fd, buffer, 0, size, stat.size - size);
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function writeJson(targetDir, filename, value, written) {
  const filePath = path.join(targetDir, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  written.push(filePath);
  return filePath;
}

function writeText(targetDir, filename, value, written) {
  const filePath = path.join(targetDir, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(value || ''));
  written.push(filePath);
  return filePath;
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'support_bundles') continue;
        stack.push(filePath);
      } else if (entry.isFile()) {
        out.push(filePath);
      }
    }
  }
  return out;
}

function isSupportJsonFile(relativePath) {
  return /instrument_metadata|strategy_learning|module_manifest|module_status|data_store_manifest|account|config/i.test(relativePath);
}

function isSupportTextFile(relativePath) {
  return /\.(log|txt)$/i.test(relativePath);
}

function isModuleSourcePath(filePath) {
  return /(^|[/\\])modules([/\\]|$).*\.js$/i.test(filePath);
}

function safeFilePart(value) {
  return String(value || 'file').replace(/[^a-z0-9_.-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 140) || 'file';
}

function supportHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

function byteLength(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function earlierBucket(left, right) {
  if (!left) return right || '';
  if (!right) return left;
  return String(right) < String(left) ? right : left;
}

function laterBucket(left, right) {
  if (!left) return right || '';
  if (!right) return left;
  return String(right) > String(left) ? right : left;
}

function required(value, name) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${name} is required.`);
  return text;
}

module.exports = {
  buildSupportBundle,
  sanitizeForSupport,
  summarizeCandles,
  summarizeDiscoveryLog,
  redactText
};
