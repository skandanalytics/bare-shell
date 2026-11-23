const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MIN_NODE_MAJOR = 20;

function main() {
  const options = parseArgs(process.argv.slice(2));
  process.chdir(ROOT);

  assertNodeVersion();
  assertCommand(npmCommand(), 'npm');

  console.log(`Trade Assist source setup (${options.platform || process.platform})`);
  console.log(`Repository: ${ROOT}`);

  if (!options.skipInstall && process.env.TRADE_ASSIST_SKIP_INSTALL !== '1') {
    const installCommand = fs.existsSync(path.join(ROOT, 'package-lock.json')) ? ['ci'] : ['install'];
    run('npm', installCommand);
  } else {
    console.log('Skipping dependency install.');
  }

  run('npm', ['run', 'icons:generate']);

  if (!options.skipCheck && process.env.TRADE_ASSIST_SKIP_CHECK !== '1') {
    run('npm', ['run', 'check']);
  } else {
    console.log('Skipping syntax check.');
  }

  console.log('');
  console.log('Trade Assist source setup complete.');
  console.log('Start the app with: npm start');
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--platform') {
      options.platform = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--platform=')) {
      options.platform = arg.slice('--platform='.length);
    } else if (arg === '--skip-install') {
      options.skipInstall = true;
    } else if (arg === '--skip-check') {
      options.skipCheck = true;
    }
  }
  return options;
}

function assertNodeVersion() {
  const version = process.versions.node || '';
  const major = Number(version.split('.')[0]);
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    throw new Error(`Node.js ${MIN_NODE_MAJOR}+ is required. Current version: ${version || 'unknown'}`);
  }
}

function assertCommand(command, label) {
  const result = spawnSync(command, ['--version'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(`${label} is required but was not found on PATH.`);
  }
  console.log(`${label}: ${String(result.stdout || '').trim()}`);
}

function run(label, args) {
  const command = label === 'npm' ? npmCommand() : label;
  console.log(`> ${[label, ...args].join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(`${label} ${args.join(' ')} failed with exit ${result.status}`);
  }
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Source setup failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs
};
