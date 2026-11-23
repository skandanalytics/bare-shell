const assert = require('assert');
const { builderArgs, normalizeSigningEnv } = require('./build_signed_installer');
const { parseArgs, validateEnv } = require('./check_release_signing_env');

function main() {
  assert.deepEqual(parseArgs(['--platform', 'mac', '--require-notarization']), {
    platform: 'mac',
    requireNotarization: true
  });
  assert.deepEqual(parseArgs(['--platform=win']), {
    platform: 'win'
  });

  const empty = validateEnv({ platform: 'all', requireNotarization: true }, {});
  assert.equal(empty.ok, false);
  assert.ok(empty.missing.some((item) => item.includes('mac signing certificate')));
  assert.ok(empty.missing.some((item) => item.includes('windows signing certificate')));
  assert.ok(empty.missing.some((item) => item.includes('mac notarization credentials')));

  const mac = validateEnv({ platform: 'mac', requireNotarization: true }, {
    MAC_CSC_LINK: 'base64-p12',
    MAC_CSC_KEY_PASSWORD: 'secret',
    APPLE_API_KEY: 'key',
    APPLE_API_KEY_ID: 'id',
    APPLE_API_ISSUER: 'issuer'
  });
  assert.equal(mac.ok, true);

  const win = validateEnv({ platform: 'win' }, {
    WIN_CSC_LINK: 'base64-pfx',
    WIN_CSC_KEY_PASSWORD: 'secret'
  });
  assert.equal(win.ok, true);

  const shared = validateEnv({ platform: 'win' }, {
    CSC_LINK: 'base64-pfx',
    CSC_KEY_PASSWORD: 'secret'
  });
  assert.equal(shared.ok, true);
  assert.equal(shared.warnings.length, 1);

  assert.deepEqual(builderArgs('mac'), ['--mac', 'dmg', 'zip', '--publish=never']);
  assert.deepEqual(builderArgs('win'), ['--win', 'nsis', '--publish=never']);
  assert.equal(normalizeSigningEnv('mac', { MAC_CSC_LINK: 'mac-cert' }).CSC_LINK, 'mac-cert');
  assert.equal(normalizeSigningEnv('win', { WIN_CSC_LINK: 'win-cert' }).CSC_LINK, 'win-cert');

  console.log('release signing environment tests passed');
}

main();
