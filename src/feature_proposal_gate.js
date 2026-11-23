const TYPE_CAPABILITY = {
  ENTRY: 'proposal.entry',
  EXIT: 'proposal.exit',
  FILTER: 'proposal.filter',
  INFO: 'proposal.info'
};

function gateModuleEvaluation(evaluation = {}, context = {}, options = {}) {
  const moduleStatus = options.moduleStatus || {};
  const entitlements = normalizeEntitlements(options.entitlements || context.entitlements || []);
  const capabilities = new Set([...(evaluation.capabilities || []), ...(moduleStatus.capabilities || [])].map(String));
  const featureIds = (moduleStatus.featureIds || []).map(String).filter(Boolean);
  const proposalRows = Array.isArray(evaluation.proposals) ? evaluation.proposals : [];
  const gated = proposalRows
    .map((proposal) => gateProposal(proposal, {
      context,
      entitlements,
      capabilities,
      featureIds,
      options
    }))
    .reduce((bucket, item) => {
      if (item.accepted) bucket.accepted.push(item.proposal);
      else bucket.rejected.push({
        proposal: item.proposal,
        reasons: item.reasons
      });
      return bucket;
    }, { accepted: [], rejected: [] });

  return {
    moduleId: evaluation.moduleId || moduleStatus.id || '',
    version: evaluation.version || moduleStatus.version || '',
    status: evaluation.status || 'evaluated',
    accepted: gated.accepted,
    rejected: gated.rejected,
    warnings: evaluation.warnings || [],
    error: evaluation.error || ''
  };
}

function gateEvaluationResults(results = [], context = {}, options = {}) {
  const byModule = new Map((options.modules || []).map((item) => [String(item.id || ''), item]));
  return results.map((evaluation) => {
    const moduleStatus = byModule.get(String(evaluation.moduleId || '')) || {};
    const gated = gateModuleEvaluation(evaluation, context, {
      ...options,
      moduleStatus
    });
    return {
      ...evaluation,
      gated
    };
  });
}

function gateProposal(proposal = {}, gateContext = {}) {
  const reasons = [];
  const context = gateContext.context || {};
  const type = String(proposal.type || '').toUpperCase();
  const capability = TYPE_CAPABILITY[type];

  if (!capability) reasons.push(`unsupported proposal type ${type || 'missing'}`);
  if (capability && !gateContext.capabilities.has(capability)) {
    reasons.push(`module missing ${capability} capability`);
  }

  if (!isEntitled(gateContext.featureIds, gateContext.entitlements)) {
    reasons.push('module feature is not entitled for this user');
  }

  if (isExpiredEntitlement(gateContext.featureIds, gateContext.entitlements)) {
    reasons.push('module entitlement is expired');
  }

  if (type === 'ENTRY') validateEntryProposal(proposal, context, gateContext.options, reasons);
  if (type === 'EXIT') validateExitProposal(proposal, context, reasons);
  if (type === 'FILTER' && !proposal.reason) reasons.push('filter proposal requires a reason');

  return {
    accepted: reasons.length === 0,
    proposal,
    reasons
  };
}

function validateEntryProposal(proposal, context, options, reasons) {
  if (proposal.direction !== 'bullish' && proposal.direction !== 'bearish') {
    reasons.push('entry proposal requires bullish/bearish direction');
  }
  if (proposal.optionType !== 'CE' && proposal.optionType !== 'PE') {
    reasons.push('entry proposal requires CE/PE option type');
  }
  if (Number(proposal.confidence || 0) < Number(options.minEntryConfidence || 1)) {
    reasons.push(`entry confidence below ${Number(options.minEntryConfidence || 1)}`);
  }
  if (!hasUsableCandle(context.indexCandle)) {
    reasons.push('entry requires a valid index candle');
  }
  if (context.position && !options.allowEntryWithOpenPosition) {
    reasons.push('entry rejected because shell already has an open position');
  }
}

function validateExitProposal(proposal, context, reasons) {
  if (!context.position) reasons.push('exit proposal requires an open shell position');
  if (Number(proposal.confidence || 0) <= 0) reasons.push('exit confidence must be positive');
}

function isEntitled(featureIds, entitlements) {
  if (!featureIds.length) return true;
  return featureIds.some((id) => entitlements.has(id));
}

function isExpiredEntitlement(featureIds, entitlements) {
  if (!featureIds.length) return false;
  const now = Date.now();
  return featureIds.some((id) => {
    const entitlement = entitlements.get(id);
    if (!entitlement || !entitlement.expiresAt) return false;
    const expiry = Date.parse(entitlement.expiresAt);
    return Number.isFinite(expiry) && expiry <= now;
  });
}

function normalizeEntitlements(rows) {
  return new Map((rows || [])
    .filter(Boolean)
    .map((item) => [String(item.id || '').trim(), item])
    .filter(([id]) => id));
}

function hasUsableCandle(candle) {
  if (!candle || typeof candle !== 'object') return false;
  return ['open', 'high', 'low', 'close'].every((key) => Number.isFinite(Number(candle[key])));
}

module.exports = {
  gateEvaluationResults,
  gateModuleEvaluation,
  gateProposal
};
