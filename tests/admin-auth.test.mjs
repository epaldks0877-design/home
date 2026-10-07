import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

// Offline: generated keys and mocked certificate responses only.
const pair = await webcrypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
const jwk = {...await webcrypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig'};
const env = {ADMIN_ACCESS_TEAM_DOMAIN: 'auth-test.cloudflareaccess.com', ADMIN_ACCESS_AUD: 'test-audience',
  ADMIN_EMAILS: 'admin@example.test', SITE_ORIGIN: 'https://site.example.test'};
const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
async function token(changes = {}, header = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {iss: 'https://auth-test.cloudflareaccess.com', aud: ['test-audience'],
    email: 'admin@example.test', type: 'app', iat: now, nbf: now, exp: now + 3600, ...changes};
  const data = `${b64({alg: 'RS256', kid: 'test-key', ...header})}.${b64(claims)}`;
  return `${data}.${Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey,
    new TextEncoder().encode(data))).toString('base64url')}`;
}
let caseNumber = 0;
async function run(jwt, fetchKeys = async () => Response.json({keys: [jwk]})) {
  // Fresh certificate cache per case; no network request may leave this test.
  const {authorize} = await import(`../lib/admin-auth.js?test=${++caseNumber}`);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://auth-test.cloudflareaccess.com/cdn-cgi/access/certs');
    assert.equal(init.redirect, 'manual');
    return fetchKeys();
  };
  try {
    return await authorize(new Request('https://site.example.test/api/admin/session', {
      headers: {'Cf-Access-Jwt-Assertion': jwt},
    }), env);
  } finally { globalThis.fetch = originalFetch; }
}
async function rejected(jwt, code, status = 401, fetchKeys) {
  await assert.rejects(() => run(jwt, fetchKeys), error => {
    assert.equal(error.status, status);
    assert.ok(error.message.endsWith(`[AUTH_${code}]`));
    for (const sensitive of [jwt, 'admin@example.test', 'test-audience', env.ADMIN_ACCESS_TEAM_DOMAIN]) {
      assert.equal(error.message.includes(sensitive), false);
    }
    return true;
  });
}

test('accepts a valid identity without weakening signature checks', async () => {
  assert.deepEqual(await run(await token()), {email: 'admin@example.test'});
});
test('separates expiration, issuer, audience, time and identity failures', async () => {
  for (const [change, code] of [
    [{exp: 1}, 'EXPIRED'], [{iss: 'https://wrong.example.test'}, 'ISSUER'],
    [{aud: ['another-audience']}, 'AUDIENCE'], [{iat: 9999999999}, 'TIME'],
    [{nbf: 9999999999}, 'TIME'], [{type: 'org'}, 'IDENTITY'], [{email: null}, 'IDENTITY'],
  ]) await rejected(await token(change), code);
});
test('rejects malformed tokens and unsupported signing algorithms', async () => {
  await rejected('not.a.token', 'TOKEN');
  await rejected(await token({}, {alg: 'none'}), 'ALGORITHM');
});
test('reports certificate outages as unavailable, not expired sessions', async () => {
  const jwt = await token();
  await rejected(jwt, 'CERTS', 503, async () => { throw new Error('offline'); });
  await rejected(jwt, 'CERTS', 503, async () => new Response('', {status: 503}));
  await rejected(jwt, 'CERTS', 503, async () => Response.json({keys: null}));
});
test('rejects redirected certificate responses without following another issuer', async () => {
  const jwt = await token();
  for (const status of [301, 302, 303, 307, 308]) {
    await rejected(jwt, 'CERTS', 503, async () =>
      new Response('', {status, headers: {Location: 'https://untrusted.example.test/keys'}}));
  }
});
test('distinguishes unknown key and invalid signature', async () => {
  await rejected(await token({}, {kid: 'unknown'}), 'KEY');
  const jwt = await token();
  const parts = jwt.split('.');
  const signature = Buffer.from(parts[2], 'base64url'); signature[0] ^= 1;
  parts[2] = signature.toString('base64url');
  await rejected(parts.join('.'), 'SIGNATURE');
});
test('never authorizes an email outside the configured allowlist', async () => {
  const jwt = await token({email: 'other@example.test'});
  await assert.rejects(() => run(jwt), error => error.status === 403);
});
