const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyzeDiscoveryRows } = require('../src/brokers/discovery_mapping_probe');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.config || defaultConfigPath();
  const config = readJson(configPath, {});
  const brokerId = args.broker || config.selectedBroker || 'aliceblue';
  const filePath = args.file || defaultDiscoveryPath();
  const rows = readJsonl(filePath);
  const report = analyzeDiscoveryRows({
    brokerId,
    rows,
    config
  });

  report.file = filePath;
  report.configPath = fs.existsSync(configPath) ? configPath : '';

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  printTextReport(report);
}

function printTextReport(report) {
  console.log(`Broker discovery mapping probe`);
  console.log(`Broker: ${report.broker}`);
  console.log(`File: ${report.file}`);
  console.log(`Rows: ${report.totalRows}`);
  console.log(`Mapped rows: ${report.mappedRows}`);
  console.log(`Unmapped rows: ${report.unmappedRows}`);
  console.log(`Field coverage:`);
  for (const [field, count] of Object.entries(report.fields)) {
    console.log(`  ${field}: ${count}`);
  }
  console.log(`Gaps: ${report.gaps.length ? report.gaps.join(', ') : 'none'}`);
  if (report.samples.length) {
    console.log(`Samples:`);
    for (const sample of report.samples) {
      console.log(`  ${sample.mapped ? 'mapped' : 'miss'} ${sample.status || '--'} ${sample.url} ${sample.fields.length ? `[${sample.fields.join(', ')}]` : ''}`);
    }
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      args.json = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      args[key] = argv[index + 1] || '';
      index += 1;
    }
  }
  return args;
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function defaultConfigPath() {
  return path.join(appSupportDir(), 'algo_alice_blue_config.json');
}

function defaultDiscoveryPath() {
  return path.join(appSupportDir(), 'data', `broker_api_discovery_${new Date().toISOString().slice(0, 10)}.jsonl`);
}

function appSupportDir() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Trade Assist');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'Trade Assist');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Trade Assist');
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  readJsonl
};
