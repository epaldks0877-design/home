import {authorize, HttpError, json, fail} from '../../../lib/admin-auth.js';
import {ID, storage, listItems, itemView, imageResponse, readItem} from '../../../lib/catalog.js';

export async function onRequest(context) {
  const {request, env} = context;
  try {
    const user = await authorize(request, env);
    storage(env);
    const path = new URL(request.url).pathname.replace(/^\/api\/admin\/?/, '').replace(/\/$/, '').split('/');
    if (path[0] === 'session' && request.method === 'GET') {
      await env.CATALOG_DB.prepare('SELECT id FROM catalog_items LIMIT 1').first();
      return json({email: user.email});
    }
    if (path[0] === 'images' && path.length === 2 && ['GET', 'HEAD'].includes(request.method)) return await imageResponse(request, env, path[1], true);
    if (path[0] !== 'items' || path.length > 2) throw new HttpError(404, '요청을 찾을 수 없습니다.');
    const id = path[1];
    if (id && !ID.test(id)) throw new HttpError(404, '항목을 찾을 수 없습니다.');
    if (!id && request.method === 'GET') return json(await listItems(request, env, true));
    if ((!id && request.method !== 'POST') || (id && !['PUT', 'DELETE'].includes(request.method))) throw new HttpError(405, '지원하지 않는 요청입니다.');
    const previous = id ? await env.CATALOG_DB.prepare('SELECT * FROM catalog_items WHERE id = ?').bind(id).first() : null;
    if (id && !previous) throw new HttpError(404, '이미 삭제된 항목입니다. 목록을 새로 고쳐 주세요.');
    if (request.method === 'DELETE') {
      const version = Number(new URL(request.url).searchParams.get('version'));
      if (!Number.isSafeInteger(version) || version < 1) throw new HttpError(400, '수정 버전이 올바르지 않습니다.');
      const deleted = await env.CATALOG_DB.prepare('DELETE FROM catalog_items WHERE id = ? AND version = ? RETURNING image_key').bind(id, version).first();
      if (!deleted) throw new HttpError(409, '다른 창에서 수정된 항목입니다. 목록을 새로 고친 뒤 확인해 주세요.');
      if (deleted.image_key) context.waitUntil(env.CATALOG_IMAGES.delete(deleted.image_key).catch(() => console.error('Catalog image cleanup failed')));
      return json({ok: true});
    }
    const {item, photo} = await readItem(request);
    if (previous && item.version !== previous.version) throw new HttpError(409, '다른 창에서 수정된 항목입니다. 작성 내용을 복사한 뒤 목록을 새로 고쳐 주세요.');
    const itemId = id || item.id;
    if (id && item.id !== id) throw new HttpError(400, '항목 식별자가 일치하지 않습니다.');
    if (!id && await env.CATALOG_DB.prepare('SELECT id FROM catalog_items WHERE id = ?').bind(itemId).first()) throw new HttpError(409, '이미 저장된 항목입니다. 목록을 새로 고쳐 저장 내용을 확인해 주세요.');
    const imageKey = photo ? `catalog/${itemId}/${crypto.randomUUID()}` : previous?.image_key || null;
    if (item.status === 'published' && !imageKey) throw new HttpError(400, '공개하려면 대표 사진을 등록해 주세요.');
    const now = new Date().toISOString();
    let row;
    try {
      if (photo) await env.CATALOG_IMAGES.put(imageKey, photo.body, {httpMetadata: {contentType: photo.mime}});
      const values = [item.title, item.category, item.kind, item.summary, item.description, item.material,
        imageKey, item.image_alt || item.title, item.status, item.sort_order, now];
      if (previous) {
        row = await env.CATALOG_DB.prepare('UPDATE catalog_items SET title=?, category=?, kind=?, summary=?, description=?, material=?, image_key=?, image_alt=?, status=?, sort_order=?, updated_at=?, version=version+1 WHERE id=? AND version=? RETURNING *').bind(...values, itemId, item.version).first();
        if (!row) throw new HttpError(409, '다른 창에서 수정된 항목입니다. 작성 내용을 복사한 뒤 목록을 새로 고쳐 주세요.');
      } else {
        row = await env.CATALOG_DB.prepare('INSERT INTO catalog_items (title, category, kind, summary, description, material, image_key, image_alt, status, sort_order, updated_at, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *').bind(...values, itemId, now).first();
      }
    } catch (error) {
      if (photo) {
        // A database response may fail after a successful commit. Do not delete
        // an image still referenced by the row, or when the DB cannot confirm it.
        try {
          const saved = await env.CATALOG_DB.prepare('SELECT image_key FROM catalog_items WHERE id = ?').bind(itemId).first();
          if (saved?.image_key !== imageKey) context.waitUntil(env.CATALOG_IMAGES.delete(imageKey).catch(() => console.error('Catalog image cleanup failed')));
        } catch { console.error('Catalog image cleanup deferred'); }
      }
      throw error;
    }
    if (photo && previous?.image_key) context.waitUntil(env.CATALOG_IMAGES.delete(previous.image_key).catch(() => console.error('Catalog image cleanup failed')));
    return json({item: itemView(row, true)}, previous ? 200 : 201);
  } catch (error) { return fail(error); }
}
