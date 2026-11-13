import functools
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(
    Quiet, directory=sys.argv[1] if len(sys.argv) > 1 else '/tmp/elomara-membership-ui'))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'

def open_page(browser, width, height, scenario, guide=True):
    page = browser.new_page(viewport={'width': width, 'height': height})
    page.add_init_script("const timer=setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===5600?0:ms,...args)")
    page.goto(base + '/?scenario=' + scenario + ('&guide=1' if guide else ''))
    return page

def check_panel(page, width, height):
    dialog = page.get_by_role('dialog')
    expect(dialog).to_be_visible()
    box = dialog.bounding_box()
    assert 0 <= box['x'] and box['x'] + box['width'] <= width + 1, box
    assert 0 <= box['y'] and box['y'] + box['height'] <= height + 1, box
    assert page.evaluate('document.body.style.overflow') == 'hidden'
    assert dialog.evaluate('(node)=>node.parentElement.parentElement===document.body')
    return dialog

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width, height in [(390, 640), (1280, 900)]:
        for journey in ['أنا مدير عمارة', 'أنا ساكن أو عضو']:
            page = open_page(browser, width, height, 'pending')
            dialog = check_panel(page, width, height)
            dialog.get_by_role('button', name=journey, exact=True).click()
            expected_target = 'setup-manager' if journey == 'أنا مدير عمارة' else 'setup-resident'
            for index in range(3):
                dialog = check_panel(page, width, height)
                if index == 1:
                    dialog.get_by_role('button', name='السابق', exact=True).click()
                    dialog.get_by_role('button', name='التالي', exact=True).click()
                dialog.get_by_role('button', name='التالي' if index < 2 else 'ابدأ الاستخدام', exact=True).click()
            expect(page.get_by_role('dialog')).to_have_count(0)
            assert page.evaluate('window.mock.calls') == 0
            assert not page.evaluate("window.mock.rpcCalls.some(c=>/create|join_request|set_|insert|delete|update/.test(c.name))")
            assert page.evaluate('document.body.style.overflow') == ''
            page.reload()
            expect(page.get_by_role('button', name='دليل التطبيق', exact=True)).to_be_visible()
            expect(page.get_by_role('dialog')).to_have_count(0)
            page.get_by_role('button', name='دليل التطبيق', exact=True).click()
            expect(page.get_by_role('dialog')).to_be_visible()
            page.go_back()
            expect(page.get_by_role('dialog')).to_have_count(0)
            page.close()
        print('PASS', width, 'setup guide for manager/member: next/back, no writes, completion remembered, replay and browser Back')
        page = open_page(browser, width, height, 'normal')
        check_panel(page, width, height).get_by_role('button', name='تخطي الجولة', exact=True).click()
        page.get_by_role('button', name='+ إضافة أول عمارة', exact=True).click()
        page.get_by_placeholder('اكتب اسم العمارة').fill('عمارة الجولة')
        page.get_by_role('button', name='إضافة العمارة', exact=True).click()
        expect(page.get_by_role('heading', name='لوحة إدارة عمارتك', exact=True)).to_be_visible(timeout=12000)
        pages = ['dashboard', None, 'collections', 'approvals', 'expenses', 'exceptional-collections', 'reports', 'resident', 'polls', 'services', 'chat', 'image-studio', 'more']
        for index, tab in enumerate(pages):
            dialog = check_panel(page, width, height)
            if tab:
                expect(page.locator('[data-tour=manager-page]')).to_have_attribute('data-tour-page', tab)
            if index == 2:
                page.wait_for_timeout(500)
                page.screenshot(path=f'/tmp/elomara-manager-tour-{width}.png')
            dialog.get_by_role('button', name='التالي' if index < len(pages)-1 else 'ابدأ الاستخدام', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        assert page.evaluate('window.mock.calls') == 1
        page.get_by_role('button', name='المزيد', exact=True).click()
        page.get_by_role('button', name='دليل التطبيق', exact=True).click()
        check_panel(page, width, height)
        page.keyboard.press('Shift+Tab')
        assert page.get_by_role('dialog').evaluate('(node)=>node.contains(document.activeElement)')
        page.keyboard.press('Escape')
        expect(page.get_by_role('dialog')).to_have_count(0)
        assert page.evaluate('document.body.style.overflow') == ''
        page.close()
        print('PASS', width, 'manager guide navigates all 13 steps, no extra building creation, replay, focus trap and Escape')
        page = open_page(browser, width, height, 'tour-resident')
        expect(page.get_by_role('heading', name='أهلاً بيك في عمارتك', exact=True)).to_be_visible(timeout=12000)
        resident_pages = ['home','payments','reports','announcements','maintenance','bookings','polls','services','building','more']
        for index, tab in enumerate(resident_pages):
            dialog = check_panel(page, width, height)
            expect(page.locator('[data-tour=resident-page]')).to_have_attribute('data-tour-page', tab)
            if index == 2:
                page.wait_for_timeout(500)
                page.screenshot(path=f'/tmp/elomara-resident-tour-{width}.png')
            dialog.get_by_role('button', name='التالي' if index < 9 else 'ابدأ الاستخدام', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        assert page.evaluate('window.mock.calls') == 0
        assert not page.evaluate("window.mock.rpcCalls.some(c=>/create|join_request|set_|insert|delete|update/.test(c.name))")
        page.close()
        print('PASS', width, 'resident guide covers 10 features without manager screens or writes')
    page = open_page(browser, 390, 844, 'normal', guide=False)
    expect(page.get_by_role('button', name='+ إضافة أول عمارة', exact=True)).to_be_visible()
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.close()
    print('PASS existing accounts do not get an automatic tour')
    browser.close()
server.shutdown()
