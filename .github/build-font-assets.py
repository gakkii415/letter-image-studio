#!/usr/bin/env python3
"""Build bundled Japanese fonts; run from the repository root.

Dependencies: python -m pip install fonttools==4.61.1 brotli==1.2.0
Usage: python .github/build-font-assets.py [output-directory]
Default output: assets/fonts
"""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen
import argparse
import hashlib
import os
import tempfile

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

COMMIT = "47d54ca1ebb14fd864695f1d39dc734f39017c33"
BASE_URL = f"https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl"
# slug, source TTF filename, output basename, display family, TTF SHA-256, OFL SHA-256
FONTS = (
    ("notoserifjp", "NotoSerifJP%5Bwght%5D.ttf", "noto-serif-jp", "Noto Serif JP",
     "2fd527ba12b6a44ec30d796d633360da0aeba6c5d4af1304ce12bb4dc15a7dfc",
     "5e0da210fb04058a8c0087985d2d456b931c2579811a49655721d3cf0c36b6d6"),
    ("notosansjp", "NotoSansJP%5Bwght%5D.ttf", "noto-sans-jp", "Noto Sans JP",
     "c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f",
     "1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9"),
    ("zenmarugothic", "ZenMaruGothic-Regular.ttf", "zen-maru-gothic", "Zen Maru Gothic",
     "a0c0b53543e0993ae2225e629c833f3d51495ad31720694ff112ce4ce11111ef",
     "2a20cf7ce1909d8ee1e949095d340f7d7656705f7c810a2d6faf56800ad0cb3d"),
    ("yujisyuku", "YujiSyuku-Regular.ttf", "yuji-syuku", "Yuji Syuku",
     "82728ebafc8c97391e2dab633414a806f344b8e4e2227d307179f07b548fca61",
     "ef7c85c72ae94381c8bc4832ae4e6fbabdeafa2bb8a31313cd75dce95a690256"),
)


def download(url, expected_sha256):
    request = Request(url, headers={"User-Agent": "letter-image-studio-font-build"})
    with urlopen(request, timeout=60) as response:
        data = response.read(32 * 1024 * 1024 + 1)
    if len(data) > 32 * 1024 * 1024:
        raise RuntimeError(f"Download exceeds 32 MiB: {url}")
    if hashlib.sha256(data).hexdigest() != expected_sha256:
        raise RuntimeError(f"SHA-256 mismatch: {url}")
    return data


def write_atomic(path, data):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
        temporary.write(data)
    try:
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def build_font(item, output):
    slug, filename, basename, family, font_hash, license_hash = item
    source_url = f"{BASE_URL}/{slug}/{filename}"
    font_bytes = download(source_url, font_hash)
    license_bytes = download(f"{BASE_URL}/{slug}/OFL.txt", license_hash)
    font = TTFont(BytesIO(font_bytes), recalcTimestamp=False)
    original_cmap = font.getBestCmap().copy()
    original_glyphs = font.getGlyphOrder().copy()
    if "fvar" in font:
        font = instantiateVariableFont(
            font, {"wght": 400}, inplace=True, updateFontNames=True
        )
    if font.getBestCmap() != original_cmap or font.getGlyphOrder() != original_glyphs:
        raise RuntimeError(f"Character or glyph coverage changed: {family}")
    if font["OS/2"].usWeightClass != 400 or "fvar" in font:
        raise RuntimeError(f"Expected static Regular weight 400: {family}")
    if not all(table in font for table in ("vhea", "vmtx", "GSUB")):
        raise RuntimeError(f"Missing vertical metrics or shaping: {family}")
    tags = {record.FeatureTag for record in font["GSUB"].table.FeatureList.FeatureRecord}
    if not tags.intersection({"vert", "vrt2"}):
        raise RuntimeError(f"Missing vertical glyph substitutions: {family}")
    font.recalcTimestamp = False
    font.flavor = "woff2"
    result = BytesIO()
    font.save(result)
    font.close()
    woff2 = result.getvalue()
    # Reopen the compressed output to catch incomplete/corrupt encodings.
    with TTFont(BytesIO(woff2), recalcTimestamp=False) as check:
        if check.getBestCmap() != original_cmap:
            raise RuntimeError(f"WOFF2 coverage check failed: {family}")
    write_atomic(output / f"{basename}.woff2", woff2)
    write_atomic(output / f"{basename}-OFL.txt", license_bytes)
    print(f"{basename}.woff2: {len(woff2):,} bytes; {len(original_cmap):,} characters", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", nargs="?", type=Path, default=Path("assets/fonts"))
    output = parser.parse_args().output
    output.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda item: build_font(item, output), FONTS))
    sources = [
        "All font files are distributed under the SIL Open Font License 1.1.",
        "The adjacent *-OFL.txt files contain their copyright and license notices.",
        f"Google Fonts source commit: {COMMIT}",
        "Full character maps, glyphs and vertical metrics are retained.",
        "Noto variable fonts are instantiated at weight 400; all outputs are Regular WOFF2.",
        "",
    ]
    for slug, filename, basename, family, _, _ in FONTS:
        sources += [f"{basename}.woff2 — {family}, Regular (weight 400)",
                    f"{BASE_URL}/{slug}/{filename}",
                    f"https://github.com/google/fonts/tree/{COMMIT}/ofl/{slug}", ""]
    write_atomic(output / "SOURCES.txt", "\n".join(sources).encode("utf-8"))


if __name__ == "__main__":
    main()
