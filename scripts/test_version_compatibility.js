const assert = require('assert');
const {
  checkAppCompatibility,
  compareVersions,
  normalizeVersion
} = require('../src/version_compatibility');

assert.deepEqual(normalizeVersion('1.2.3-beta.4'), [1, 2, 3, 0, 4]);
assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
assert.equal(compareVersions('1.2.4', '1.2.3'), 1);
assert.equal(compareVersions('1.2.0', '1.2.3'), -1);
assert.equal(compareVersions('2.0.0', '1.99.99'), 1);

assert.equal(checkAppCompatibility({ minAppVersion: '0.1.0' }, '0.1.0').ok, true);
assert.equal(checkAppCompatibility({ minAppVersion: '0.1.0' }, '0.0.9').ok, false);
assert.match(checkAppCompatibility({ minAppVersion: '0.1.0' }, '0.0.9').reason, /below required/);
assert.equal(checkAppCompatibility({ maxAppVersion: '0.2.0' }, '0.2.0').ok, true);
assert.equal(checkAppCompatibility({ maxAppVersion: '0.2.0' }, '0.2.1').ok, false);
assert.match(checkAppCompatibility({ maxAppVersion: '0.2.0' }, '0.2.1').reason, /above supported/);
assert.equal(checkAppCompatibility({ minAppVersion: '0.1.0', maxAppVersion: '0.2.0' }, '0.1.5').ok, true);

console.log('version compatibility tests passed');
