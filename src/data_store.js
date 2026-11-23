const fs = require('fs');
const path = require('path');

const CURRENT_DATA_STORE_VERSION = 1;
const MANIFEST_FILE = 'data_store_manifest.json';
const JOURNAL_FILE = 'data_migrations.jsonl';
const DEFAULT_CANDLE_INTERVAL_MS = 60 * 1000;

function ensureDataStore(options = {}) {
  const dataDir = path.resolve(required(options.dataDir, 'dataDir'));
  const now = options.now || (() => new Date());
  const appVersion = String(options.appVersion || '').trim();
  fs.mkdirSync(dataDir, { recursive: true });

  const manifestPath = path.join(dataDir, MANIFEST_FILE);
  const journalPath = path.join(dataDir, JOURNAL_FILE);
  const existing = readManifest(manifestPath);
  if (existing.schemaVersion > CURRENT_DATA_STORE_VERSION) {
    throw new Error(`Local data schema ${existing.schemaVersion} is newer than supported schema ${CURRENT_DATA_STORE_VERSION}. Update the app before opening this data.`);
  }

  const migrations = [];
  let manifest = normalizeManifest(existing, { dataDir, appVersion, now });
  if (!existing.schemaVersion) {
    migrations.push(createMigrationEvent('baseline-v1', 'Created local data store manifest.', manifest, now));
    manifest.schemaVersion = CURRENT_DATA_STORE_VERSION;
  }

  while (manifest.schemaVersion < CURRENT_DATA_STORE_VERSION) {
    const migrated = runNextMigration(manifest, { now });
    manifest = migrated.manifest;
    migrations.push(migrated.event);
  }

  manifest.appVersion = appVersion || manifest.appVersion || '';
  manifest.updatedAt = now().toISOString();
  manifest.paths = dataStorePaths(dataDir);
  manifest.fileCounts = countDataStoreFiles(dataDir);
  writeManifest(manifestPath, manifest);
  for (const event of migrations) appendMigrationEvent(journalPath, event);

  return {
    ok: true,
    schemaVersion: manifest.schemaVersion,
    currentSchemaVersion: CURRENT_DATA_STORE_VERSION,
    manifestPath,
    journalPath,
    appliedMigrations: migrations.map((event) => event.id),
    manifest
  };
}

function applyDataRetention(options = {}) {
  const dataDir = path.resolve(required(options.dataDir, 'dataDir'));
  const retention = normalizeRetention(options.retention || {});
  if (!retention.enabled) {
    return {
      ok: true,
      enabled: false,
      deletedFiles: 0,
      deletedDirs: 0,
      freedBytes: 0,
      categories: {}
    };
  }

  const nowMs = options.now ? options.now().getTime() : Date.now();
  const summary = {
    ok: true,
    enabled: true,
    deletedFiles: 0,
    deletedDirs: 0,
    freedBytes: 0,
    categories: {
      candles: pruneCandleFiles(dataDir, retention.candleDays, nowMs),
      journals: pruneJournalFiles(dataDir, retention.journalDays, nowMs),
      supportBundles: pruneSupportBundles(path.join(path.dirname(dataDir), 'support_bundles'), retention.supportBundleDays, nowMs)
    }
  };
  for (const category of Object.values(summary.categories)) {
    summary.deletedFiles += category.deletedFiles || 0;
    summary.deletedDirs += category.deletedDirs || 0;
    summary.freedBytes += category.freedBytes || 0;
  }
  return summary;
}

function scanCandleIntegrity(options = {}) {
  const dataDir = path.resolve(required(options.dataDir, 'dataDir'));
  const candleRoot = path.join(dataDir, 'market_candles');
  const now = options.now || (() => new Date());
  const nowMs = now().getTime();
  const intervalMs = Math.max(1000, Number(options.intervalMs || DEFAULT_CANDLE_INTERVAL_MS));
  const staleMs = Math.max(intervalMs * 2, Number(options.staleMs || 5 * intervalMs));
  const issues = [];
  const instruments = [];
  const totals = {
    instruments: 0,
    files: 0,
    candles: 0,
    parseErrors: 0,
    invalidRows: 0,
    duplicateBuckets: 0,
    gaps: 0,
    staleInstruments: 0
  };

  if (!fs.existsSync(candleRoot)) {
    return {
      ok: true,
      checkedAt: now().toISOString(),
      candleRoot,
      totals,
      instruments,
      issues
    };
  }

  for (const entry of fs.readdirSync(candleRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const instrumentDir = path.join(candleRoot, entry.name);
    const result = scanInstrumentCandles(instrumentDir, entry.name, { intervalMs, staleMs, nowMs });
    instruments.push(result.instrument);
    issues.push(...result.issues);
    totals.instruments += 1;
    totals.files += result.instrument.files;
    totals.candles += result.instrument.candles;
    totals.parseErrors += result.instrument.parseErrors;
    totals.invalidRows += result.instrument.invalidRows;
    totals.duplicateBuckets += result.instrument.duplicateBuckets;
    totals.gaps += result.instrument.gaps;
    if (result.instrument.stale) totals.staleInstruments += 1;
  }

  return {
    ok: issues.length === 0,
    checkedAt: now().toISOString(),
    candleRoot,
    totals,
    instruments: instruments.sort((a, b) => String(b.lastBucket || '').localeCompare(String(a.lastBucket || ''))),
    issues: issues.slice(0, 200)
  };
}

function scanInstrumentCandles(instrumentDir, instrumentName, options = {}) {
  const instrument = {
    instrument: instrumentName,
    files: 0,
    candles: 0,
    parseErrors: 0,
    invalidRows: 0,
    duplicateBuckets: 0,
    gaps: 0,
    firstBucket: '',
    lastBucket: '',
    stale: false,
    staleMinutes: 0
  };
  const issues = [];
  const buckets = new Map();
  const files = fs.readdirSync(instrumentDir)
    .filter((fileName) => /\.jsonl$/i.test(fileName))
    .sort();

  for (const fileName of files) {
    instrument.files += 1;
    const filePath = path.join(instrumentDir, fileName);
    const rows = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    for (let index = 0; index < rows.length; index += 1) {
      const lineNo = index + 1;
      let candle;
      try {
        candle = JSON.parse(rows[index]);
      } catch (error) {
        instrument.parseErrors += 1;
        issues.push(candleIssue('parse_error', instrumentName, fileName, lineNo, error.message));
        continue;
      }
      const normalized = normalizeCandleForIntegrity(candle);
      if (!normalized.ok) {
        instrument.invalidRows += 1;
        issues.push(candleIssue('invalid_row', instrumentName, fileName, lineNo, normalized.reason));
        continue;
      }
      instrument.candles += 1;
      if (buckets.has(normalized.bucket)) {
        instrument.duplicateBuckets += 1;
        issues.push(candleIssue('duplicate_bucket', instrumentName, fileName, lineNo, `Duplicate bucket ${normalized.bucket}.`));
      }
      buckets.set(normalized.bucket, { ...normalized, fileName, lineNo });
    }
  }

  const sorted = Array.from(buckets.values()).sort((a, b) => a.bucket - b.bucket);
  for (let index = 0; index < sorted.length; index += 1) {
    const candle = sorted[index];
    instrument.firstBucket = earlierBucket(instrument.firstBucket, candle.startTime);
    instrument.lastBucket = laterBucket(instrument.lastBucket, candle.startTime);
    if (index === 0) continue;
    const prev = sorted[index - 1];
    const gap = candle.bucket - prev.bucket;
    if (gap > options.intervalMs * 1.5) {
      instrument.gaps += 1;
      issues.push(candleIssue('gap', instrumentName, candle.fileName, candle.lineNo, `Gap ${Math.round(gap / options.intervalMs)} candles after ${prev.startTime}.`));
    }
  }

  const last = sorted[sorted.length - 1];
  if (last) {
    const ageMs = options.nowMs - last.bucket;
    instrument.staleMinutes = Math.max(0, Math.round(ageMs / 60000));
    instrument.stale = ageMs > options.staleMs;
    if (instrument.stale) {
      issues.push(candleIssue('stale', instrumentName, last.fileName, last.lineNo, `Latest candle is ${instrument.staleMinutes} minutes old.`));
    }
  }

  return { instrument, issues };
}

function normalizeCandleForIntegrity(candle = {}) {
  const bucket = Number(candle.bucket);
  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  if (![bucket, open, high, low, close].every(Number.isFinite)) {
    return { ok: false, reason: 'bucket/open/high/low/close must be numeric.' };
  }
  if (high < low) return { ok: false, reason: 'high is below low.' };
  if (open > high || open < low || close > high || close < low) {
    return { ok: false, reason: 'open/close must be within high-low range.' };
  }
  return {
    ok: true,
    bucket,
    startTime: candle.startTime || new Date(bucket).toISOString()
  };
}

function candleIssue(type, instrument, fileName, lineNo, message) {
  return {
    type,
    instrument,
    file: fileName,
    line: lineNo,
    message
  };
}

function normalizeRetention(value = {}) {
  return {
    enabled: value.enabled !== false,
    candleDays: clampDays(value.candleDays, 30),
    journalDays: clampDays(value.journalDays, 14),
    supportBundleDays: clampDays(value.supportBundleDays, 7)
  };
}

function pruneCandleFiles(dataDir, keepDays, nowMs) {
  const candleRoot = path.join(dataDir, 'market_candles');
  const cutoffMs = nowMs - keepDays * 24 * 60 * 60 * 1000;
  const summary = emptyRetentionCategory();
  if (!fs.existsSync(candleRoot)) return summary;
  for (const filePath of walkFiles(candleRoot)) {
    if (!/\.jsonl$/i.test(filePath)) continue;
    const fileDay = path.basename(filePath).replace(/\.jsonl$/i, '');
    const dayMs = Date.parse(`${fileDay}T23:59:59.999Z`);
    const stat = fs.statSync(filePath);
    const ageMs = Number.isFinite(dayMs) ? dayMs : stat.mtimeMs;
    if (ageMs >= cutoffMs) continue;
    deleteFile(filePath, stat, summary);
  }
  summary.deletedDirs += removeEmptyDirs(candleRoot);
  return summary;
}

function pruneJournalFiles(dataDir, keepDays, nowMs) {
  const cutoffMs = nowMs - keepDays * 24 * 60 * 60 * 1000;
  const summary = emptyRetentionCategory();
  if (!fs.existsSync(dataDir)) return summary;
  for (const entry of fs.readdirSync(dataDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!/\.jsonl$/i.test(entry.name)) continue;
    if (entry.name === JOURNAL_FILE) continue;
    const filePath = path.join(dataDir, entry.name);
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs >= cutoffMs) continue;
    deleteFile(filePath, stat, summary);
  }
  return summary;
}

function pruneSupportBundles(supportRoot, keepDays, nowMs) {
  const cutoffMs = nowMs - keepDays * 24 * 60 * 60 * 1000;
  const summary = emptyRetentionCategory();
  if (!fs.existsSync(supportRoot)) return summary;
  for (const entry of fs.readdirSync(supportRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(supportRoot, entry.name);
    const stat = fs.statSync(dirPath);
    if (stat.mtimeMs >= cutoffMs) continue;
    const bytes = directorySize(dirPath);
    fs.rmSync(dirPath, { recursive: true, force: true });
    summary.deletedDirs += 1;
    summary.freedBytes += bytes;
  }
  return summary;
}

function runNextMigration(manifest, context) {
  const fromVersion = Number(manifest.schemaVersion || 0);
  if (fromVersion === 0) {
    const next = {
      ...manifest,
      schemaVersion: 1,
      updatedAt: context.now().toISOString()
    };
    return {
      manifest: next,
      event: createMigrationEvent('baseline-v1', 'Initialized schema version 1.', next, context.now)
    };
  }
  throw new Error(`No migration path from local data schema ${fromVersion}.`);
}

function readManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (_error) {
    return {};
  }
}

function normalizeManifest(value = {}, context = {}) {
  const nowText = context.now().toISOString();
  return {
    schemaVersion: Number(value.schemaVersion || 0),
    createdAt: value.createdAt || nowText,
    updatedAt: value.updatedAt || nowText,
    appVersion: value.appVersion || context.appVersion || '',
    paths: value.paths || dataStorePaths(context.dataDir),
    fileCounts: value.fileCounts || {}
  };
}

function dataStorePaths(dataDir) {
  return {
    root: dataDir,
    marketCandles: path.join(dataDir, 'market_candles'),
    modules: path.join(dataDir, 'modules'),
    supportBundles: path.join(path.dirname(dataDir), 'support_bundles')
  };
}

function countDataStoreFiles(dataDir) {
  const counts = {
    candleFiles: 0,
    moduleFiles: 0,
    journalFiles: 0,
    metadataFiles: 0,
    otherFiles: 0
  };
  for (const filePath of walkFiles(dataDir)) {
    const relative = path.relative(dataDir, filePath).replace(/\\/g, '/');
    if (relative.startsWith('market_candles/') && /\.jsonl$/i.test(relative)) counts.candleFiles += 1;
    else if (relative.startsWith('modules/')) counts.moduleFiles += 1;
    else if (/\.jsonl$/i.test(relative)) counts.journalFiles += 1;
    else if (/instrument_metadata|data_store_manifest/i.test(relative)) counts.metadataFiles += 1;
    else counts.otherFiles += 1;
  }
  return counts;
}

function emptyRetentionCategory() {
  return {
    deletedFiles: 0,
    deletedDirs: 0,
    freedBytes: 0
  };
}

function deleteFile(filePath, stat, summary) {
  fs.unlinkSync(filePath);
  summary.deletedFiles += 1;
  summary.freedBytes += stat.size;
}

function removeEmptyDirs(rootDir) {
  let removed = 0;
  const dirs = walkDirs(rootDir).sort((a, b) => b.length - a.length);
  for (const dirPath of dirs) {
    if (dirPath === rootDir) continue;
    try {
      if (fs.readdirSync(dirPath).length === 0) {
        fs.rmdirSync(dirPath);
        removed += 1;
      }
    } catch (_error) {}
  }
  return removed;
}

function directorySize(rootDir) {
  return walkFiles(rootDir).reduce((total, filePath) => {
    try {
      return total + fs.statSync(filePath).size;
    } catch (_error) {
      return total;
    }
  }, 0);
}

function clampDays(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(3650, Math.floor(number)));
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

function createMigrationEvent(id, message, manifest, now) {
  return {
    id,
    schemaVersion: manifest.schemaVersion || CURRENT_DATA_STORE_VERSION,
    message,
    appliedAt: now().toISOString()
  };
}

function writeManifest(manifestPath, manifest) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const tmpPath = `${manifestPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(tmpPath, manifestPath);
}

function appendMigrationEvent(journalPath, event) {
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  fs.appendFileSync(journalPath, `${JSON.stringify(event)}\n`);
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(filePath);
      else if (entry.isFile()) out.push(filePath);
    }
  }
  return out;
}

function walkDirs(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    out.push(current);
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) stack.push(path.join(current, entry.name));
    }
  }
  return out;
}

function required(value, name) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${name} is required.`);
  return text;
}

module.exports = {
  CURRENT_DATA_STORE_VERSION,
  MANIFEST_FILE,
  JOURNAL_FILE,
  ensureDataStore,
  applyDataRetention,
  normalizeRetention,
  scanCandleIntegrity
};
