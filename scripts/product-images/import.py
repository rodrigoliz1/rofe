#!/usr/bin/env python3
"""
Integrates externally generated photos of the new collection.

    python3 scripts/product-images/import.py <folder-with-photos>

Files must be named after the product id: espresso.png, flat-white.jpg, iced-matcha-latte.webp…
(see the ids in sources.json). Each one is checked (≥1024 px, close to 1:1), copied to
scripts/product-images/originals/, marked "approved" with today's approval date, and the
optimized variants + src/kiosk/productImages.json are rebuilt. Commit and deploy: the new
content-hashed names invalidate every cache, and admin uploads older than the approval
no longer override the new photo.
"""
import datetime
import json
import pathlib
import shutil
import subprocess
import sys

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SOURCES = HERE / "sources.json"
ORIGINALS = HERE / "originals"


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    folder = pathlib.Path(sys.argv[1])
    data = json.loads(SOURCES.read_text("utf-8"))
    products = data["products"]
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()
    imported, problems = [], []
    validated = []
    seen = set()
    for file in sorted(folder.iterdir()):
        if file.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        product_id = file.stem.lower()
        if product_id not in products:
            problems.append(f"{file.name}: no existe el producto «{product_id}»")
            continue
        if product_id in seen:
            problems.append(f"{file.name}: producto duplicado en el lote")
            continue
        seen.add(product_id)
        try:
            with Image.open(file) as image:
                width, height = image.size
                image.verify()
        except (OSError, ValueError):
            problems.append(f"{file.name}: imagen inválida")
            continue
        if min(width, height) < 1024:
            problems.append(f"{file.name}: {width}×{height}, se requieren al menos 1024 px")
            continue
        if abs(width / height - 1) > 0.05:
            problems.append(f"{file.name}: {width}×{height}, se requiere formato cuadrado 1:1")
            continue
        validated.append((file, product_id))
    if problems:
        for problem in problems:
            print("✗", problem)
        print("El lote no se importó; no se modificaron originales ni manifiesto.")
        return 1
    ORIGINALS.mkdir(exist_ok=True)
    for file, product_id in validated:
        target = ORIGINALS / f"{product_id}{file.suffix.lower()}"
        shutil.copyfile(file, target)
        spec = products[product_id]
        spec.update({"status": "approved", "approvedAt": now, "source": str(target.relative_to(ROOT)), "note": ""})
        spec.pop("focus", None)
        imported.append(product_id)
    SOURCES.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", "utf-8")
    if imported:
        subprocess.run([sys.executable, str(HERE / "build.py")], check=True)
    pending = [pid for pid, spec in products.items() if spec["status"] != "approved"]
    print(f"Aprobadas ahora: {', '.join(imported) or 'ninguna'}")
    print(f"Aún sin foto nueva ({len(pending)}): {', '.join(pending) or 'ninguna'}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
