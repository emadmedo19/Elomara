from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':844});page.goto('http://127.0.0.1:5188/poster.html');page.wait_for_function('window.posterFixture===true')
 page.get_by_role('button',name='توليد لوحة الإعلان الآن',exact=True).click();page.get_by_text('حصة الصور غير متاحة',exact=True).wait_for()
 assert page.get_by_role('button',name='توليد لوحة الإعلان الآن',exact=True).is_enabled()
 page.evaluate('window.posterSuccess=true')
 for ratio,size in [('1:1',[1080,1080]),('16:9',[1280,720]),('3:4',[900,1200]),('9:16',[900,1600])]:
  page.get_by_role('button',name=ratio,exact=False).first.click()
  page.get_by_role('button',name='توليد لوحة الإعلان الآن',exact=True).click()
  page.wait_for_function("document.querySelector('img[alt=\"Generated building poster\"]')?.naturalWidth==="+str(size[0]))
  dims=page.locator('img[alt="Generated building poster"]').evaluate('(i)=>[i.naturalWidth,i.naturalHeight]')
  assert dims==size,dims
  colors=page.locator('img[alt="Generated building poster"]').evaluate("""i=>{const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return [[.95,.2],[.05,.9]].map(([a,b])=>Array.from(x.getImageData(Math.floor(c.width*a),Math.floor(c.height*b),1,1).data).slice(0,3))}""")
  assert sum(colors[0])>sum(colors[1]) and colors[1][1]>colors[1][0],colors
  print('PASS mobile poster '+ratio+': PNG export, Arabic text and retry after provider quota error')
 for title in ['صيانة المصعد الدورية','انقطاع المياه','انقطاع الكهرباء','نظافة المداخل والممرات','تنظيم مواقف السيارات بالجراج','اجتماع السكان والملاك','تذكير بسداد الاشتراك','تعليمات الهدوء']:
  page.get_by_role('button',name=title,exact=False).click()
  text=page.locator('textarea').input_value()
  assert '\n' in text and len(text)<260
  page.get_by_role('button',name='توليد لوحة الإعلان الآن',exact=True).click()
  page.locator('img[alt="Generated building poster"]').wait_for()
  print('PASS ready template: '+title)
 page.screenshot(path='/tmp/elomara-poster-template.png',full_page=True)
 b.close()
