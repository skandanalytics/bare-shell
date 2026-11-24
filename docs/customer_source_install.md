# Customer Source Install

This is the no-certificate pilot distribution path for trusted technical users. Instead of a signed installer, the customer clones the bare Trade Assist shell repo, installs dependencies, and runs the Electron app locally.

Use this path while paid macOS/Windows signing is pending. It is not the final low-friction customer install experience.

## Before Sharing A Source Repo

Only share the public clean-history `skandanalytics/bare-shell` repo or a branch that contains the bare shell. Do not share this working branch as a public/customer source repo until private strategy and operator code are removed or moved into signed modules.

Run this gate before opening a source-install branch to customers:

```sh
npm run release:source-boundary
```

The source boundary is stricter than `npm run test:package-boundary`: package-boundary checks what goes into an Electron installer, while source-boundary checks what a customer can see after cloning the repo.

## Customer Requirements

Customers need:

- Git.
- Node.js 20 or newer.
- npm, included with Node.js.
- Internet access for `npm ci`, Electron download, license sync, module download, and broker login.
- A broker account supported by the enabled shell modules.

## macOS

```sh
git clone https://github.com/skandanalytics/bare-shell.git
cd bare-shell
sh scripts/setup-mac.sh
npm start
```

If macOS was launched from an environment where `ELECTRON_RUN_AS_NODE` is set, use:

```sh
/usr/bin/env -u ELECTRON_RUN_AS_NODE npm start
```

## Linux

```sh
git clone https://github.com/skandanalytics/bare-shell.git
cd bare-shell
sh scripts/setup-linux.sh
npm start
```

## Windows PowerShell

```powershell
git clone https://github.com/skandanalytics/bare-shell.git
cd bare-shell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
npm start
```

If the user already installed dependencies and only wants to re-check the app:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 -SkipInstall
```

## What The Setup Script Does

The setup script:

1. Confirms Node.js 20+ is available.
2. Confirms npm is available.
3. Runs `npm ci` when `package-lock.json` exists.
4. Generates Trade Assist app icons.
5. Runs `npm run check`.

It does not install Node.js, Git, broker software, certificate trust, or system drivers.

## Updating A Customer Checkout

```sh
git pull
npm run setup:source
npm start
```

`npm run source:install-check` is kept as an alias for the same setup check. On Windows, run the PowerShell setup script again instead of `npm run setup:source` if the customer prefers the guided command.

## Licensing And Module Flow

The cloned repo should contain only the bare shell. After the app starts:

1. Customer enters license details.
2. The shell validates the license with the license service.
3. The shell downloads only entitled signed modules.
4. The shell verifies module signatures before use.
5. Expired or disabled modules stop running through the license/module runtime.

Customer mode must remain the default. Internal/admin controls should not be exposed to customer source users.

## Limitations

- This is not a signed installer. macOS and Windows may show more warnings than a packaged release.
- The customer can inspect and modify the shell source.
- This does not protect logic that is present in the repo. Premium strategy logic must live outside the public source branch.
- Support effort is higher because customer machines may have different Node/npm/Git environments.
- This path is best for pilot customers who are comfortable with terminal commands.

## Support Checklist

Ask the customer for:

- OS and version.
- `node -v`.
- `npm -v`.
- The exact setup command output around the failure.
- Whether the app reaches the license screen.
- Whether broker login opens inside the right-side broker panel.
