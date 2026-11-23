const BUILTIN_MOMENTUM_REVERSAL = {
  strategyId: 'momentum-reversal-v1',
  strategyName: 'Momentum Reversal V1',
  strategySource: 'builtin',
  featureId: 'strategy.momentumReversal'
};

function normalizeStrategyIdentity(value = {}, fallback = BUILTIN_MOMENTUM_REVERSAL) {
  return {
    strategyId: String(value.strategyId || value.id || fallback.strategyId).trim(),
    strategyName: String(value.strategyName || value.name || fallback.strategyName).trim(),
    strategySource: String(value.strategySource || value.source || fallback.strategySource).trim(),
    featureId: String(value.featureId || fallback.featureId || '').trim()
  };
}

function withStrategyIdentity(value = {}, fallback = BUILTIN_MOMENTUM_REVERSAL) {
  return {
    ...value,
    ...normalizeStrategyIdentity(value, fallback)
  };
}

module.exports = {
  BUILTIN_MOMENTUM_REVERSAL,
  normalizeStrategyIdentity,
  withStrategyIdentity
};
