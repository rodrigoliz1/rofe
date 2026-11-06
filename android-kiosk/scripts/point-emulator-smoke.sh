#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# No fallback to a connected tablet or commercial terminal.
if adb devices | awk 'NR > 1 && NF > 0 && $1 !~ /^emulator-/ {found=1} END {exit !found}'; then
    echo 'Desconecta los dispositivos físicos antes de ejecutar esta prueba de emulador.' >&2
    exit 1
fi
serial="${ANDROID_SERIAL:-}"
if [[ "$serial" != emulator-* ]]; then
    serial="$(adb devices | awk '/^emulator-.*\tdevice$/ {print $1; exit}')"
fi
if [[ "$serial" != emulator-* ]] || [ "$(adb -s "$serial" shell getprop ro.kernel.qemu | tr -d '\r')" != '1' ]; then
    echo 'Esta prueba solo admite un emulador Android. No se instala en dispositivos físicos.' >&2
    exit 1
fi
export ANDROID_SERIAL="$serial"
./gradlew --no-daemon -Pandroid.injected.device.serial="$serial" :point:assemblePrototypeDebug :point:connectedPrototypeDebugAndroidTest
adb -s "$serial" shell am start -W -n com.rofe.point.prototype.debug/com.rofe.point.MainActivity
mkdir -p dist/point/emulator
adb -s "$serial" exec-out screencap -p > dist/point/emulator/cold-start.png
adb -s "$serial" shell input keyevent KEYCODE_HOME
adb -s "$serial" shell am start -W -n com.rofe.point.prototype.debug/com.rofe.point.MainActivity
adb -s "$serial" shell am force-stop com.rofe.point.prototype.debug
adb -s "$serial" shell am start -W -n com.rofe.point.prototype.debug/com.rofe.point.MainActivity
adb -s "$serial" exec-out screencap -p > dist/point/emulator/restarted.png
# No order is created and no SmartPOS/Mediator/default HOME configuration is touched.
