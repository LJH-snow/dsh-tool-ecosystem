# dsh-tool-ecosystem

Unified source workspace and release gate for the DeepSeek Harness tool plugins.

The repository contains the plugin packages under dsh-tool-*, the release inventory and security reports under release/, and the shared release check under scripts/release-check.mjs.

## Pull request gate

Every pull request runs .github/workflows/release-check.yml. The workflow installs every plugin from its lockfile, runs the credential scan, endpoint allowlist, output-bound checks, and the complete typecheck/build/npm pack matrix. The release-check job must pass before a protected main branch can merge the change.

Local invocation:

    node scripts/release-check.mjs --strict-output
