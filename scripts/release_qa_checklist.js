const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'release', 'clean-machine-qa-checklist.md');

const CHECKS = [
  {
    section: 'Installer Integrity',
    items: [
      'Install macOS DMG on a clean macOS user profile and confirm Gatekeeper opens Trade Assist without a warning.',
      'Install Windows NSIS EXE on a clean Windows user profile and confirm publisher shows Skand Analytics.',
      'Confirm installed app name, menu name, window title, and app icon show Trade Assist.',
      'Confirm uninstall does not delete broker/customer data unless the user explicitly chooses that path.'
    ]
  },
  {
    section: 'First Run And Licensing',
    items: [
      'Launch with no existing user data and confirm customer-mode settings are visible without internal admin controls.',
      'Enter licensed user id and license key, then run Sync License.',
      'Confirm signed module manifest validates and only entitled features appear as available.',
      'Confirm offline grace messaging is clear when the license server is unreachable.',
      'Confirm Restart App works after license sync and relaunches into the same customer-mode state.'
    ]
  },
  {
    section: 'Broker And Market Capture',
    items: [
      'Login to Alice Blue from the embedded broker panel.',
      'Open watchlist 1 with current-day CE and PE option scrips.',
      'Confirm Account, Balance, and Day P&L populate or show a broker-specific error.',
      'Confirm CE and PE metadata counts are non-zero.',
      'Confirm live ticks create current-day candles and old-day instruments are not shown in the dropdown.'
    ]
  },
  {
    section: 'Trading Safety',
    items: [
      'Confirm Auto Trade is off by default for a fresh install.',
      'Enable Auto Trade only on a controlled test account.',
      'Confirm risk limits, emergency stop, and max open position settings persist after restart.',
      'Confirm protective SL is placed after activation criteria when a test position is entered.',
      'Confirm completed SL orders are not modified and modify rate limit is respected.'
    ]
  },
  {
    section: 'Support And Recovery',
    items: [
      'Run Check Candles and confirm the integrity panel renders.',
      'Export Support Bundle and verify it opens the generated support folder.',
      'Confirm support bundle redacts secrets, broker tokens, license keys, and private material.',
      'Restart during no active trade and confirm app restores broker visibility, settings, and candle state.',
      'Attempt restart during active strategy position and confirm the active-trade warning appears.'
    ]
  }
];

function main() {
  const options = parseArgs(process.argv.slice(2));
  const markdown = renderChecklist({
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

function renderChecklist(meta = {}) {
  const lines = [
    '# Clean-Machine Release QA',
    '',
    `Version: ${meta.version || ''}`,
    `Tag: ${meta.tag || 'pending'}`,
    `Generated: ${meta.generatedAt || ''}`,
    '',
    'Run this checklist on fresh macOS and Windows machines after signed installer artifacts are produced.',
    ''
  ];
  for (const group of CHECKS) {
    lines.push(`## ${group.section}`, '');
    for (const item of group.items) lines.push(`- [ ] ${item}`);
    lines.push('');
  }
  lines.push('## Sign Off', '');
  lines.push('- [ ] macOS installer accepted');
  lines.push('- [ ] Windows installer accepted');
  lines.push('- [ ] packaged app first-run verification accepted');
  lines.push('- [ ] release notes updated with known limitations');
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
  CHECKS,
  renderChecklist,
  parseArgs
};
