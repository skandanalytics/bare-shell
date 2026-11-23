const AliceBlueAdapter = require('./alice_blue_adapter');
const ZerodhaAdapter = require('./zerodha_adapter');

const BROKER_CAPABILITY_FIELDS = [
  {
    id: 'portalLogin',
    label: 'Portal login',
    description: 'The app can open and preserve a broker portal login session.'
  },
  {
    id: 'portalWatchlist',
    label: 'Portal watchlist',
    description: 'The app can open the broker watchlist or dashboard page.'
  },
  {
    id: 'sessionTokenDetection',
    label: 'Session token detection',
    description: 'The app knows which browser storage keys indicate an active broker session.'
  },
  {
    id: 'accountDiscovery',
    label: 'Account discovery',
    description: 'Broker portal API responses can be mapped into account, balance, and P&L fields.'
  },
  {
    id: 'balanceMapping',
    label: 'Balance mapping',
    description: 'Available funds and used margin can be read from broker-specific API responses.'
  },
  {
    id: 'pnlMapping',
    label: 'P&L mapping',
    description: 'Day, realized, and unrealized P&L can be read from broker-specific API responses.'
  },
  {
    id: 'marketDataCapture',
    label: 'Market data capture',
    description: 'Ticks can be captured from the broker portal and converted into candles.'
  },
  {
    id: 'restOrders',
    label: 'REST orders',
    description: 'The broker adapter can place live orders through a broker order API.'
  },
  {
    id: 'orderModify',
    label: 'Order modify',
    description: 'Open broker orders can be modified, including protective SL updates.'
  },
  {
    id: 'orderBook',
    label: 'Order book',
    description: 'The broker adapter can read live order state for open/completed order checks.'
  },
  {
    id: 'protectiveStopLoss',
    label: 'Protective SL',
    description: 'The shell can place and manage a broker-side protective stop-loss order.'
  },
  {
    id: 'trailingStopLoss',
    label: 'Trailing SL',
    description: 'The shell can trail an existing broker-side stop-loss order safely.'
  },
  {
    id: 'optionChainDiscovery',
    label: 'Option chain discovery',
    description: 'Broker-specific option/contract metadata can be learned from portal traffic.'
  }
];

const BROKER_DEFS = [
  buildBrokerDefinition({
    id: 'aliceblue',
    name: 'Alice Blue',
    capabilities: {
      portalLogin: true,
      portalWatchlist: true,
      sessionTokenDetection: true,
      accountDiscovery: true,
      balanceMapping: true,
      pnlMapping: true,
      marketDataCapture: true,
      restOrders: true,
      orderModify: true,
      orderBook: true,
      protectiveStopLoss: true,
      trailingStopLoss: true,
      optionChainDiscovery: true
    }
  }),
  buildBrokerDefinition({
    id: 'zerodha',
    name: 'Zerodha',
    capabilities: {
      portalLogin: true,
      portalWatchlist: true,
      sessionTokenDetection: true,
      accountDiscovery: true,
      balanceMapping: true,
      pnlMapping: true,
      marketDataCapture: false,
      restOrders: false,
      orderModify: false,
      orderBook: false,
      protectiveStopLoss: false,
      trailingStopLoss: false,
      optionChainDiscovery: false
    }
  })
];

function listBrokers() {
  return BROKER_DEFS.map(cloneBrokerDefinition);
}

function getBrokerCapabilities(id) {
  return { ...getBrokerDefinition(id).capabilities };
}

function getBrokerCapabilityMatrix() {
  return {
    fields: BROKER_CAPABILITY_FIELDS.map((field) => ({ ...field })),
    brokers: BROKER_DEFS.map((broker) => ({
      id: broker.id,
      name: broker.name,
      capabilities: { ...broker.capabilities }
    }))
  };
}

function brokerSupports(id, capability) {
  const broker = BROKER_DEFS.find((candidate) => candidate.id === normalizeBrokerId(id));
  return Boolean(broker && broker.capabilities && broker.capabilities[capability]);
}

function createBrokerAdapter(id, options = {}) {
  const brokerId = normalizeBrokerId(id);
  if (brokerId === 'aliceblue') return new AliceBlueAdapter(options);
  if (brokerId === 'zerodha') return new ZerodhaAdapter(options);
  throw new Error(`Unsupported broker: ${id}`);
}

function getBrokerDefinition(id) {
  const brokerId = normalizeBrokerId(id);
  return cloneBrokerDefinition(BROKER_DEFS.find((broker) => broker.id === brokerId) || BROKER_DEFS[0]);
}

function normalizeBrokerId(id) {
  return String(id || BROKER_DEFS[0].id).trim().toLowerCase();
}

function buildBrokerDefinition(definition) {
  const capabilities = { ...definition.capabilities };
  return {
    ...definition,
    capabilities,
    supportsMarketDataCapture: Boolean(capabilities.marketDataCapture),
    supportsRestOrders: Boolean(capabilities.restOrders)
  };
}

function cloneBrokerDefinition(broker) {
  return {
    ...broker,
    capabilities: { ...broker.capabilities }
  };
}

module.exports = {
  BROKER_CAPABILITY_FIELDS,
  brokerSupports,
  createBrokerAdapter,
  getBrokerCapabilities,
  getBrokerCapabilityMatrix,
  getBrokerDefinition,
  listBrokers,
  normalizeBrokerId
};
