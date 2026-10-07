import {authorize} from '../lib/admin-auth.js';

// Run: workerd test tests/admin-auth.workerd.capnp
// Uses real Workers Request/Web Crypto APIs, ephemeral keys and no network.
const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const part = value => encode(new TextEncoder().encode(JSON.stringify(value)));

async function fixture(domain) {
  const pair = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  const key = {...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig'};
  const now = Math.floor(Date.now() / 1000);
  const data = `${part({alg: 'RS256', kid: key.kid})}.${part({iss: `https://${domain}`,
    aud: ['test-audience'], email: 'admin@example.test', type: 'app', iat: now, exp: now + 3600})}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(data));
  return {
    key,
    env: {ADMIN_ACCESS_TEAM_DOMAIN: domain, ADMIN_ACCESS_AUD: 'test-audience',
      ADMIN_EMAILS: 'admin@example.test', SITE_ORIGIN: 'https://site.example.test'},
    request: new Request('https://site.example.test/api/admin/session', {
      headers: {'Cf-Access-Jwt-Assertion': `${data}.${encode(new Uint8Array(signature))}`},
    }),
  };
}

async function withCertificates(response, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    // Preserve Workers' real validation of request options before mocking I/O.
    const request = new Request(url, init);
    if (!request.url.endsWith('/cdn-cgi/access/certs')) throw new Error('Unexpected request');
    if (request.redirect !== 'manual') throw new Error('Certificate redirects must not be followed');
    return response;
  };
  try { await run(); } finally { globalThis.fetch = original; }
}

export const validIdentity = {
  async test() {
    const {key, env, request} = await fixture('valid-test.cloudflareaccess.com');
    await withCertificates(Response.json({keys: [key]}), async () => {
      const user = await authorize(request, env);
      if (user.email !== 'admin@example.test') throw new Error('Valid administrator rejected');
    });
  },
};

export const certificateRedirectRejected = {
  async test() {
    const {env, request} = await fixture('redirect-test.cloudflareaccess.com');
    await withCertificates(Response.redirect('https://unexpected.example.test/keys', 302), async () => {
      let rejected = false;
      try { await authorize(request, env); }
      catch (error) { rejected = error.status === 503 && error.message.endsWith('[AUTH_CERTS]'); }
      if (!rejected) throw new Error('Certificate redirect was not rejected');
    });
  },
};
