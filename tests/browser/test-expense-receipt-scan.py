"""Verify that receipt scans only save extracted expense fields. Synthetic API only; no production writes."""
import functools, threading, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright, expect
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=sys.argv[1] if len(sys.argv)>1 else '/tmp/elomara-membership-ui'))
threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(360,640),(390,844),(1280,900)]:
  page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/api/gemini/**',lambda r:r.fulfill(status=503,content_type='application/json',body='{"error":"test unavailable"}'))
  page.goto(base+'/?scenario=review-manager')
  page.evaluate('window.mock.building.balance=3100')
  page.get_by_role('button',name='المصروفات',exact=True).click()
  page.get_by_role('button',name='تسجيل مصروف جديد',exact=True).click()
  form=page.locator('[data-tour=expense-form]')
  form.locator('[data-tour=expense-title]').fill('عنوان يدوي')
  form.locator('[data-tour=expense-amount]').fill('150.50')
  receipt = {'name':'test.png','mimeType':'image/png','buffer':bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082')}
  form.locator('input[type=file]').set_input_files(receipt)
  expect(form.get_by_text('تعذر قراءة الصورة.',exact=False)).to_be_visible()
  expect(form.locator('[data-tour=expense-title]')).to_have_value('عنوان يدوي')
  expect(form.locator('[data-tour=expense-amount]')).to_have_value('150.50')
  expect(form.get_by_role('button',name='نموذج تجريبي',exact=True)).to_have_count(0)
  form.locator('select').select_option('أخرى')
  page.evaluate('window.mock.delayFinancial=false;window.mock.failFinancial=true')
  form.locator('button[type=submit]').click()
  expect(form.get_by_role('alert')).to_be_visible();expect(form).to_be_visible()
  first_id=page.evaluate("window.mock.rpcCalls.filter(x=>x.name==='mutate_financial_entry').at(-1).args.p_request_id")
  page.evaluate('window.mock.failFinancial=false;window.mock.delayFinancial=true;window.mock.finishFinancial=null')
  form.locator('button[type=submit]').click();page.wait_for_function('!!window.mock.finishFinancial')
  expect(form).to_be_visible();expect(form.locator('button[type=submit]')).to_be_disabled()
  second_id=page.evaluate("window.mock.rpcCalls.filter(x=>x.name==='mutate_financial_entry').at(-1).args.p_request_id")
  assert first_id==second_id
  page.evaluate('window.mock.finishFinancial()');expect(form).to_have_count(0)
  assert page.evaluate('window.mock.building.balance')==2949.5
  assert not page.evaluate("window.mock.rpcCalls.filter(x=>x.name==='mutate_financial_entry').at(-1).args.p_values.receiptUrl")
  page.route('**/api/gemini/analyze-receipt',lambda r:r.fulfill(json={
   'vendor':'مورد الاختبار','amount':42.75,'category':'كهرباء','date':'2026-11-21','notes':'فاتورة اختبار'
  }))
  page.get_by_role('button',name='تسجيل مصروف جديد',exact=True).click()
  form=page.locator('[data-tour=expense-form]')
  form.locator('input[type=file]').set_input_files(receipt)
  expect(form.locator('[data-tour=expense-amount]')).to_have_value('42.75')
  page.evaluate('window.mock.delayFinancial=false')
  form.locator('button[type=submit]').click()
  expect(form).to_have_count(0)
  values=page.evaluate("window.mock.rpcCalls.filter(x=>x.name==='mutate_financial_entry').at(-1).args.p_values")
  assert values['amount']==42.75 and values['vendor']=='مورد الاختبار'
  assert not values.get('receiptUrl')
  assert not errors, errors
  page.close()
 print('Receipt scans passed at mobile and desktop widths')
