# Local Data Store Migrations

The desktop shell now creates a lightweight data-store manifest in the Electron user-data `data/` directory:

```text
data/
  data_store_manifest.json
  data_migrations.jsonl
```

## Purpose

This is not a database layer. It is a version marker and migration journal for the local files the app already owns:

- market candles under `market_candles/`;
- module cache state under `modules/`;
- strategy journals and learning files;
- broker-specific instrument metadata;
- support diagnostics inventory.

## Current Version

`schemaVersion: 1`

Version 1 records:

- creation and last update time;
- app version that last opened the data;
- known local storage paths;
- file counts for candles, modules, journals, metadata, and other files.

When an existing customer install has no manifest, the app creates version 1 and appends a `baseline-v1` event to `data_migrations.jsonl`.

## Retention

On startup, after schema validation, the app applies configurable local retention:

- candles: default 30 days;
- local JSONL journals: default 14 days;
- exported support bundles: default 7 days.

The retention settings are available in the app settings panel and are written to the regular app config. `data_migrations.jsonl` is never pruned by this retention job.

## Safety Rules

- The manifest is written atomically with a temporary file and rename.
- Migrations append one JSONL row per applied migration.
- If local data was opened by a newer app schema, the older app refuses to open it instead of silently corrupting future-format data.
- Support bundles include the redacted data-store state so support can see schema version and migration history.

Future migrations should be added in `src/data_store.js` and covered by `scripts/test_data_store.js`.

## Candle Integrity

The app settings panel includes **Check Candles**. It scans saved `market_candles/` files and reports:

- malformed JSONL rows;
- missing or invalid numeric OHLC/bucket values;
- duplicate candle buckets;
- gaps larger than the configured candle interval;
- stale instruments whose latest candle is older than the allowed stale window.

This is read-only. It does not repair or delete candles; it only surfaces data-health signals for support and trading diagnosis.
