#!/usr/bin/env python3
"""Generate in-app branding and the independently supplied Android launcher icon."""
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
    ("public/pwa-512x512.png", 512),
    ("public/pwa-maskable-512x512.png", 512),
]:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    icon = render(size)
    if "maskable" in path:
        # Keep the building inside the PWA maskable 80%-diameter safe circle.
        icon = Image.new("RGBA", (size, size), (241, 248, 255, 255))
        inset_size = round(size * .9)
        offset = (size - inset_size) // 2
        icon.alpha_composite(render(inset_size), (offset, offset))
    icon.save(target, format="PNG", optimize=True)

# Keep Capacitor's copied web assets in sync as well.
assets = ROOT / "android/app/src/main/assets/public"
assets.mkdir(parents=True, exist_ok=True)
for name in ("icon.png", "apple-touch-icon.png", "pwa-192x192.png", "pwa-512x512.png", "pwa-maskable-512x512.png"):
    (assets / name).write_bytes((ROOT / "public" / name).read_bytes())
(assets / "icon.svg").write_bytes(source)

# Launcher branding is intentionally separate from the in-app/web artwork.
# The owner supplied this exact square illustration for the phone home screen.
launcher = Image.open(ROOT / "android/branding/launcher-source.jpg").convert("RGBA")
if launcher.width != launcher.height:
    raise ValueError("Android launcher source must be square")
for density, size, adaptive_size in [("mdpi",48,108),("hdpi",72,162),("xhdpi",96,216),("xxhdpi",144,324),("xxxhdpi",192,432)]:
    folder = ROOT / f"android/app/src/main/res/mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    launcher.resize((size,size), Image.Resampling.LANCZOS).save(folder / "ic_launcher.png", optimize=True)
    launcher.resize((size,size), Image.Resampling.LANCZOS).save(folder / "ic_launcher_round.png", optimize=True)
    # Keep the full gold frame within the Android adaptive icon safe circle.
    # A solid navy surround blends with the supplied artwork under any mask.
    fg = Image.new("RGBA", (adaptive_size,adaptive_size), (3,23,53,255))
    art_size = round(adaptive_size * .62)
    offset = (adaptive_size-art_size)//2
    fg.alpha_composite(launcher.resize((art_size,art_size),Image.Resampling.LANCZOS),(offset,offset))
    fg.save(folder / "ic_launcher_foreground.png", optimize=True)

# Splash art: a dark canvas with the complete new logo centered.
splash = Image.new("RGBA", (512,512), (241,248,255,255))
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
