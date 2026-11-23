# App Version Compatibility

The feature-module system now checks app compatibility in both directions:

- the license server can reject apps that are too old or too new;
- the desktop shell rejects incompatible manifests and module descriptors before installing remote code.

## Version Sources

Desktop app version:

```text
package.json -> version
```

`main.js` passes that version into `FeatureModuleManager`, and module sync sends it as `appVersion` to the license server.

## License Server Checks

The license server accepts these fields:

| Location | Field | Meaning |
| --- | --- | --- |
| root config | `minAppVersion` | Reject every app older than this version. |
| root config | `maxAppVersion` | Reject every app newer than this version. |
| user config | `minAppVersion` | Per-user minimum app version. |
| user config | `maxAppVersion` | Per-user maximum app version. |
| module config | `minAppVersion` | Hide this module from older apps. |
| module config | `maxAppVersion` | Hide this module from newer apps. |

If the app version is rejected, `/manifest` returns HTTP `426`.

## Desktop Shell Checks

The shell verifies compatibility again after receiving a signed manifest:

- incompatible manifest: sync fails before module download;
- incompatible module descriptor: module is marked `rejected` and is not fetched or installed.
- cached module descriptor: checked again before runtime validation/evaluation, so an old shell or downgraded app cannot continue running a module whose `minAppVersion`/`maxAppVersion` no longer matches.

This protects users even if the license server config accidentally includes a module meant for another app version.

## Module Publishing

The publisher can stamp compatibility metadata directly into module descriptors:

```bash
npm run publish:module -- \
  --source ./remote_modules/momentum/module.js \
  --out-dir ./module_dist \
  --cdn-base-url https://cdn.example.com/feature-modules \
  --id momentum-module \
  --version 2026.11.19 \
  --feature-ids strategy.momentumReversal \
  --min-app-version 0.1.0 \
  --max-app-version 0.3.0 \
  --private-key ./secure_keys/production-2026-11.private.pem
```

## Rotation Pattern

When a module requires a newer shell:

1. Release the desktop app first.
2. Set the module `minAppVersion` to the new desktop version.
3. Publish the module.
4. Add the descriptor to the license server config.
5. Older apps keep syncing the previous compatible module set.

When a module is unsafe for newer shells:

1. Set `maxAppVersion` to the last known-compatible shell version.
2. Publish a replacement module for newer shells.
3. Keep both descriptors in the license config if needed.

## Automated Coverage

```bash
npm run test:version
npm run test:modules
```

These cover version comparison, desktop manifest rejection, and desktop module rejection.
