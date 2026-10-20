#!/usr/bin/env python3
"""Build bundled fonts; run from the repository root.

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
    ("alexbrush", "AlexBrush-Regular.ttf", "alex-brush", "Alex Brush",
     "df702038d8e27797230c77959c139eeea38cac0caf53e19ea5b513d3b0d3362d",
     "0ee34ce7c99b0deb7f7332bca0a4950d3796c23c00de77ada8aa29a4b55ff2c2"),
    ("sacramento", "Sacramento-Regular.ttf", "sacramento", "Sacramento",
     "9341fda10adbfeb7efc94302b34507a3e227d7e7f5c432df3f5ac8753ff73d24",
     "2e2cb5a98da665f2ab82a9fd01fb18c2337f845761b0c163f690ed65f3b94677"),
    ("italianno", "Italianno-Regular.ttf", "italianno", "Italianno",
     "f6ae96dea0da46c73370eb0575848ab0eda190315bdfda3f5b252bba3dc9173c",
     "bce79721f0203586872bbd7016922baf449980bdd1c44550a821112a3b547185"),
    ("monsieurladoulaise", "MonsieurLaDoulaise-Regular.ttf", "monsieur-la-doulaise", "Monsieur La Doulaise",
     "dd3e04fbe661a7a70ff87b56b446e57a2605de5659c84d35ef58f4606ee68fad",
     "a5fc033225d145b43fd7391482ae7689825414ce29a01614d651a3012b57c81e"),
    ("parisienne", "Parisienne-Regular.ttf", "parisienne", "Parisienne",
     "bc9ee17f022e20bc700797e5f557d14bfa43af0c98d9e6c9c5c1ca4ec7aacd57",
     "1dd84b611f4bed7f9ff9089e76a96337b187e6f283a4ab33bcb987f844f2c4db"),
    ("pinyonscript", "PinyonScript-Regular.ttf", "pinyon-script", "Pinyon Script",
     "4aab130a6ed27f8b8117738c84a5602edf9300cdcc0651a9a65bf96f451ac29a",
     "61d07cb0eaa943943648df2b11d0c2210e772053c192871e13f680b53fe0b77e"),
)
# Latin-only scripts do not provide Japanese vertical metrics or substitutions.
JAPANESE_FONT_SLUGS = frozenset({"notoserifjp", "notosansjp", "zenmarugothic", "yujisyuku"})


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
    if slug in JAPANESE_FONT_SLUGS:
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
        "Full character maps and glyphs are retained; Japanese vertical metrics and substitutions are retained.",
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
