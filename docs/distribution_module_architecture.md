# Distribution Module Architecture

This branch starts the desktop shell plus licensed feature module approach.

The customer release model is one bare shell installer per platform/version. Features are unlocked only by signed runtime entitlements and signed downloaded modules, not by shipping different installers per customer or feature tier. See `docs/bare_shell_entitlement_policy.md`.

## Shell Responsibilities

- Broker panel, login/session detection, market feed capture, candle storage, and order execution stay in the base Electron shell.
- Risk controls and broker request limits stay in the shell so downloaded modules cannot bypass safety checks.
- Remote modules are cached under Electron user data, not inside the app repo.
- Premium module source belongs under `modules_src/` and must not be packaged into the customer shell.
- Built signed module artifacts belong under ignored `module_dist/` before upload to CDN/object storage.

## Module Sync Flow

1. Admin config stores:
   - module manifest URL
   - licensed user id
   - license key
   - stable shell device id
   - RSA public key used to verify module signatures
2. The app calls the manifest URL with `userId`, `licenseKey`, `appVersion`, and `deviceId`.
3. The server returns a signed entitlement manifest.
4. The shell verifies the manifest signature unless unsigned development mode is enabled.
5. Each module is downloaded, checked against its SHA-256 hash, verified with the same public key, and cached.
6. Cached modules are stored by module id and immutable version.
7. On app startup, before automatic module sync, the shell performs a once-per-IST-day startup cleanup. This covers the case where the app was closed during the normal post-market cleanup time.
8. Cached modules are also cleaned after the configured IST cleanup hour, default `19`, while the app is running.
9. Cached modules have a local max age, default `24` hours from `installedAt`, even when files remain on disk.
10. If a later license sync fails, previously verified cached modules can run only inside the configured offline grace window and never past license/module/cache expiry.
11. If license sync succeeds but CDN/module storage download fails, the shell may reuse a same-id/same-version cached module only after rechecking its SHA-256 and signature against the signed manifest descriptor. The module status keeps a visible download error.

The shell also stores a configurable sync jitter window. Manual admin sync remains immediate, but automated sync paths can use jitter so a large customer base does not stampede the license API at market open.

## Manifest Shape

```json
{
  "payload": {
    "userId": "customer-001",
    "expiresAt": "2026-11-18T13:30:00.000Z",
    "features": [
      {
        "id": "strategy.momentumReversal",
        "name": "Momentum Reversal",
        "enabled": true,
        "expiresAt": "2026-11-18T13:30:00.000Z"
      }
    ],
    "modules": [
      {
        "id": "strategy-momentum-reversal",
        "version": "2026.11.18",
        "url": "https://cdn.example.com/modules/strategy-momentum-reversal.js",
        "entry": "module.js",
        "sha256": "hex-encoded-sha256",
        "signature": "base64-rsa-sha256-signature",
        "featureIds": ["strategy.momentumReversal"],
        "expiresAt": "2026-11-18T13:30:00.000Z"
      }
    ]
  },
  "signature": "base64-rsa-sha256-signature-of-json-stringified-payload"
}
```

## Current Scope

This branch now downloads, verifies, caches, expires, reports, and validates feature modules. Runtime execution is proposal-only: modules can suggest entries/exits/filters, but the shell still owns risk checks and broker order execution.

## Cache Exposure Controls

Downloaded modules are intentionally short-lived on the customer machine:

- install paths include module id and version;
- module source must match the descriptor SHA-256;
- module source signature must verify against the configured public key;
- `module.json` records `installedAt`, app compatibility, feature ids, hash, and expiry;
- modules are hidden from runtime evaluation after their own `expiresAt`;
- modules are hidden and removed after the local cache max age, default `24` hours;
- cached fallback after CDN failure is allowed only for the same module id/version and only when the cached bytes still match the signed descriptor hash/signature;
- startup cleanup removes old cached modules once per IST day before automatic sync;
- daily cleanup removes the whole feature-module cache after the configured IST cleanup hour while the app is running.

## Shell Risk Guard

The desktop shell owns the final order gate before any broker request is sent. The guard applies to built-in strategy orders now and will also protect future module-driven orders because modules only produce proposals.

Admin risk settings:

- `riskEmergencyStop`: blocks new entries immediately.
- `riskDailyLossLimit`: blocks new entries once broker/account day P&L is at or below the configured loss.
- `riskMaxTradesPerDay`: blocks new entries after the configured number of successful strategy entries for the current IST day.
- `riskMaxOpenPositions`: blocks new entries when known open positions reach the configured count.

Risk-reducing orders are still allowed while the guard is active. Exits, protective stop-loss placement, protective stop-loss modification, and sell-side close orders can continue so the app does not trap an open position just because new entries are disabled.

Every rejected order writes an `ORDER_SKIPPED` strategy event with the risk settings and live metrics used for the decision.

## Runtime Contract

Downloaded JavaScript modules run in a restricted VM context without `require`, `process`, broker APIs, or direct filesystem access. A module exports an object:

```js
module.exports = {
  id: 'strategy-momentum-reversal',
  version: '2026.11.19',
  kind: 'strategy',
  capabilities: ['proposal.entry', 'proposal.exit'],
  description: 'Momentum reversal scoring module',
  evaluate(context) {
    return {
      type: 'ENTRY',
      direction: 'bullish',
      optionType: 'CE',
      confidence: 72,
      reason: 'module-scored reversal',
      data: {}
    };
  }
};
```

Supported module kinds:

- `strategy`
- `indicator`
- `risk-filter`

Supported proposal types:

- `ENTRY`
- `EXIT`
- `FILTER`
- `INFO`

The shell clamps proposal confidence to `0..100`, strips unsafe fields, attaches module id/version, and must reject any proposal that fails shell-owned risk, broker, subscription, or market-state checks.

Downloaded modules cannot emit executable broker orders. The runtime keeps only proposal fields such as type, direction, option type, confidence, reason, module id/version, and optional data. Order payloads, direct strategy identity overrides, broker credentials, and quantity/price instructions are ignored. If a module proposal is ever promoted from observation to execution, the shell must rebuild the order itself and pass it through the same `evaluateStrategyRisk` final gate used by built-in strategies.

## Proposal Gate

Every module proposal now passes through a shell gate before it can be considered by live strategy code.

The gate rejects proposals when:

- the module does not declare the needed capability, such as `proposal.entry`;
- the module feature id is not present in the user's entitlement manifest;
- the entitlement is expired;
- an entry proposal is missing direction, CE/PE option type, confidence, or a valid index candle;
- an entry proposal arrives while the shell already has an open position;
- an exit proposal arrives without an open shell position.

The admin `Evaluate Modules` button runs installed modules against current shell state and reports accepted/rejected proposal counts. Accepted proposals are still not auto-traded in this slice.

Each evaluation writes a broker-scoped audit row to Electron user data:

- `feature_module_audit_aliceblue.jsonl`
- `feature_module_audit_zerodha.jsonl`

The audit row includes module count, accepted/rejected proposal counts, shell context summary, strategy-integration flag state, accepted proposals, rejected proposals, and rejection reasons.

## Strategy Integration Flag

Admin settings include `Enable accepted module proposals for strategy integration`. It is disabled by default. Accepted module proposals still do not place orders or override the built-in strategy.

When the flag is enabled, the shell evaluates installed modules on each closed index candle and emits accepted module proposals to the local UI/event stream. These proposal signals remain `autoTrade: false`; they are observable strategy candidates, not executable broker orders. The audit journal records every automatic candle evaluation.
