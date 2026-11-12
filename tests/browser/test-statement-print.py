import sys,threading,functools,fitz
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=sys.argv[1] if len(sys.argv)>1 else '/tmp/elomara-statement-print'))
threading.Thread(target=server.serve_forever,daemon=True).start()
url='http://127.0.0.1:'+str(server.server_port)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for count in [14,80]:
  page=b.new_page(viewport={'width':390,'height':844});page.goto(url+'/?count='+str(count))
  page.get_by_role('button',name='طباعة / حفظ PDF',exact=True).click()
  page.wait_for_function('window.printedHTML')
  html=page.evaluate('window.printedHTML')
  assert 'APP-SCREEN-MUST-NOT-PRINT' not in html and 'data:image/png;base64,' in html
  assert 'bunyan-native-print-style' not in page.content()
  assert page.evaluate('window.printCalls')==1
  expect(page.get_by_role('button',name='جارٍ فتح الطباعة...',exact=True)).to_be_disabled()
  print_page=b.new_page();print_page.set_content(html,wait_until='load')
  print_page.emulate_media(media='print')
  assert print_page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth')
  pdf=fitz.open(stream=print_page.pdf(format='A4',prefer_css_page_size=True,print_background=True),filetype='pdf')
  text='\n'.join(sheet.get_text() for sheet in pdf)
  assert all(sheet.get_text().strip() for sheet in pdf),'blank printed page'
  assert 'RES001' in pdf[0].get_text(),'first page must contain statement rows'
  for i in range(count):assert text.count('RES'+str(i+1).zfill(3))==1,('missing or repeated apartment',i,text)
  for i in range(40 if count>14 else 0):assert text.count('EXP'+str(i+1).zfill(3))==1,('missing or repeated expense',i)
  if count==14:assert len(pdf)==1,len(pdf)
  else:assert len(pdf)>1
  print('PASS',count,'apartments:',len(pdf),'A4 pages, no blanks, every row exactly once, embedded logo, no background app')
  page.evaluate('window.finishPrint()');expect(page.get_by_role('button',name='طباعة / حفظ PDF',exact=True)).to_be_enabled()
  # A second print creates another isolated document and cancellation/error leaves preview usable.
  page.get_by_role('button',name='طباعة / حفظ PDF',exact=True).click();page.wait_for_function('window.printCalls===2');page.evaluate('window.failPrint()')
  expect(page.get_by_role('alert')).to_be_visible();expect(page.get_by_role('button',name='طباعة / حفظ PDF',exact=True)).to_be_enabled()
  print_page.close();page.close()
 b.close()
server.shutdown()
