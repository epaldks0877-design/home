// File previews work offline. Online delivery appears only after server setup.
(async () => {
  if (!/^https?:$/.test(location.protocol)) return;
  let config;
  try {
    const response = await fetch('/api/inquiry-config', {signal: AbortSignal.timeout(5000)});
    if (!response.ok) return;
    config = await response.json();
  } catch { return; }
  if (!config.enabled || typeof config.siteKey !== 'string' || !config.privacyNotice) return;
  config.siteKey = config.siteKey.trim();
  const form = document.querySelector('#inquiry-form');
  const dialog = document.querySelector('#preview-dialog');
  const note = dialog.querySelector('.dialog-note');
  const consent = document.createElement('label');
  consent.className = 'inquiry-consent';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox'; checkbox.name = 'consent'; checkbox.required = true;
  consent.append(checkbox, document.createTextNode('개인정보 수집·이용에 동의합니다. (필수)'));
  const disclosure = document.createElement('details');
  disclosure.className = 'inquiry-privacy';
  const summary = document.createElement('summary');
  summary.textContent = '개인정보 수집·이용 안내';
  const privacy = document.createElement('p');
  privacy.textContent = config.privacyNotice;
  disclosure.append(summary, privacy);
  form.querySelector('.submit').before(disclosure, consent);
  form.querySelector('.form-hint').textContent = '* 필수 항목 · 문의 내용을 확인한 뒤 접수할 수 있습니다.';
  const panel = document.querySelector('#inquiry-security');
  panel.hidden = false;
  const challenge = document.createElement('div');
  const status = document.querySelector('#inquiry-status');
  const send = document.querySelector('#send-inquiry');
  panel.append(challenge);
  let token = '', widget, snapshot, fingerprint = '', requestId, busy = false, accepted = false;
  let widgetReady = false;
  const load = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.onload = resolve; script.onerror = reject;
    document.head.append(script);
  });
  load.then(() => { widgetReady = true; }).catch(() => {
    status.textContent = '보안 확인을 불러오지 못했습니다. 페이지를 새로고침하거나 이메일로 문의해 주세요.';
  });
  function mountChallenge() {
    if (!widgetReady || !dialog.open || widget !== undefined) return;
    status.textContent = '보안 확인을 진행 중입니다. 잠시 기다려 주세요.';
    try {
      widget = window.turnstile.render(challenge, {
        sitekey: config.siteKey, action: 'inquiry', theme: 'dark', size: 'flexible',
        callback: value => { token = value; send.disabled = busy || accepted; if (!busy && !accepted) status.textContent = '보안 확인이 완료되었습니다. 문의를 접수해 주세요.'; },
        'expired-callback': () => { token = ''; send.disabled = true; if (!busy && !accepted) status.textContent = '보안 확인이 만료되었습니다. 다시 확인해 주세요.'; },
        'error-callback': () => { token = ''; send.disabled = true; if (!busy && !accepted) status.textContent = '보안 확인을 완료하지 못했습니다. 새로고침 후 다시 시도하거나 GTS@gtskorea.co.kr로 문의해 주세요.'; },
      });
    } catch {
      token = ''; send.disabled = true;
      status.textContent = '보안 확인을 시작하지 못했습니다. 새로고침 후 다시 시도하거나 GTS@gtskorea.co.kr로 문의해 주세요.';
    }
  }
  load.then(mountChallenge).catch(() => {});
  form.addEventListener('inquiry-preview', event => {
    snapshot = {...event.detail, consent: checkbox.checked};
    const next = JSON.stringify(snapshot);
    if (fingerprint !== next || accepted) { requestId = crypto.randomUUID(); fingerprint = next; }
    accepted = false;
    note.textContent = '내용을 확인한 뒤 접수해 주세요. 견적 문의는 GTS@gtskorea.co.kr로 전달됩니다.';
    send.textContent = '견적 문의 접수'; send.disabled = !token;
    status.textContent = widgetReady ? '' : '보안 확인을 불러오는 중입니다. 잠시 후에도 표시되지 않으면 새로고침해 주세요.';
    mountChallenge();
  });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  send.addEventListener('click', async () => {
    if (busy || accepted || !token || !snapshot) return;
    busy = true; send.disabled = true; send.textContent = '접수 중…';
    dialog.dataset.sending = 'true';
    dialog.querySelectorAll('.dialog-close, #edit-inquiry').forEach(button => { button.disabled = true; });
    try {
      const response = await fetch('/api/inquiry', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({...snapshot, token, requestId}),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || '접수 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
      accepted = true;
      note.textContent = '메일 발송 서비스에 접수되었습니다.';
      status.textContent = `접수번호: ${result.reference}`;
      send.textContent = '접수 완료';
    } catch (error) {
      status.textContent = error.name === 'AbortError' || error instanceof TypeError || error instanceof SyntaxError
        ? '접수 결과를 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.' : error.message;
      send.textContent = '다시 접수하기';
    } finally {
      busy = false; token = ''; send.disabled = true;
      delete dialog.dataset.sending;
      dialog.querySelectorAll('.dialog-close, #edit-inquiry').forEach(button => { button.disabled = false; });
      if (widget !== undefined) window.turnstile.reset(widget);
    }
  });
})();
