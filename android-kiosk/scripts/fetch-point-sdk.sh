#!/usr/bin/env bash
set -euo pipefail
# Public official SDK, immutable revision + reviewed SHA. Never installs any APK.
root="$(cd "$(dirname "$0")/.." && pwd)"
destination="$root/point/vendor/nativesdk-7.3.1.aar"
expected='fa0969740cb670298d48e8b13fba06c0001e69dbf9d2559556124525d187575b'
mkdir -p "$(dirname "$destination")"
temporary="$(mktemp "${destination}.XXXXXX")"
trap 'rm -f "$temporary"' EXIT
curl --fail --location --silent --show-error \
    'https://raw.githubusercontent.com/mercadopago/point-smartapp-demo-android/2bc088ecf9414fa2a6c9464e7db03f66111150db/app/libs/nativesdk-7.3.1.aar' \
    -o "$temporary"
actual="$(shasum -a 256 "$temporary" | cut -d ' ' -f 1)"
if [ "$actual" != "$expected" ]; then
    echo 'SDK rechazado: el SHA-256 no coincide.' >&2
    exit 1
fi
mv "$temporary" "$destination"
echo 'SDK oficial 7.3.1 verificado. Ninguna terminal fue modificada.'
