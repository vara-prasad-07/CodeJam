# Secure Firestore on Render

The updated backend authenticates Firestore REST requests with short-lived OAuth tokens from Firebase Admin Application Default Credentials. There is no API-key-only database fallback. Existing Firebase web configuration remains necessary for user sign-in. No extension update is required just for this backend migration.

## 1. Store the key privately on Render

Use the service-account JSON for the same Firebase project as `projectId` / `FIREBASE_PROJECT_ID` on your backend. Do not upload it to GitHub, attach it to an issue, bundle it in the VSIX or paste it into chat.

On Render select the CodeJam service, then **Environment > Secret Files > Add Secret File**:

- Filename: `firebase-service-account.json`
- Contents: the full JSON downloaded from Firebase.

Add this environment variable:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-service-account.json
```

Keep existing Firebase web settings, Nexconn keys, Gemini key, `HOST=0.0.0.0` and `CODEJAM_PUBLIC_URL`. Keep `NODE_VERSION=24`. This secret file is server-only. For local work store the JSON outside the repository and set the same variable to its absolute local path in ignored `server/.env`.

## 2. Deploy the updated backend

Commit/push the updated `server/firestore.mjs`, `server/index.mjs`, `server/legacy-migration.mjs`, `server/firestore.rules`, `package.json` and `package-lock.json` along with intended source/docs. Never commit the secret JSON. Deploy that commit on Render with the normal build/start commands.

HTTP startup does not query Firestore. `/health` checks server liveness and configuration; database-backed requests still fail closed on credential, permission or quota errors. Optional legacy imports run before the first database-backed request and defer with backoff if Firestore is unavailable. Check the deploy logs and confirm this field at `https://codejam-vdmp.onrender.com/health`:

```json
"databaseAccess": "server-iam"
```

Before changing rules, sign in and verify an existing room loads, a decision can be saved and it remains after refresh. This exercises authenticated database reads/writes; the health label alone does not verify that every action works.

If Render reports credentials unavailable, verify the secret filename/path and valid JSON. If Firestore reports PERMISSION_DENIED, confirm project identity and that the service account has appropriate IAM database access (for example Cloud Datastore User / `roles/datastore.user`). Grant only the required access. Do not reopen public rules as a workaround.

## 3. Lock client access

Only after Step 2 succeeds, open **Firebase Console > Firestore Database > Rules**. Replace the complete ruleset with `server/firestore.rules` from this repository and click Publish. It contains:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

This blocks direct mobile/web client access. Server OAuth requests use IAM and are not granted access by these client rules. CodeJam's backend still validates sessions and room membership. Firebase Authentication sign-in is a separate service and is not disabled by these rules.

The rules cover the entire default database. If this Firebase database also supports other apps that directly use Firestore, do not replace its rules blindly; those apps need a separate reviewed access policy or separate database/project.

## 4. Verify after locking

- Sign in and load an existing room through CodeJam.
- Save a pin or resolve a discussion, refresh and check persistence.
- Use Firebase Rules Playground to verify an unauthenticated read/write to `codejam_rooms/test` is denied. Authenticated direct clients should also be denied with this ruleset.
- Confirm a non-member still cannot access another room through the backend (covered by automated API tests).
- Check the Firebase Rules tab shows the deployed deny-all rules.

Do not claim the hosted database is secured until these deployed checks pass. Review any data exposure that may have occurred while earlier rules were open; locking rules does not undo earlier reads or changes.

Keep service-account keys protected. If one was exposed, revoke it in Google IAM and replace the Render secret. No key has been read by the implementation agent, and no deployed rules were changed by these source edits.

References: https://firebase.google.com/docs/admin/setup/ and https://render.com/docs/configure-environment-variables
