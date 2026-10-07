(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const form = $('#item-form');
  const editor = $('#editor');
  const previewMode = location.protocol === 'file:' || (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && new URLSearchParams(location.search).get('preview') === '1');
  const storageKey = 'gts-admin-local-preview-v1';
  let items = [], current = null, pendingPhoto = null, photoUrl = '', photoTask = 0;
  let dirty = false, saving = false, processingPhoto = false, ready = false, loading = false, activeStatus = '', offset = 0, total = 0;
  let requestNumber = 0, toastTimer, searchTimer;
  const fields = ['title', 'category', 'kind', 'summary', 'description', 'material', 'image_alt', 'sort_order', 'status'];
  const field = name => form.elements.namedItem(name);
  const message = (text, error = false) => { $('#editor-message').textContent = text; $('#editor-message').classList.toggle('error', error); };
  function node(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
  function toast(text) { clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 4500); }
  function readLocal() { return JSON.parse(localStorage.getItem(storageKey) || '[]'); }
  function writeLocal(rows) { try { localStorage.setItem(storageKey, JSON.stringify(rows)); } catch { throw new Error('로컬 미리보기 저장 공간이 부족합니다. 사진 크기를 줄이거나 기존 미리보기 항목을 삭제해 주세요.'); } }
  async function api(path, options = {}) {
    let response;
    try { response = await fetch(`/api/admin/${path}`, {...options, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(45000)}); }
    catch { throw new Error('연결을 확인할 수 없습니다. 새 창에서 관리자에 다시 로그인한 뒤 재시도해 주세요. 저장 중이었다면 목록에서 저장 여부를 먼저 확인해 주세요.'); }
    if (!(response.headers.get('Content-Type') || '').includes('application/json')) throw new Error('관리자 로그인이 필요합니다. 이 페이지를 새로 고쳐 주세요.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '처리하지 못했습니다. 다시 시도해 주세요.');
    return data;
  }
  async function connect() {
    if (saving) return;
    $('#connection-notice').textContent = '관리자 연결을 확인하고 있습니다.';
    $('#connection-notice').hidden = false;
    try {
      if (previewMode) {
        readLocal();
        $('#account-label').textContent = '로컬 미리보기';
        $('#connection-label').textContent = '화면 검토 모드';
        $('#connection-notice').textContent = '로컬 미리보기입니다. 등록 내용은 이 브라우저에만 저장되며 실제 홈페이지에는 반영되지 않습니다.';
      } else {
        // An expired or rejected session must still offer a way to sign in again.
        $('#logout').hidden = false;
        $('#logout').textContent = '다시 로그인 ↗';
        const session = await api('session');
        $('#account-label').textContent = session.email;
        $('#logout').textContent = '로그아웃 ↗';
        $('#connection-label').textContent = '홈페이지 연결됨';
        $('.connection-dot').style.background = 'var(--green)';
        $('#connection-notice').hidden = true;
      }
      ready = true;
      $('#new-item').disabled = false;
      await loadItems();
    } catch (error) {
      ready = false;
      $('#new-item').disabled = true;
      $('#connection-label').textContent = '연결 대기';
      $('#account-label').textContent = '연결 확인 필요';
      $('#connection-notice').textContent = error.message;
      $('#list-message').textContent = '설정 후 ‘새로 고침’을 누르면 다시 연결합니다.';
    }
  }
  async function loadItems() {
    if (!ready) return;
    const number = ++requestNumber;
    loading = true;
    $('#item-list').setAttribute('aria-busy', 'true');
    $('#list-message').textContent = '목록을 불러오는 중입니다…';
    const category = $('#category-filter').value, q = $('#search').value.trim();
    try {
      let data;
      if (previewMode) {
        const all = readLocal();
        const filtered = all.filter(item => (!activeStatus || item.status === activeStatus) && (!category || item.category === category) && (!q || `${item.title} ${item.material}`.toLowerCase().includes(q.toLowerCase()))).sort((a,b) => a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
        data = {items: filtered.slice(offset, offset + 24), total: filtered.length, counts: {total: all.length, published: all.filter(i => i.status === 'published').length, draft: all.filter(i => i.status === 'draft').length}};
      } else data = await api(`items?${new URLSearchParams({status: activeStatus, category, q, offset})}`);
      if (number !== requestNumber) return;
      total = data.total;
      if (offset >= total && offset > 0) { offset = Math.max(0, Math.ceil(total / 24) * 24 - 24); return await loadItems(); }
      items = data.items;
      for (const name of ['total', 'published', 'draft']) $(`#count-${name}`).textContent = data.counts[name];
      $('#result-count').textContent = `${total}개`;
      $('#item-list').replaceChildren(...items.map(renderCard));
      const filtered = !!(activeStatus || category || q);
      $('#empty-state').hidden = !!items.length;
      $('#empty-title').textContent = filtered ? '조건에 맞는 항목이 없습니다.' : '첫 번째 콘텐츠를 등록해 보세요.';
      $('#empty-description').textContent = filtered ? '검색어 또는 분류를 바꿔서 확인해 주세요.' : '제품 사진 한 장과 간단한 설명이면 시작할 수 있습니다.\n작성 중인 내용은 임시 저장해 두세요.';
      $('#empty-add').hidden = filtered;
      $('#pagination').hidden = total <= 24;
      $('#previous-page').disabled = offset === 0;
      $('#next-page').disabled = offset + 24 >= total;
      $('#page-label').textContent = `${Math.floor(offset / 24) + 1} / ${Math.max(1, Math.ceil(total / 24))}`;
      $('#list-message').textContent = '';
    } catch (error) { if (number === requestNumber) $('#list-message').textContent = error.message; }
    finally { if (number === requestNumber) { loading = false; $('#item-list').setAttribute('aria-busy', 'false'); } }
  }
  function renderCard(item) {
    const card = node('article', 'content-card');
    const cover = node('button', 'card-image'); cover.type = 'button'; cover.setAttribute('aria-label', `${item.title} 수정`);
    if (item.image_url) { const img = node('img'); img.src = item.image_url; img.alt = item.image_alt || item.title; img.loading = 'lazy'; cover.append(img); }
    else cover.append(node('span', 'image-blank', 'PHOTO NOT ADDED'));
    cover.addEventListener('click', () => openEditor(item));
    const body = node('div', 'card-body'), meta = node('div', 'card-meta');
    meta.append(node('span', 'category-tag', item.category), node('span', `badge ${item.status}`, item.status === 'published' ? '공개 중' : '임시 저장'));
    const title = node('button', 'card-title', item.title); title.addEventListener('click', () => openEditor(item));
    const bottom = node('div', 'card-bottom');
    bottom.append(node('span', 'card-date', `${item.kind === 'case' ? '가공 사례' : '제품 소개'} · ${item.updated_at.slice(0,10).replaceAll('-', '.')}`));
    const buttons = node('div', 'card-buttons');
    const edit = node('button', 'text-button', '수정'), remove = node('button', 'text-button delete', '삭제');
    edit.setAttribute('aria-label', `${item.title} 수정`); remove.setAttribute('aria-label', `${item.title} 삭제`);
    edit.addEventListener('click', () => openEditor(item)); remove.addEventListener('click', () => deleteItem(item));
    buttons.append(edit, remove); bottom.append(buttons);
    body.append(meta, title, node('p', 'card-summary', item.summary || '짧은 소개를 추가해 주세요.'), bottom);
    card.append(cover, body); return card;
  }
  function updatePreview() {
    $('#preview-title').textContent = field('title').value || '제품 또는 가공 사례 제목';
    $('#preview-category').textContent = field('category').value;
    $('#preview-summary').textContent = field('summary').value || '짧은 소개가 이곳에 표시됩니다.';
    const published = field('status').value === 'published';
    $('#save-item').textContent = published ? '공개로 저장' : '임시 저장';
    field('description').required = published;
    $('#publish-help').textContent = published ? '저장하면 홈페이지에 바로 표시됩니다.' : '홈페이지에는 표시되지 않습니다.';
  }
  function setPhoto(url) {
    $('#photo-preview').hidden = !url; $('#upload-prompt').hidden = !!url;
    if (url) $('#photo-preview').src = url; else $('#photo-preview').removeAttribute('src');
  }
  function openEditor(item = null) {
    if (!ready || saving) return;
    current = item ? {...item} : {id: crypto.randomUUID(), category: 'PROFILE', kind: 'product', status: 'draft', sort_order: 0};
    form.reset(); pendingPhoto = null; photoTask++; dirty = false; processingPhoto = false;
    $('#save-item').disabled = false;
    if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = '';
    for (const name of fields) field(name).value = current[name] ?? '';
    $('#undo-photo').hidden = true;
    setPhoto(item?.image_url);
    $('#editor-title').textContent = item ? '콘텐츠 수정' : '새 항목 등록';
    message('확인된 정보와 사용 가능한 사진만 등록해 주세요.');
    updatePreview(); editor.showModal(); editor.scrollTop = 0; field('title').focus({preventScroll: true});
  }
  function confirmation(title, description, action) {
    const dialog = $('#confirm-dialog');
    $('#confirm-title').textContent = title; $('#confirm-description').textContent = description; $('#confirm-yes').textContent = action;
    dialog.returnValue = ''; dialog.showModal(); $('#confirm-no').focus();
    return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), {once: true}));
  }
  async function closeEditor() {
    if (saving) return;
    if (dirty && !await confirmation('작성 중인 내용을 닫을까요?', '저장하지 않은 변경 내용은 사라집니다.', '닫기')) return;
    photoTask++; dirty = false; editor.close();
    if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = '';
  }
  async function selectPhoto(file) {
    if (!file || saving) return;
    const task = ++photoTask;
    processingPhoto = true;
    $('#save-item').disabled = true;
    message('사진을 준비하고 있습니다…');
    let bitmap;
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WebP 사진을 선택해 주세요.');
      if (file.size > 15 * 1024 * 1024) throw new Error('원본 사진은 15MB 이하로 선택해 주세요.');
      bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 60000000) throw new Error('사진 해상도가 너무 큽니다. 크기를 줄여 주세요.');
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88));
      if (!blob || blob.size > 4 * 1024 * 1024) throw new Error('사진을 압축하지 못했습니다. 더 작은 사진을 선택해 주세요.');
      if (task !== photoTask || !editor.open) return;
      pendingPhoto = new File([blob], 'photo.jpg', {type: 'image/jpeg'});
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = URL.createObjectURL(blob); setPhoto(photoUrl); dirty = true;
      $('#undo-photo').hidden = false;
      message(`사진 준비 완료 · ${canvas.width} × ${canvas.height}px · ${Math.ceil(blob.size / 1024)}KB. 저장하면 반영됩니다.`);
    } catch (error) { if (task === photoTask) message(error.message, true); }
    finally { bitmap?.close(); if (task === photoTask) { processingPhoto = false; $('#save-item').disabled = false; } }
  }
  function setSaving(value) {
    saving = value;
    form.querySelectorAll('input, select, textarea, button').forEach(element => element.disabled = value);
    editor.setAttribute('aria-busy', String(value));
    if (value) $('#save-item').textContent = '저장 중…'; else updatePreview();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (saving || processingPhoto || !ready) return;
    const data = Object.fromEntries(fields.map(name => [name, field(name).value.trim()]));
    data.sort_order = Number(data.sort_order); data.version = current.version; data.id = current.id;
    if (!data.title) return message('제목을 입력해 주세요.', true);
    if (data.status === 'published' && !pendingPhoto && !current.image_url) return message('공개하려면 대표 사진을 등록해 주세요.', true);
    if (data.status === 'published' && !data.description) return message('공개하려면 상세 설명을 입력해 주세요.', true);
    setSaving(true); message('저장하고 있습니다. 잠시만 기다려 주세요.');
    try {
      if (previewMode) {
        const rows = readLocal();
        let url = current.image_url || null;
        if (pendingPhoto) url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(pendingPhoto); });
        const previous = rows.find(i => i.id === data.id);
        if (previous && previous.version !== current.version) throw new Error('다른 창에서 수정된 항목입니다. 목록을 새로 고쳐 주세요.');
        const now = new Date().toISOString();
        const item = {...data, image_url: url, version: (current.version || 0) + 1, created_at: current.created_at || now, updated_at: now};
        writeLocal([item, ...rows.filter(i => i.id !== item.id)]);
      } else {
        const body = new FormData(); body.set('data', JSON.stringify(data)); if (pendingPhoto) body.set('image', pendingPhoto);
        await api(current.version ? `items/${current.id}` : 'items', {method: current.version ? 'PUT' : 'POST', body});
      }
      dirty = false; editor.close(); photoTask++;
      if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = '';
      toast(previewMode ? '이 브라우저에 미리보기로 저장했습니다.' : (data.status === 'published' ? '저장했습니다. 홈페이지에 공개됩니다.' : '임시 저장했습니다.'));
      await loadItems();
    } catch (error) { message(error.message, true); }
    finally { setSaving(false); }
  });
  async function deleteItem(item) {
    if (saving || !await confirmation('항목을 삭제할까요?', `‘${item.title}’과 대표 사진을 삭제합니다.\n삭제한 내용은 되돌릴 수 없습니다.`, '삭제')) return;
    saving = true;
    try {
      if (previewMode) {
        const rows = readLocal(); const previous = rows.find(row => row.id === item.id);
        if (previous && previous.version !== item.version) throw new Error('다른 창에서 수정된 항목입니다. 목록을 새로 고쳐 주세요.');
        writeLocal(rows.filter(row => row.id !== item.id));
      } else await api(`items/${item.id}?version=${item.version}`, {method: 'DELETE'});
      toast('삭제했습니다.'); await loadItems();
    } catch (error) { $('#list-message').textContent = error.message; }
    finally { saving = false; }
  }
  $('#new-item').addEventListener('click', () => openEditor()); $('#empty-add').addEventListener('click', () => openEditor());
  $('#close-editor').addEventListener('click', closeEditor); $('#cancel-editor').addEventListener('click', closeEditor);
  editor.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
  $('#confirm-no').addEventListener('click', () => $('#confirm-dialog').close('no')); $('#confirm-yes').addEventListener('click', () => $('#confirm-dialog').close('yes'));
  form.addEventListener('input', () => { dirty = true; updatePreview(); }); form.addEventListener('change', () => { dirty = true; updatePreview(); });
  $('#choose-photo').addEventListener('click', () => $('#photo').click());
  $('#photo').addEventListener('change', () => { selectPhoto($('#photo').files[0]); $('#photo').value = ''; });
  $('#undo-photo').addEventListener('click', () => { photoTask++; processingPhoto = false; pendingPhoto = null; if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = ''; setPhoto(current.image_url); $('#undo-photo').hidden = true; $('#save-item').disabled = false; dirty = true; message('사진 변경을 취소했습니다.'); });
  for (const eventName of ['dragenter', 'dragover']) $('#drop-zone').addEventListener(eventName, event => { event.preventDefault(); if (!saving) $('#drop-zone').classList.add('dragover'); });
  for (const eventName of ['dragleave', 'drop']) $('#drop-zone').addEventListener(eventName, event => { event.preventDefault(); $('#drop-zone').classList.remove('dragover'); if (eventName === 'drop' && !saving) selectPhoto(event.dataTransfer.files[0]); });
  $('[data-status]').parentElement.addEventListener('click', event => { const button = event.target.closest('[data-status]'); if (!button || saving) return; activeStatus = button.dataset.status; document.querySelectorAll('[data-status]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); offset = 0; loadItems(); });
  $('#category-filter').addEventListener('change', () => { offset = 0; loadItems(); });
  $('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { offset = 0; loadItems(); }, 250); });
  $('#previous-page').addEventListener('click', () => { if (!loading) { offset = Math.max(0, offset - 24); loadItems(); } });
  $('#next-page').addEventListener('click', () => { if (!loading && offset + 24 < total) { offset += 24; loadItems(); } });
  $('#refresh').addEventListener('click', () => ready ? loadItems() : connect());
  window.addEventListener('beforeunload', event => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('storage', event => { if (previewMode && event.key === storageKey && !editor.open) loadItems(); });
  connect();
})();
