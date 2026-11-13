import functools
import io
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright, expect

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(
    Quiet, directory=sys.argv[1] if len(sys.argv) > 1 else '/tmp/elomara-membership-ui'))
threading.Thread(target=server.serve_forever, daemon=True).start()
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width, height, motion in [(390, 844, 'no-preference'), (1280, 900, 'no-preference'), (390, 640, 'reduce')]:
        page = browser.new_page(viewport={'width': width, 'height': height}, reduced_motion=motion)
        page.goto(f'http://127.0.0.1:{server.server_port}/?scenario=normal')
        city = page.locator('.intro-city')
        expect(city).to_be_visible()
        page.wait_for_function("Array.from(document.querySelectorAll('.intro-city img')).every(i=>i.complete&&i.naturalWidth>0)")
        assert city.locator('mask,clipPath').count() == 0
        assert city.locator('.intro-city-building').count() == 6
        page.evaluate("document.getAnimations().forEach(a=>{a.currentTime=5000;a.pause()})")
        actual = Image.open(io.BytesIO(city.screenshot())).convert('RGB')
        page.screenshot(path=f'/tmp/elomara-intro-{width}-{motion}.png')
        page.evaluate("""const city=document.querySelector('.intro-city');city.querySelectorAll('.intro-city-building').forEach(n=>n.style.visibility='hidden');const image=document.createElement('img');image.className='intro-city-art';image.src='/splash-hq/houses.png';image.alt='';city.append(image);""")
        page.wait_for_function("document.querySelector('.intro-city>img').complete")
        original = Image.open(io.BytesIO(city.screenshot())).convert('RGB')
        diff = ImageChops.difference(actual, original)
        changed = sum(1 for pixel in diff.getdata() if max(pixel) > 15)
        # Allow a pixel of antialiasing at slice boundaries, never missing foliage/buildings.
        assert changed < actual.width * 2, (width, motion, changed)
        if motion == 'reduce':
            assert page.locator('.intro-city-building').first.evaluate("n=>getComputedStyle(n).animationName") == 'none'
        print('PASS', width, motion, 'complete panorama matches original; trees leave no cutout holes; reduced-motion respected')
        page.close()
    browser.close()
server.shutdown()
