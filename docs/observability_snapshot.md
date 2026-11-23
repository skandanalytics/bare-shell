# Observability Snapshot

Trade Assist behavior depends on several moving parts at once: shell version, broker state, account mapping, license state, module version, local module cache, risk settings, and strategy position state.

To make support/debugging practical, the app now builds a single observability snapshot for app state and support bundles.

## Snapshot Sections

- `shell`: app name/version, platform, arch, and runtime policy.
- `broker`: selected broker, broker panel readiness, session presence, active token, account/balance/P&L load state, and position count.
- `license`: feature-module configuration, user/device identifiers, sync timestamps, manifest expiry, offline grace, and sync errors.
- `modules`: installed module ids, versions, statuses, runtime status, feature ids, install/expiry times, cache age, app compatibility, and errors.
- `cache`: local module cache dir, cleanup enabled/hour, max cache age, last cleanup, and cleanup reason.
- `risk`: emergency stop, daily loss limit, max trades, max positions, and auto-trade state.
- `strategy`: current open strategy position and cooldown/suppression state.
- `dataStore`: local data-store manifest/migration status when available.

The support bundle writes this as `observability_snapshot.redacted.json`. Sensitive fields are redacted or hashed by the support-bundle sanitizer before leaving the customer machine.

## Operational Use

When a customer reports "strategy did not trade" or "module did not work", inspect this file first:

1. Confirm shell app version and runtime policy.
2. Confirm selected broker and whether account/balance/day P&L loaded.
3. Confirm license sync and offline grace status.
4. Confirm module id/version/status and cache age.
5. Confirm risk settings and whether auto-trade is enabled.
6. Confirm open strategy position/cooldown state.

This should reduce guesswork before reading raw JSONL logs.
