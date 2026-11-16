"""Unified building balances UI; synthetic responses, real arithmetic tested in Neon SQL."""
import functools,threading,sys
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=sys.argv[1] if len(sys.argv)>1 else '/tmp/elomara-unified-finance'))
threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)
def open_form(page):
 page.locator('[data-tour=manager-buildings]').click()
 form=page.locator('[data-tour=building-form]')
 expect(form.get_by_text('جارٍ تحميل الأرصدة...',exact=True)).to_have_count(0)
 expect(form.get_by_role('button',name='حفظ التعديلات',exact=True)).to_be_enabled()
 return form
def cash(page,value):expect(page.locator('[data-tour=dashboard-balance] strong')).to_contain_text(value,timeout=15000)
def fresh(browser,width=390,height=844,suffix=''):
 page=browser.new_page(viewport={'width':width,'height':height})
 page.add_init_script("const timer=setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===5600?0:ms,...args)")
 page.on('dialog',lambda dialog:dialog.accept())
 page.goto(base+'/?scenario=historical-manager&opening-deficit=1'+suffix)
 return page
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(1280,900)]:
  page=fresh(b,width,height);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  cash(page,'0')
  page.get_by_role('button',name='المزيد',exact=True).click()
  expect(page.get_by_role('button',name='الرصيد الافتتاحي ووديعة الصيانة',exact=True)).to_have_count(0)
  page.get_by_role('button',name='الرئيسية',exact=True).click()
  form=open_form(page)
  opening=form.get_by_label('الرصيد المبدئي (جنيه)',exact=True);reserve=form.get_by_label('رصيد صندوق الطوارئ (جنيه)',exact=True)
  opening.fill('5000');reserve.fill('1000')
  form.get_by_label('إجمالي المصروفات السابقة',exact=True).fill('10000')
  form.get_by_label('إجمالي التحصيلات الاستثنائية السابقة',exact=True).fill('8000')
  expect(form.locator('[data-building-finance-preview]')).to_contain_text('٣٬٠٠٠')
  page.evaluate('window.mock.financeSavePending=true')
  form.get_by_role('button',name='حفظ التعديلات',exact=True).click()
  page.wait_for_function('!!window.mock.finishFinanceSave')
  expect(form).to_be_visible();expect(form.get_by_role('button',name='جارٍ الحفظ...',exact=True)).to_be_disabled()
  assert page.evaluate('window.mock.building.balance')==0
  page.evaluate('window.mock.finishFinanceSave();window.mock.financeSavePending=false')
  expect(form).to_have_count(0);cash(page,'3,000')
  expect(page.locator('[data-tour=dashboard-collected] strong')).to_contain_text('8,000')
  assert page.evaluate('window.mock.entities.payments.length')==0
  form=open_form(page)
  expect(form.get_by_label('الرصيد المبدئي (جنيه)',exact=True)).to_have_value('5000')
  form.get_by_label('رصيد صندوق الطوارئ (جنيه)',exact=True).fill('1500')
  expect(form.locator('[data-building-finance-preview]')).to_contain_text('٣٬٠٠٠')
  form.get_by_role('button',name='حفظ التعديلات',exact=True).click()
  expect(form).to_have_count(0);cash(page,'3,000')
  form=open_form(page)
  form.get_by_label('الرصيد المبدئي (جنيه)',exact=True).fill('5500')
  form.locator('[data-tour=building-name]').fill('اسم محفوظ ذريًا')
  page.evaluate('window.mock.financeSaveFail=true')
  form.get_by_role('button',name='حفظ التعديلات',exact=True).click()
  expect(form.get_by_role('alert')).to_contain_text('تعذر حفظ أرصدة')
  expect(form.get_by_label('الرصيد المبدئي (جنيه)',exact=True)).to_have_value('5500')
  assert page.evaluate('window.mock.building.name')=='عمارة الاختبار'
  page.evaluate('window.mock.financeSaveFail=false;window.mock.building.balance+=100')
  form.get_by_role('button',name='حفظ التعديلات',exact=True).click()
  expect(form.get_by_role('alert')).to_contain_text('تغيرت أرصدة')
  assert page.evaluate('window.mock.building.balance')==3100
  form.get_by_role('button',name='إعادة تحميل أرصدة العمارة',exact=True).click()
  expect(form.get_by_label('الرصيد المبدئي (جنيه)',exact=True)).to_have_value('5000')
  expect(form.locator('[data-tour=building-name]')).to_have_value('اسم محفوظ ذريًا')
  form.get_by_label('الرصيد المبدئي (جنيه)',exact=True).fill('5500')
  expect(form.locator('[data-building-finance-preview]')).to_contain_text('٣٬٦٠٠')
  form.get_by_role('button',name='حفظ التعديلات',exact=True).click()
  expect(form).to_have_count(0);cash(page,'3,600')
  form=open_form(page);form.get_by_label('الرصيد المبدئي (جنيه)',exact=True).fill('9000')
  page.locator('[data-tour=building-close]').click();cash(page,'3,600')
  form=open_form(page);expect(form.get_by_label('الرصيد المبدئي (جنيه)',exact=True)).to_have_value('5500')
  if width==390:page.screenshot(path='/tmp/unified-building-balances-mobile.png')
  page.locator('[data-tour=building-close]').click()
  assert page.evaluate('document.documentElement.scrollWidth')<=width
  assert not errors,errors
  page.close();print('PASS',width,'one building page; no duplicate More item; combined save; independent reserve; pending/failure/stale handling; base preserved; cancel; no overflow',flush=True)
 page=fresh(b,suffix='&tab=treasury-settings')
 expect(page.locator('[data-tour=building-form]')).to_be_visible(timeout=15000)
 expect(page.get_by_role('heading',name='بيانات العمارة',exact=True)).to_be_visible()
 expect(page.locator('[data-tour=treasury-opening]')).to_have_count(1)
 assert 'tab=more' in page.url
 page.close();print('PASS old treasury links open the unified building form',flush=True)
 page=fresh(b);cash(page,'0')
 page.evaluate('window.mock.building.opening_balance=null;window.mock.building.balance=5000')
 form=open_form(page)
 form.get_by_label('الرصيد المبدئي (جنيه)',exact=True).fill('5000')
 expect(form.locator('[data-building-finance-preview]')).to_contain_text('حدد طريقة تسجيل الرصيد')
 form.get_by_text('نعم، تسجيله دون إضافته مرة ثانية',exact=True).click()
 expect(form.locator('[data-building-finance-preview]')).to_contain_text('٥٬٠٠٠')
 form.get_by_role('button',name='حفظ التعديلات',exact=True).click()
 expect(form).to_have_count(0);cash(page,'5,000')
 page.close();print('PASS legacy inclusion choice prevents counting opening cash twice',flush=True)
 b.close()
server.shutdown()
