import sys, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright, expect
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=sys.argv[1] if len(sys.argv)>1 else '/tmp/elomara-dialog-fixture'))
threading.Thread(target=server.serve_forever,daemon=True).start()
url='http://127.0.0.1:'+str(server.server_port)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(1280,900)]:
  page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(url)
  for repeat in range(3):
   page.get_by_title('عرض كشف حساب وتفاصيل الشقة والإيصالات').last.click()
   expect(page.get_by_role('dialog',name='تفاصيل الشقة',exact=True)).to_be_visible()
   page.get_by_role('dialog').get_by_role('button',name='تسجيل سداد جديد',exact=True).click()
   expect(page.get_by_role('dialog')).to_have_count(1)
   expect(page.get_by_role('dialog')).to_have_attribute('aria-labelledby','payment-modal-title')
   assert page.evaluate('document.body.style.overflow')=='hidden'
   page.get_by_role('button',name='إلغاء',exact=True).click()
   expect(page.get_by_role('dialog')).to_have_count(0)
   assert page.evaluate('document.body.style.overflow')==''
   page.mouse.move(width//2,height//2);page.mouse.wheel(0,-600);page.wait_for_timeout(50)
  page.get_by_title('قيد دفعة سداد جديدة لهذه الشقة').last.click()
  page.get_by_role('button',name='تأكيد وقيد السداد',exact=True).click()
  expect(page.get_by_role('dialog')).to_have_count(0)
  assert page.evaluate('document.body.style.overflow')==''
  page.get_by_title('عرض كشف حساب وتفاصيل الشقة والإيصالات').last.click()
  expect(page.get_by_role('dialog').get_by_text('سجل المدفوعات والإيصالات',exact=False)).to_be_visible()
  page.get_by_role('button',name='إغلاق',exact=True).click()
  page.get_by_role('button',name='تبديل الشاشة',exact=True).click()
  assert page.evaluate('document.body.style.overflow')==''
  page.get_by_role('button',name='تبديل الشاشة',exact=True).click()
  page.get_by_title('عرض كشف حساب وتفاصيل الشقة والإيصالات').last.click()
  page.get_by_role('button',name='تبديل الشاشة',exact=True).evaluate('(button)=>button.click()')
  expect(page.get_by_role('dialog')).to_have_count(0)
  assert page.evaluate('document.body.style.overflow')==''
  # Out-of-order closing and pre-existing style are both preserved, including StrictMode.
  page.evaluate("document.body.style.overflow='auto'")
  page.get_by_role('button',name='فتح قفلين',exact=True).click()
  assert page.evaluate('document.body.style.overflow')=='hidden'
  page.get_by_role('button',name='إغلاق الأول',exact=True).click()
  assert page.evaluate('document.body.style.overflow')=='hidden'
  page.get_by_role('button',name='إغلاق الثاني',exact=True).click()
  assert page.evaluate('document.body.style.overflow')=='auto'
  assert not errors,errors
  print('PASS',width,'details → payment → cancel/save; repeat/reopen; navigation/unmount; overlapping lock cleanup')
  page.close()
 page=browser.new_page(viewport={'width':390,'height':844});page.goto(url+'/?role=owner')
 page.get_by_title('عرض كشف حساب وتفاصيل الشقة والإيصالات').last.click()
 expect(page.get_by_role('button',name='تسجيل سداد جديد',exact=True)).to_have_count(0)
 page.get_by_role('button',name='إغلاق',exact=True).click()
 assert page.evaluate('document.body.style.overflow')==''
 print('PASS owner role still cannot record payments; details close restores scrolling')
 browser.close()
server.shutdown()
