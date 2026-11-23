# Bare Shell Entitlement Policy

Trade Assist should ship as one bare desktop shell per platform/version. Customer access is decided at runtime by signed license entitlements, not by building different installers for different customers or feature bundles.

## Release Rule

For a given app version and platform, Skand should publish one customer installer artifact:

- macOS: `Trade Assist-<version>-mac-<arch>.dmg` and `.zip`
- Windows: `Trade Assist-<version>-win-<arch>.exe`

The installer must not include customer ids, broker names, feature names, module names, license tiers, or strategy package names in the artifact name. Those belong in the signed license manifest and downloaded module descriptors.

## Runtime Unlock Rule

All customer installs start with the same local shell capabilities:

- broker panel and local candle capture;
- license/device configuration;
- signed module sync;
- shell-owned risk controls and order execution;
- support diagnostics.

Premium behavior becomes available only when the license server returns a signed manifest containing enabled feature ids and signed module descriptors. The shell verifies:

- manifest signature;
- user/license/device validity;
- feature entitlement;
- module hash and signature;
- app-version compatibility;
- module expiry and offline-grace limits.

## Why This Matters

This avoids distributing separate premium builds that are harder to revoke, harder to support, and easier to leak. A customer can possess only the same base installer as everyone else; what changes is the short-lived signed entitlement and the signed module set the shell is allowed to cache.

## Guardrails

- Do not create customer-specific package scripts or installer artifact names.
- Do not bake license keys, user ids, entitlement lists, premium modules, or private signing keys into `package.json`, Electron build config, or installer resources.
- Keep premium module source outside the customer package.
- Use server-side feature assignment, module kill switches, and signed manifest expiry for access control.
