#!/usr/bin/env bash
# APK yig'ish: ./build-apk.sh   (ixtiyoriy: SERVER_URL=sizning-server.onrender.com ./build-apk.sh)
# Talab: Node 18+, JDK 17+, Android SDK (ANDROID_HOME), python3 + Pillow (ikonka uchun)
set -euo pipefail
cd "$(dirname "$0")"

rm -rf www && mkdir www && cp -r ../client/* www/
if [ -n "${SERVER_URL:-}" ]; then
  echo "export const DEFAULT_SERVER = '${SERVER_URL}';" > www/config.js
  echo "Server manzili APK ichiga yozildi: ${SERVER_URL}"
fi

[ -d node_modules ] || npm install
[ -d android ] || npx cap add android

if [ -n "${ANDROID_HOME:-}" ]; then echo "sdk.dir=${ANDROID_HOME}" > android/local.properties; fi

node patch-android.mjs
python3 make-icons.py android/app/src/main/res
npx cap sync android

cd android
if [ -x ./gradlew ] && timeout 120 ./gradlew --version >/dev/null 2>&1; then GR=./gradlew; else GR=gradle; fi
echo "Gradle: $GR"
# Maven vaqtincha "429 Too Many Requests" bersa, qayta urinadi (yuklab olingan fayllar keshda qoladi)
ok=0
for i in 1 2 3 4 5 6; do
  if $GR assembleDebug --no-daemon; then ok=1; break; fi
  echo "Gradle xato berdi, ${i}-urinish. 20 soniyadan keyin qayta uriniladi..."; sleep 20
done
[ "$ok" = 1 ] || { echo "APK yig'ilmadi"; exit 1; }
cd ..
mkdir -p ../dist
cp android/app/build/outputs/apk/debug/app-debug.apk ../dist/SariqHovli.apk
echo "TAYYOR: $(cd ../dist && pwd)/SariqHovli.apk"
