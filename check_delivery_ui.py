from pathlib import Path
exec(Path(__file__).with_name('check_browser.py').read_text(encoding='utf-8').split("call('Page.enable')")[0])
call('Page.enable')
call('Runtime.enable')
call('Page.navigate', {'url': (root / 'index.html').as_uri()})
time.sleep(.5)
evaluate("""(() => {
 window.__sent = []; window.__status = 502;
 window.fetch = async (url, options) => {
   if (url === '/api/inquiry-config') return Response.json({enabled:true,siteKey:'  mock  ' + String.fromCharCode(10),privacyNotice:'테스트 안내'});
   if (url === '/api/inquiry') {
     window.__sent.push(JSON.parse(options.body));
     return new Promise(resolve => { window.__finish = () => resolve(Response.json(window.__status === 200 ? {ok:true, reference:'test-reference'} : {error:'테스트 전송 실패'}, {status:window.__status})); });
   }
   throw new Error('Unexpected network');
 };
 window.turnstile = {render: (target, options) => { if (window.__throwRender) throw new Error('Invalid configuration'); window.__challenge = options; return 'mock-widget'; }, reset: () => {}};
 const append = document.head.append.bind(document.head);
 document.head.append = (...nodes) => {
   if (nodes[0]?.src?.includes('challenges.cloudflare.com')) { queueMicrotask(() => nodes[0].onload()); return; }
   append(...nodes);
 };
})()""")
source = (root / 'inquiry-delivery.js').read_text(encoding='utf-8')
source = source.replace("if (!/^https?:$/.test(location.protocol)) return;", '')
evaluate(source)
assert evaluate("document.querySelector('.inquiry-consent input').required")
evaluate("""(() => {
 const f = document.querySelector('form'); f.elements.name.value = 'UI 검증';
 f.elements.contact.value = 'mock@example.test'; f.elements.material.value = '프로파일';
 f.elements.message.value = '검증용';
})()""")
assert evaluate("!document.querySelector('form').checkValidity()")
evaluate("window.__throwRender = true; document.querySelector('.inquiry-consent input').checked = true; document.querySelector('form').requestSubmit()")
assert evaluate("document.querySelector('.inquiry-status').textContent.includes('보안 확인을 시작하지 못했습니다') && document.querySelector('#send-inquiry').disabled")
evaluate("window.__throwRender = false; document.querySelector('dialog').close(); document.querySelector('form').requestSubmit()")
assert evaluate("document.querySelector('dialog').open && document.querySelector('#send-inquiry').disabled")
assert evaluate("window.__challenge.sitekey === 'mock'")
evaluate("window.__challenge.callback('fake-token'); document.querySelector('#send-inquiry').click()")
assert evaluate("document.querySelector('#edit-inquiry').disabled && document.querySelector('#send-inquiry').disabled")
evaluate("window.__finish()")
time.sleep(.1)
assert evaluate("document.querySelector('.inquiry-status').textContent === '테스트 전송 실패' && document.querySelector('form').elements.message.value === '검증용'")
evaluate("window.__status=200; window.__challenge.callback('fresh-token'); document.querySelector('#send-inquiry').click(); window.__finish()")
time.sleep(.1)
assert evaluate("document.querySelector('#send-inquiry').textContent === '접수 완료'")
assert evaluate("window.__sent.length === 2 && window.__sent[0].requestId === window.__sent[1].requestId && window.__sent[1].consent === true")
evaluate("window.__challenge.callback('another-token')")
assert evaluate("document.querySelector('#send-inquiry').disabled")
assert evaluate("document.querySelectorAll('#send-inquiry').length === 1 && document.querySelector('.dialog-actions #send-inquiry') && !document.querySelector('#download-inquiry')")
assert evaluate("Boolean(document.querySelector('#inquiry-security').compareDocumentPosition(document.querySelector('.dialog-actions')) & Node.DOCUMENT_POSITION_FOLLOWING)")
for width, height, name in [(1440, 1000, 'dialog-desktop'), (390, 844, 'dialog-mobile')]:
    call('Emulation.setDeviceMetricsOverride', {'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': False})
    time.sleep(.1)
    assert evaluate("document.querySelector('dialog').scrollWidth <= document.querySelector('dialog').clientWidth")
    assert evaluate("Math.abs(document.querySelector('#send-inquiry').getBoundingClientRect().top - document.querySelector('#edit-inquiry').getBoundingClientRect().top) < 1")
    shot = call('Page.captureScreenshot', {'format': 'png'})
    (root / '.qa' / f'{name}.png').write_bytes(base64.b64decode(shot['data']))
print('PASS online UI: consent, security challenge, pending lock, failure preserves data, retry ID, accepted state; no actual mail sent')
sock.close()
