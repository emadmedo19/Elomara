import functools
import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(
    Quiet, directory=sys.argv[1] if len(sys.argv) > 1 else '/tmp/elomara-membership-ui'))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'

def open_page(browser, width, height, scenario, guide=True):
    page = browser.new_page(viewport={'width': width, 'height': height})
    page.add_init_script("const timer=setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===5600?0:ms,...args)")
    page.goto(base + '/?scenario=' + scenario + ('&guide=1' if guide else ''))
    return page

def ready(page, width, height):
    layer = page.locator('[data-app-tour]')
    expect(layer).to_have_attribute('data-tour-state', 'ready', timeout=10000)
    dialog = layer.get_by_role('dialog')
    expect(dialog).to_be_visible()
    box = dialog.bounding_box()
    assert 0 <= box['x'] and box['x'] + box['width'] <= width + 1, box
    assert 0 <= box['y'] and box['y'] + box['height'] <= height + 1, box
    assert page.evaluate('document.body.style.overflow') == 'hidden'
    assert dialog.evaluate('(node)=>node.parentElement.parentElement===document.body')
    target = page.locator('[data-tour-active=true]')
    if target.count():
        rect = target.bounding_box()
        assert rect and rect['height'] > 0, rect
        # Field/button targets must be visible in their actual page or modal,
        # and the coachmark must not cover them.
        if rect['height'] < 170:
            assert rect['y'] >= -1 and rect['y']+rect['height'] <= height+1,rect
            assert rect['x'] >= -1 and rect['x']+rect['width'] <= width+1,rect
            overlap_x = max(0, min(rect['x']+rect['width'],box['x']+box['width'])-max(rect['x'],box['x']))
            overlap_y = max(0, min(rect['y']+rect['height'],box['y']+box['height'])-max(rect['y'],box['y']))
            assert overlap_x*overlap_y < 1, (page.locator('[data-app-tour]').get_attribute('data-tour-step'),rect,box)
    return dialog

def walk(page,width,height):
    dialog=ready(page,width,height)
    total=int(dialog.get_by_role('progressbar').get_attribute('aria-valuemax'))
    for i in range(total):
        dialog=ready(page,width,height)
        assert page.locator('[data-app-tour]').get_attribute('data-tour-step')==str(i)
        if i in [9,15,24]:
            page.screenshot(path=f'/tmp/elomara-detailed-tour-{width}-{i}.png')
        dialog.get_by_role('button',name='ابدأ الاستخدام' if i==total-1 else 'التالي',exact=True).click()
    expect(page.locator('[data-app-tour]')).to_have_count(0)
    assert page.evaluate('document.body.style.overflow')==''
    return total

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width,height in [(390,640),(1280,900)]:
        if os.environ.get('TOUR_WIDTH') and int(os.environ['TOUR_WIDTH']) != width: continue
        for journey in ['أنا مدير عمارة','أنا ساكن أو عضو']:
            page=open_page(browser,width,height,'pending')
            ready(page,width,height).get_by_role('button',name=journey,exact=True).click()
            for i in range(1,6):
                dialog=ready(page,width,height)
                if i==2:
                    dialog.get_by_role('button',name='السابق',exact=True).click()
                    ready(page,width,height).get_by_role('button',name='التالي',exact=True).click()
                    dialog=ready(page,width,height)
                dialog.get_by_role('button',name='التالي' if i<5 else 'ابدأ الاستخدام',exact=True).click()
            expect(page.locator('[data-app-tour]')).to_have_count(0)
            assert page.evaluate('window.mock.calls')==0
            assert not page.evaluate("window.mock.rpcCalls.some(c=>/create|join_request|set_|insert|delete|update/.test(c.name))")
            page.reload()
            expect(page.get_by_role('button',name='دليل التطبيق',exact=True)).to_be_visible()
            expect(page.locator('[data-app-tour]')).to_have_count(0)
            page.get_by_role('button',name='دليل التطبيق',exact=True).click()
            ready(page,width,height)
            page.go_back()
            expect(page.locator('[data-app-tour]')).to_have_count(0)
            page.close()
        print('PASS',width,'setup: actual fields, next/back, remembered completion, replay and browser Back; no writes')
        page=open_page(browser,width,height,'normal')
        assert walk(page,width,height)==5
        assert page.evaluate('window.mock.calls')==0
        page.get_by_role('button',name='+ إضافة أول عمارة',exact=True).click()
        page.get_by_placeholder('اكتب اسم العمارة').fill('عمارة الجولة')
        page.get_by_role('button',name='إضافة العمارة',exact=True).click()
        expect(page.locator('[data-app-tour]')).to_be_visible(timeout=12000)
        total=walk(page,width,height)
        assert total>=35,total
        assert page.evaluate('window.mock.calls')==1
        assert not page.evaluate("window.mock.rpcCalls.some(c=>/^(set_|delete_|update_|submit_|vote_)/.test(c.name))")
        # Every automatically opened real dialog must be closed without saving.
        expect(page.locator('[data-tour=apartment-form],[data-tour=payment-form],[data-tour=expense-form],[data-tour=building-form]')).to_have_count(0)
        page.get_by_role('button',name='المزيد',exact=True).click()
        page.get_by_role('button',name='دليل التطبيق',exact=True).click()
        dialog=ready(page,width,height)
        dialog.get_by_role('button',name='فهرس الجولة',exact=True).click()
        page.locator('.app-tour-index').get_by_role('button',name='السداد',exact=True).click()
        dialog=ready(page,width,height)
        expect(page.locator('[data-tour-active=true]')).to_have_attribute('data-tour','collections-pay')
        dialog.get_by_role('button',name='عرض الصفحة كاملة',exact=True).click()
        expect(page.locator('[data-app-tour]')).to_have_count(0)
        expect(page.locator('.fotouh-collections')).to_be_visible()
        page.get_by_role('button',name='متابعة الجولة',exact=True).click()
        ready(page,width,height)
        page.keyboard.press('Shift+Tab')
        assert page.locator('[data-app-tour] [role=dialog]').evaluate('(node)=>node.contains(document.activeElement)')
        page.keyboard.press('Escape')
        expect(page.locator('[data-app-tour]')).to_have_count(0)
        page.get_by_role('button',name='دليل التطبيق',exact=True).click()
        dialog=ready(page,width,height)
        dialog.get_by_role('button',name='فهرس الجولة',exact=True).click()
        page.locator('.app-tour-index').get_by_role('button',name='الشقق',exact=True).click()
        ready(page,width,height).get_by_role('button',name='التالي',exact=True).click()
        ready(page,width,height).get_by_role('button',name='عرض الصفحة كاملة',exact=True).click()
        page.locator('[data-tour=apartment-name]').fill('بيانات لم يتم حفظها')
        page.get_by_role('button',name='متابعة الجولة',exact=True).click()
        ready(page,width,height).get_by_role('button',name='إغلاق الجولة',exact=True).click()
        expect(page.locator('[data-tour=apartment-name]')).to_have_value('بيانات لم يتم حفظها')
        page.locator('[data-tour=apartment-close]').click()
        assert page.evaluate('document.body.style.overflow')==''
        page.close()
        print('PASS',width,'manager:',total,'detailed steps; actual forms open/close; fields unobscured; no writes; chapter jump; full-page view; focus trap')
        page=open_page(browser,width,height,'tour-resident')
        expect(page.locator('[data-app-tour]')).to_be_visible(timeout=12000)
        total=walk(page,width,height)
        assert total>=20
        assert page.evaluate('window.mock.calls')==0
        assert not page.evaluate("window.mock.rpcCalls.some(c=>/^(create_|set_|insert|delete|update|submit_|vote_)/.test(c.name))")
        page.close()
        print('PASS',width,'resident:',total,'steps across real pages and maintenance/booking fields, no writes or manager permissions')
    page=open_page(browser,390,844,'normal',guide=False)
    expect(page.get_by_role('button',name='+ إضافة أول عمارة',exact=True)).to_be_visible()
    expect(page.locator('[data-app-tour]')).to_have_count(0)
    page.close()
    print('PASS existing accounts do not get an automatic tour')
    browser.close()
server.shutdown()
