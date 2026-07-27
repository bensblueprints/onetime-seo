# Maintainers

Maintainer-only workflow notes for the OneTime SEO fork (`bensblueprints/onetime-seo`). This repo is a fork of [`every-app/open-seo`](https://github.com/every-app/open-seo) (MIT, attribution kept in the README).

## Syncing from upstream

The upstream remote is `https://github.com/every-app/open-seo.git`. Pull upstream changes into the fork regularly and resolve rebrand conflicts (product name, links, pricing copy) in favor of OneTime SEO.

## Release notes workflow

Generate notes from commits since the latest semver tag:

```sh
pnpm release:notes
```

Useful variants:

```sh
pnpm release:notes -- --from v0.0.1 --to HEAD
pnpm release:notes -- --draft v0.0.2
```

The generator uses commits since the latest semver tag by default, filters out maintenance-only commits (`chore:`, `ci:`, `test:`, `build:`, `release:`), groups the rest into short user-facing sections, and can create a draft GitHub release with `--draft`.

Store finalized notes in `release-notes/` as versioned Markdown files such as `release-notes/v0.0.2.md`.
