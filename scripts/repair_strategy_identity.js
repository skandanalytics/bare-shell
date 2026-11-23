const fs = require('fs');
const os = require('os');
const path = require('path');
const { BUILTIN_MOMENTUM_REVERSAL, withStrategyIdentity } = require('../src/strategy_identity');

const DEFAULT_DATA_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Trade Assist', 'data');
const LEGACY_DATA_DIRS = [
  path.join(os.homedir(), 'Library', 'Application Support', 'algo-alice-blue', 'data'),
  path.join(os.homedir(), 'Library', 'Application Support', 'Algo Alice Blue', 'data')
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDirs = resolveDataDirs(args);
  const apply = Boolean(args.apply);
  const files = dataDirs.flatMap(findJournalFiles);
  const results = files.map((filePath) => repairFile(filePath, { apply }));
  const changed = results.filter((row) => row.changedRows > 0);

  console.log(`Data dirs: ${dataDirs.join(', ')}`);
  console.log(`Journal files scanned: ${files.length}`);
  console.log(`Files needing strategy identity: ${changed.length}`);
  for (const row of results) {
    if (!row.changedRows) continue;
    console.log(`${apply ? 'Updated' : 'Would update'} ${row.filePath} (${row.changedRows}/${row.totalRows} rows)`);
    if (row.backupPath) console.log(`  backup: ${row.backupPath}`);
  }
  if (!apply && changed.length) {
    console.log('Dry run only. Re-run with --apply to write changes.');
  }
}

function resolveDataDirs(args = {}) {
  if (args.dataDir) return [args.dataDir];
  if (process.env.ALGO_DATA_DIR) return [process.env.ALGO_DATA_DIR];
  return [DEFAULT_DATA_DIR, ...LEGACY_DATA_DIRS]
    .filter((item, index, rows) => rows.indexOf(item) === index);
}

function repairFile(filePath, options = {}) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\n/);
  let changedRows = 0;
  let totalRows = 0;
  const repaired = lines.map((line) => {
    if (!line.trim()) return line;
    let row;
    try {
      row = JSON.parse(line);
    } catch (_) {
      return line;
    }
    totalRows += 1;
    if (hasStrategyIdentity(row)) return line;
    changedRows += 1;
    return JSON.stringify(withStrategyIdentity(row, BUILTIN_MOMENTUM_REVERSAL));
  });

  let backupPath = '';
  if (changedRows && options.apply) {
    backupPath = `${filePath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(filePath, backupPath);
    fs.writeFileSync(filePath, repaired.join('\n'));
  }
  return { filePath, totalRows, changedRows, backupPath };
}

function findJournalFiles(dataDir) {
  if (!fs.existsSync(dataDir)) return [];
  return fs.readdirSync(dataDir)
    .filter((name) => /^strategy_(events|trades)_[a-z0-9_-]+\.jsonl$/i.test(name))
    .map((name) => path.join(dataDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .sort();
}

function hasStrategyIdentity(row) {
  return Boolean(row && row.strategyId && row.strategyName);
}

function parseArgs(argv) {
  const args = { apply: false, dataDir: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--data-dir') {
      args.dataDir = argv[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--data-dir=')) {
      args.dataDir = arg.slice('--data-dir='.length);
    }
  }
  return args;
}

if (require.main === module) {
  main();
}

module.exports = {
  findJournalFiles,
  repairFile,
  resolveDataDirs
};
