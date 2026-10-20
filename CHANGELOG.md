# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## [0.1.5] - 2026-10-20

- Remove the automatic `package.json` push release trigger. Merges run CI only; publication goes through the explicit `release_authorized` dispatch, matching the managed OSS release-hold policy.
- Stop `publish.yml` from publishing on a `package.json` push to `main`; tag, release, and manual dispatch remain.

## [0.1.4] - 2026-09-30

- Update `@earendil-works/pi-*` dependencies to `0.99.1`.

## [0.1.3] - 2026-09-27

- chore: periodic patch bump after 7+ days without npm publish
## [0.1.2] - 2026-09-28

- chore: periodic patch bump after 7+ days without npm publish
## [0.1.1] - 2026-09-28

- chore: periodic patch bump after 7+ days without npm publish
## Unreleased

