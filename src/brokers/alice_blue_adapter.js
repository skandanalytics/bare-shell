const BrokerAdapter = require('./base_adapter');
const AliceRestExecutor = require('../alice_rest_executor');
const { mapAliceBlueDiscovery } = require('./alice_blue_discovery_mapper');

class AliceBlueAdapter extends BrokerAdapter {
  constructor({ config = {} } = {}) {
    super({ config });
    this.executor = new AliceRestExecutor({
      sessionToken: config.sessionToken,
      apiKey: config.apiKey
    });
  }

  get id() {
    return 'aliceblue';
  }

  get name() {
    return 'Alice Blue';
  }

  get loginUrl() {
    return 'https://ant.aliceblueonline.com/';
  }

  get watchlistUrl() {
    return 'https://ant.aliceblueonline.com/watchlist';
  }

  get partition() {
    return 'persist:algo-alice-broker';
  }

  get tokenStorageKeys() {
    return ['userSession', 'sessionID', 'sessionId', 'alice_session', 'token'];
  }

  setCredentials({ sessionToken = '', apiKey = '' } = {}) {
    this.executor.setCredentials({ sessionToken, apiKey });
  }

  async placeOrder(order) {
    return this.executor.placeOrder(order);
  }

  async modifyOrder(order) {
    return this.executor.modifyOrder(order);
  }

  async getOrderBook() {
    return this.executor.getOrderBook();
  }

  async getAccountSummary() {
    return this.executor.getAccountSummary();
  }

  mapDiscoveryAccountSummary(candidate) {
    return mapAliceBlueDiscovery(candidate, this.config.brokerDiscoveryMappings || {});
  }

  getPortalAccountRequests() {
    return [
      { url: 'https://ant.aliceblueonline.com/omk/client-rest/profile/getclientdetails', method: 'GET' },
      { url: 'https://ant.aliceblueonline.com/omk/funds-rest/funds/limits', method: 'GET' },
      { url: 'https://ant.aliceblueonline.com/omk/po-rest/positions', method: 'GET' }
    ];
  }

  isPortalUrl(url) {
    return /^https:\/\/ant\.aliceblueonline\.com\//i.test(String(url || ''));
  }
}

module.exports = AliceBlueAdapter;
