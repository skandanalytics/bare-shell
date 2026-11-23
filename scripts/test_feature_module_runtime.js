const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gateEvaluationResults } = require('../src/feature_proposal_gate');
const FeatureModuleRuntime = require('../src/feature_module_runtime');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-runtime-'));
const modulePath = path.join(tempDir, 'module.js');

fs.writeFileSync(modulePath, `
module.exports = {
  id: 'strategy-test',
  version: '1.0.0',
  kind: 'strategy',
  capabilities: ['proposal.entry'],
  description: 'Runtime smoke module',
  evaluate(context) {
    return {
      type: 'ENTRY',
      direction: context.indexCandle && context.indexCandle.close > context.indexCandle.open ? 'bullish' : 'bearish',
      optionType: 'CE',
      confidence: 120,
      reason: 'runtime smoke proposal',
      data: { seen: Boolean(context.indexCandle) }
    };
  }
};
`);

try {
  const runtime = new FeatureModuleRuntime();
  const status = {
    id: 'strategy-test',
    version: '1.0.0',
    status: 'installed',
    cachePath: modulePath
  };
  const summary = runtime.validate(status);
  assert.equal(summary.id, 'strategy-test');
  assert.equal(summary.kind, 'strategy');
  assert.equal(summary.canEvaluate, true);

  const result = runtime.evaluate(status, {
    indexCandle: { open: 100, close: 110 },
    candles: [{ close: 100 }]
  });
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].type, 'ENTRY');
  assert.equal(result.proposals[0].direction, 'bullish');
  assert.equal(result.proposals[0].confidence, 100);
  assert.deepEqual(result.capabilities, ['proposal.entry']);

  const gated = gateEvaluationResults([result], {
    indexCandle: { open: 100, high: 112, low: 99, close: 110 },
    entitlements: [{ id: 'strategy.test', expiresAt: '2099-01-01T00:00:00.000Z' }]
  }, {
    modules: [{
      id: 'strategy-test',
      featureIds: ['strategy.test']
    }],
    minEntryConfidence: 50
  });
  assert.equal(gated[0].gated.accepted.length, 1);
  assert.equal(gated[0].gated.rejected.length, 0);

  const rejected = gateEvaluationResults([{
    ...result,
    capabilities: []
  }], {
    indexCandle: { open: 100, high: 112, low: 99, close: 110 },
    entitlements: []
  }, {
    modules: [{
      id: 'strategy-test',
      featureIds: ['strategy.test']
    }],
    minEntryConfidence: 50
  });
  assert.equal(rejected[0].gated.accepted.length, 0);
  assert.ok(rejected[0].gated.rejected[0].reasons.some((reason) => reason.includes('capability')));
  assert.ok(rejected[0].gated.rejected[0].reasons.some((reason) => reason.includes('not entitled')));
  console.log('feature module runtime smoke passed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
