# Publish CodeJam from the Marketplace website

## 1. Resolve release requirements

- Database migration/access checks passed on November 19, 2026; see [DATABASE_VERIFICATION.md](DATABASE_VERIFICATION.md). Redeploy the small version-conflict handling fix before release. Use [FIRESTORE_SECURITY.md](FIRESTORE_SECURITY.md) for other deployments.
- Finish Google popup, real two-way audio and visual acceptance using DEMO.md.
- Review LICENSE.txt and PRIVACY.md, including operator identity, third-party services and retention. CodeJam source is MIT-licensed. Bundled third-party SDKs keep their separate licenses.
- Confirm the Render deployment has the membership fix, working `/health`, Google authorized domain and required provider services. Configure quotas and abuse controls for public signups.

## 2. Create your publisher account

Open https://marketplace.visualstudio.com/manage and sign in with a Microsoft account. Choose **Create publisher**. Set your display name and an available unique publisher ID. Use an ID you control. The publisher ID forms part of the permanent extension identity; choose it before publication.

Your publisher display name and registered publisher ID are both **CodeJam**, as confirmed in the Marketplace publisher management page. The manifest uses this exact ID. From the inner `codejam` directory run:

```powershell
npm run set:publisher -- YOUR_PUBLISHER_ID
```

Use the same exact ID as the Marketplace publisher you created. Changing publisher changes extension identity; existing sideloaded installs may need uninstall/reinstall and sign-in again.

## 3. Build the final upload

From the inner `codejam` directory:

```powershell
npm ci --include=dev
npm test
npm run check:release
npm run vsix
```

`check:release` validates files and metadata but cannot prove publisher ownership. Confirm the **CodeJam** publisher is selected under your account before uploading. The VSIX is created in the outer `artifacts` folder as `codejam-workspace-1.0.6.vsix`. This is a universal package; no platform-specific native dependency is bundled. Source, backend, tests, node_modules, `.env` and development docs are excluded by a package allowlist. The installed extension defaults to the Render URL.

Commit and push the intended source, docs and assets to your GitHub repository so Marketplace readme links resolve. Never commit `.env` or private legacy data.

Install this final VSIX locally and complete DEMO.md before uploading. Do not upload a source ZIP or your `.env`.

## 4. Upload using the website

On the Marketplace publisher management page select your publisher, choose **New extension > Visual Studio Code**, and upload `artifacts/codejam-workspace-1.0.6.vsix`. Review the title, description, icon, readme, license and publisher. Complete any required account verification and terms yourself. Submit when the release requirements above are satisfied.

The website flow does not require putting a publishing token into the project. Do not add Marketplace credentials to `.env` or share them in chat. Marketplace performs validation/scanning; use its status page to see whether publication succeeded. No publication has been performed by these preparation steps.

The manifest marks this release as a preview. It should remain a preview until manual acceptance and backend security work are complete.

## 5. Future updates

Fix and test changes, increment `version` in package.json and package-lock.json (`npm version patch --no-git-tag-version`), update CHANGELOG.md, run the release checks/build, and upload the new VSIX through your extension's **Update** action. A published version cannot be replaced with different contents under the same version number.

## Maintained files

- Marketplace: package.json, README.md, CHANGELOG.md, media/icon.png.
- User disclosures: LICENSE.txt, PRIVACY.md, SUPPORT.md, SECURITY.md, THIRD_PARTY_NOTICES.md and licenses/.
- Development: src/, tests/, server/, scripts/, .vscode/, docs/ and build configuration.
- Generated: dist/, media/nexconn.js, server/public/*.js and out/.
- Release artifacts: outer artifacts/; old VSIX packages are in artifacts/archive/.

Official instructions: https://code.visualstudio.com/api/working-with-extensions/publishing-extension

## Removed Marketplace entry

The previous internal name `codejam` was removed from Marketplace. Microsoft permanently reserves removed extension names, including for the original publisher. This package uses `name: codejam-workspace`, `displayName: CodeJam Workspace`, `publisher: CodeJam`. Its new identity is `CodeJam.codejam-workspace`.

Upload this package as a new extension under the existing CodeJam publisher. Do not create another publisher. If an old CodeJam build is installed locally, uninstall it before installing the new identity, then sign in again with the same Firebase account to retrieve existing rooms. Existing installations do not automatically migrate to a different extension ID.

For subsequent releases use Update and increase the version. Avoid Remove when you only want to replace a build; unpublishing and removing are different operations. Official policy: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#removing-extensions

The portal also rejected the display name `CodeJam` as taken. Version 1.0.6 uses `CodeJam Workspace`. The publisher remains `CodeJam`; do not remove or recreate the publisher. Actual name acceptance is determined by the Marketplace during upload.
