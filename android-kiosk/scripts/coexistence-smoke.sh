#!/usr/bin/env bash
set -euo pipefail
# Test-only loopback URL. No production requests or customer data.
./gradlew --no-daemon :app:assembleDebug :barista:assembleDebug -Profe.debugUrl=http://127.0.0.1:5173/kiosk -Pbarista.debugUrl=http://127.0.0.1:5173/barista
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r barista/build/outputs/apk/debug/barista-debug.apk
mkdir -p dist/coexistence
for package in com.rofe.kiosk.debug com.rofe.barista.debug; do
  adb shell pm path "$package" | tee "dist/coexistence/$package.txt"
  adb shell am start -W -n "$package/com.rofe.kiosk.MainActivity"
  adb shell dumpsys package "$package" > "dist/coexistence/$package-package.txt"
done
adb shell pm list packages | grep -E 'package:com.rofe.(kiosk|barista).debug' | tee dist/coexistence/installed.txt
test "$(wc -l < dist/coexistence/installed.txt | tr -d ' ')" = 2
