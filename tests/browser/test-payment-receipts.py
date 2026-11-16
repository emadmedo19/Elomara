"""Actual save → receipt → print/image/share path with synthetic API and native printer bridge."""
import functools,threading,sys,re,os
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=sys.argv[1] if len(sys.argv)>1 else '/tmp/elomara-receipts'))
threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in ([] if os.environ.get('RECEIPT_RESIDENT_ONLY') else [390,1280]):
  page=b.new_page(viewport={'width':width,'height':844 if width<500 else 900},accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script("const timer=setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===5600?0:ms,...args);Object.defineProperty(navigator,'canShare',{value:()=>true});Object.defineProperty(navigator,'share',{value:async(data)=>{window.shares??=[];window.shares.push({name:data.files[0].name,type:data.files[0].type,size:data.files[0].size})}})")
  page.goto(base+'/?scenario=review-manager');page.get_by_role('button',name='الشقق والتحصيل',exact=True).click()
  page.get_by_role('button',name='تسجيل سداد جديد',exact=True).first.click();form=page.locator('[data-tour=payment-form]');form.locator('[data-tour=payment-apartment]').select_option('apt-1');form.locator('[data-tour=payment-amount]').fill('500.25')
  page.evaluate('window.mock.failFinancial=true');form.get_by_role('button',name='تأكيد وقيد السداد',exact=True).click();expect(page.locator('[data-payment-receipt]')).to_have_count(0)
  page.evaluate('window.mock.failFinancial=false');form.get_by_role('button',name='تأكيد وقيد السداد',exact=True).click();expect(form).to_have_count(0)
  modal=page.locator('[data-payment-receipt]');paper=modal.locator('[data-receipt-paper]');expect(paper).to_contain_text('٥٠٠٫٢٥',timeout=15000);expect(paper).to_contain_text('شقة 1')
  modal.get_by_role('button',name='طباعة / حفظ PDF',exact=True).click();page.wait_for_function('window.printJobs?.length===1');html=page.evaluate('window.printJobs[0].html');assert '٥٠٠٫٢٥' in html and 'شقة 1' in html and 'إغلاق الإيصال' not in html
  with page.expect_download() as download:modal.get_by_role('button',name='حفظ صورة الإيصال',exact=True).click()
  file=download.value;assert file.suggested_filename.startswith('elomara-receipt-');file.save_as('/tmp/receipt-'+str(width)+'.png')
  modal.get_by_role('button',name='مشاركة على واتساب',exact=True).click();page.wait_for_function('window.shares?.length===1');assert page.evaluate("window.shares[0].type==='image/png'&&window.shares[0].size>1000")
  assert page.evaluate('window.mock.entities.payments.length')==1
  # Every export refreshes from the server; deleted/denied receipts cannot be shared.
  page.evaluate('window.mock.receiptFail=true');modal.get_by_role('button',name='مشاركة على واتساب',exact=True).click();expect(modal.get_by_role('alert')).to_contain_text('غير متاح');assert page.evaluate('window.shares.length')==1
  assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.close();print('PASS',width,'successful save auto receipt; failed save creates none; real PDF HTML and PNG generation; file sharing; export permission recheck; no duplicated payment',flush=True)
 page=b.new_page(viewport={'width':390,'height':844});page.goto(base+'/?scenario=historical-resident')
 page.get_by_role('button',name='حسابي المالي',exact=True).click();expect(page.get_by_role('button',name='عرض إيصال السداد',exact=True)).to_have_count(1)
 page.get_by_role('button',name='عرض إيصال السداد',exact=True).click();expect(page.locator('[data-receipt-paper]')).to_contain_text('٣٠٠');page.get_by_role('button',name='إغلاق الإيصال',exact=True).click()
 # Receipt routing uses the same inbox item, rather than creating a second notice.
 page.evaluate("window.mock.entities.app_notifications=[{id:'notice',recipient_id:'manager',building_id:'resident-building',entity_id:'real',category:'payments',title:'إيصال سداد شقتك',body:'افتح الإيصال',created_at:new Date().toISOString(),read_at:null,member_target:'payments',manager_target:'collections'}]")
 page.get_by_role('button',name=re.compile('^الإشعارات')).click();page.get_by_text('إيصال سداد شقتك',exact=True).click();expect(page.locator('[data-receipt-paper]')).to_contain_text('٣٠٠');page.get_by_role('button',name='إغلاق الإيصال',exact=True).click()
 page.evaluate("window.mock.entities.payments.push({id:'other-receipt',apartment_id:'other-apartment',amount:777,payment_date:'2026-11-01'});window.dispatchEvent(new CustomEvent('elomara-open-receipt',{detail:{paymentId:'other-receipt'}}))")
 expect(page.locator('[data-payment-receipt]').get_by_role('alert')).to_contain_text('غير مصرح');expect(page.locator('[data-receipt-paper]')).to_have_count(0)
 page.close();print('PASS resident can reopen own receipt from payments and its notification, old opening balances have no ordinary receipts, another apartment denied',flush=True)
 b.close()
server.shutdown()
