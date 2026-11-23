const { spawnSync } = require('child_process');
const { parseArgs, validateEnv } = require('./check_release_signing_env');

function main() {
  const options = parseArgs(process.argv.slice(2));
  const platform = options.platform || 'all';
  const requireNotarization = platform === 'mac';
  const validation = validateEnv({ platform, requireNotarization });

  for (const warning of validation.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  if (!validation.ok) {
    console.error(`Release signing environment is incomplete for ${validation.platform}.`);
    for (const item of validation.missing) {
      console.error(`- Missing ${item}`);
    }
    process.exit(1);
  }

  const env = normalizeSigningEnv(validation.platform, process.env);
  const args = builderArgs(validation.platform);
  const result = spawnSync('electron-builder', args, {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.error) throw result.error;
  process.exit(result.status || 0);
}

function normalizeSigningEnv(platform, env) {
  const next = { ...env };
  if (platform === 'mac') {
    next.CSC_LINK = next.CSC_LINK || next.MAC_CSC_LINK;
    next.CSC_KEY_PASSWORD = next.CSC_KEY_PASSWORD || next.MAC_CSC_KEY_PASSWORD;
  } else if (platform === 'win') {
    next.CSC_LINK = next.CSC_LINK || next.WIN_CSC_LINK;
    next.CSC_KEY_PASSWORD = next.CSC_KEY_PASSWORD || next.WIN_CSC_KEY_PASSWORD;
  }
  return next;
}

function builderArgs(platform) {
  if (platform === 'mac') return ['--mac', 'dmg', 'zip', '--publish=never'];
  if (platform === 'win') return ['--win', 'nsis', '--publish=never'];
  return ['--mac', 'dmg', 'zip', '--win', 'nsis', '--publish=never'];
}

if (require.main === module) {
  main();
}

module.exports = {
  builderArgs,
  normalizeSigningEnv
};
