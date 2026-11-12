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
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width, height in [(390, 844), (1280, 900)]:
        page = browser.new_page(viewport={'width': width, 'height': height})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/?scenario=signup')
        page.get_by_role('button', name='إنشاء حساب جديد', exact=True).click()
        page.get_by_label('الاسم بالكامل', exact=True).fill('اختبار التسجيل')
        page.get_by_label('البريد الإلكتروني', exact=True).fill('fixture@example.invalid')
        page.get_by_label('كلمة المرور', exact=True).fill('Fixture-password-42')
        page.get_by_label('تأكيد كلمة المرور', exact=True).fill('Fixture-password-42')
        page.get_by_role('button', name='إنشاء حساب بالبريد الإلكتروني', exact=True).click()
        expect(page.get_by_role('heading', name='تأكيد البريد الإلكتروني')).to_be_visible()
        expect(page.get_by_text('اكتب الرمز المرسل إلى fixture@example.invalid لإكمال تسجيل حسابك.')).to_be_visible()
        page.get_by_role('button', name='إعادة إرسال الرمز', exact=True).click()
        page.wait_for_function("window.mock.resend?.email==='fixture@example.invalid'")
        page.get_by_label('رمز التأكيد', exact=True).fill('000000')
        page.get_by_role('button', name='تأكيد البريد', exact=True).click()
        expect(page.get_by_role('alert')).to_be_visible()
        expect(page.get_by_label('رمز التأكيد', exact=True)).to_have_value('000000')
        expect(page.get_by_text('اكتب الرمز المرسل إلى fixture@example.invalid لإكمال تسجيل حسابك.')).to_be_visible()
        assert page.evaluate('window.mock.verify.email') == 'fixture@example.invalid'
        assert page.evaluate('window.mock.signin') is None
        page.get_by_label('رمز التأكيد', exact=True).fill('123456')
        page.get_by_role('button', name='تأكيد البريد', exact=True).click()
        page.wait_for_function("window.mock.signin?.password==='Fixture-password-42'")
        assert page.evaluate('window.mock.verify') == {'email': 'fixture@example.invalid', 'token': '123456', 'type': 'signup'}
        assert page.evaluate('window.mock.signin.email') == 'fixture@example.invalid'
        expect(page.get_by_role('heading', name='تأكيد البريد الإلكتروني')).to_have_count(0)
        assert not errors, errors
        print('PASS', width, 'signup retains email; resend uses same email; invalid OTP retains fields; retry sends email/token and original password')
        page.close()
    browser.close()
server.shutdown()
