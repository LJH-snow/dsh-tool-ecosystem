# Unified plugin release checks

Run the inventory and security checks without executing package commands:

```bash
node scripts/release-check.mjs --no-matrix
```

Run the complete typecheck/build/npm pack --dry-run matrix:

```bash
node scripts/release-check.mjs
```

The command writes these reviewable artifacts under `release/`:

- `plugin-versions.json` — package names, versions, and paths.
- `tool-manifest.json` — declared tool names per plugin.
- `security-report.json` — credential-like literals, endpoint allowlist findings, and output-bound review items.
- `release-matrix.json` — command results for every plugin.

The command fails on credential-like literals, endpoints outside the allowlist, missing bounds in the security-sensitive packages, or any failed matrix command. `--strict-output` also treats review items for older plugins as failures.
