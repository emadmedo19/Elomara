import sys
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for scenario in ['normal','race','early-race','error','pending','hang','switch','switch-inflight','autounits']:
  page=b.new_page(viewport={'width':390,'height':844});navigations=[];page.on('framenavigated',lambda frame:navigations.append(frame.url) if frame==page.main_frame else None)
  page.add_init_script("""const timer=setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===5600?0:ms===7000?50:ms,...args);window.falseOnboarding=false;new MutationObserver(()=>{if(window.mock?.created&&document.body?.textContent.includes('اختار طريقة البدء'))window.falseOnboarding=true}).observe(document,{childList:true,subtree:true});""")
  page.goto((sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:5188')+'/?scenario='+scenario)
  page.wait_for_function("window.mock?.fixture==='elomara-membership-fixture-v1'")
  if scenario=='pending':
   page.get_by_placeholder('اسم العمارة',exact=True).fill('عمارة جديدة')
   page.get_by_role('button',name='إنشاء العمارة',exact=True).click()
  else:
   page.get_by_role('button',name='+ إضافة أول عمارة',exact=True).click()
   page.get_by_placeholder('اكتب اسم العمارة').fill('عمارة بعد الحذف')
   if scenario=='autounits':
    page.locator('form input').nth(2).fill('4');page.locator('form input').nth(3).fill('14')
   page.get_by_role('button',name='إضافة العمارة',exact=True).click()
  if scenario=='switch-inflight':
   page.wait_for_function('window.mock.created&&window.authState.loading')
   page.evaluate("window.mock.emit('SIGNED_IN',{id:'other',email:'other@example.invalid',user_metadata:{}})")
   page.wait_for_function("window.authState.id==='other'&&window.authState.profile?.uid==='other'&&!window.authState.admin&&!window.authState.error&&!window.authState.loading")
   page.wait_for_timeout(150)
   assert page.evaluate('window.authState.id')=='other'
   assert page.get_by_role('button',name='المزيد',exact=True).count()==0
   print('PASS identity switch during an unresponsive membership read cannot restore the previous account')
   page.close();continue
  if scenario in ['error','hang','switch']:
   page.get_by_role('heading',name='العمارة محفوظة',exact=True).wait_for(timeout=12000)
   assert not page.evaluate('window.falseOnboarding')
   assert page.evaluate('window.mock.calls')==1
   if scenario=='switch':
    page.evaluate("window.mock.emit('SIGNED_IN',{id:'other',email:'other@example.invalid',user_metadata:{}})")
    page.wait_for_function("window.authState.id==='other'&&window.authState.profile?.uid==='other'&&!window.authState.admin&&!window.authState.error")
    assert page.get_by_role('button',name='المزيد',exact=True).count()==0
    print('PASS identity switch cancels membership handoff and does not expose previous manager data')
    page.close();continue
   page.evaluate('window.mock.staleReads=0;window.mock.unhang=true')
   page.get_by_role('button',name='إعادة المحاولة',exact=True).click()
  page.get_by_role('button',name='المزيد',exact=True).wait_for(timeout=12000)
  expect(page.get_by_label('اختيار العقار',exact=True)).to_have_value('new-building')
  assert page.evaluate('window.authState.admin') and page.evaluate('window.authState.profile.buildingId')=='new-building'
  assert not page.evaluate('window.falseOnboarding')
  assert page.evaluate('window.mock.calls')==1
  assert len(navigations)==1,navigations
  print('PASS '+scenario+': actual AuthProvider and App verify membership, suppress stale onboarding, reach dashboard without reload or repeated creation')
  if scenario=='autounits':
   page.get_by_role('button',name='الشقق والتحصيل',exact=True).click()
   page.get_by_role('button',name='كشف الشقق وسداد الوحدات (14)',exact=False).wait_for()
   assert page.evaluate('window.mock.apartments.length')==14
   assert 'لا توجد شقق مطابقة' not in page.locator('body').inner_text()
   print('PASS generated apartment records appear immediately in Collections without reopening the app')
  if scenario=='normal':
   page.evaluate("window.mock.forcePending=true;window.mock.emit('TOKEN_REFRESHED')")
   page.wait_for_function("window.authState.admin===false&&window.authState.profile?.role==='pending'")
   print('PASS verified role revocation still applies after the handoff completes')
  page.close()
 b.close()
