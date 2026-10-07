import {HttpError} from './admin-auth.js';
export const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function storage(env) {
  if (!env.CATALOG_DB || !env.CATALOG_IMAGES) throw new HttpError(503, '제품 저장소 연결이 필요합니다. D1과 R2 바인딩을 확인해 주세요.');
}
export function itemView(row, admin = false) {
  const result = {id: row.id, title: row.title, category: row.category, kind: row.kind,
    summary: row.summary, description: row.description, material: row.material, image_alt: row.image_alt,
    image_url: row.image_key ? `${admin ? '/api/admin/images/' : '/api/media/'}${row.id}?v=${row.version}` : null};
  if (admin) Object.assign(result, {status: row.status, sort_order: row.sort_order, version: row.version, created_at: row.created_at, updated_at: row.updated_at});
  return result;
}
export async function listItems(request, env, admin = false) {
  const url = new URL(request.url);
  const offset = Number(url.searchParams.get('offset') || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new HttpError(400, '목록 위치가 올바르지 않습니다.');
  const limit = admin ? 24 : 12;
  const conditions = admin ? ['1=1'] : ["status = 'published'"];
  const values = [];
  const category = url.searchParams.get('category');
  if (['PROFILE', 'PLASTIC'].includes(category)) { conditions.push('category = ?'); values.push(category); }
  if (admin) {
    const status = url.searchParams.get('status');
    if (['draft', 'published'].includes(status)) { conditions.push('status = ?'); values.push(status); }
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (q) { conditions.push('(title LIKE ? OR material LIKE ?)'); values.push(`%${q}%`, `%${q}%`); }
  }
  const where = conditions.join(' AND ');
  const results = await env.CATALOG_DB.batch([
    env.CATALOG_DB.prepare(`SELECT * FROM catalog_items WHERE ${where} ORDER BY sort_order ASC, created_at DESC, id ASC LIMIT ? OFFSET ?`).bind(...values, limit, offset),
    env.CATALOG_DB.prepare(`SELECT COUNT(*) AS total FROM catalog_items WHERE ${where}`).bind(...values),
    ...(admin ? [env.CATALOG_DB.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(status = 'published'), 0) AS published, COALESCE(SUM(status = 'draft'), 0) AS draft FROM catalog_items")] : [])
  ]);
  return {items: results[0].results.map(row => itemView(row, admin)), total: results[1].results[0].total, offset, limit,
    ...(admin ? {counts: results[2].results[0]} : {})};
}
export async function imageResponse(request, env, id, admin = false) {
  if (!ID.test(id)) throw new HttpError(404, '사진을 찾을 수 없습니다.');
  const row = await env.CATALOG_DB.prepare(`SELECT image_key FROM catalog_items WHERE id = ?${admin ? '' : " AND status = 'published'"}`).bind(id).first();
  if (!row?.image_key) throw new HttpError(404, '사진을 찾을 수 없습니다.');
  const object = await env.CATALOG_IMAGES.get(row.image_key);
  if (!object) throw new HttpError(404, '사진을 찾을 수 없습니다.');
  // Recheck publication on every request. A draft must never be served from a CDN cache.
  const headers = new Headers({'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin'});
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('ETag', object.httpEtag);
  return new Response(request.method === 'HEAD' ? null : object.body, {headers});
}
async function boundedBody(request, max) {
  if (Number(request.headers.get('Content-Length')) > max) throw new HttpError(413, '사진 용량이 큽니다. 4MB 이하로 줄여 주세요.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '저장할 내용이 없습니다.');
  const chunks = []; let length = 0;
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) { await reader.cancel(); throw new HttpError(413, '사진 용량이 큽니다. 4MB 이하로 줄여 주세요.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export async function readItem(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.startsWith('multipart/form-data;')) throw new HttpError(415, '지원하지 않는 저장 형식입니다.');
  const bytes = await boundedBody(request, 4 * 1024 * 1024 + 32768);
  let form, data;
  try {
    form = await new Response(bytes, {headers: {'Content-Type': type}}).formData();
    const raw = form.get('data');
    if (typeof raw !== 'string' || raw.length > 20000) throw new Error();
    data = JSON.parse(raw);
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
  } catch { throw new HttpError(400, '입력 내용을 읽을 수 없습니다.'); }
  const item = {};
  if (!ID.test(data.id || '')) throw new HttpError(400, '항목 식별자가 올바르지 않습니다.');
  item.id = data.id;
  for (const [field, limit] of Object.entries({title: 100, summary: 200, description: 5000, material: 100, image_alt: 150})) {
    if (typeof data[field] !== 'string' || data[field].length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(data[field])) throw new HttpError(400, '입력 길이와 내용을 확인해 주세요.');
    item[field] = data[field].trim();
  }
  if (!item.title) throw new HttpError(400, '제목을 입력해 주세요.');
  if (!['PROFILE', 'PLASTIC'].includes(data.category) || !['product', 'case'].includes(data.kind) || !['draft', 'published'].includes(data.status)) throw new HttpError(400, '분류와 공개 상태를 확인해 주세요.');
  if (!Number.isInteger(data.sort_order) || data.sort_order < 0 || data.sort_order > 9999) throw new HttpError(400, '표시 순서는 0~9999로 입력해 주세요.');
  if (data.version !== undefined && (!Number.isSafeInteger(data.version) || data.version < 1)) throw new HttpError(400, '수정 버전이 올바르지 않습니다.');
  Object.assign(item, {category: data.category, kind: data.kind, status: data.status, sort_order: data.sort_order, version: data.version});
  if (item.status === 'published' && !item.description) throw new HttpError(400, '공개할 제품의 상세 설명을 입력해 주세요.');
  const image = form.get('image');
  let photo = null;
  if (image && typeof image !== 'string' && image.size) {
    if (image.size > 4 * 1024 * 1024) throw new HttpError(413, '사진은 4MB 이하만 저장할 수 있습니다.');
    const body = new Uint8Array(await image.arrayBuffer());
    const head = new TextDecoder('latin1').decode(body.slice(0, 12));
    let mime;
    if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) mime = 'image/jpeg';
    if ([137,80,78,71,13,10,26,10].every((n, i) => body[i] === n)) mime = 'image/png';
    if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') mime = 'image/webp';
    if (!mime || mime !== image.type) throw new HttpError(400, 'JPG, PNG, WebP 사진만 등록할 수 있습니다.');
    photo = {body, mime};
  } else if (image !== null) throw new HttpError(400, '사진 파일을 확인해 주세요.');
  return {item, photo};
}
