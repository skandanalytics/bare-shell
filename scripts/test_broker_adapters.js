const assert = require('assert');
const {
  brokerSupports,
  createBrokerAdapter,
  getBrokerCapabilities,
  getBrokerCapabilityMatrix,
  getBrokerDefinition,
  listBrokers,
  normalizeBrokerId
} = require('../src/brokers/broker_registry');
const {
  isCompleteOrderStatus,
  isOpenOrderStatus,
  normalizeOrderStatus,
  statusKey
} = require('../src/brokers/order_status');
const { analyzeDiscoveryRows } = require('../src/brokers/discovery_mapping_probe');
const { compactTradingSymbol } = require('../src/alice_rest_executor');

async function main() {
  testBrokerRegistry();
  testOrderStatusNormalization();
  testAliceCompactTradingSymbol();
  await testAliceBlueExecutorForwarding();
  testAliceBlueDiscoveryMapping();
  testAliceBlueConfigurableDiscoveryMapping();
  await testZerodhaSafeDefaults();
  testZerodhaSessionMapping();
  testZerodhaDiscoveryMapping();
  testZerodhaConfigurableDiscoveryMapping();
  testDiscoveryMappingProbe();
  console.log('broker adapter mock tests passed');
}

function testAliceCompactTradingSymbol() {
  assert.equal(
    compactTradingSymbol('SENSEX 19th NOV 82000 CE', {}, 'BFO'),
    'SENSEX26N1982000CE'
  );
  assert.equal(
    compactTradingSymbol('SENSEX 26th NOV 84000 PE', {}, 'BFO'),
    'SENSEX26NOV84000PE'
  );
  assert.equal(
    compactTradingSymbol('SENSEX26N1982000CE', {}, 'BFO'),
    'SENSEX26N1982000CE'
  );
}

function testBrokerRegistry() {
  const brokers = listBrokers();
  const aliceBlue = brokers.find((broker) => broker.id === 'aliceblue');
  const zerodha = brokers.find((broker) => broker.id === 'zerodha');
  assert.ok(aliceBlue);
  assert.ok(zerodha);
  assert.equal(normalizeBrokerId(' Zerodha '), 'zerodha');
  assert.equal(getBrokerDefinition('missing').id, 'aliceblue');
  assert.equal(createBrokerAdapter('aliceblue', { config: {} }).id, 'aliceblue');
  assert.equal(createBrokerAdapter('zerodha', { config: {} }).id, 'zerodha');
  assert.throws(() => createBrokerAdapter('unknown'), /Unsupported broker/);

  assert.equal(aliceBlue.supportsMarketDataCapture, aliceBlue.capabilities.marketDataCapture);
  assert.equal(aliceBlue.supportsRestOrders, aliceBlue.capabilities.restOrders);
  assert.equal(zerodha.supportsMarketDataCapture, zerodha.capabilities.marketDataCapture);
  assert.equal(zerodha.supportsRestOrders, zerodha.capabilities.restOrders);

  assert.equal(brokerSupports('aliceblue', 'restOrders'), true);
  assert.equal(brokerSupports('zerodha', 'restOrders'), false);
  assert.equal(brokerSupports('unknown', 'restOrders'), false);

  const aliceCapabilities = getBrokerCapabilities('aliceblue');
  const zerodhaCapabilities = getBrokerCapabilities('zerodha');
  assert.equal(aliceCapabilities.trailingStopLoss, true);
  assert.equal(zerodhaCapabilities.trailingStopLoss, false);

  const matrix = getBrokerCapabilityMatrix();
  assert.ok(matrix.fields.some((field) => field.id === 'pnlMapping'));
  assert.ok(matrix.fields.some((field) => field.id === 'protectiveStopLoss'));
  assert.equal(matrix.brokers.find((broker) => broker.id === 'aliceblue').capabilities.pnlMapping, true);
  assert.equal(matrix.brokers.find((broker) => broker.id === 'zerodha').capabilities.orderModify, false);

  aliceCapabilities.restOrders = false;
  matrix.brokers.find((broker) => broker.id === 'aliceblue').capabilities.pnlMapping = false;
  assert.equal(getBrokerCapabilities('aliceblue').restOrders, true);
  assert.equal(getBrokerCapabilityMatrix().brokers.find((broker) => broker.id === 'aliceblue').capabilities.pnlMapping, true);
}

function testOrderStatusNormalization() {
  assert.equal(statusKey('Trigger Pending'), 'TRIGGER_PENDING');
  assert.equal(statusKey('trigger_pending'), 'TRIGGER_PENDING');

  const openSamples = [
    'OPEN',
    'Pending',
    'TRIGGER_PENDING',
    'Trigger Pending',
    'MODIFY PENDING',
    { orderStatus: 'trigger pending' },
    { status: 'VALIDATION PENDING' }
  ];
  for (const sample of openSamples) {
    const normalized = normalizeOrderStatus(sample);
    assert.equal(normalized.normalized, 'open');
    assert.equal(isOpenOrderStatus(sample), true);
    assert.equal(normalized.isTerminal, false);
  }

  const completeSamples = [
    'COMPLETE',
    'Completed',
    'FILLED',
    'TRADED',
    { order_status: 'executed' }
  ];
  for (const sample of completeSamples) {
    const normalized = normalizeOrderStatus(sample);
    assert.equal(normalized.normalized, 'complete');
    assert.equal(isCompleteOrderStatus(sample), true);
    assert.equal(isOpenOrderStatus(sample), false);
    assert.equal(normalized.isTerminal, true);
  }

  const terminalSamples = [
    ['CANCELLED', 'cancelled'],
    ['CANCELED', 'cancelled'],
    ['REJECTED', 'rejected'],
    ['RMS Reject', 'rejected'],
    ['EXPIRED', 'expired']
  ];
  for (const [sample, expected] of terminalSamples) {
    const normalized = normalizeOrderStatus(sample);
    assert.equal(normalized.normalized, expected);
    assert.equal(isOpenOrderStatus(sample), false);
    assert.equal(normalized.isTerminal, true);
  }

  const unknown = normalizeOrderStatus({ orderStatus: 'SAF:order is not open to modify' });
  assert.equal(unknown.normalized, 'unknown');
  assert.equal(unknown.isOpen, false);
}

async function testAliceBlueExecutorForwarding() {
  const adapter = createBrokerAdapter('aliceblue', { config: { sessionToken: 'old', apiKey: 'old-key' } });
  const calls = [];
  adapter.executor = {
    setCredentials(credentials) {
      calls.push(['setCredentials', credentials]);
    },
    placeOrder(order) {
      calls.push(['placeOrder', order]);
      return Promise.resolve({ ok: true, result: { orderNo: 'AB123' } });
    },
    modifyOrder(order) {
      calls.push(['modifyOrder', order]);
      return Promise.resolve({ ok: true, result: { orderNo: order.orderNo } });
    },
    getOrderBook() {
      calls.push(['getOrderBook']);
      return Promise.resolve({ ok: true, result: [{ orderNo: 'AB123' }] });
    },
    getAccountSummary() {
      calls.push(['getAccountSummary']);
      return Promise.resolve({ ok: true, clientId: 'AB001', balance: 1000 });
    }
  };

  adapter.setCredentials({ sessionToken: 'new-token', apiKey: 'new-key' });
  assert.deepEqual(calls.shift(), ['setCredentials', { sessionToken: 'new-token', apiKey: 'new-key' }]);

  const order = { symbol: 'SENSEX26N82000CE', token: '123', quantity: 20 };
  assert.deepEqual(await adapter.placeOrder(order), { ok: true, result: { orderNo: 'AB123' } });
  assert.deepEqual(calls.shift(), ['placeOrder', order]);

  const modify = { orderNo: 'AB123', triggerPrice: 110 };
  assert.deepEqual(await adapter.modifyOrder(modify), { ok: true, result: { orderNo: 'AB123' } });
  assert.deepEqual(calls.shift(), ['modifyOrder', modify]);

  assert.deepEqual(await adapter.getOrderBook(), { ok: true, result: [{ orderNo: 'AB123' }] });
  assert.deepEqual(calls.shift(), ['getOrderBook']);

  assert.deepEqual(await adapter.getAccountSummary(), { ok: true, clientId: 'AB001', balance: 1000 });
  assert.deepEqual(calls.shift(), ['getAccountSummary']);
  assert.equal(adapter.isPortalUrl('https://ant.aliceblueonline.com/watchlist'), true);
  assert.equal(adapter.isPortalUrl('https://kite.zerodha.com/dashboard'), false);
}

function testAliceBlueDiscoveryMapping() {
  const adapter = createBrokerAdapter('aliceblue', { config: {} });
  const profile = adapter.mapDiscoveryAccountSummary(candidate('/omk/client-rest/profile/getclientdetails', {
    result: { userId: 'AB001', clientName: 'Alice User', actStatus: 'ACTIVE' }
  }));
  assert.equal(profile.clientId, 'AB001');
  assert.equal(profile.clientName, 'Alice User');
  assert.equal(profile.accountStatus, 'ACTIVE');

  const funds = adapter.mapDiscoveryAccountSummary(candidate('/omk/funds-rest/funds/limits', {
    result: { availableMargin: '286,889.66', marginUsed: '12,345.50' }
  }));
  assert.equal(funds.balance, 286889.66);
  assert.equal(funds.marginUsed, 12345.5);

  const positions = adapter.mapDiscoveryAccountSummary(candidate('/omk/po-rest/positions', {
    result: [
      { pnl: '9436.00' },
      { realizedPnl: '100.50', unrealizedPnl: '-25.25' }
    ]
  }));
  assert.equal(positions.dayPnl, 9511.25);
  assert.equal(positions.positions.length, 2);
}

function testAliceBlueConfigurableDiscoveryMapping() {
  const adapter = createBrokerAdapter('aliceblue', {
    config: {
      brokerDiscoveryMappings: {
        aliceblue: {
          profile: {
            rootPaths: ['data.client'],
            clientIdPaths: ['id'],
            clientNamePaths: ['displayName'],
            accountStatusPaths: ['state']
          },
          funds: {
            rootPaths: ['data.funds'],
            balancePaths: ['cash.available'],
            marginUsedPaths: ['cash.used']
          },
          positions: {
            rowPaths: ['data.rows'],
            pnlPaths: ['profit'],
            realizedPnlPaths: ['booked'],
            unrealizedPnlPaths: ['open']
          }
        }
      }
    }
  });

  const profile = adapter.mapDiscoveryAccountSummary(candidate('/omk/client-rest/profile/getclientdetails', {
    data: { client: { id: 'AB-CFG', displayName: 'Mapped Alice', state: 'ACTIVE' } }
  }));
  assert.equal(profile.clientId, 'AB-CFG');
  assert.equal(profile.clientName, 'Mapped Alice');
  assert.equal(profile.accountStatus, 'ACTIVE');

  const funds = adapter.mapDiscoveryAccountSummary(candidate('/omk/funds-rest/funds/limits', {
    data: { funds: { cash: { available: '10,500.25', used: '99.75' } } }
  }));
  assert.equal(funds.balance, 10500.25);
  assert.equal(funds.marginUsed, 99.75);

  const positions = adapter.mapDiscoveryAccountSummary(candidate('/omk/po-rest/positions', {
    data: { rows: [{ booked: '100', open: '20' }, { profit: '-15' }] }
  }));
  assert.equal(positions.dayPnl, 105);
}

async function testZerodhaSafeDefaults() {
  const adapter = createBrokerAdapter('zerodha', { config: {} });
  assert.equal(adapter.id, 'zerodha');
  assert.equal(adapter.isPortalUrl('https://kite.zerodha.com/dashboard'), true);
  assert.equal(adapter.isPortalUrl('https://ant.aliceblueonline.com/watchlist'), false);
  await assert.rejects(
    () => adapter.placeOrder({}),
    /Zerodha live order execution is not implemented/
  );
  const summary = await adapter.getAccountSummary();
  assert.equal(summary.ok, false);
  assert.equal(summary.positions.length, 0);
}

function testZerodhaSessionMapping() {
  const adapter = createBrokerAdapter('zerodha', { config: {} });
  assert.equal(adapter.tokenStorageKeys.includes('enctoken'), true);
  assert.equal(adapter.loggedInKeywords.includes('funds'), true);
  assert.equal(adapter.loggedOutKeywords.includes('password'), true);

  const headers = adapter.buildPortalAuthHeaders('kite-token-123', 'enctoken');
  assert.equal(headers.authorization, 'enctoken kite-token-123');
  assert.equal(headers.Authorization, 'enctoken kite-token-123');
  assert.equal(headers['x-kite-version'], '3');
  assert.equal(Object.prototype.hasOwnProperty.call(headers, 'tokenKey'), false);

  const prefixed = adapter.buildPortalAuthHeaders('enctoken existing-token', 'enctoken');
  assert.equal(prefixed.authorization, 'enctoken existing-token');
}

function testZerodhaDiscoveryMapping() {
  const adapter = createBrokerAdapter('zerodha', { config: {} });
  const profile = adapter.mapDiscoveryAccountSummary(candidate('/oms/user/profile/full', {
    data: { user_id: 'ZD001', user_name: 'Zerodha User', user_type: 'individual' }
  }));
  assert.equal(profile.clientId, 'ZD001');
  assert.equal(profile.clientName, 'Zerodha User');
  assert.equal(profile.accountStatus, 'individual');

  const margins = adapter.mapDiscoveryAccountSummary(candidate('/oms/user/margins', {
    data: {
      equity: {
        available: { live_balance: '125000.75' },
        utilised: { debits: '1000.25', option_premium: '200.50' }
      }
    }
  }));
  assert.equal(margins.balance, 125000.75);
  assert.equal(margins.marginUsed, 1200.75);

  const positions = adapter.mapDiscoveryAccountSummary(candidate('/oms/portfolio/positions', {
    data: {
      net: [{ pnl: '500.25' }],
      day: [{ realised: '100', unrealised: '-20' }]
    }
  }));
  assert.equal(positions.dayPnl, 600.25);
  assert.equal(positions.positions.length, 2);
}

function testZerodhaConfigurableDiscoveryMapping() {
  const adapter = createBrokerAdapter('zerodha', {
    config: {
      brokerDiscoveryMappings: {
        zerodha: {
          profile: {
            rootPaths: ['payload.profile'],
            clientIdPaths: ['account'],
            clientNamePaths: ['fullName'],
            accountStatusPaths: ['kind']
          },
          funds: {
            rootPaths: ['payload.margin'],
            balancePaths: ['cash.free'],
            marginUsedObjectPaths: ['used'],
            marginUsedPaths: []
          },
          positions: {
            rowPaths: ['payload.positions'],
            pnlPaths: ['netProfit'],
            realizedPnlPaths: [],
            unrealizedPnlPaths: []
          }
        }
      }
    }
  });

  const profile = adapter.mapDiscoveryAccountSummary(candidate('/oms/user/profile/full', {
    payload: { profile: { account: 'ZD-CFG', fullName: 'Mapped Zerodha', kind: 'individual' } }
  }));
  assert.equal(profile.clientId, 'ZD-CFG');
  assert.equal(profile.clientName, 'Mapped Zerodha');

  const margins = adapter.mapDiscoveryAccountSummary(candidate('/oms/user/margins', {
    payload: { margin: { cash: { free: '250000' }, used: { debits: '1000', option: '500' } } }
  }));
  assert.equal(margins.balance, 250000);
  assert.equal(margins.marginUsed, 1500);

  const positions = adapter.mapDiscoveryAccountSummary(candidate('/oms/portfolio/positions', {
    payload: { positions: [{ netProfit: '75' }, { netProfit: '-25' }] }
  }));
  assert.equal(positions.dayPnl, 50);
  assert.equal(positions.positions.length, 2);
}

function testDiscoveryMappingProbe() {
  const report = analyzeDiscoveryRows({
    brokerId: 'aliceblue',
    rows: [
      candidate('/omk/client-rest/profile/getclientdetails', {
        result: { userId: 'AB001', clientName: 'Alice User', actStatus: 'ACTIVE' }
      }),
      candidate('/omk/funds-rest/funds/limits', {
        result: { availableMargin: '286,889.66', marginUsed: '12,345.50' }
      }),
      candidate('/omk/po-rest/positions', {
        result: [{ pnl: '9436.00' }]
      }),
      candidate('/unrelated/api', {
        ok: true
      })
    ],
    config: {}
  });

  assert.equal(report.broker, 'aliceblue');
  assert.equal(report.totalRows, 4);
  assert.equal(report.mappedRows, 3);
  assert.equal(report.unmappedRows, 1);
  assert.equal(report.fields.clientId, 1);
  assert.equal(report.fields.balance, 1);
  assert.equal(report.fields.dayPnl, 1);
  assert.equal(report.fields.positions, 1);
  assert.deepEqual(report.gaps, []);
}

function candidate(urlPath, body) {
  return {
    url: `https://broker.test${urlPath}`,
    bodyPreview: JSON.stringify(body)
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
