const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  applyDataRetention,
  CURRENT_DATA_STORE_VERSION,
  JOURNAL_FILE,
  MANIFEST_FILE,
  ensureDataStore,
  scanCandleIntegrity
} = require('../src/data_store');

function main() {
  assertCreatesManifest();
  assertIdempotentExistingManifest();
  assertRejectsFutureSchema();
  assertRetentionCleanup();
  assertCandleIntegrityScan();
  console.log('data store migration tests passed');
}

function assertCreatesManifest() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-store-test-'));
  fs.mkdirSync(path.join(dataDir, 'market_candles', 'SENSEX_1'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'market_candles', 'SENSEX_1', '2026-11-19.jsonl'), '{}\n');
  fs.writeFileSync(path.join(dataDir, 'strategy_events_aliceblue.jsonl'), '{}\n');

  const result = ensureDataStore({
    dataDir,
    appVersion: '0.1.0',
    now: fixedNow
  });

  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, CURRENT_DATA_STORE_VERSION);
  assert.deepEqual(result.appliedMigrations, ['baseline-v1']);
  assert.equal(fs.existsSync(path.join(dataDir, MANIFEST_FILE)), true);
  assert.equal(fs.existsSync(path.join(dataDir, JOURNAL_FILE)), true);

  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, MANIFEST_FILE), 'utf8'));
  assert.equal(manifest.schemaVersion, CURRENT_DATA_STORE_VERSION);
  assert.equal(manifest.appVersion, '0.1.0');
  assert.equal(manifest.fileCounts.candleFiles, 1);
  assert.equal(manifest.fileCounts.journalFiles, 1);

  const journalRows = fs.readFileSync(path.join(dataDir, JOURNAL_FILE), 'utf8').trim().split(/\n/);
  assert.equal(journalRows.length, 1);
  assert.equal(JSON.parse(journalRows[0]).id, 'baseline-v1');
}

function assertIdempotentExistingManifest() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-store-existing-'));
  const first = ensureDataStore({ dataDir, appVersion: '0.1.0', now: fixedNow });
  const second = ensureDataStore({ dataDir, appVersion: '0.1.1', now: fixedLater });
  assert.equal(first.appliedMigrations.length, 1);
  assert.equal(second.appliedMigrations.length, 0);
  const journalRows = fs.readFileSync(path.join(dataDir, JOURNAL_FILE), 'utf8').trim().split(/\n/);
  assert.equal(journalRows.length, 1);
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, MANIFEST_FILE), 'utf8'));
  assert.equal(manifest.appVersion, '0.1.1');
  assert.equal(manifest.updatedAt, '2026-11-19T10:05:00.000Z');
}

function assertRejectsFutureSchema() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-store-future-'));
  fs.writeFileSync(path.join(dataDir, MANIFEST_FILE), JSON.stringify({
    schemaVersion: CURRENT_DATA_STORE_VERSION + 1,
    createdAt: '2026-11-19T10:00:00.000Z',
    updatedAt: '2026-11-19T10:00:00.000Z'
  }));
  assert.throws(() => ensureDataStore({ dataDir, appVersion: '0.1.0', now: fixedNow }), /newer than supported/);
}

function assertRetentionCleanup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-retention-'));
  const dataDir = path.join(root, 'data');
  const supportDir = path.join(root, 'support_bundles');
  fs.mkdirSync(path.join(dataDir, 'market_candles', 'OLD_1'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'market_candles', 'NEW_1'), { recursive: true });
  fs.mkdirSync(path.join(supportDir, 'support_old'), { recursive: true });
  const oldCandle = path.join(dataDir, 'market_candles', 'OLD_1', '2026-10-01.jsonl');
  const newCandle = path.join(dataDir, 'market_candles', 'NEW_1', '2026-11-19.jsonl');
  const oldJournal = path.join(dataDir, 'strategy_events_aliceblue.jsonl');
  const migrationJournal = path.join(dataDir, JOURNAL_FILE);
  const supportFile = path.join(supportDir, 'support_old', 'summary.json');
  fs.writeFileSync(oldCandle, '{}\n');
  fs.writeFileSync(newCandle, '{}\n');
  fs.writeFileSync(oldJournal, '{}\n');
  fs.writeFileSync(migrationJournal, '{}\n');
  fs.writeFileSync(supportFile, '{}\n');
  touch(oldJournal, '2026-10-01T00:00:00.000Z');
  touch(path.join(supportDir, 'support_old'), '2026-10-01T00:00:00.000Z');

  const result = applyDataRetention({
    dataDir,
    retention: {
      enabled: true,
      candleDays: 30,
      journalDays: 14,
      supportBundleDays: 7
    },
    now: fixedNow
  });

  assert.equal(result.enabled, true);
  assert.equal(fs.existsSync(oldCandle), false);
  assert.equal(fs.existsSync(newCandle), true);
  assert.equal(fs.existsSync(oldJournal), false);
  assert.equal(fs.existsSync(migrationJournal), true);
  assert.equal(fs.existsSync(path.join(supportDir, 'support_old')), false);
  assert.equal(result.deletedFiles >= 2, true);

  const disabled = applyDataRetention({
    dataDir,
    retention: { enabled: false },
    now: fixedNow
  });
  assert.equal(disabled.enabled, false);
}

function assertCandleIntegrityScan() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'candle-integrity-'));
  const dir = path.join(dataDir, 'market_candles', 'SENSEX_1');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-11-19.jsonl'), [
    JSON.stringify(candle('2026-11-19T09:30:00.000Z', 100, 105, 99, 101)),
    JSON.stringify(candle('2026-11-19T09:30:00.000Z', 101, 106, 100, 102)),
    JSON.stringify(candle('2026-11-19T09:33:00.000Z', 102, 107, 101, 103)),
    JSON.stringify({ bucket: Date.parse('2026-11-19T09:34:00.000Z'), open: 108, high: 107, low: 100, close: 102 }),
    '{broken'
  ].join('\n'));

  const report = scanCandleIntegrity({
    dataDir,
    intervalMs: 60_000,
    staleMs: 5 * 60_000,
    now: () => new Date('2026-11-19T09:40:00.000Z')
  });

  assert.equal(report.ok, false);
  assert.equal(report.totals.files, 1);
  assert.equal(report.totals.candles, 3);
  assert.equal(report.totals.parseErrors, 1);
  assert.equal(report.totals.invalidRows, 1);
  assert.equal(report.totals.duplicateBuckets, 1);
  assert.equal(report.totals.gaps, 1);
  assert.equal(report.totals.staleInstruments, 1);
  assert.equal(report.issues.some((issue) => issue.type === 'duplicate_bucket'), true);
  assert.equal(report.issues.some((issue) => issue.type === 'gap'), true);
  assert.equal(report.issues.some((issue) => issue.type === 'stale'), true);
}

function candle(iso, open, high, low, close) {
  const bucket = Date.parse(iso);
  return {
    bucket,
    startTime: iso,
    open,
    high,
    low,
    close
  };
}

function touch(filePath, isoTime) {
  const date = new Date(isoTime);
  fs.utimesSync(filePath, date, date);
}

function fixedNow() {
  return new Date('2026-11-19T10:00:00.000Z');
}

function fixedLater() {
  return new Date('2026-11-19T10:05:00.000Z');
}

main();
