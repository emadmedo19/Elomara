#!/usr/bin/env python3
"""Generate one consistent set of Al-Emara brand assets for web and Android."""
from pathlib import Path
import io
import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SVG = ROOT / "public" / "icon.svg"
source = SVG.read_bytes()
def render(size):
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=source, output_width=size, output_height=size))).convert("RGBA")

# Web/PWA icons
for path, size in [
    ("public/icon.png", 512),
    ("public/apple-touch-icon.png", 180),
    ("public/pwa-192x192.png", 192),
]:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    render(size).save(target, format="PNG", optimize=True)

# Keep Capacitor's copied web assets in sync as well.
assets = ROOT / "android/app/src/main/assets/public"
assets.mkdir(parents=True, exist_ok=True)
for name in ("icon.png", "apple-touch-icon.png", "pwa-192x192.png"):
    (assets / name).write_bytes((ROOT / "public" / name).read_bytes())
(assets / "icon.svg").write_bytes(source)

# Android launcher icon densities.
for density, size in [("mdpi",48),("hdpi",72),("xhdpi",96),("xxhdpi",144),("xxxhdpi",192)]:
    folder = ROOT / f"android/app/src/main/res/mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    render(size).save(folder / "ic_launcher.png", format="PNG", optimize=True)
    # Foreground is inset into the adaptive-icon safe zone.
    fg = Image.new("RGBA", (108,108), (0,0,0,0))
    fg.alpha_composite(render(78).resize((78,78), Image.Resampling.LANCZOS), (15,15))
    fg.save(folder / "ic_launcher_foreground.png", format="PNG", optimize=True)
    render(size).save(folder / "ic_launcher_round.png", format="PNG", optimize=True)

# Android 12+ adaptive foreground uses the same safe-zone artwork.
fg = Image.new("RGBA", (108,108), (0,0,0,0))
fg.alpha_composite(render(78).resize((78,78), Image.Resampling.LANCZOS), (15,15))
for density, size in [("mdpi",108),("hdpi",162),("xhdpi",216),("xxhdpi",324),("xxxhdpi",432)]:
    folder = ROOT / f"android/app/src/main/res/mipmap-{density}"
    fg.resize((size,size), Image.Resampling.LANCZOS).save(folder / "ic_launcher_foreground.png", format="PNG", optimize=True)

# Splash art: a dark canvas with the complete new logo centered.
splash = Image.new("RGBA", (512,512), (7,21,34,255))
splash.alpha_composite(render(400).resize((400,400), Image.Resampling.LANCZOS), (56,56))
splash_paths = [
    "android/app/src/main/res/drawable/splash.png",
    "android/app/src/main/res/drawable-port-mdpi/splash.png",
    "android/app/src/main/res/drawable-port-hdpi/splash.png",
    "android/app/src/main/res/drawable-port-xhdpi/splash.png",
    "android/app/src/main/res/drawable-port-xxhdpi/splash.png",
    "android/app/src/main/res/drawable-port-xxxhdpi/splash.png",
    "android/app/src/main/res/drawable-land-mdpi/splash.png",
    "android/app/src/main/res/drawable-land-hdpi/splash.png",
    "android/app/src/main/res/drawable-land-xhdpi/splash.png",
    "android/app/src/main/res/drawable-land-xxhdpi/splash.png",
    "android/app/src/main/res/drawable-land-xxxhdpi/splash.png",
]
for path in splash_paths:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    splash.save(target, format="PNG", optimize=True)

print("Generated Al-Emara web icons, Android launcher icons, and splash images.")
