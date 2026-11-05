#!/usr/bin/env python3
"""
Builds the kiosk catalog photos: square crops, WebP variants with content-hashed names,
and src/kiosk/productImages.json (product → files, status, art-direction prompt).

    python3 scripts/product-images/build.py

Deterministic: same sources and settings → same bytes → same file names, so the files
can be cached forever (vercel.json marks /products/* immutable). Re-run after replacing
a source photo in scripts/product-images/sources.json; old hashed files are removed.

Requires Pillow (pip install pillow). Sources are never modified.
"""
import hashlib
import io
import json
import pathlib

from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "public" / "products"
MANIFEST = ROOT / "src" / "kiosk" / "productImages.json"
SOURCES = json.loads((pathlib.Path(__file__).parent / "sources.json").read_text("utf-8"))

# Card: 1x / 2x of the ~200–360 CSS px card on a 1.5× M10. Detail: product sheet header.
SIZES = {"card": [384, 640], "detail": [960]}
QUALITY = 80


def crop_square(image: Image.Image, focus: dict) -> Image.Image:
    width, height = image.size
    side = round(min(width, height) * focus.get("scale", 1.0))
    cx, cy = focus.get("x", 0.5) * width, focus.get("y", 0.5) * height
    left = min(max(0, round(cx - side / 2)), width - side)
    top = min(max(0, round(cy - side / 2)), height - side)
    return image.crop((left, top, left + side, top + side))


def encode(image: Image.Image, size: int) -> bytes:
    resized = image.resize((size, size), Image.Resampling.LANCZOS) if image.width > size else image
    buffer = io.BytesIO()
    # Metadata-free, method 6 (best compression); identical input → identical bytes.
    resized.save(buffer, "WEBP", quality=QUALITY, method=6, exact=False)
    return buffer.getvalue()


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "style": SOURCES["style"], "products": {}}
    produced: set[str] = set()
    for product_id, spec in SOURCES["products"].items():
        entry = {"name": spec["name"], "status": spec["status"], "prompt": spec["prompt"], "note": spec.get("note", "")}
        if spec.get("source"):
            source = ROOT / spec["source"]
            image = ImageOps.exif_transpose(Image.open(source)).convert("RGB")
            square = crop_square(image, spec.get("focus", {}))
            entry["source"] = spec["source"]
            entry["sourceSize"] = f"{image.width}x{image.height}"
            for kind, sizes in SIZES.items():
                files = {}
                for size in sizes:
                    target = min(size, square.width)  # never upscale
                    data = encode(square, target)
                    name = f"{product_id}-{target}.{hashlib.sha256(data).hexdigest()[:10]}.webp"
                    (OUT_DIR / name).write_bytes(data)
                    produced.add(name)
                    files[str(target)] = {"url": f"/products/{name}", "bytes": len(data)}
                entry[kind] = files
        manifest["products"][product_id] = entry
    for stale in OUT_DIR.glob("*.webp"):
        if stale.name not in produced:
            stale.unlink()
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8")
    for product_id, entry in manifest["products"].items():
        card = entry.get("card", {})
        print(f"{product_id:24} {entry['status']:9} " + " ".join(f"{k}px={v['bytes'] // 1024}KB" for k, v in card.items()))


if __name__ == "__main__":
    main()
