# Signed Installer Release

The app now has installer targets for:

- macOS: signed/notarized `.dmg` plus `.zip`
- Windows: signed NSIS `.exe`

Release builds run through `.github/workflows/release-installers.yml` on either a `v*` tag push or manual workflow dispatch. Manual workflow dispatch supports a platform selector:

- `all`: build macOS and Windows installers.
- `mac`: build only macOS installers.
- `win`: build only Windows installers.

Use `win` while Apple Developer ID/notarization setup is pending. A pushed `v*` tag still builds all release platforms.

## GitHub Secrets

Run this before configuring a release machine or GitHub Actions environment:

```sh
npm run release:secrets-plan
```

The command prints which release secrets are present or missing without printing secret values.

### macOS

Required for app signing:

- `MAC_CSC_LINK`: base64 encoded `.p12` Developer ID Application certificate, or a secure URL supported by Electron Builder.
- `MAC_CSC_KEY_PASSWORD`: password for the `.p12`.

Required for notarization. Prefer App Store Connect API key secrets:

- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

Alternative notarization methods accepted by the preflight check:

- `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_KEYCHAIN` + `APPLE_KEYCHAIN_PROFILE`

### Windows

Required:

- `WIN_CSC_LINK`: base64 encoded `.pfx` code-signing certificate, or a secure URL supported by Electron Builder.
- `WIN_CSC_KEY_PASSWORD`: password for the `.pfx`.

Use a separate Windows certificate secret instead of reusing `CSC_LINK`; it keeps macOS and Windows release credentials independent.

Windows-only preflight:

```sh
npm run release:preflight -- --tag v0.1.0-win --platform=win
```

## Local Commands

Unsigned unpacked smoke build:

```sh
npm run pack -- --publish=never
```

Signed macOS installer:

```sh
npm run dist:mac:signed
```

This accepts either `MAC_CSC_LINK` + `MAC_CSC_KEY_PASSWORD` or Electron Builder's generic `CSC_LINK` + `CSC_KEY_PASSWORD`.

Signed Windows installer:

```sh
npm run dist:win:signed
```

This accepts either `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` or Electron Builder's generic `CSC_LINK` + `CSC_KEY_PASSWORD`.

The signed commands intentionally fail before packaging if the required secrets are missing.

## Release Process

1. Confirm the app passes:

```sh
npm run check
npm run test:modules
npm run test:brokers
npm run test:version
npm run test:release
npm run test:package-boundary
npm run release:source-boundary
npm run pack -- --publish=never
```

2. Add or verify the GitHub secrets listed above.
   Use this pattern from a secured operator machine:

```sh
gh secret set MAC_CSC_LINK --body "<base64 .p12 or secure URL>"
gh secret set MAC_CSC_KEY_PASSWORD --body "<certificate password>"
gh secret set APPLE_API_KEY --body "<App Store Connect API key contents>"
gh secret set APPLE_API_KEY_ID --body "<key id>"
gh secret set APPLE_API_ISSUER --body "<issuer id>"
gh secret set WIN_CSC_LINK --body "<base64 .pfx or secure URL>"
gh secret set WIN_CSC_KEY_PASSWORD --body "<certificate password>"
```

   Never commit certificate files, passwords, API keys, copied secret values, or generated key material into git.
3. For a full production release, create and push a release tag:

```sh
git tag -a v0.1.1 -m "v0.1.1 signed installer release"
git push origin v0.1.1
```

   For Windows-only validation while macOS credentials are pending, run the `Release Installers` workflow manually from GitHub Actions and select `platform=win`.
4. Download artifacts from the `Release Installers` workflow run.
5. Generate the clean-machine QA checklist:

```sh
npm run release:qa-checklist -- --tag v0.1.1 --write
npm run release:first-run-checklist -- --tag v0.1.1 --write
```

6. On macOS, verify the `.dmg` opens and the app launches without a Gatekeeper block.
7. On Windows, verify the installer publisher is `Skand Analytics` and the app launches from the Start menu.
8. Complete `release/clean-machine-qa-checklist.md` and `release/packaged-first-run-verification.md` from fresh macOS and Windows profiles before customer distribution.

## Current Constraint

The repository cannot produce truly signed Windows installers until `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` are added to GitHub secrets. The Windows workflow can now be run independently through manual dispatch with `platform=win`; the full `v*` tag release should wait until both macOS and Windows production signing secrets are ready.
