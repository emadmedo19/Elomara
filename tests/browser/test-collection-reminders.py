"""Exercise manager reminder settings and the resident monthly breakdown."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import sys

from playwright.sync_api import expect, sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


with ThreadingHTTPServer(
    ('127.0.0.1', 0), partial(QuietHandler, directory=sys.argv[1])
) as server, sync_playwright() as playwright:
    Thread(target=server.serve_forever, daemon=True).start()
    root = f'http://127.0.0.1:{server.server_port}/'
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)

    page.goto(root + '?scenario=review-manager')
    page.get_by_role('button', name='المزيد', exact=True).click()
    page.evaluate("window.mock.entities.app_settings = [{building_id:'other-building',setting_key:'collection_reminders',setting_value:{day:12,before:true,after:false}}]")
    page.get_by_role('button', name='إعدادات العمارة والتحصيل', exact=True).click()
    preferences = page.get_by_role('group', name='تذكيرات الاشتراك الشهرية')
    day = preferences.get_by_role('combobox')
    expect(day).to_have_value('5')
    day.select_option('10')
    for checkbox in preferences.get_by_role('checkbox').all():
        checkbox.check()
    preferences.get_by_role('button', name='حفظ إعدادات التذكير').click()
    expect(preferences.get_by_role('status')).to_have_text('تم حفظ تذكيرات الاشتراك لهذه العمارة.')
    saved = page.evaluate("window.mock.entities.app_settings")
    assert saved[0]['setting_value']['day'] == 12
    assert saved[1]['building_id'] == 'new-building'
    assert saved[1]['setting_value'] == {'day': 10, 'before': True, 'after': True}

    page.goto(root + '?scenario=historical-resident')
    page.get_by_role('button', name='حسابي المالي', exact=True).click()
    for label in ('المتبقي من اشتراك الشهر', 'متأخرات الاشتراكات السابقة', 'الرصيد المدفوع مقدمًا'):
        expect(page.get_by_text(label, exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='عرض إيصال السداد', exact=True)).to_have_count(1)
