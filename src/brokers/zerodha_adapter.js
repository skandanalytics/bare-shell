const BrokerAdapter = require('./base_adapter');
const { mapZerodhaDiscovery } = require('./zerodha_discovery_mapper');

class ZerodhaAdapter extends BrokerAdapter {
  get id() {
    return 'zerodha';
  }

  get name() {
    return 'Zerodha';
  }

  get loginUrl() {
    return 'https://kite.zerodha.com/';
  }

  get watchlistUrl() {
    return 'https://kite.zerodha.com/dashboard';
  }

  get partition() {
    return 'persist:algo-zerodha-broker';
  }

  get tokenStorageKeys() {
    return ['enctoken', 'kf_session', 'public_token', 'request_token', 'user_id', 'token'];
  }

  get loggedInKeywords() {
    return ['dashboard', 'holdings', 'positions', 'orders', 'funds', 'margins', 'logout'];
  }

  get loggedOutKeywords() {
    return ['login', 'kite', 'password', 'forgot user id', 'forgot password'];
  }

  buildPortalAuthHeaders(token, _tokenKey = '') {
    const cleanToken = String(token || '').trim();
    if (!cleanToken) return {};
    const authorization = /^enctoken\s+/i.test(cleanToken)
      ? cleanToken.replace(/^enctoken\s+/i, 'enctoken ')
      : `enctoken ${cleanToken}`;
    return {
      authorization,
      Authorization: authorization,
      'x-kite-version': '3'
    };
  }

  async placeOrder() {
    throw new Error('Zerodha live order execution is not implemented yet. Add Kite Connect credentials before enabling orders.');
  }

  async getAccountSummary() {
    return {
      ok: false,
      clientId: '',
      clientName: '',
      accountStatus: '',
      balance: null,
      marginUsed: null,
      dayPnl: null,
      positions: [],
      message: 'Zerodha account summary sync uses the logged-in Kite portal session.'
    };
  }

  mapDiscoveryAccountSummary(candidate) {
    return mapZerodhaDiscovery(candidate, this.config.brokerDiscoveryMappings || {});
  }

  getPortalAccountRequests() {
    return [
      { url: 'https://kite.zerodha.com/oms/user/profile/full', method: 'GET' },
      { url: 'https://kite.zerodha.com/oms/user/margins', method: 'GET' },
      { url: 'https://kite.zerodha.com/oms/portfolio/positions', method: 'GET' }
    ];
  }

  isPortalUrl(url) {
    return /^https:\/\/kite\.zerodha\.com\//i.test(String(url || ''));
  }
}

module.exports = ZerodhaAdapter;
