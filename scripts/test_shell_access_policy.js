const assert = require('assert');
const {
  assertInternalAdmin,
  enforceCustomerConfig,
  filterConfigUpdateForPolicy,
  getRuntimePolicy,
  sanitizeFeatureModuleStatus
} = require('../src/shell_access_policy');

function main() {
  const customer = getRuntimePolicy({}, ['electron', '.']);
  assert.equal(customer.customerMode, true);
  assert.equal(customer.internalAdminEnabled, false);

  const internal = getRuntimePolicy({ ALGO_INTERNAL_ADMIN: '1' }, ['electron', '.']);
  assert.equal(internal.customerMode, false);
  assert.equal(internal.internalAdminEnabled, true);

  assert.throws(() => assertInternalAdmin(customer, 'Discovery'), /internal support mode/);
  assert.doesNotThrow(() => assertInternalAdmin(internal, 'Discovery'));

  const filtered = filterConfigUpdateForPolicy({
    featureModuleManifestUrl: 'https://attacker.test/manifest',
    featureModulePublicKeyPem: 'bad-key',
    featureModuleAllowUnsigned: true,
    featureModuleUserId: 'customer-1',
    sessionToken: 'should-not-change',
    riskDailyLossLimit: 1000
  }, customer);
  assert.equal(filtered.featureModuleManifestUrl, undefined);
  assert.equal(filtered.featureModulePublicKeyPem, undefined);
  assert.equal(filtered.featureModuleAllowUnsigned, false);
  assert.equal(filtered.featureModuleUserId, 'customer-1');
  assert.equal(filtered.sessionToken, undefined);
  assert.equal(filtered.riskDailyLossLimit, 1000);

  const customerConfig = enforceCustomerConfig({ featureModuleAllowUnsigned: true }, customer);
  assert.equal(customerConfig.featureModuleAllowUnsigned, false);

  const status = sanitizeFeatureModuleStatus({
    configured: true,
    userId: 'customer-1',
    deviceId: 'device-1',
    modules: [{
      id: 'premium-strategy',
      version: 'secret',
      status: 'installed',
      cachePath: '/tmp/secret/module.js'
    }],
    entitlements: [{ id: 'strategy.premium', name: 'Premium Strategy' }],
    errors: []
  }, customer);
  assert.deepEqual(status.modules, []);
  assert.equal(status.moduleSummary.installed, 1);
  assert.equal(status.moduleSummary.total, 1);

  console.log('shell access policy tests passed');
}

main();
