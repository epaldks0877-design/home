"""Local design QA using Chrome DevTools and Python standard library only."""
import base64
import json
import os
from pathlib import Path
import socket
import struct
import time
import urllib.request
from urllib.parse import urlparse

root = Path(__file__).resolve().parents[1]
pages = json.load(urllib.request.urlopen('http://127.0.0.1:9335/json/list'))
url = urlparse(next(p['webSocketDebuggerUrl'] for p in pages if p['type'] == 'page'))
sock = socket.create_connection((url.hostname, url.port), timeout=15)
key = base64.b64encode(os.urandom(16)).decode()
sock.sendall((f'GET {url.path} HTTP/1.1\r\nHost: {url.netloc}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
header = b''
while not header.endswith(b'\r\n\r\n'):
    header += sock.recv(1)
assert header.startswith(b'HTTP/1.1 101 '), header
counter = 0

def readn(length):
    data = b''
    while len(data) < length:
        part = sock.recv(length - len(data))
        if not part:
            raise RuntimeError('WebSocket closed')
        data += part
    return data

def call(method, params=None):
    global counter
    counter += 1
    payload = json.dumps({'id': counter, 'method': method, 'params': params or {}}).encode()
    mask = os.urandom(4)
    size = len(payload)
    prefix = bytes([0x81, 0x80 | size]) if size < 126 else bytes([0x81, 0xfe]) + struct.pack('!H', size)
    sock.sendall(prefix + mask + bytes(v ^ mask[i % 4] for i, v in enumerate(payload)))
    fragments = b''
    while True:
        first, second = readn(2)
        length = second & 127
        if length == 126:
            length = struct.unpack('!H', readn(2))[0]
        elif length == 127:
            length = struct.unpack('!Q', readn(8))[0]
        data = readn(length)
        fragments += data
        if not first & 128:
            continue
        message = json.loads(fragments)
        fragments = b''
        if message.get('id') == counter:
            if 'error' in message:
                raise RuntimeError(message['error'])
            return message.get('result', {})

def evaluate(expression):
    result = call('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
    assert 'exceptionDetails' not in result, result
    return result.get('result', {}).get('value')

call('Page.enable')
call('Runtime.enable')
call('Page.navigate', {'url': (root / 'index.html').as_uri()})
time.sleep(1)
assert evaluate("document.title.startsWith('GTS KOREA')")
assert evaluate("Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)")
evaluate("Promise.all(Array.from(document.images, i => i.decode())).then(() => true)")
assert evaluate("Array.from(document.querySelectorAll('a[href^=\"#\"]')).every(a => document.querySelector(a.getAttribute('href')))")
for width, height, name in [(1440, 1000, 'desktop'), (768, 1024, 'tablet'), (390, 844, 'mobile'), (320, 740, 'small-mobile')]:
    call('Emulation.setDeviceMetricsOverride', {'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': False})
    time.sleep(.2)
    assert evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow at {width}'
    metrics = call('Page.getLayoutMetrics')
    screenshot = call('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': True, 'clip': {'x': 0, 'y': 0, 'width': width, 'height': metrics['cssContentSize']['height'], 'scale': 1}})
    (root / '.qa' / f'{name}.png').write_bytes(base64.b64decode(screenshot['data']))
    print(f'PASS layout {name} {width}px')
assert evaluate("document.querySelector('.menu-toggle').click(); document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'true'")
assert evaluate("document.querySelector('#navigation a').click(); document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false'")
assert evaluate("document.querySelector('[data-filter=\"아크릴\"]').click(); document.querySelectorAll('[data-category]:not([hidden])').length === 1")
assert evaluate("document.querySelector('[data-filter=\"all\"]').click(); document.querySelectorAll('[data-category]:not([hidden])').length === 3")
assert evaluate("document.querySelectorAll('[data-service]').length === 2")
assert evaluate("document.querySelector('[data-service=\"플라스틱 (아크릴·수지류)\"]').click(); document.querySelector('#material').value === '플라스틱 (아크릴·수지류)'")
assert evaluate("document.querySelector('[data-service=\"프로파일\"]').click(); document.querySelector('#material').value === '프로파일'")
assert evaluate("!document.querySelector('form').checkValidity()")
assert evaluate("""(() => {
 const f = document.querySelector('form');
 f.elements.name.value = '화면 검토';
 f.elements.contact.value = 'design@example.test';
 f.elements.message.value = '<script>test</script> 아크릴 문의';
 f.requestSubmit();
 return document.querySelector('dialog').open && document.querySelector('#preview-fields').textContent.includes('<script>test</script>') && !document.querySelector('#preview-fields script');
})()""")
assert evaluate("document.querySelector('#edit-inquiry').click(); !document.querySelector('dialog').open && document.querySelector('form').elements.name.value === '화면 검토'")
evaluate("document.querySelector('form').requestSubmit()")
assert evaluate("document.querySelector('.dialog-actions #send-inquiry').disabled && !document.querySelector('#download-inquiry')")
evaluate("document.querySelector('dialog').close(); document.querySelector('form').reset(); window.scrollTo(0,0)")
print('PASS navigation, filters, material selection, validation, safe preview, edit, disabled offline send')
sock.close()
