# Offline Grace Policy

Feature modules are remote-controlled by the license manifest, but the app should not stop a paid feature immediately because of a short network or license-server outage.

## Default Policy

- Offline grace is enabled by default.
- The default grace window is `24` hours from the last successful signed manifest sync.
- Admin settings can disable grace or change the window between `1` and `168` hours.
- Grace never extends past the manifest `expiresAt` value.
- Individual cached modules are not evaluated past their own `expiresAt` value, even when manifest-level grace is still active.
- Individual cached modules are not evaluated past the local cache max age, default `24` hours from install.
- A first-time activation cannot use offline grace. The shell must complete at least one signed manifest sync before any downloaded module is eligible to run.
- If offline grace is disabled or expired, cached modules are blocked until the next successful signed manifest sync.
- Grace does not bypass module cleanup. Startup cleanup runs once per IST day before automatic sync, and the scheduled cleanup also runs after the configured IST hour when the app is open.

## What Happens During Sync

On a successful sync:

- the signed manifest is verified;
- module signatures and SHA-256 hashes are verified;
- modules are cached locally;
- `lastSuccessfulSyncAt` and manifest expiry are stored;
- the grace window is recalculated from that successful sync.

On app startup:

- stale downloaded modules from a previous IST day are removed first, even if the app was closed during the prior cleanup window;
- after cleanup, the app starts an automatic manifest sync with jitter so the current day's allowed modules can be downloaded.

On a failed sync:

- the failure is shown in module status;
- if grace is active, previously installed signed and unexpired modules remain available;
- if grace is expired, disabled, or no successful sync exists, cached modules are marked `offline-disabled` and are not evaluated;
- first activation remains blocked until the license API returns a valid signed manifest.

When the app later reads feature-module status, it also recalculates grace from `lastSuccessfulSyncAt` and `manifestExpiresAt`. If time has passed beyond the grace window without another sync attempt, any still-installed cached modules are immediately marked `offline-disabled`. This prevents the UI from showing a module as installed after it has become ineligible to run.

## Safety Boundaries

Offline grace only controls whether cached feature modules can be evaluated. It does not give modules any direct broker power.

The shell still owns:

- auto-trade toggle checks;
- broker session checks;
- daily loss and trade-count limits;
- stop-loss, trailing, and order-rate protection;
- final order placement.

So even during offline grace, a remote module can only produce a proposal. The desktop shell must still accept the proposal through normal risk and broker checks.

## Why This Is The Right Base

This gives real users a practical buffer for temporary internet or server issues, but still keeps distribution control with the manifest. A module cannot live forever offline: it is bounded by the last successful sync time, the license expiry, each module's own expiry, the local cache max age, and the daily cleanup process.
