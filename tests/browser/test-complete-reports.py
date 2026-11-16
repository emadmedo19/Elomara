"""Actual report/preview/print HTML path with a stub at the native printer bridge."""
import functools,threading,sys
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=sys.argv[1] if len(sys.argv)>1 else '/tmp/elomara-reports'))
threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port)
def card(page,label):return page.get_by_text(label,exact=True).locator('../..')
def preview(page):
 page.get_by_role('button',name='طباعة وتصدير كشف حساب PDF',exact=True).click();return page.locator('#printable-statement')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [390,1280]:
  for new in [False,True]:
   page=b.new_page(viewport={'width':width,'height':844 if width<500 else 900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.add_init_script("const timer=setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===5600?0:ms,...args)")
   page.goto(base+'/?scenario=historical-manager&report-import=1'+('&report-new=1' if new else ''))
   page.get_by_role('button',name='المزيد',exact=True).click();page.get_by_role('button',name='التقارير',exact=True).click()
   expect(page.get_by_role('button',name='الحسابات كاملة',exact=True)).to_have_attribute('aria-pressed','true')
   inflow='82,850.25' if new else '82,500';outflow='76,319.25' if new else '76,269';cash='10,786' if new else '10,486';paid='7,450.25' if new else '7,100'
   expect(card(page,'إجمالي الإيرادات المحصلة')).to_contain_text(inflow)
   expect(card(page,'إجمالي المصروفات المنفذة')).to_contain_text(outflow)
   expect(card(page,'رصيد الخزينة الحالي')).to_contain_text(cash)
   sheet=preview(page);kpis=sheet.locator('[data-statement-kpis]')
   expect(kpis).to_contain_text(inflow);expect(kpis).to_contain_text(outflow);expect(kpis).to_contain_text(cash)
   expect(sheet.locator('[data-statement-unit="1"] td').nth(3)).to_contain_text(paid)
   expect(sheet.locator('[data-print-historical-expenses]')).to_contain_text('76,269')
   page.get_by_role('button',name='طباعة / حفظ PDF',exact=True).click();page.wait_for_function('window.printJobs?.length===1')
   html=page.evaluate('window.printJobs[0].html');assert inflow in html and outflow in html and cash in html and paid in html
   assert 'data-print-historical-expenses' in html
   assert 'إغلاق معاينة كشف الحساب' not in html
   page.get_by_role('button',name='إغلاق معاينة كشف الحساب',exact=True).click()
   page.get_by_role('button',name='حركة فترة محددة',exact=True).click()
   expect(card(page,'إجمالي الإيرادات المحصلة')).to_contain_text('350.25' if new else '0')
   expect(card(page,'إجمالي المصروفات المنفذة')).to_contain_text('50.25' if new else '0')
   sheet=preview(page);kpis=sheet.locator('[data-statement-kpis]')
   expect(kpis).not_to_contain_text(inflow);expect(kpis).to_contain_text(cash)
   expect(sheet.locator('[data-print-historical-expenses]')).to_have_count(0)
   expect(sheet.locator('[data-statement-unit="1"] td').nth(3)).to_contain_text('350.25' if new else '0')
   assert not errors,errors
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.close();print('PASS',width,'new movements' if new else 'import-only','complete totals, actual cash, apartment old/new payments, period isolation, preview and generated native print HTML',flush=True)
 b.close()
server.shutdown()
