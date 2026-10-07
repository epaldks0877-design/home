// Access signs application tokens with RS256. Verify on the origin as well:
// https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
const certificates = new Map();
// Report only a fixed diagnostic code, never JWTs, claims, emails or key values.
const authFailures = {
  TOKEN: [401, '로그인 인증 정보를 읽을 수 없습니다. 다시 로그인해 주세요.'],
  ALGORITHM: [401, '로그인 인증 형식을 확인할 수 없습니다. 다시 로그인해 주세요.'],
  ISSUER: [401, '관리자 인증의 발급자 설정이 일치하지 않습니다. 관리자 연결 설정을 확인해야 합니다.'],
  AUDIENCE: [401, '관리자 인증의 앱 설정이 일치하지 않습니다. 관리자 연결 설정을 확인해야 합니다.'],
  EXPIRED: [401, '로그인 시간이 만료되었습니다. 다시 로그인해 주세요.'],
  TIME: [401, '로그인 인증의 유효 시간을 확인할 수 없습니다. 잠시 후 다시 로그인해 주세요.'],
  IDENTITY: [401, '관리자 이메일 인증 정보를 확인할 수 없습니다. 이메일로 다시 로그인해 주세요.'],
  CERTS: [503, '인증서 서버에 연결하지 못했습니다. 잠시 후 새로 고침해 주세요.'],
  KEY: [401, '로그인 서명에 맞는 인증서를 찾지 못했습니다. 잠시 후 다시 로그인해 주세요.'],
  CRYPTO: [503, '서버의 인증서 검증 처리를 완료하지 못했습니다. 관리자 연결 점검이 필요합니다.'],
  SIGNATURE: [401, '로그인 인증의 서명을 확인할 수 없습니다. 다시 로그인해 주세요.'],
};
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function json(value, status = 200) {
  return Response.json(value, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}
export function fail(error) {
  if (error instanceof HttpError) return json({error: error.message}, error.status);
  console.error('Catalog operation failed');
  return json({error: '처리하지 못했습니다. 연결 상태와 저장소 설정을 확인한 뒤 다시 시도해 주세요.'}, 503);
}
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}
async function getKeys(issuer, kid) {
  let entry = certificates.get(issuer);
  const now = Date.now();
  if (!entry || now - entry.at > 300000 || (!entry.keys.some(key => key.kid === kid) && now - entry.at > 30000)) {
    const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {signal: AbortSignal.timeout(8000), redirect: 'error'});
    if (!response.ok) throw new Error('Unavailable certificates');
    const jwks = await response.json();
    if (!Array.isArray(jwks.keys)) throw new Error('Invalid certificates');
    entry = {at: now, keys: jwks.keys};
    certificates.set(issuer, entry);
  }
  return entry.keys;
}
export async function authorize(request, env) {
  const domain = String(env.ADMIN_ACCESS_TEAM_DOMAIN || '').trim().replace(/^https:\/\//, '').replace(/\/$/, '');
  const audience = String(env.ADMIN_ACCESS_AUD || '').trim();
  const emails = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const origin = String(env.SITE_ORIGIN || '').trim();
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !audience || !emails.length || !/^https:\/\/[^/]+$/.test(origin)) {
    throw new HttpError(503, '관리자 연결이 필요합니다. Cloudflare Access와 관리자 환경 변수를 설정해 주세요.');
  }
  if (new URL(request.url).origin !== origin) throw new HttpError(403, '홈페이지의 관리자 주소로 접속해 주세요.');
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== origin) {
    throw new HttpError(403, '요청 출처를 확인할 수 없습니다. 관리자 화면을 다시 열어 주세요.');
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) throw new HttpError(401, '관리자 로그인이 필요합니다.');
  const issuer = `https://${domain}`;
  let claims;
  let stage = 'TOKEN';
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token');
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (!header || typeof header !== 'object' || !claims || typeof claims !== 'object') throw new Error();
    stage = 'ALGORITHM';
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.crit || header.b64 === false) throw new Error('Invalid algorithm');
    const now = Date.now() / 1000;
    stage = 'ISSUER';
    if (claims.iss !== issuer) throw new Error();
    stage = 'AUDIENCE';
    if (!Array.isArray(claims.aud) || !claims.aud.includes(audience)) throw new Error();
    stage = 'EXPIRED';
    if (!Number.isFinite(claims.exp) || claims.exp <= now) throw new Error();
    stage = 'TIME';
    if (!Number.isFinite(claims.iat) || claims.iat > now + 30 ||
        (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 30))) throw new Error();
    stage = 'IDENTITY';
    if (claims.type !== 'app' || typeof claims.email !== 'string') throw new Error();
    stage = 'CERTS';
    const keys = await getKeys(issuer, header.kid);
    stage = 'KEY';
    const key = keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig'));
    if (!key) throw new Error('Unknown key');
    stage = 'CRYPTO';
    const cryptoKey = await crypto.subtle.importKey('jwk', key, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
    stage = 'SIGNATURE';
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) {
      throw new Error('Invalid signature');
    }
  } catch {
    const [status, message] = authFailures[stage];
    throw new HttpError(status, `${message} [AUTH_${stage}]`);
  }
  const email = claims.email.trim().toLowerCase();
  if (!emails.includes(email)) throw new HttpError(403, '등록된 관리자만 이용할 수 있습니다.');
  return {email};
}
