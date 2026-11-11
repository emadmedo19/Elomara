import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':844})
 page.add_init_script("""(()=>{const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,x,y,...rest){(window.posterInk ||= []).push({t,x,y,font:this.font});return fill.call(this,t,x,y,...rest)}})()""")
 page.goto((sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:5188')+'/poster.html');page.wait_for_function('window.posterFixture===true')
 page.get_by_role('button',name='توليد لوحة الإعلان الآن',exact=True).click();page.get_by_text('حصة الصور غير متاحة',exact=True).wait_for()
 assert page.get_by_role('button',name='توليد لوحة الإعلان الآن',exact=True).is_enabled()
 page.evaluate('window.posterSuccess=true')
 for ratio,size in [('1:1',[1080,1080]),('16:9',[1280,720]),('3:4',[900,1200]),('9:16',[900,1600])]:
  page.get_by_role('button',name=ratio,exact=False).first.click();page.evaluate('window.posterInk=[]')
  page.get_by_role('button',name='توليد لوحة الإعلان الآن',exact=True).click()
  page.wait_for_function("document.querySelector('img[alt=\"Generated building poster\"]')?.naturalWidth==="+str(size[0]))
  img=page.locator('img[alt="Generated building poster"]');dims=img.evaluate('(i)=>[i.naturalWidth,i.naturalHeight]')
  assert dims[0]==size[0] and dims[1]>size[1],dims
  ink=page.evaluate('window.posterInk');assert ink and all(v['y']>=size[1] for v in ink)
  colors=img.evaluate("""(i,h)=>{const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return [[1,1],[1,h-1],[1,h+1]].map(([a,b])=>Array.from(x.getImageData(a,b,1,1).data).slice(0,3))}""",size[1])
  assert colors==[[51,102,85],[51,102,85],[251,249,243]],colors
  assert img.evaluate('i=>Math.abs(i.getBoundingClientRect().height-i.getBoundingClientRect().width*i.naturalHeight/i.naturalWidth)<2')
  print('PASS '+ratio+': whole uncropped image, large separate caption, full-width mobile preview and PNG export')
 for title in ['صيانة المصعد الدورية','انقطاع المياه','انقطاع الكهرباء','نظافة المداخل والممرات','تنظيم مواقف السيارات بالجراج','اجتماع السكان والملاك','تذكير بسداد الاشتراك','تعليمات الهدوء']:
  page.get_by_role('button',name=title,exact=False).click();page.evaluate('window.posterInk=[]')
  text=page.locator('textarea').input_value();assert '\n' in text
  page.get_by_role('button',name='توليد لوحة الإعلان الآن',exact=True).click();page.locator('img[alt="Generated building poster"]').wait_for()
  assert any(v['font'].startswith('45px') or v['font'].startswith('54px') or v['font'].startswith('64px') for v in page.evaluate('window.posterInk'))
  print('PASS ready template: '+title)
 with page.expect_download() as saved:
  page.get_by_role('button',name='حفظ الصورة بجهازك',exact=True).click()
 download=saved.value
 assert download.suggested_filename.startswith('elomara-announcement-')
 with open(download.path(),'rb') as image_file: assert image_file.read(8)==b'\x89PNG\r\n\x1a\n'
 page.get_by_role('status').filter(has_text='بدأ تنزيل صورة الإعلان').wait_for()
 print('PASS save button downloads the combined PNG and shows an honest browser status')
 page.get_by_role('button',name='نشر على لوحة إعلانات العمارة',exact=True).click()
 page.wait_for_function('window.pinnedAnnouncement?.imageUrl?.startsWith("data:image/png")')
 assert page.evaluate('window.pinnedAnnouncement.imageUrl')==page.locator('img[alt="Generated building poster"]').get_attribute('src')
 print('PASS publishing uses the single combined image and caption')
 page.screenshot(path='/tmp/elomara-poster-template.png',full_page=True);b.close()
