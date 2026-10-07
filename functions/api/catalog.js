import {json, fail, HttpError} from '../../lib/admin-auth.js';
import {storage, listItems} from '../../lib/catalog.js';
export async function onRequest({request, env}) {
  try {
    if (request.method !== 'GET') throw new HttpError(405, '지원하지 않는 요청입니다.');
    storage(env);
    return json(await listItems(request, env));
  } catch (error) { return fail(error); }
}
