# Customer Shell Lockdown

The production/customer shell must not expose internal development controls. This protects the licensing model and reduces the chance that a customer can redirect module sources, enable unsigned code, inspect cached module internals, or run broker discovery tooling.

## Default Mode

The app defaults to customer mode.

Customer mode allows:

- broker login and watchlist use;
- license user/key entry;
- license sync;
- visible device id for support;
- auto-trade toggle;
- emergency/risk settings;
- normal strategy operation through shell-owned risk checks.

Customer mode hides and rejects:

- manifest URL editing;
- public signing key editing;
- unsigned module mode;
- module validation/evaluation internals;
- module cleanup tools;
- broker API discovery controls;
- raw data folder opening;
- strategy replay report controls;
- manual order ticket IPC.

The renderer hides these controls, and the main process also rejects the sensitive IPC calls.

## Internal Support Mode

Internal controls are available only when the app is launched with either:

```sh
ALGO_INTERNAL_ADMIN=1 npm run start
```

or:

```sh
npm run start -- --internal-admin
```

This is for Skand/support builds and local troubleshooting, not customer distribution.

## Important Boundary

This does not make client-side code impossible to inspect. It reduces exposed controls and blocks sensitive runtime paths in customer mode. Premium strategy source must still stay outside the shell package and be delivered only as signed, short-lived modules.
