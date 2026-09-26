import {configured} from './inquiry.js';
export function onRequestGet({request, env}) {
  const enabled = Boolean(configured(env) && new URL(request.url).origin === env.SITE_ORIGIN);
  return Response.json(enabled ? {enabled, siteKey: env.TURNSTILE_SITE_KEY, privacyNotice: env.PRIVACY_NOTICE} : {enabled: false},
    {headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}
