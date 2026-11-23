const fs = require('fs');
const vm = require('vm');

const MODULE_TIMEOUT_MS = 1000;
const SUPPORTED_KINDS = new Set(['strategy', 'indicator', 'risk-filter']);
const SUPPORTED_PROPOSALS = new Set(['ENTRY', 'EXIT', 'FILTER', 'INFO']);

class FeatureModuleRuntime {
  constructor(options = {}) {
    this.logger = typeof options.logger === 'function' ? options.logger : () => {};
  }

  load(moduleStatus = {}) {
    if (moduleStatus.status !== 'installed') {
      throw new Error(`Module ${moduleStatus.id || ''} is not installed.`);
    }
    if (!moduleStatus.cachePath || !fs.existsSync(moduleStatus.cachePath)) {
      throw new Error(`Module ${moduleStatus.id || ''} entry file is missing.`);
    }
    const source = fs.readFileSync(moduleStatus.cachePath, 'utf8');
    const module = { exports: {} };
    const sandbox = {
      module,
      exports: module.exports,
      console: {
        log: (...args) => this.logger('log', args),
        warn: (...args) => this.logger('warn', args),
        error: (...args) => this.logger('error', args)
      }
    };
    vm.createContext(sandbox, {
      name: `feature-module:${moduleStatus.id || 'unknown'}`,
      codeGeneration: { strings: false, wasm: false }
    });
    const script = new vm.Script(source, {
      filename: moduleStatus.cachePath,
      displayErrors: true
    });
    script.runInContext(sandbox, { timeout: MODULE_TIMEOUT_MS });
    return validateModuleExport(module.exports, moduleStatus);
  }

  validate(moduleStatus = {}) {
    const loaded = this.load(moduleStatus);
    return summarizeModule(loaded);
  }

  evaluate(moduleStatus = {}, context = {}) {
    const loaded = this.load(moduleStatus);
    if (typeof loaded.evaluate !== 'function') {
      return {
        moduleId: loaded.id,
        version: loaded.version,
        proposals: [],
        warnings: ['module has no evaluate function']
      };
    }
    const raw = loaded.evaluate(sanitizeContext(context));
    const proposals = normalizeProposals(raw, loaded);
    return {
      moduleId: loaded.id,
      version: loaded.version,
      kind: loaded.kind,
      capabilities: loaded.capabilities,
      proposals,
      warnings: []
    };
  }
}

function validateModuleExport(value, moduleStatus = {}) {
  if (!value || typeof value !== 'object') throw new Error('Feature module must export an object.');
  const id = String(value.id || moduleStatus.id || '').trim();
  const version = String(value.version || moduleStatus.version || '').trim();
  const kind = String(value.kind || '').trim();
  if (!id) throw new Error('Feature module id is required.');
  if (!version) throw new Error('Feature module version is required.');
  if (!SUPPORTED_KINDS.has(kind)) throw new Error(`Unsupported module kind: ${kind || 'missing'}.`);
  const capabilities = Array.isArray(value.capabilities) ? value.capabilities.map(String) : [];
  return {
    id,
    version,
    kind,
    capabilities,
    description: String(value.description || ''),
    evaluate: value.evaluate
  };
}

function summarizeModule(moduleExport) {
  return {
    id: moduleExport.id,
    version: moduleExport.version,
    kind: moduleExport.kind,
    capabilities: moduleExport.capabilities,
    description: moduleExport.description,
    canEvaluate: typeof moduleExport.evaluate === 'function'
  };
}

function sanitizeContext(context = {}) {
  return JSON.parse(JSON.stringify({
    now: context.now || new Date().toISOString(),
    broker: context.broker || '',
    instrument: context.instrument || null,
    indexCandle: context.indexCandle || null,
    optionCandle: context.optionCandle || null,
    candles: Array.isArray(context.candles) ? context.candles.slice(-120) : [],
    position: context.position || null,
    account: context.account || null,
    entitlements: Array.isArray(context.entitlements) ? context.entitlements : []
  }));
}

function normalizeProposals(raw, moduleExport) {
  const rows = Array.isArray(raw)
    ? raw
    : raw && Array.isArray(raw.proposals)
      ? raw.proposals
      : raw
        ? [raw]
        : [];
  return rows.map((proposal) => normalizeProposal(proposal, moduleExport)).filter(Boolean);
}

function normalizeProposal(proposal, moduleExport) {
  if (!proposal || typeof proposal !== 'object') return null;
  const type = String(proposal.type || '').toUpperCase();
  if (!SUPPORTED_PROPOSALS.has(type)) return null;
  return {
    type,
    direction: normalizeDirection(proposal.direction),
    optionType: normalizeOptionType(proposal.optionType),
    confidence: clampNumber(proposal.confidence, 0, 100),
    reason: String(proposal.reason || ''),
    moduleId: moduleExport.id,
    moduleVersion: moduleExport.version,
    data: proposal.data && typeof proposal.data === 'object' ? JSON.parse(JSON.stringify(proposal.data)) : null
  };
}

function normalizeDirection(value) {
  const text = String(value || '').toLowerCase();
  return text === 'bullish' || text === 'bearish' ? text : '';
}

function normalizeOptionType(value) {
  const text = String(value || '').toUpperCase();
  return text === 'CE' || text === 'PE' ? text : '';
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(max, Math.max(min, number));
}

module.exports = FeatureModuleRuntime;
