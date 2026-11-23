const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'release', 'packaged-first-run-verification.md');

const STEPS = [
  ['Fresh profile', 'Start from a clean OS user profile with no existing Trade Assist user data.'],
  ['Launch', 'Open the installed packaged app and confirm the first screen is the usable Trade Assist shell.'],
  ['Customer mode', 'Confirm internal-only controls are hidden and license/safety settings are visible.'],
  ['License sync', 'Enter licensed user id and license key, run Sync License, and confirm status changes without exposing secrets.'],
  ['Module download', 'Confirm only entitled signed modules install and rejected/expired modules remain disabled.'],
  ['Broker login', 'Open the broker panel, login to Alice Blue, and confirm session/account state is detected.'],
  ['Account mapping', 'Confirm Account, Balance, and Day P&L display correctly or show a clear broker-specific mapping error.'],
  ['Watchlist capture', 'Open watchlist 1 with current-day CE/PE scrips and confirm CE and PE metadata counts are non-zero.'],
  ['Candles', 'Confirm live ticks create current-day candles and stale old-day instruments are not shown in the dropdown.'],
  ['Safety default', 'Confirm Auto Trade is off by default on the fresh packaged install.'],
  ['Risk settings', 'Set risk values, save, restart, and confirm they persist.'],
  ['Support bundle', 'Export Support Bundle and confirm it redacts broker tokens, license keys, private keys, and secrets.'],
  ['Restart no trade', 'Click Restart App with no active trade and confirm the app relaunches cleanly.'],
  ['Restart active trade warning', 'With a controlled active strategy position, confirm Restart App shows the active-trade warning before force restart.'],
  ['Auto-trade controlled test', 'On a controlled test account only, confirm order placement, protective SL, completed-SL modify skip, and modify rate limit behavior.']
];

function main() {
  const options = parseArgs(process.argv.slice(2));
  const markdown = renderFirstRunChecklist({
    version: require(path.join(ROOT, 'package.json')).version,
    tag: options.tag || '',
    generatedAt: new Date().toISOString()
  });
  if (options.write) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, markdown);
    console.log(`Wrote ${REPORT_PATH}`);
  } else {
    process.stdout.write(markdown);
  }
}

function renderFirstRunChecklist(meta = {}) {
  const lines = [
    '# Packaged First-Run Verification',
    '',
    `Version: ${meta.version || ''}`,
    `Tag: ${meta.tag || 'pending'}`,
    `Generated: ${meta.generatedAt || ''}`,
    '',
    'Use this after installing the signed customer package on a fresh machine.',
    '',
    '| Status | Area | Verification | Evidence |',
    '| --- | --- | --- | --- |'
  ];
  for (const [area, step] of STEPS) {
    lines.push(`| [ ] | ${area} | ${step} | screenshot/support bundle/log note |`);
  }
  lines.push('');
  lines.push('## Release Decision', '');
  lines.push('- [ ] Accepted for customer distribution');
  lines.push('- [ ] Blocked pending fixes');
  lines.push('- [ ] Known limitations documented');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') {
      options.write = true;
    } else if (arg === '--tag') {
      options.tag = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--tag=')) {
      options.tag = arg.slice('--tag='.length);
    }
  }
  return options;
}

if (require.main === module) {
  main();
}

module.exports = {
  STEPS,
  renderFirstRunChecklist,
  parseArgs
};
