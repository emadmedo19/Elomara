import functools
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=sys.argv[1] if len(sys.argv)>1 else '/tmp/elomara-membership-ui'))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width,height,blocked in [(390,844,False),(1280,900,False),(390,640,True)]:
        page=browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce' if blocked else 'no-preference')
        page.add_init_script("""const timer=setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===5600?0:ms,...args);
        window.confirmationTones=0;const Native=window.AudioContext;
        window.AudioContext=class extends Native{constructor(...args){if(BLOCKED)throw Error('Audio disabled');super(...args)}createOscillator(){const tone=super.createOscillator();const start=tone.start.bind(tone);tone.start=(...args)=>{window.confirmationTones++;return start(...args)};return tone}};""".replace('BLOCKED','true' if blocked else 'false'))
        page.goto(f'http://127.0.0.1:{server.server_port}/?scenario=feedback-resident')
        page.get_by_role('button',name='الصيانة والبلاغات',exact=True).click()
        page.locator('[data-tour=ticket-title]').fill('تسريب مياه')
        page.locator('[data-tour=ticket-description]').fill('تسريب في مدخل العمارة')
        page.evaluate('window.mock.ticketFail=true')
        page.locator('[data-tour=ticket-submit]').click()
        expect(page.get_by_text('لم نتمكن من إرسال البلاغ:',exact=False)).to_be_visible()
        expect(page.locator('[data-success-feedback]')).to_have_count(0)
        assert page.evaluate('window.confirmationTones')==0
        expect(page.locator('[data-tour=ticket-title]')).to_have_value('تسريب مياه')
        page.evaluate('window.mock.ticketFail=false')
        page.locator('[data-tour=ticket-submit]').click()
        feedback=page.locator('[data-success-feedback]')
        expect(feedback.get_by_role('heading',name='تم إرسال البلاغ بنجاح')).to_be_visible()
        assert feedback.evaluate('node=>node.parentElement===document.body')
        card=feedback.get_by_role('status').bounding_box()
        assert card['y']>=0 and card['y']+card['height']<=height,card
        if not blocked: page.wait_for_function('window.confirmationTones===2')
        page.wait_for_timeout(650)
        page.screenshot(path=f'/tmp/elomara-ticket-success-{width}-{blocked}.png')
        feedback.get_by_role('button',name='تمام',exact=True).click()
        expect(feedback).to_have_count(0)
        assert page.evaluate('document.body.style.overflow')==''
        assert page.evaluate('window.mock.ticketCount')==1
        assert page.evaluate('window.mock.ticketAttempts')==2
        page.get_by_role('button',name='المزيد',exact=True).click()
        page.get_by_role('button',name='تصويت الجمعية والقرارات',exact=True).click()
        page.evaluate('window.mock.voteFail=true')
        page.get_by_role('button',name='موافق تصويت سري',exact=True).click()
        expect(page.get_by_text('تعذر تسجيل التصويت:',exact=False)).to_be_visible()
        expect(feedback).to_have_count(0)
        assert page.evaluate('window.confirmationTones')==(0 if blocked else 2)
        page.evaluate('window.mock.voteFail=false')
        page.get_by_role('button',name='موافق تصويت سري',exact=True).click()
        expect(feedback.get_by_role('heading',name='تم تسجيل صوتك بنجاح')).to_be_visible()
        if not blocked: page.wait_for_function('window.confirmationTones===4')
        assert 'موافق' not in feedback.inner_text()
        expect(feedback).to_have_count(0,timeout=4500)
        assert page.evaluate('document.body.style.overflow')==''
        assert page.evaluate('window.mock.voteCount')==1
        assert page.evaluate('window.mock.voteAttempts')==2
        print('PASS',width,'audio blocked' if blocked else 'audio enabled','ticket/vote: failures show no success or tones; confirmed success shows checkmark; two tones per success; dismissal restores scroll; no duplicate writes; vote choice stays private')
        page.close()
    browser.close()
server.shutdown()
