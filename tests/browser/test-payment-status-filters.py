"""Payment groups use real recorded balances, stay colored and refresh after saving."""
import functools,threading,sys
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=sys.argv[1] if len(sys.argv)>1 else '/tmp/elomara-membership-ui'))
threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(320,640),(390,844),(1280,900)]:
  page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base+'/?scenario=payment-filter-manager')
  page.get_by_role('button',name='عرض الشقق التي عليها مستحقات',exact=True).click()
  summary=page.locator('[data-payment-filter-summary]')
  expect(summary).to_contain_text('الشقق التي عليها متبقي');expect(page.locator('.apartment-compact-card')).to_have_count(12)
  filters=page.get_by_role('group',name='حالة السداد',exact=True)
  expect(filters.locator('[data-payment-status=all] strong')).to_have_text('١٤')
  expect(filters.locator('[data-payment-status=paid] strong')).to_have_text('١')
  expect(filters.locator('[data-payment-status=unpaid] strong')).to_have_text('٩')
  expect(filters.locator('[data-payment-status=partial] strong')).to_have_text('٣')
  # Every status has its own persistent color even while unselected.
  colors=filters.locator('button').evaluate_all('(buttons)=>buttons.slice(1).map(button=>getComputedStyle(button).color)')
  assert len(set(colors))==3,colors
  filters.locator('[data-payment-status=paid]').click()
  expect(page.locator('.apartment-compact-card')).to_have_count(1);expect(page.locator('.apartment-compact-card')).to_contain_text('شقة 1')
  filters.locator('[data-payment-status=unpaid]').click()
  expect(page.locator('.apartment-compact-card')).to_have_count(9)
  expect(page.locator('.apartment-compact-card').filter(has_text='شقة 6 ·')).to_have_count(0)
  filters.locator('[data-payment-status=partial]').click()
  expect(page.locator('.apartment-compact-card')).to_have_count(3)
  expect(page.locator('.apartment-compact-card').first).to_contain_text('شقة 2') # Monthly advance cannot hide an unpaid assessment.
  search=page.locator('[data-tour=collections-search]');search.fill('٤')
  expect(page.locator('.apartment-compact-card')).to_have_count(1);expect(page.locator('.apartment-compact-card')).to_contain_text('شقة 4')
  search.fill('');card=page.locator('.apartment-compact-card').filter(has_text='شقة 4 ·')
  card.get_by_role('button',name='سداد',exact=True).click()
  form=page.locator('[data-tour=payment-form]');form.locator('[data-tour=payment-amount]').fill('2000')
  form.get_by_role('button',name='تأكيد وقيد السداد',exact=True).click()
  if form.get_by_role('button',name='نعم، تسجيل الدفعة رغم التشابه',exact=True).count():
   form.get_by_role('button',name='نعم، تسجيل الدفعة رغم التشابه',exact=True).click()
  expect(form).to_have_count(0);page.locator('[data-payment-receipt]').get_by_role('button',name='إغلاق الإيصال',exact=True).click();page.get_by_role('button',name='تم',exact=True).click()
  expect(filters.locator('[data-payment-status=paid] strong')).to_have_text('٢')
  expect(filters.locator('[data-payment-status=partial] strong')).to_have_text('٢')
  expect(page.locator('.apartment-compact-card')).to_have_count(2)
  expect(card).to_have_count(0)
  filters.locator('[data-payment-status=all]').click()
  expect(page.locator('.apartment-compact-card')).to_have_count(14)
  expect(page.get_by_text('الشقق بدون مستحقات محددة تظهر في «الكل».',exact=True)).to_be_visible()
  assert filters.locator('button').evaluate_all('(buttons)=>buttons.slice(1).map(button=>getComputedStyle(button).color)')==colors
  assert page.evaluate('document.documentElement.scrollWidth')<=width
  page.evaluate("document.documentElement.dataset.appearance='dark'")
  dark_colors=filters.locator('button').evaluate_all('(buttons)=>buttons.slice(1).map(button=>getComputedStyle(button).color)')
  assert len(set(dark_colors))==3 and dark_colors!=colors,dark_colors
  if width==390: page.screenshot(path='/tmp/payment-status-filters-dark.png',full_page=True)
  page.evaluate("document.documentElement.dataset.appearance='light'")
  page.wait_for_timeout(300)
  if width==390: page.screenshot(path='/tmp/payment-status-filters-light.png',full_page=True)
  page.get_by_role('button',name='الرئيسية',exact=True).click()
  page.get_by_role('button',name='الشقق والتحصيل',exact=True).click()
  expect(filters.locator('[data-payment-status=all]')).to_have_attribute('aria-pressed','true')
  assert not errors,errors
  print('PASS',width,'colored paid/unpaid/partial groups; monthly arrears; exceptional dues; search; zero-fee units; live counts after save; dashboard shortcut; dark/light; no overflow/runtime errors',flush=True)
  page.close()
 browser.close()
server.shutdown()
