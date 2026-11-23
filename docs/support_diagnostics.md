# Support Diagnostics Bundle

The desktop shell can export a local support bundle from **Settings -> Export Support Bundle**.

The bundle is written under the Electron user-data directory:

```text
support_bundles/support_<timestamp>_<id>/
```

The app opens the generated folder after export.

## Included

- `summary.json`: app version, platform, selected broker, runtime policy, and compact broker status.
- `config.redacted.json`: renderer-safe config with secrets removed.
- `account_summary.redacted.json`: current mapped broker summary, with customer ids hashed and names redacted.
- `feature_modules.redacted.json`: module sync state with signatures and keys removed.
- `strategy_state.redacted.json`: current open-position/cooldown snapshot.
- `data_store.redacted.json`: local data schema version, manifest path, and migration state.
- `file_inventory.json`: filenames, sizes, and modified times under local data.
- `candle_summary.json`: per-instrument/day candle counts and first/last bucket times.
- `logs/*.redacted.json`: recent strategy/module journal rows.
- `logs/*discovery*.summary.json`: broker discovery request summaries only.

## Excluded Or Redacted

- broker session tokens;
- API keys;
- license keys;
- passwords;
- cookies and authorization headers;
- private/public signing keys;
- module source files;
- module signatures and hashes;
- raw broker discovery request/response bodies.

The bundle is intended for reproducible support checks: stale candle capture, account mapping, feature-module sync, strategy state, and recent local events. It is not a full backup and should not be used to restore a customer machine.
## Observability Snapshot

Support bundles include `observability_snapshot.redacted.json`, a compact redacted view of shell version, broker state, license state, module versions, cache age, risk settings, and strategy state. See `docs/observability_snapshot.md`.

