# GitHub Release checklist

This repository is prepared locally and has not been made public.

Before creating the public repository or release:

1. Obtain explicit user approval for repository visibility and publishing.
2. Confirm the target GitHub account and repository name.
3. Re-run the public-content secret scan.
4. Confirm `manifest.json` and `package.json` both report version `0.2.1`.
5. Confirm `main.js`, `manifest.json`, and `styles.css` match the accepted
   0.2.1 install ZIP.
6. Push the default branch.
7. Create tag `0.2.1`.
8. Upload `main.js`, `manifest.json`, `styles.css`, and
   `azhen-memory-0.2.1.zip` as Release assets.
9. Publish Release notes from `release/0.2.1/release-notes.md`.
