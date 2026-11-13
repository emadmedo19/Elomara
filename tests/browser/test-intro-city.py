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
        assert city.locator('mask,clipPath,image,img').count() == 0
        assert city.locator('[data-city-building]').count() == 6
        assert city.locator('.intro-city-tree').count() == 5
        assert city.locator('.intro-city-building').count() == 6
        if motion != 'reduce':
            page.evaluate("document.getAnimations().forEach(a=>{a.currentTime=3400;a.pause()})")
            trees = city.locator('.intro-city-tree')
            assert all(trees.nth(i).evaluate('n=>getComputedStyle(n).opacity') == '0' for i in range(5))
            transforms = city.locator('.intro-city-building').evaluate_all('nodes=>nodes.map(n=>new DOMMatrix(getComputedStyle(n).transform).m41)')
            assert transforms[0] < 0 and transforms[-1] > 0, transforms
            page.evaluate("document.getAnimations().forEach(a=>a.currentTime=4300)")
            first_y = trees.first.bounding_box()['y']
            page.evaluate("document.getAnimations().forEach(a=>a.currentTime=4650)")
            assert trees.first.bounding_box()['y'] < first_y
            assert all(abs(x) < 0.01 for x in city.locator('.intro-city-building').evaluate_all('nodes=>nodes.map(n=>new DOMMatrix(getComputedStyle(n).transform).m41)'))
            page.screenshot(path=f'/tmp/elomara-trees-rising-{width}.png')
            # The entire facade must stay identical while trees move, including
            # after settlement. The previous patch changed/hid backing at 5.15s.
            trees.evaluate_all("nodes=>nodes.forEach(n=>n.style.visibility='hidden')")
            during = Image.open(io.BytesIO(city.screenshot())).convert('RGB')
            trees.evaluate_all("nodes=>nodes.forEach(n=>n.style.visibility='')")
        page.evaluate("document.getAnimations().forEach(a=>{a.currentTime=5300;a.pause()})")
        page.screenshot(path=f'/tmp/elomara-intro-{width}-{motion}.png')
        city.locator('.intro-city-tree').evaluate_all("nodes=>nodes.forEach(n=>n.style.visibility='hidden')")
        settled = Image.open(io.BytesIO(city.screenshot())).convert('RGB')
        page.screenshot(path=f'/tmp/elomara-buildings-only-{width}-{motion}.png')
        if motion != 'reduce':
            assert ImageChops.difference(during, settled).getbbox() is None, 'Building facades changed when trees settled'
        if motion == 'reduce':
            assert page.locator('.intro-city-building').first.evaluate("n=>getComputedStyle(n).animationName") == 'none'
        print('PASS', width, motion, 'buildings slide from both sides; separate trees rise upward; complete facades stay identical throughout tree motion; reduced-motion respected')
        page.close()
    browser.close()
server.shutdown()
