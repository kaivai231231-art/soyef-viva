# Viva Study Android automatic web updates

The APK contains an offline copy of the web app. When internet is available, the native Android shell checks:

- `/app-update/version.json`
- `/app-update/web.zip`

If the remote semantic version is newer, the ZIP is downloaded to app-private storage, validated, atomically installed, and the WebView reloads. If the network fails, the current local version keeps working.

## One required configuration

Open:
`android/app/src/main/java/com/vivastudy/app/MainActivity.java`

Replace:
`https://myviva.netlify.app/app-update/`

with the real deployed Viva Study domain, for example:
`https://your-real-domain.com/app-update/`

The URL must be HTTPS.

## Website deployment

Every web deployment should generate the update bundle:

```bash
APP_UPDATE_VERSION=1.0.2 bash scripts/generate-app-update.sh
```

The generated files are placed under `artifacts/viva-study/dist/public/app-update/`, so Netlify publishes them automatically. Increment `APP_UPDATE_VERSION` for each Android-web update.

The app's IndexedDB origin stays `https://appassets.androidplatform.net/app/`, so web updates do not intentionally clear the user's local question/revision database.

## Native Android changes

If you change Java/native Android code, permissions, SDK configuration, or other native functionality, a new APK is still required. Normal React/Vite UI, AI, question, answer, revision, and bug-fix changes can be delivered through the web update system.
