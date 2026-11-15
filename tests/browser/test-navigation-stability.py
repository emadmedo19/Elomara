"""Page navigation must not animate the document from a previous scroll position."""
import functools,threading,sys,json
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory='/tmp/elomara-membership-ui'))
threading.Thread(target=server.serve_forever,daemon=True).start()
observe='--observe' in sys.argv
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(1280,900)]:
  page=b.new_page(viewport={'width':width,'height':height},has_touch=True)
  page.goto('http://127.0.0.1:'+str(server.server_port)+'/?scenario=review-manager')
  page.get_by_role('button',name='الشقق والتحصيل',exact=True).click()
  def capture(action,target,title=None):
   page.evaluate('''()=>{window.scrollFrames=[];window.captureUntil=performance.now()+850;const sample=()=>{window.scrollFrames.push({y:scrollY,page:document.querySelector('main')?.dataset.tourPage,title:document.querySelector('.settings-page h1')?.textContent});if(performance.now()<window.captureUntil)requestAnimationFrame(sample)};requestAnimationFrame(sample)}''')
   action();page.wait_for_timeout(950)
   frames=[f for f in page.evaluate('window.scrollFrames') if f.get('page')==target and (title is None or f.get('title')==title)]
   assert frames, (target,title)
   positions=[round(f['y'],1) for f in frames]
   print(width,target,title or '', 'scroll positions:',positions[:8], 'final:',positions[-1],flush=True)
   if not observe: assert all(abs(y)<1 for y in positions),positions
  page.evaluate("window.scrollTo({top:1500,behavior:'instant'})")
  capture(lambda:page.get_by_role('button',name='المزيد',exact=True).click(),'more')
  settings=page.get_by_role('button',name='إعدادات التطبيق والحساب',exact=True)
  settings.evaluate("node=>node.scrollIntoView({block:'center',behavior:'instant'})")
  capture(lambda:settings.click(),'app-settings','إعدادات التطبيق')
  page.evaluate("window.scrollTo({top:500,behavior:'instant'})")
  appearance=page.get_by_role('button',name='المظهر',exact=False)
  appearance.evaluate("node=>node.scrollIntoView({block:'center',behavior:'instant'})")
  capture(lambda:appearance.click(),'app-settings','المظهر')
  capture(lambda:page.get_by_role('button',name='رجوع',exact=True).click(),'app-settings','إعدادات التطبيق')
  page.evaluate("window.scrollTo({top:600,behavior:'instant'})")
  capture(lambda:page.get_by_role('button',name='الرئيسية',exact=True).click(),'dashboard')
  page.get_by_role('button',name='المزيد',exact=True).click()
  chat=page.get_by_role('button',name='المساعد الذكي',exact=True)
  chat.evaluate("node=>node.scrollIntoView({block:'center',behavior:'instant'})")
  capture(lambda:chat.click(),'chat')
  if not observe:
   page.mouse.wheel(0,250);page.wait_for_timeout(150)
   assert page.evaluate('scrollY')>0,'normal user scrolling stopped working'
  page.close()
 page=b.new_page(viewport={'width':390,'height':844});page.goto('http://127.0.0.1:'+str(server.server_port)+'/?scenario=tour-resident')
 page.get_by_role('button',name='المزيد',exact=True).click()
 page.evaluate("window.scrollTo({top:400,behavior:'instant'})")
 settings=page.get_by_role('button',name='إعدادات التطبيق والحساب',exact=True);settings.evaluate("node=>node.scrollIntoView({block:'center',behavior:'instant'})")
 settings.click();page.wait_for_timeout(100)
 if not observe:
  assert page.evaluate('scrollY')==0
  assert page.locator('main').evaluate("e=>getComputedStyle(e).animationName")=='none'
  page.get_by_role('button',name='المظهر',exact=False).click();page.get_by_role('button',name='رجوع',exact=True).click()
  assert page.evaluate('scrollY')==0
 print('PASS navigation stability checks' if not observe else 'Baseline observation complete')
 b.close()
server.shutdown()
