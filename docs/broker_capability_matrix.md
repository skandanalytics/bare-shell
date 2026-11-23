# Broker Capability Matrix

The app now keeps broker support as an explicit capability matrix in `src/brokers/broker_registry.js`.
This avoids assuming that mappings, order placement, and stop-loss handling are the same for every broker.

## Current Broker Status

| Capability | Alice Blue | Zerodha |
| --- | --- | --- |
| Portal login | Yes | Yes |
| Portal watchlist/dashboard | Yes | Yes |
| Session token detection | Yes | Yes |
| Account discovery from portal APIs | Yes | Yes |
| Balance/funds mapping | Yes | Yes |
| P&L mapping | Yes | Yes |
| Market data tick capture | Yes | No |
| REST order placement | Yes | No |
| Order modify | Yes | No |
| Order book polling | Yes | No |
| Protective stop-loss order | Yes | No |
| Trailing stop-loss modify | Yes | No |
| Option chain/instrument discovery | Yes | No |

## Meaning

Alice Blue is the only broker currently marked as live-trading capable. It can map account, balance, P&L, positions, candles, order placement, order modification, and protective trailing stop-loss handling.

Zerodha is intentionally marked as portal/discovery scaffold only. The app can open Kite, preserve the browser session, and map known account/funds/positions API responses, but it must not place or modify live orders until the Zerodha execution adapter is completed and tested.

## Rules For New Brokers

- Add the broker adapter first with safe defaults.
- Add broker-specific account, balance, P&L, position, order, and instrument mappers.
- Enable `marketDataCapture` only after live tick capture is proven.
- Enable `restOrders`, `orderModify`, and `orderBook` only after broker API execution tests pass.
- Enable `protectiveStopLoss` and `trailingStopLoss` only when order modify state normalization prevents modifying completed/cancelled orders.
- Keep old compatibility flags `supportsMarketDataCapture` and `supportsRestOrders` derived from the capability matrix.
