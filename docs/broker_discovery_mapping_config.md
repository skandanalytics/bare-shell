# Broker Discovery Mapping Config

Broker account, balance, and P&L mapping is broker-specific. The shell now supports optional per-broker overrides through `brokerDiscoveryMappings` in `algo_alice_blue_config.json`.

## Config Shape

```json
{
  "brokerDiscoveryMappings": {
    "aliceblue": {
      "profile": {
        "rootPaths": ["result.0", "result", "$"],
        "clientIdPaths": ["userId", "actId"],
        "clientNamePaths": ["clientName"],
        "accountStatusPaths": ["actStatus"]
      },
      "funds": {
        "rootPaths": ["result.0", "result", "$"],
        "balancePaths": ["availableMargin"],
        "marginUsedPaths": ["marginUsed"]
      },
      "positions": {
        "rowPaths": ["result"],
        "pnlPaths": ["pnl"],
        "realizedPnlPaths": ["realizedPnl", "realisedPnl"],
        "unrealizedPnlPaths": ["unrealizedPnl", "unrealisedPnl"]
      }
    }
  }
}
```

`$` means the full response object. Dot paths can enter nested objects and array indexes, such as `data.equity.available.live_balance` or `result.0.clientName`.

## Why This Matters

Alice Blue and Zerodha do not use the same response keys. Even the same broker can change or duplicate fields across profile, funds, and positions endpoints. With mapping overrides, we can update field paths after discovery without rewriting mapper code.

## Current Scope

- Profile fields: client id, client name, account status.
- Funds fields: available balance and used margin.
- Position fields: rows plus direct P&L or realized/unrealized P&L.
- Defaults remain built into the broker mappers, so no config is required for current Alice Blue behavior.

## Probe Captured Logs

When a broker changes response fields, replay the captured discovery log before editing code:

```bash
npm run probe:broker-mapping -- --broker aliceblue --json
```

Use a specific log or config file when checking a customer bundle or older capture:

```bash
npm run probe:broker-mapping -- \
  --broker zerodha \
  --file "/path/to/broker_api_discovery_2026-11-23.jsonl" \
  --config "/path/to/algo_alice_blue_config.json" \
  --json
```

The report shows total rows, mapped rows, unmapped rows, field coverage, sample URLs, and gaps. A gap means no captured response mapped that field, for example `dayPnl` or `clientName`. Update only that broker's `brokerDiscoveryMappings` override, then rerun the probe until the expected fields are covered.
