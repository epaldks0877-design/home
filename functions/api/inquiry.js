// Cloudflare Pages Function. Secrets belong in Cloudflare, never in browser code.
export function configured(env) {
  return env.INQUIRY_ENABLED === 'true' &&
    ['RESEND_API_KEY', 'INQUIRY_FROM', 'SITE_ORIGIN', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'PRIVACY_NOTICE']
      .every(key => typeof env[key] === 'string' && env[key].trim());
}
function json(data, status = 200) {
  return Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}
const materials = ['프로파일', '플라스틱 (아크릴·수지류)', '아크릴', '기타 수지류', '상담 후 결정'];
const labels = {name: '회사명 / 성함', contact: '연락처', material: '문의 소재', quantity: '예상 수량', message: '문의 내용'};
export async function onRequest({request, env}, fetcher = fetch) {
  if (request.method !== 'POST') return json({error: '허용되지 않은 요청입니다.'}, 405);
  if (!configured(env)) return json({error: '온라인 접수 준비 중입니다. GTS@gtskorea.co.kr로 문의해 주세요.'}, 503);
  if (request.headers.get('Origin') !== env.SITE_ORIGIN || new URL(request.url).origin !== env.SITE_ORIGIN) {
    return json({error: '홈페이지에서 다시 접수해 주세요.'}, 403);
  }
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error: '잘못된 요청 형식입니다.'}, 415);
  let data;
  try {
    // Bound body size while reading, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return json({error: '문의 내용을 입력해 주세요.'}, 400);
    let size = 0;
    const chunks = [];
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 20000) { await reader.cancel(); return json({error: '문의 내용이 너무 깁니다.'}, 413); }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    data = JSON.parse(new TextDecoder().decode(body));
  } catch { return json({error: '문의 내용을 확인해 주세요.'}, 400); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return json({error: '잘못된 요청입니다.'}, 400);
  if (data.consent !== true) return json({error: '개인정보 수집·이용 동의가 필요합니다.'}, 400);
  for (const key of Object.keys(labels)) {
    if (typeof data[key] !== 'string' || data[key].length > (key === 'message' ? 3000 : 100) ||
        (key !== 'quantity' && !data[key].trim())) return json({error: '필수 항목과 입력 길이를 확인해 주세요.'}, 400);
    data[key] = data[key].trim();
  }
  if (!materials.includes(data.material) || /[\r\n]/.test(data.contact) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.requestId || '') ||
      typeof data.token !== 'string' || !data.token || data.token.length > 2048) {
    return json({error: '입력 내용과 보안 확인을 다시 확인해 주세요.'}, 400);
  }
  try {
    const verification = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({secret: env.TURNSTILE_SECRET_KEY, response: data.token}),
    });
    const checked = await verification.json();
    if (!verification.ok || !checked.success || checked.hostname !== new URL(env.SITE_ORIGIN).hostname || checked.action !== 'inquiry') {
      return json({error: '보안 확인이 만료되었거나 실패했습니다. 다시 확인해 주세요.'}, 400);
    }
    const text = Object.entries(labels).map(([key, label]) => `${label}: ${data[key] || '미정'}`).join('\n\n');
    const email = {
      from: env.INQUIRY_FROM, to: ['GTS@gtskorea.co.kr'], subject: `[홈페이지 견적 문의] ${data.material}`,
      text: `GTS KOREA 홈페이지 문의\n접수번호: ${data.requestId}\n\n${text}\n\n개인정보 수집·이용 동의: 동의함`,
    };
    if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(data.contact)) email.reply_to = data.contact;
    const sent = await fetcher('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: {Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `inquiry/${data.requestId}`},
      body: JSON.stringify(email),
    });
    const result = await sent.json();
    if (!sent.ok || !result.id) return json({error: '메일 접수 결과를 확인하지 못했습니다. 잠시 후 다시 시도하거나 이메일로 문의해 주세요.'}, 502);
    // Accepted by the mail provider; final inbox delivery is checked separately.
    return json({ok: true, reference: data.requestId});
  } catch {
    return json({error: '접수 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'}, 502);
  }
}
