import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for scenario in ['success','missing','offline','session','switch','revoked']:
  page=b.new_page(viewport={'width':390,'height':844})
  page.add_init_script("""const timer=setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===5600?0:ms===7000?250:ms,...args);window.falseOnboarding=false;new MutationObserver(()=>{if(window.mock?.created&&document.body?.textContent.includes('اختار طريقة البدء'))window.falseOnboarding=true}).observe(document,{childList:true,subtree:true});""")
  page.goto((sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:5188')+'/?scenario=normal')
  page.wait_for_function("window.mock?.fixture==='elomara-membership-fixture-v1'")
  page.get_by_role('button',name='+ إضافة أول عمارة',exact=True).click()
  page.get_by_placeholder('اكتب اسم العمارة').fill('عمارة بعد الحذف')
  page.get_by_role('button',name='إضافة العمارة',exact=True).click()
  page.get_by_role('button',name='المزيد',exact=True).wait_for(timeout=12000)
  page.evaluate("window.mock.badProfileGet=true;window.mock.startReads=window.mock.membershipRpcs;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});")
  if scenario=='missing': page.evaluate('window.mock.membershipMissing=true')
  if scenario=='offline': page.evaluate('window.mock.membershipFault=true')
  if scenario=='session': page.evaluate('window.mock.sessionRefreshFail=true')
  if scenario=='revoked': page.evaluate('window.mock.forcePending=true')
  page.evaluate("window.nativeResume();window.nativeResume();window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))")
  if scenario=='switch':
   page.evaluate("window.mock.emit('SIGNED_IN',{id:'other',email:'other@example.invalid',user_metadata:{}})")
   page.wait_for_function("window.authState.id==='other'&&window.authState.profile?.uid==='other'&&!window.authState.admin")
   page.wait_for_timeout(200)
   assert page.evaluate('window.authState.id')=='other'
  elif scenario=='revoked':
   page.wait_for_function("window.authState.profile?.role==='pending'&&!window.authState.admin")
  elif scenario in ['missing','offline','session']:
   page.get_by_role('heading',name='تعذر تحديث بيانات الحساب',exact=True).wait_for(timeout=12000)
   assert not page.evaluate('window.falseOnboarding')
   page.evaluate('window.mock.membershipMissing=false;window.mock.membershipFault=false;window.mock.sessionRefreshFail=false')
   page.get_by_role('button',name='إعادة المحاولة',exact=True).click()
   page.get_by_role('button',name='المزيد',exact=True).wait_for(timeout=12000)
   assert page.evaluate('window.authState.admin')
  else:
   page.wait_for_function('window.mock.refreshes===1&&window.mock.membershipRpcs>window.mock.startReads')
   page.wait_for_timeout(200)
   assert page.evaluate('window.authState.admin')
   assert page.evaluate('window.mock.refreshes')==1
   assert not page.evaluate('window.falseOnboarding')
  assert page.evaluate('window.mock.calls')==1
  print('PASS native background resume '+scenario+': authoritative membership, actual identity and no duplicate creation')
  page.close()
 b.close()
