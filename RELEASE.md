<!--
  ~ Copyright (c) 2025-2026 Datalayer, Inc.
  ~
  ~ MIT License
-->

# Making a release

One tag releases both packages, with no stored token: PyPI and npm trust
`.github/workflows/release.yaml` through OIDC (trusted publishing).

| Package                    | Registry | Version from                          | GitHub environment |
| -------------------------- | -------- | -------------------------------------- | ------------------- |
| `lexical-loro`             | PyPI     | `package.json` (via hatch-nodejs-version) | `pypi`            |
| `@datalayer/lexical-loro`  | npm      | `package.json`                         | `npm`               |

Both packages carry **one version**: `package.json`'s. `pyproject.toml`
reads it straight from there (`[tool.hatch.version] source = "nodejs"`), so
there is nothing to keep in sync by hand.

## Steps

1. Bump `version` in `package.json`, on a branch, and open a pull request.
2. Merge, then tag the merge commit and push the tag:

   ```bash
   git checkout main && git pull
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

3. The `Release` workflow checks that the tag names the version, builds the
   wheel, the sdist and the npm tarball, publishes what is not on the
   registries yet, and creates a GitHub release with generated notes.

## Trusted publishing

- PyPI project `lexical-loro`: owner `datalayer`, repository `lexical-loro`,
  workflow `release.yaml`, environment `pypi`.
- npm package `@datalayer/lexical-loro`: GitHub Actions, organization
  `datalayer`, repository `lexical-loro`, workflow filename `release.yaml`,
  environment `npm`. npm provenance also checks `package.json`'s
  `repository.url`, which already names this repository.

The registry matches the repository, the workflow filename and the
environment exactly; renaming any of them means re-registering.
