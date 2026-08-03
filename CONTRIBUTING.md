# Contributing

Thanks for helping improve pi-multica-doctor.

## Development

```bash
npm install
npm run ci
```

## Local Pi testing

```bash
pi -e .
```

Then run:

```txt
/multica-doctor-check
```

## Pull requests

Before opening a PR:

- Run `npm run ci`
- Update docs when behavior changes
- Update `CHANGELOG.md` for user-facing changes
- Keep package contents small and intentional
- Run `npm pack --dry-run` when you add, remove, or rename shipped files

## Release

Releases use npm Trusted Publishing. Do not add `NPM_TOKEN` to GitHub Secrets.

```bash
npm version patch
git push --follow-tags
```
