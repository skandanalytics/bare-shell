const PLATFORM_ALIASES = {
  darwin: 'mac',
  macos: 'mac',
  mac: 'mac',
  windows: 'win',
  win32: 'win',
  win: 'win',
  all: 'all'
};

function validateEnv(options = {}, env = process.env) {
  const platform = normalizePlatform(options.platform || 'all');
  const requireNotarization = Boolean(options.requireNotarization);
  const missing = [];
  const warnings = [];

  const platforms = platform === 'all' ? ['mac', 'win'] : [platform];
  if (platforms.includes('mac')) {
    requireAny(env, missing, ['MAC_CSC_LINK', 'CSC_LINK'], 'mac signing certificate');
    requireAny(env, missing, ['MAC_CSC_KEY_PASSWORD', 'CSC_KEY_PASSWORD'], 'mac signing certificate password');
    if (requireNotarization && !hasCompleteGroup(env, [
      ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'],
      ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD'],
      ['APPLE_KEYCHAIN', 'APPLE_KEYCHAIN_PROFILE']
    ])) {
      missing.push('mac notarization credentials: APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER, or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD, or APPLE_KEYCHAIN + APPLE_KEYCHAIN_PROFILE');
    }
  }

  if (platforms.includes('win')) {
    requireAny(env, missing, ['WIN_CSC_LINK', 'CSC_LINK'], 'windows signing certificate');
    requireAny(env, missing, ['WIN_CSC_KEY_PASSWORD', 'CSC_KEY_PASSWORD'], 'windows signing certificate password');
    if (!value(env.WIN_CSC_LINK) && value(env.CSC_LINK)) {
      warnings.push('Using CSC_LINK for Windows. Prefer WIN_CSC_LINK in CI so mac and Windows certificates can be stored separately.');
    }
  }

  return {
    ok: missing.length === 0,
    platform,
    missing,
    warnings
  };
}

function normalizePlatform(value) {
  const normalized = PLATFORM_ALIASES[String(value || '').toLowerCase()];
  if (!normalized) throw new Error(`Unknown release platform: ${value}`);
  return normalized;
}

function requireAny(env, missing, names, label) {
  if (names.some((name) => value(env[name]))) return;
  missing.push(`${label}: one of ${names.join(', ')}`);
}

function hasCompleteGroup(env, groups) {
  return groups.some((group) => group.every((name) => value(env[name])));
}

function value(item) {
  return String(item || '').trim();
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--require-notarization') {
      options.requireNotarization = true;
    } else if (arg === '--platform') {
      options.platform = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--platform=')) {
      options.platform = arg.slice('--platform='.length);
    }
  }
  return options;
}

function main() {
  const result = validateEnv(parseArgs(process.argv.slice(2)));
  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }
  if (!result.ok) {
    console.error(`Release signing environment is incomplete for ${result.platform}.`);
    for (const item of result.missing) {
      console.error(`- Missing ${item}`);
    }
    process.exit(1);
  }
  console.log(`Release signing environment ready for ${result.platform}.`);
}

if (require.main === module) {
  main();
}

module.exports = {
  validateEnv,
  parseArgs
};
