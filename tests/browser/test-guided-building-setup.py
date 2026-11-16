"""Actual app wizard with synthetic transport; SQL arithmetic is tested on an isolated branch."""
import functools,threading,sys
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=sys.argv[1] if len(sys.argv)>1 else '/tmp/elomara-guided'))
threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port)
def fresh(browser,width=390,scenario='normal'):
 page=browser.new_page(viewport={'width':width,'height':844 if width<500 else 900})
 page.add_init_script("const timer=setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===5600?0:ms,...args)")
 page.goto(base+'/?scenario='+scenario);return page
def open_wizard(page,pending=False):
 page.get_by_role('button',name='أنا مدير — تسجيل عمارة جديدة أو نقل حسابات عمارتك' if pending else 'تسجيل عمارة جديدة أو نقل حسابات عمارتك',exact=True).click()
 return page.locator('[data-building-setup]')
def next(w):w.get_by_role('button',name='التالي',exact=True).click()
def confirm(w):w.get_by_role('checkbox',name='راجعت مدفوعات الشقق',exact=False).check()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [390,1280]:
  page=fresh(b,width);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  w=open_wizard(page);w.get_by_role('button',name='نقل حسابات عمارتك',exact=False).click()
  next(w);expect(w.get_by_role('alert')).to_contain_text('اكتب الاسم')
  w.get_by_label('اسم العمارة',exact=True).fill('عمارة الحسابات القديمة');w.get_by_label('عدد الشقق',exact=True).fill('14');w.get_by_label('الاشتراك الشهري لكل شقة (جنيه)',exact=True).fill('100')
  w.get_by_label('أول شهر في الحسابات القديمة',exact=True).fill('2025-01');w.get_by_label('آخر شهر في الحسابات القديمة',exact=True).fill('2025-12');next(w)
  expect(w.get_by_text('١٬٢٠٠ جنيه',exact=True)).to_be_visible()
  w.get_by_label('المدفوع الشهري السابق للشقة 1',exact=True).fill('1200');w.get_by_label('المدفوع الشهري السابق للشقة 2',exact=True).fill('1500');next(w)
  expect(w.get_by_role('alert')).to_contain_text('لا يتجاوز');w.get_by_label('المدفوع الشهري السابق للشقة 2',exact=True).fill('500');next(w)
  w.get_by_role('checkbox',name='عندي تحصيل استثنائي قديم').check();w.get_by_label('اسم التحصيل الاستثنائي',exact=True).fill('تركيب أسانسير')
  w.get_by_label('المطلوب من كل شقة (جنيه)',exact=True).fill('6000');expect(w.get_by_text('إجمالي المطلوب:',exact=False)).to_contain_text('٨٤٬٠٠٠')
  w.get_by_label('المدفوع الاستثنائي السابق للشقة 1',exact=True).fill('6000');w.get_by_label('المدفوع الاستثنائي السابق للشقة 2',exact=True).fill('2000');next(w)
  review=w.locator('[data-setup-review]');expect(review).to_contain_text('المحصّل الشهري: ١٬٧٠٠');expect(review).to_contain_text('المحصّل الاستثنائي: ٨٬٠٠٠')
  w.get_by_role('button',name='السابق',exact=True).click();expect(w.get_by_label('المدفوع الاستثنائي السابق للشقة 2',exact=True)).to_have_value('2000');next(w)
  w.get_by_label('الموجود حاليًا في خزينة العمارة (جنيه)',exact=True).fill('3000');w.get_by_label('المخصص للطوارئ من الخزينة (جنيه)',exact=True).fill('4000');confirm(w)
  save=w.get_by_role('button',name='حفظ وبدء الاستخدام',exact=True);save.click();expect(w.get_by_role('alert')).to_contain_text('لا يزيد')
  assert page.evaluate('(window.mock.guidedCalls||[]).length')==0
  w.get_by_label('المخصص للطوارئ من الخزينة (جنيه)',exact=True).fill('500');w.get_by_label('إجمالي المصروفات القديمة — اختياري (جنيه)',exact=True).fill('7000');confirm(w)
  page.evaluate('window.mock.guidedPending=true');save.click();page.wait_for_function('!!window.mock.finishGuided')
  expect(w.get_by_role('button',name='جارٍ الحفظ...',exact=True)).to_be_disabled();page.evaluate('window.mock.finishGuided()')
  expect(page.locator('[data-tour=dashboard-balance] strong')).to_contain_text('3,000',timeout=15000)
  assert page.evaluate('window.mock.calls')==1
  args=page.evaluate('window.mock.guidedCalls[0]');assert args['p_details']['monthlyTarget']==100;assert args['p_history']['exceptionalPerUnit']==6000;assert args['p_history']['units'][2]['monthlyPaid']==0
  assert page.evaluate('window.mock.entities.payments.filter(p=>!p.is_assessment&&!p.is_opening_entry).length')==0
  page.locator('[data-tour=manager-buildings]').click()
  expect(page.get_by_label('رصيد الخزينة عند بدء استخدام التطبيق (جنيه)',exact=True)).to_have_value('3000')
  expect(page.get_by_label('المحصل فعليًا من التحصيلات الاستثنائية السابقة',exact=True)).to_have_value('8000')
  expect(page.get_by_label('المحصل فعليًا من التحصيلات الاستثنائية السابقة',exact=True)).not_to_be_editable()
  page.locator('[data-tour=building-close]').click()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors
  page.close();print('PASS',width,'14 units × 6000 = 84000 due, partial payments, no implicit equal payments, net treasury 3000, reserve validation, previous-step draft, one atomic submit',flush=True)
 for scenario in ['normal','pending']:
  page=fresh(b,390,scenario);w=open_wizard(page,pending=scenario=='pending')
  w.get_by_role('button',name='تسجيل عمارة جديدة',exact=False).click();w.get_by_label('اسم العمارة',exact=True).fill('بداية جديدة');w.get_by_label('عدد الشقق',exact=True).fill('2');w.get_by_label('الاشتراك الشهري لكل شقة (جنيه)',exact=True).fill('250.75');next(w)
  expect(w.get_by_text('راجع قبل الحفظ',exact=True)).to_be_visible();expect(w.get_by_text('المطلوب الاستثنائي:',exact=False)).to_have_count(0)
  w.get_by_label('الموجود حاليًا في خزينة العمارة (جنيه)',exact=True).fill('1000');confirm(w)
  page.evaluate('window.mock.guidedFail=true');w.get_by_role('button',name='حفظ وبدء الاستخدام',exact=True).click();expect(w.get_by_role('alert')).to_contain_text('تعذر تأكيد')
  expect(w.get_by_label('الموجود حاليًا في خزينة العمارة (جنيه)',exact=True)).to_be_disabled()
  page.evaluate('window.mock.guidedFail=false');w.get_by_role('button',name='حفظ وبدء الاستخدام',exact=True).click()
  expect(page.locator('[data-tour=dashboard-balance] strong')).to_contain_text('1,000',timeout=15000)
  requests=page.evaluate('window.mock.guidedCalls');assert len(requests)==2 and requests[0]==requests[1]
  assert page.evaluate('window.mock.entities.payments.length')==0;assert page.evaluate('window.mock.entities.historical_monthly_allocations.length')==0
  page.close();print('PASS',scenario,'new-building skip old accounts; failed request preserved and same-key retry; no duplicate creation',flush=True)
 page=fresh(b);w=open_wizard(page);w.get_by_role('button',name='نقل حسابات عمارتك',exact=False).click()
 w.get_by_label('اسم العمارة',exact=True).fill('عمارة أكبر');w.get_by_label('عدد الشقق',exact=True).fill('21');w.get_by_label('الاشتراك الشهري لكل شقة (جنيه)',exact=True).fill('250.75');next(w)
 w.get_by_label('المدفوع الشهري السابق للشقة 1',exact=True).fill('250.75');w.get_by_role('button',name='الشقق التالية',exact=True).click()
 w.get_by_label('المدفوع الشهري السابق للشقة 21',exact=True).fill('50.25');next(w);next(w)
 expect(w.locator('[data-setup-review]')).to_contain_text('٣٠١');w.get_by_label('الموجود حاليًا في خزينة العمارة (جنيه)',exact=True).fill('80');confirm(w);w.get_by_role('button',name='حفظ وبدء الاستخدام',exact=True).click()
 expect(page.locator('[data-tour=dashboard-balance] strong')).to_contain_text('80',timeout=15000)
 assert page.evaluate('window.mock.guidedCalls[0].p_history.units[20].monthlyPaid')==50.25
 page.close();print('PASS different 21-unit building, decimal subscription, paginated apartment inputs preserve correct unit shares',flush=True)
 page=fresh(b,390,'historical-manager');page.locator('[data-tour=manager-buildings]').click();page.get_by_role('button',name='تسجيل الحسابات خطوة بخطوة',exact=True).click()
 expect(page.locator('[data-building-setup]').get_by_role('alert')).to_contain_text('فيها حسابات مسجلة')
 assert page.evaluate('(window.mock.guidedCalls||[]).length')==0
 page.close();print('PASS existing financial records protected before entering guided import',flush=True)
 b.close()
server.shutdown()
