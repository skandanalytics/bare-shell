# Clean-Machine Release QA

Run clean-machine QA only after signed installer artifacts exist. Use fresh macOS and Windows user profiles so cached broker sessions, old candles, and development settings do not hide first-run defects.

## Generate The Checklist

```sh
npm run release:qa-checklist -- --tag v0.1.1 --write
```

This writes `release/clean-machine-qa-checklist.md`. Keep the completed checklist with release evidence outside the customer installer.

Generate the focused packaged first-run evidence sheet:

```sh
npm run release:first-run-checklist -- --tag v0.1.1 --write
```

This writes `release/packaged-first-run-verification.md`.

## Required Machines

- macOS machine with no prior Trade Assist user data.
- Windows machine with no prior Trade Assist user data.
- Test broker account with controlled quantity and watchlist 1 access.
- License user configured in the hosted license system.

## Pass Criteria

- The signed installer opens without operating-system trust warnings.
- The installed app shows `Trade Assist` name and branded icon.
- License sync installs only entitled signed modules.
- Broker login, account summary, balance, Day P&L, metadata, and candle capture work from a fresh profile.
- Auto Trade defaults to off.
- Restart App works with no active trade and warns when a strategy position is active.
- Support bundle export works and redacts secrets.
- The completed packaged first-run evidence sheet is attached to the release notes.

## Failure Handling

If any item fails:

1. Save screenshots and the support bundle.
2. Record OS version, app version, release tag, broker, and license user id.
3. Do not ship the installer until the failing item has either a fix or a documented release-blocking decision.
