const fs = require('fs');
const os = require('os');
const path = require('path');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const brokerArg = process.argv.find((arg) => arg.startsWith('--broker='));
const broker = safePathPart((brokerArg && brokerArg.split('=')[1]) || 'aliceblue');
const dataDir = path.join(os.homedir(), 'Library', 'Application Support', 'Trade Assist', 'data');
const candleRoot = path.join(dataDir, 'market_candles');
const metadataPath = path.join(dataDir, `instrument_metadata_${broker}.json`);

function main() {
  const metadata = loadMetadata();
  const repairs = planRepairs(metadata);
  console.log(`Broker: ${broker}`);
  console.log(`Metadata file: ${metadataPath}`);
  console.log(`Known instruments: ${metadata.size}`);
  console.log(`Repairable candle folders: ${repairs.length}`);
  if (!repairs.length) {
    console.log('No candle files were changed. Open the broker watchlist/option chain after restart so metadata can be learned first.');
    return;
  }

  for (const repair of repairs) {
    console.log(`${apply ? 'Repairing' : 'Would repair'} ${repair.fromDir} -> ${repair.toDir} (${repair.files.length} file${repair.files.length === 1 ? '' : 's'})`);
    if (apply) applyRepair(repair);
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write changes.');
  }
}

function loadMetadata() {
  const map = new Map();
  try {
    const rows = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    for (const row of Array.isArray(rows) ? rows : Object.values(rows || {})) {
      const token = String(row && row.token || '').trim();
      const symbol = String(row && (row.symbol || row.trading_symbol) || '').trim();
      if (!token || !symbol || symbol === `Token ${token}`) continue;
      map.set(token, {
        token,
        symbol,
        trading_symbol: row.trading_symbol || symbol,
        exchange: row.exchange || '',
        segment: row.segment || ''
      });
    }
  } catch (_) {}
  return map;
}

function planRepairs(metadata) {
  if (!fs.existsSync(candleRoot)) return [];
  const repairs = [];
  for (const dirName of fs.readdirSync(candleRoot)) {
    const fromDir = path.join(candleRoot, dirName);
    if (!fs.statSync(fromDir).isDirectory()) continue;
    const token = inferTokenFromDir(dirName);
    const meta = metadata.get(token);
    if (!meta) continue;
    const toDir = path.join(candleRoot, safePathPart(`${meta.symbol}_${token}`));
    const sameDir = path.resolve(fromDir) === path.resolve(toDir);
    const files = fs.readdirSync(fromDir)
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => path.join(fromDir, name));
    if (!files.length) continue;
    if (sameDir && !needsMetadataRewrite(files, token, meta)) continue;
    repairs.push({ token, meta, fromDir, toDir, files });
  }
  return repairs;
}

function needsMetadataRewrite(files, token, meta) {
  for (const filePath of files) {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\n/).filter(Boolean);
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (String(row.token || '') !== token) continue;
        if (row.symbol !== meta.symbol) return true;
        if (meta.exchange && row.exchange !== meta.exchange) return true;
        if (meta.segment && row.segment !== meta.segment) return true;
      } catch (_) {}
    }
  }
  return false;
}

function applyRepair(repair) {
  fs.mkdirSync(repair.toDir, { recursive: true });
  for (const filePath of repair.files) {
    const nextPath = path.join(repair.toDir, path.basename(filePath));
    const rows = fs.readFileSync(filePath, 'utf8')
      .split(/\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          const row = JSON.parse(line);
          if (String(row.token || '') === repair.token) {
            row.symbol = repair.meta.symbol;
            if (repair.meta.exchange) row.exchange = repair.meta.exchange;
            if (repair.meta.segment) row.segment = repair.meta.segment;
          }
          return JSON.stringify(row);
        } catch (_) {
          return line;
        }
      });
    const existing = fs.existsSync(nextPath)
      ? fs.readFileSync(nextPath, 'utf8').split(/\n/).filter(Boolean)
      : [];
    const merged = mergeJsonlRows([...existing, ...rows]);
    fs.writeFileSync(nextPath, merged.join('\n') + (merged.length ? '\n' : ''));
  }
  if (repair.fromDir !== repair.toDir) {
    for (const filePath of repair.files) fs.unlinkSync(filePath);
    if (fs.readdirSync(repair.fromDir).length === 0) fs.rmdirSync(repair.fromDir);
  }
}

function mergeJsonlRows(lines) {
  const byKey = new Map();
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      const key = `${row.token || ''}:${row.bucket || ''}`;
      byKey.set(key, JSON.stringify(row));
    } catch (_) {
      byKey.set(`raw:${byKey.size}`, line);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    try {
      return Number(JSON.parse(a).bucket || 0) - Number(JSON.parse(b).bucket || 0);
    } catch (_) {
      return 0;
    }
  });
}

function inferTokenFromDir(dirName) {
  const match = String(dirName || '').match(/_([0-9A-Za-z.-]+)$/);
  return match ? match[1] : '';
}

function safePathPart(value) {
  return String(value || 'unknown').replace(/[^a-z0-9_.-]+/gi, '_').slice(0, 160);
}

main();
