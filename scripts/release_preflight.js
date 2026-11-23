const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { validateEnv } = require('./check_release_signing_env');

const ROOT = path.join(__dirname, '..');

function main() {
  const options = parseArgs(process.argv.slice(2));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const tag = options.tag || `v${pkg.version}`;
  const platform = options.platform || 'all';
  const checks = [];

  checks.push(checkGitClean());
  checks.push(checkTagAvailable(tag));
  checks.push(checkSigning(platform));

  if (!options.skipCommands) {
    checks.push(runCheck('npm run check'));
    checks.push(runCheck('npm run test:package-boundary'));
    checks.push(runCheck('npm run release:source-boundary'));
    checks.push(runCheck('npm run package:shell'));
  }

  const failed = checks.filter((check) => !check.ok);
  for (const check of checks) {
    console.log(`${check.ok ? 'OK' : 'FAIL'} ${check.name}${check.detail ? `: ${check.detail}` : ''}`);
  }
  if (failed.length) {
    console.error(`Release preflight failed for ${tag}. Fix the failed checks before tagging.`);
    process.exit(1);
  }
  console.log(`Release preflight ready for ${tag}.`);
}

function checkGitClean() {
  const result = git(['status', '--porcelain']);
  const output = String(result.stdout || '').trim();
  return {
    name: 'git worktree clean',
    ok: result.status === 0 && output.length === 0,
    detail: output ? 'uncommitted changes exist' : ''
  };
}

function checkTagAvailable(tag) {
  const result = git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`]);
  return {
    name: `release tag available (${tag})`,
    ok: result.status !== 0,
    detail: result.status === 0 ? 'tag already exists' : ''
  };
}

function checkSigning(platform) {
  const result = validateEnv({
    platform,
    requireNotarization: platform === 'mac' || platform === 'all'
  });
  return {
    name: `signing secrets ready (${result.platform})`,
    ok: result.ok,
    detail: result.missing.join('; ')
  };
}

function runCheck(command) {
  const result = spawnSync(command, {
    cwd: ROOT,
    shell: true,
    stdio: optionsPassthrough()
  });
  return {
    name: command,
    ok: result.status === 0,
    detail: result.status === 0 ? '' : `exit ${result.status}`
  };
}

function optionsPassthrough() {
  return process.env.RELEASE_PREFLIGHT_VERBOSE ? 'inherit' : 'pipe';
}

function git(args) {
  return spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8'
  });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--tag') {
      options.tag = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--tag=')) {
      options.tag = arg.slice('--tag='.length);
    } else if (arg === '--platform') {
      options.platform = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--platform=')) {
      options.platform = arg.slice('--platform='.length);
    } else if (arg === '--skip-commands') {
      options.skipCommands = true;
    }
  }
  return options;
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs
};
