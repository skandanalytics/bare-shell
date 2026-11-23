const { validateEnv } = require('./check_release_signing_env');

const SECRET_GROUPS = [
  {
    platform: 'mac',
    title: 'macOS code signing',
    secrets: ['MAC_CSC_LINK', 'MAC_CSC_KEY_PASSWORD'],
    note: 'Developer ID Application .p12 as base64/secure URL plus certificate password.'
  },
  {
    platform: 'mac',
    title: 'macOS notarization',
    alternatives: [
      ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'],
      ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD'],
      ['APPLE_KEYCHAIN', 'APPLE_KEYCHAIN_PROFILE']
    ],
    note: 'Prefer App Store Connect API key secrets for CI notarization.'
  },
  {
    platform: 'win',
    title: 'Windows code signing',
    secrets: ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD'],
    note: 'Windows .pfx as base64/secure URL plus certificate password.'
  }
];

function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = buildReleaseSecretPlan(process.env, options);
  printPlan(plan);
  if (options.failOnMissing && plan.missing.length) process.exit(1);
}

function buildReleaseSecretPlan(env = process.env, options = {}) {
  const platform = normalizePlatform(options.platform || 'all');
  const groups = SECRET_GROUPS.filter((group) => platform === 'all' || group.platform === platform);
  const rows = groups.map((group) => summarizeGroup(group, env));
  const validation = validateEnv({
    platform,
    requireNotarization: platform === 'mac' || platform === 'all' || Boolean(options.requireNotarization)
  }, env);
  return {
    platform,
    ok: validation.ok,
    missing: validation.missing,
    warnings: validation.warnings,
    rows
  };
}

function summarizeGroup(group, env) {
  if (group.secrets) {
    const missing = group.secrets.filter((name) => !hasValue(env[name]));
    return {
      platform: group.platform,
      title: group.title,
      status: missing.length ? 'missing' : 'ready',
      required: group.secrets,
      missing,
      note: group.note
    };
  }

  const alternatives = group.alternatives || [];
  const readyAlternative = alternatives.find((names) => names.every((name) => hasValue(env[name])));
  const missing = readyAlternative ? [] : alternatives[0] || [];
  return {
    platform: group.platform,
    title: group.title,
    status: readyAlternative ? 'ready' : 'missing',
    alternatives,
    missing,
    note: group.note
  };
}

function printPlan(plan) {
  console.log(`Release secret plan for ${plan.platform}`);
  for (const row of plan.rows) {
    console.log(`\n${row.status === 'ready' ? 'READY' : 'MISSING'} ${row.title}`);
    console.log(`Platform: ${row.platform}`);
    if (row.required) console.log(`Required: ${row.required.join(', ')}`);
    if (row.alternatives) {
      console.log('Accepted alternatives:');
      for (const group of row.alternatives) console.log(`- ${group.join(' + ')}`);
    }
    if (row.missing.length) console.log(`Missing now: ${row.missing.join(', ')}`);
    console.log(`Note: ${row.note}`);
  }

  if (plan.warnings.length) {
    console.log('\nWarnings:');
    for (const warning of plan.warnings) console.log(`- ${warning}`);
  }

  if (plan.missing.length) {
    console.log('\nGitHub setup pattern:');
    console.log('gh secret set SECRET_NAME --body "<secret value>"');
    console.log('Never commit certificate files, passwords, API keys, or copied secret values into git.');
  } else {
    console.log('\nRelease signing secrets are ready.');
  }
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
    } else if (arg === '--require-notarization') {
      options.requireNotarization = true;
    } else if (arg === '--fail-on-missing') {
      options.failOnMissing = true;
    }
  }
  return options;
}

function normalizePlatform(value) {
  const normalized = String(value || 'all').toLowerCase();
  if (['all', 'mac', 'win'].includes(normalized)) return normalized;
  if (['darwin', 'macos'].includes(normalized)) return 'mac';
  if (['windows', 'win32'].includes(normalized)) return 'win';
  throw new Error(`Unknown platform: ${value}`);
}

function hasValue(value) {
  return Boolean(String(value || '').trim());
}

if (require.main === module) {
  main();
}

module.exports = {
  buildReleaseSecretPlan,
  parseArgs
};
