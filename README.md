# Trade Assist

Standalone Electron terminal for broker market-watch capture and selected-token order execution.

## What It Does

- Opens Alice Blue inside Electron for broker login and market-data capture.
- Captures live ticks for instruments loaded in Alice Market Watch 1, including commodities and other scrips exposed by the broker web socket.
- Builds local candles and momentum stats per tracked instrument.
- Saves candle history locally under Electron user data.
- Places Buy/Sell/Exit orders for the selected tracked token through Alice REST from Electron.
- Runs without the cloud Brain server.

## Run Locally

```bash
cd /Users/apple/Documents/scratch/algo_alice_blue
npm install
/usr/bin/env -u ELECTRON_RUN_AS_NODE npm start
```

## Customer Install

The preferred customer path is the packaged bare-shell installer:

- macOS: signed/notarized `.dmg`.
- Windows: signed NSIS `.exe`.
- Internal smoke build: `npm run package:shell`.
- Signed release builds: `npm run dist:mac:signed` or `npm run dist:win:signed`.

The packaged shell starts like a normal desktop app, then syncs licensed feature modules after the customer enters their license details.

## Pilot Source Install

While paid signing certificates are pending, trusted technical pilot users can run from a bare-shell source checkout:

```bash
git clone https://github.com/skandanalytics/bare-shell.git
cd bare-shell
sh scripts/setup-mac.sh
npm start
```

Windows users can run:

```powershell
git clone https://github.com/skandanalytics/bare-shell.git
cd bare-shell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
npm start
```

Only use a source-install branch that passes `npm run release:source-boundary`. See `docs/customer_source_install.md`.

## First Use

1. Click **Open Alice Login** and login to Alice Blue.
2. Open Alice **Market Watch 1** and add the scrips you want to track.
3. Click **Track Market Watch 1** after the broker page is loaded.
4. Wait for ticks and candles to populate, then choose an instrument from the selector.
5. Review the selected-token ticket, quantity, product, exchange, and order type.
6. Click **Buy**, **Sell**, or **Exit**. The app keeps a local net-position monitor for the selected token.
7. Use **Settings → Restart App** when support asks for a clean reload after license sync, broker panel reload, or module updates.

## Notes

- Market-data capture accepts any tick token published by Alice's loaded watchlist web socket.
- Candle history is stored per instrument under `market_candles`.
- Order execution uses the selected tracked token and exchange shown in the ticket.
- The position monitor is local to orders submitted from this app and is not a full broker positions reconciliation.
- Session token and app settings are stored in Electron user data, not inside this project folder.
- The Alice API key is optional because many Alice sessions authorize with the browser session token alone, but the field is available if the account needs it.
- Restart App blocks the first restart attempt when a strategy position is active and requires an explicit force confirmation.
