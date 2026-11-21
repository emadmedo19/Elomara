"""Exercise record-backed assistant replies with synthetic building data."""
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
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
    page.goto(f'http://127.0.0.1:{server.server_port}/?scenario=payment-filter-manager')
    page.get_by_role('button', name='المزيد', exact=True).click()
    page.get_by_role('button', name='المساعد الذكي', exact=True).click()

    def ask(question):
        input_box = page.locator('[data-tour=chat-message]')
        input_box.fill(question)
        input_box.press('Enter')

    ask('كام شقة مسددتش ومين سدد؟')
    expect(page.get_by_text('عدد الشقق اللي لسه عليها مستحقات: 12.', exact=False)).to_be_visible()
    expect(page.get_by_text('شقة 1 (ساكن 1)', exact=False)).to_be_visible()
    ask('كام رصيد الخزينة؟')
    expect(page.get_by_text('رصيد خزينة العمارة الحالي ١٠٠ ج.م.', exact=True)).to_be_visible()

    assert page.evaluate('window.mock.chatRequest === undefined')
    ask('ما هي حالة طلبات الصيانة المسجلة؟')
    expect(page.get_by_text('إجابة تجريبية من بيانات العمارة', exact=True)).to_be_visible()
    request = page.evaluate('window.mock.chatRequest')
    assert 'recentTickets' in request['systemInstruction']
    assert 'ساكن 1' not in str(request)
