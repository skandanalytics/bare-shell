class BrokerAdapter {
  constructor({ config = {} } = {}) {
    this.config = config;
  }

  get id() {
    return 'base';
  }

  get name() {
    return 'Broker';
  }

  get loginUrl() {
    throw new Error('Broker login URL is not configured.');
  }

  get watchlistUrl() {
    return this.loginUrl;
  }

  get partition() {
    return `persist:algo-${this.id}-broker`;
  }

  get tokenStorageKeys() {
    return ['userSession', 'sessionID', 'sessionId', 'token'];
  }

  get loggedInKeywords() {
    return ['portfolio', 'funds', 'orders', 'positions', 'watchlist', 'logout', 'log out'];
  }

  get loggedOutKeywords() {
    return ['login', 'sign in', 'password', 'forgot password'];
  }

  setCredentials(_credentials = {}) {}

  buildPortalAuthHeaders(token, tokenKey = '') {
    const cleanToken = String(token || '').trim();
    if (!cleanToken) return {};
    return {
      Authorization: cleanToken.startsWith('Bearer ') ? cleanToken : `Bearer ${cleanToken}`,
      'X-Authorization': cleanToken.startsWith('Bearer ') ? cleanToken : `Bearer ${cleanToken}`,
      sessionId: cleanToken,
      userSession: cleanToken,
      token: cleanToken
    };
  }

  async placeOrder() {
    throw new Error(`${this.name} order execution is not implemented.`);
  }

  async getOrderBook() {
    throw new Error(`${this.name} order book lookup is not implemented.`);
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
      message: `${this.name} account summary is not implemented.`
    };
  }

  mapDiscoveryAccountSummary(_candidate) {
    return null;
  }

  getPortalAccountRequests() {
    return [];
  }

  isPortalUrl(url) {
    return Boolean(url);
  }
}

module.exports = BrokerAdapter;
