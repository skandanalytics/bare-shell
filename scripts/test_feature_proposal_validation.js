const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FeatureModuleRuntime = require('../src/feature_module_runtime');
const { gateEvaluationResults } = require('../src/feature_proposal_gate');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-proposals-'));
const modulePath = path.join(tempDir, 'module.js');

fs.writeFileSync(modulePath, `
module.exports = {
  id: 'proposal-validation',
  version: '1.0.0',
  kind: 'strategy',
  capabilities: ['proposal.entry', 'proposal.exit', 'proposal.filter', 'proposal.info'],
  evaluate() {
    return [
      { type: 'ENTRY', direction: 'BULLISH', optionType: 'ce', confidence: 180, reason: 'valid after normalization', order: { action: 'BUY' }, strategyId: 'unsafe-module-strategy' },
      { type: 'ENTRY', direction: 'sideways', optionType: 'XX', confidence: -20, reason: 'invalid entry fields' },
      { type: 'EXIT', confidence: 0, reason: 'zero confidence exit' },
      { type: 'FILTER' },
      { type: 'UNKNOWN', confidence: 99, reason: 'unsupported proposal should be dropped' },
      null
    ];
  }
};
`);

try {
  const runtime = new FeatureModuleRuntime();
  const evaluation = runtime.evaluate({
    id: 'proposal-validation',
    version: '1.0.0',
    status: 'installed',
    cachePath: modulePath,
    featureIds: ['strategy.proposalValidation']
  }, {
    indexCandle: { open: 100, high: 115, low: 95, close: 112 },
    candles: [{ close: 100 }]
  });

  assert.equal(evaluation.proposals.length, 4);
  assert.equal(evaluation.proposals[0].direction, 'bullish');
  assert.equal(evaluation.proposals[0].optionType, 'CE');
  assert.equal(evaluation.proposals[0].confidence, 100);
  assert.equal(Object.prototype.hasOwnProperty.call(evaluation.proposals[0], 'order'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(evaluation.proposals[0], 'strategyId'), false);
  assert.equal(evaluation.proposals[1].direction, '');
  assert.equal(evaluation.proposals[1].optionType, '');
  assert.equal(evaluation.proposals[1].confidence, 0);

  const gated = gateEvaluationResults([evaluation], {
    indexCandle: { open: 100, high: 115, low: 95, close: 112 },
    entitlements: [{ id: 'strategy.proposalValidation', expiresAt: '2099-01-01T00:00:00.000Z' }]
  }, {
    modules: [{
      id: 'proposal-validation',
      featureIds: ['strategy.proposalValidation']
    }],
    minEntryConfidence: 50
  });

  assert.equal(gated[0].gated.accepted.length, 1);
  assert.equal(gated[0].gated.accepted[0].type, 'ENTRY');
  assert.equal(gated[0].gated.rejected.length, 3);
  assertReasons(gated[0].gated.rejected, 'entry proposal requires bullish/bearish direction');
  assertReasons(gated[0].gated.rejected, 'entry proposal requires CE/PE option type');
  assertReasons(gated[0].gated.rejected, 'entry confidence below 50');
  assertReasons(gated[0].gated.rejected, 'exit proposal requires an open shell position');
  assertReasons(gated[0].gated.rejected, 'exit confidence must be positive');
  assertReasons(gated[0].gated.rejected, 'filter proposal requires a reason');

  const rejectedForOpenPosition = gateEvaluationResults([evaluation], {
    indexCandle: { open: 100, high: 115, low: 95, close: 112 },
    position: { direction: 'bullish' },
    entitlements: [{ id: 'strategy.proposalValidation', expiresAt: '2099-01-01T00:00:00.000Z' }]
  }, {
    modules: [{
      id: 'proposal-validation',
      featureIds: ['strategy.proposalValidation']
    }],
    minEntryConfidence: 50
  });
  assertReasons(rejectedForOpenPosition[0].gated.rejected, 'entry rejected because shell already has an open position');

  const rejectedForExpiredEntitlement = gateEvaluationResults([evaluation], {
    indexCandle: { open: 100, high: 115, low: 95, close: 112 },
    entitlements: [{ id: 'strategy.proposalValidation', expiresAt: '2000-01-01T00:00:00.000Z' }]
  }, {
    modules: [{
      id: 'proposal-validation',
      featureIds: ['strategy.proposalValidation']
    }],
    minEntryConfidence: 50
  });
  assertReasons(rejectedForExpiredEntitlement[0].gated.rejected, 'module entitlement is expired');

  const rejectedForMissingCandle = gateEvaluationResults([evaluation], {
    entitlements: [{ id: 'strategy.proposalValidation', expiresAt: '2099-01-01T00:00:00.000Z' }]
  }, {
    modules: [{
      id: 'proposal-validation',
      featureIds: ['strategy.proposalValidation']
    }],
    minEntryConfidence: 50
  });
  assertReasons(rejectedForMissingCandle[0].gated.rejected, 'entry requires a valid index candle');

  console.log('feature proposal validation tests passed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function assertReasons(rows, expected) {
  assert.ok(
    rows.some((row) => (row.reasons || []).includes(expected)),
    `Expected rejection reason: ${expected}`
  );
}
