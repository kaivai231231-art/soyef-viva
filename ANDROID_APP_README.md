# Viva Study — Offline Android App

এই Android wrapper-এ Viva Study-এর built web app সরাসরি APK-এর assets-এর মধ্যে bundled থাকে। তাই UI, প্রশ্ন, উত্তর, revision data এবং IndexedDB local storage ব্যবহারের জন্য Chrome/browser দরকার নেই। AI generation-এর মতো network কাজের জন্য internet লাগবে।

## Data
- Viva Study-এর local Dexie/IndexedDB database app-এর WebView storage-এ থাকে।
- App বন্ধ/ফোন offline হলেও saved questions/answers/revision data থাকবে।
- Browser-এর আগের IndexedDB সরাসরি Android app-এর storage-এ copy করা যায় না, কারণ দুইটি আলাদা origin/storage। Browser version-এর Settings → Backup → Export দিয়ে JSON backup নিয়ে app-এ Settings → Backup → Import করলে আগের data আনা যাবে।

## Build APK
1. Android Studio-তে এই `android/` folder open করুন।
2. Gradle sync শেষ করুন।
3. `app` → `build` → `assembleDebug` চালান।
4. APK পাবেন: `android/app/build/outputs/apk/debug/app-debug.apk`

## Updating the bundled web app
Web app source পরিবর্তনের পর:
1. `pnpm --filter @workspace/viva-study run build`
2. নতুন `artifacts/viva-study/dist/public` contents আবার `android/app/src/main/assets/www/`-এ copy করুন।
3. `assembleDebug` চালান।

## Important
এটি Chrome tab/PWA নয়। এটি একটি native Android application shell-এর ভিতরে bundled web app। Android-এর WebView renderer ব্যবহার হয়, Chrome browser app নয়।
