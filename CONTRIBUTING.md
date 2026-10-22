# Contributing to TabbyDeck

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Before you start

- **Bugs:** open an issue with the Bug report form. Include your Windows version, the phone or tablet and its browser, and what you pressed.
- **Features:** open an issue first so we can agree on the idea before you write code.
- **Questions:** use Discussions.

## Set up

You need Windows 10 or 11 and Node.js 24.

```
git clone https://github.com/<your-account>/TabbyDeck.git
cd TabbyDeck
npm install
npm run dev
```

`npm run dev` starts the host with a fake native layer, so buttons are recorded instead of pressing keys on your PC. Set `TABBY_REAL_NATIVE=1` to use the real one.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Keep the change focused on one thing.
3. Add or update tests for what you changed.
4. Run the checks before you push:
   ```
   npm run typecheck
   npm test
   ```
5. Open a pull request and fill in the template.

The phone and tablet app (`apps/deck`) must stay under 100 KB gzipped and run on Chrome 60 (Android 6). The build fails if it grows past the limit.

## Review and merging

Every pull request is reviewed by the maintainer, [@iamshihab2020](https://github.com/iamshihab2020), who is the only person who can merge into `main`. A pull request may be asked to change, or may be closed if it does not fit the project.

## Licence

By contributing, you agree that your contribution is licensed under the [Apache License 2.0](LICENSE), the same as the rest of the project.

## Releases

The maintainer publishes a release from their PC. Raise the version in `package.json`, add a `## <version>` section to `CHANGELOG.md`, commit, quit TabbyDeck, then run:

```
npm run release
```

It runs the type check and the tests, builds `tabbydeck.exe`, zips it with LICENSE and NOTICE, tags the version and publishes the release on GitHub.
