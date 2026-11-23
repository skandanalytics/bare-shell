# Customer Package Boundary

The customer installer must contain only the bare Trade Assist shell. Premium strategy source, signing material, operator tools, server code, and generated module artifacts must stay outside the Electron package.

## Allowed In The Customer Package

The package allow-list in `package.json` should stay limited to:

- `main.js`
- `preload.js`
- `broker_preload.js`
- `src/**/*`
- `renderer/**/*`
- `package.json`

These paths are shell/runtime code only. They can load signed modules, verify licenses, maintain broker adapters, run risk checks, and execute orders, but they must not contain paid strategy source.

Hosted license-server source is explicitly excluded from the customer package even though it lives under `src/` for local development and tests:

- `src/license_server.js`
- `src/license_subscription_store.js`
- `src/rate_limiter.js`

## Forbidden In The Customer Package

Never package:

- `modules_src/`
- `remote_modules/`
- `premium_modules/`, `paid_modules/`, `private_modules/`
- `strategy_modules/`, `strategies_src/`
- `module_dist/`
- `admin_portal/`
- license server or deployment-only source
- private keys, signing keys, `.pem`, `.p12`, `.pfx`, `.key`
- production `license_config.json` or `operators.json`

Premium strategy source should live in a separate private repo or in `modules_src/` during local development, then be built into signed artifacts under ignored `module_dist/` before upload to CDN/object storage.

## Verification

Run before any customer release:

```sh
npm run test:package-boundary
```

The tests check the Electron package allow-list, reject entitlement-specific installer flavors, ensure premium/source/server folders are excluded, and scan packaged roots for forbidden premium-source and secret-key names.

## Source-Install Boundary

For the temporary source-install pilot path, also run:

```sh
npm run release:source-boundary
```

This gate is intentionally stricter because a source-install customer can inspect every tracked file, not only the packaged Electron allow-list. It must pass before a public/customer source branch is shared.
