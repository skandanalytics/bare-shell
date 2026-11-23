const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FeatureModuleManager = require('../src/feature_module_manager');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-signatures-'));
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
const rotatedKeyPair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const moduleSource = `
module.exports = {
  id: 'signed-strategy',
  version: '1.0.0',
  kind: 'strategy',
  capabilities: ['proposal.entry'],
  evaluate() {
    return { type: 'INFO', confidence: 10, reason: 'signed module loaded' };
  }
};
`;

async function main() {
  try {
    assertManifestSignatureAccepted();
    assertManifestSignatureAcceptedWithRotatedKeyBundle();
    assertManifestSignatureRejected();
    await assertManifestCompatibilityRejected();
    await assertModuleHashAccepted();
    await assertModuleSignatureAcceptedWithRotatedKeyBundle();
    await assertModuleHashRejected();
    await assertModuleSignatureRejected();
    await assertModuleCompatibilityRejected();
    console.log('feature module signature/hash tests passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertManifestSignatureAccepted() {
  const manager = createManager('manifest-ok');
  const payload = manifestPayload('good');
  assert.equal(manager.verifyManifest(signedEnvelope(payload), payload), true);
}

function assertManifestSignatureAcceptedWithRotatedKeyBundle() {
  const manager = createManager('manifest-rotated-key', {
    featureModulePublicKeyPem: `${publicKey}\n${rotatedKeyPair.publicKey}`
  });
  const payload = manifestPayload('good');
  assert.equal(manager.verifyManifest(signedEnvelope(payload, rotatedKeyPair.privateKey), payload), true);
}

function assertManifestSignatureRejected() {
  const manager = createManager('manifest-bad');
  const payload = manifestPayload('good');
  const envelope = signedEnvelope(payload);
  envelope.signature = sign(JSON.stringify({ ...payload, userId: 'attacker' }));
  assert.throws(
    () => manager.verifyManifest(envelope, payload),
    /Signature verification failed/
  );
}

async function assertManifestCompatibilityRejected() {
  const payload = { ...manifestPayload('good'), minAppVersion: '0.2.0' };
  const manager = new FeatureModuleManager({
    baseDir: path.join(tempDir, 'manifest-incompatible-sync'),
    fetchText: async () => JSON.stringify(signedEnvelope(payload)),
    config: {
      featureModuleManifestUrl: 'https://license.test/manifest',
      featureModulePublicKeyPem: publicKey,
      featureModuleAllowUnsigned: false,
      featureModuleCleanupEnabled: false,
      appVersion: '0.1.0'
    }
  });
  const status = await manager.sync();
  assert.equal(status.offlineGrace.active, false);
  assert.match(status.errors[0], /Feature manifest is incompatible/);
}

async function assertModuleHashAccepted() {
  const manager = createManager('module-ok');
  const status = await manager.installModule(moduleDescriptor('good'), manifestPayload('good'));
  assert.equal(status.status, 'installed');
  assert.equal(status.sha256, sha256(moduleSource));
  assert.ok(fs.existsSync(status.cachePath));
}

async function assertModuleSignatureAcceptedWithRotatedKeyBundle() {
  const manager = createManager('module-rotated-key', {
    featureModulePublicKeyPem: `${publicKey}\n${rotatedKeyPair.publicKey}`
  });
  const status = await manager.installModule(moduleDescriptor('rotated-key'), manifestPayload('good'));
  assert.equal(status.status, 'installed');
  assert.equal(status.sha256, sha256(moduleSource));
}

async function assertModuleHashRejected() {
  const manager = createManager('module-bad-hash');
  const status = await manager.installModule(moduleDescriptor('bad-hash'), manifestPayload('good'));
  assert.equal(status.status, 'failed');
  assert.match(status.error, /sha256 mismatch/);
}

async function assertModuleSignatureRejected() {
  const manager = createManager('module-bad-signature');
  const status = await manager.installModule(moduleDescriptor('bad-signature'), manifestPayload('good'));
  assert.equal(status.status, 'failed');
  assert.match(status.error, /Signature verification failed/);
}

async function assertModuleCompatibilityRejected() {
  const manager = createManager('module-incompatible', { appVersion: '0.1.0' });
  const status = await manager.installModule({
    ...moduleDescriptor('good'),
    minAppVersion: '0.2.0'
  }, manifestPayload('good'));
  assert.equal(status.status, 'rejected');
  assert.match(status.error, /below required/);
}

function createManager(folderName, extraConfig = {}) {
  return new FeatureModuleManager({
    baseDir: path.join(tempDir, folderName),
    fetchText: async () => moduleSource,
    config: {
      featureModulePublicKeyPem: publicKey,
      featureModuleAllowUnsigned: false,
      featureModuleCleanupEnabled: false,
      ...extraConfig
    }
  });
}

function manifestPayload() {
  return {
    userId: 'unit-test-user',
    expiresAt: '2099-01-01T00:00:00.000Z',
    features: [{
      id: 'strategy.signed',
      name: 'Signed Strategy',
      enabled: true,
      expiresAt: '2099-01-01T00:00:00.000Z'
    }],
    modules: []
  };
}

function moduleDescriptor(mode) {
  return {
    id: 'signed-strategy',
    version: '1.0.0',
    url: 'memory://module.js',
    entry: 'module.js',
    sha256: mode === 'bad-hash' ? sha256(`${moduleSource}\nmutated`) : sha256(moduleSource),
    signature: mode === 'bad-signature'
      ? sign('different module source')
      : sign(moduleSource, mode === 'rotated-key' ? rotatedKeyPair.privateKey : privateKey),
    featureIds: ['strategy.signed'],
    expiresAt: '2099-01-01T00:00:00.000Z'
  };
}

function signedEnvelope(payload, signingKey = privateKey) {
  return {
    payload,
    signature: sign(JSON.stringify(payload), signingKey)
  };
}

function sign(value, signingKey = privateKey) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(value);
  signer.end();
  return signer.sign(signingKey, 'base64');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
