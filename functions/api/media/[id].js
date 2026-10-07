import {fail, HttpError} from '../../../lib/admin-auth.js';
import {storage, imageResponse} from '../../../lib/catalog.js';
export async function onRequest({request, env, params}) {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, '지원하지 않는 요청입니다.');
    storage(env);
    return await imageResponse(request, env, params.id);
  } catch (error) { return fail(error); }
}
