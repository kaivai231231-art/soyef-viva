# ফোন থেকে Viva Study APK বানানো ও ইনস্টল

এই ZIP নিজে APK নয়; এটি source project। ফোন থেকে APK বানানোর সবচেয়ে সহজ পথ হলো GitHub Actions।

1. GitHub-এ একটি private repository তৈরি করুন।
2. এই project-এর সব files repository-তে upload করুন।
3. GitHub-এর **Actions** tab খুলুন।
4. **Build Viva Study APK** workflow নির্বাচন করুন।
5. **Run workflow** চাপুন।
6. Build শেষ হলে workflow-এর **Artifacts** অংশ থেকে `viva-study-debug-apk` download করুন।
7. ZIP খুলে `app-debug.apk` ফোনে রাখুন।
8. APK-তে tap করে Install করুন। Android যদি অনুমতি চায়, যে browser/file manager দিয়ে APK খুলেছেন তার জন্য **Install unknown apps** অনুমতি দিন।

APK install হওয়ার পর:
- প্রথমে bundled/offline version চলবে।
- Internet চালু থাকলে `https://myviva.netlify.app/app-update/` থেকে নতুন web version check করবে।
- নতুন version থাকলে background-এ download করে পরের reload-এ চালাবে।
- প্রশ্ন, উত্তর, follow-up, revision এবং daily study-time local database-এ থাকবে।

## Daily study time

App সামনে visible থাকা সময় প্রতি 10 সেকেন্ডে local database-এ জমা হয়। App background/অন্য app-এ গেলে timer থেমে যায়। Midnight পার হলে সময় দুই তারিখে ভাগ হয়। Progress → **অ্যাপ ব্যবহারের সময়** অংশে:
- শেষ 14 দিনের chart
- মোট জমা সময়
- তারিখ অনুযায়ী exact duration
দেখাবে।

Backup export-এ study-time-ও থাকবে এবং import করলে আবার ফিরবে।
