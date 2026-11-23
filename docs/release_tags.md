# Release Tagging

This project uses annotated git tags for stable milestones.

## Tag Format

Use semantic-version style tags:

```text
vMAJOR.MINOR.PATCH[-milestone]
```

Examples:

- `v0.1.0-distribution-shell`
- `v0.1.1-risk-controls`
- `v0.2.0-license-modules`

## What A Tag Means

A tag should point to a commit that:

- has been pushed to the remote branch;
- passes `npm run release:preflight -- --tag <tag>`;
- passes `npm run check`;
- passes `npm run test:modules`;
- passes `npm run test:brokers`;
- passes `npm run release:source-boundary`;
- passes `npm run pack -- --publish=never`;
- has the matching checklist item or release note updated.

## Current Milestones

| Tag | Branch | Meaning |
| --- | --- | --- |
| `v0.1.0-distribution-shell` | `feature/distribution-module-loader` | First stable desktop shell milestone with broker adapters, candle repair, risk controls, protected trailing SL, feature-module runtime, reporting helpers, tests, and CI workflow. |

## Command Pattern

```bash
npm run release:preflight -- --tag v0.1.1
git tag -a v0.1.1 -m "v0.1.1 release"
git push origin v0.1.1
```

Do not push a `v*` release tag until production signing and notarization secrets are configured. Pushing a `v*` tag starts the signed installer workflow.
