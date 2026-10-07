(() => {
  'use strict';
  const section = document.querySelector('#work');
  const grid = section.querySelector('.work-grid');
  const filters = [...section.querySelectorAll('[data-filter]')];
  const status = section.querySelector('.filter-status');
  const more = document.createElement('button'); more.type = 'button'; more.className = 'button outline catalog-more'; more.textContent = '더 보기 +'; more.hidden = true;
  grid.after(more);
  const dialog = document.createElement('dialog'); dialog.className = 'product-dialog'; dialog.setAttribute('aria-labelledby', 'product-detail-title');
  document.body.append(dialog);
  let connected = false, offset = 0, category = 'all', generation = 0, loading = false;
  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function detail(item) {
    const heading = element('div', 'dialog-heading'); const titleBox = element('div');
    titleBox.append(element('p', 'eyebrow', `${item.category} / ${item.kind === 'case' ? '가공 사례' : '제품 소개'}`));
    const title = element('h2', '', item.title); title.id = 'product-detail-title'; titleBox.append(title);
    const close = element('button', 'product-close', '×'); close.type = 'button'; close.setAttribute('aria-label', '상세 내용 닫기'); close.addEventListener('click', () => dialog.close());
    heading.append(titleBox, close);
    const photo = element('img', 'product-photo'); photo.src = item.image_url; photo.alt = item.image_alt || item.title;
    const body = element('div', 'product-body');
    if (item.material) body.append(element('p', 'product-material', `소재 · ${item.material}`));
    body.append(element('p', 'product-description', item.description));
    const inquire = element('a', 'button lime', '이 제품 문의하기 ↗'); inquire.href = '#contact';
    inquire.addEventListener('click', () => { dialog.close(); document.querySelector('#material').value = item.category === 'PROFILE' ? '프로파일' : '플라스틱 (아크릴·수지류)'; const message = document.querySelector('[name="message"]'); if (!message.value.trim()) message.value = `[${item.title}]에 대해 문의합니다.\n`; });
    body.append(inquire); dialog.replaceChildren(heading, photo, body); dialog.showModal(); dialog.scrollTop = 0;
  }
  function card(item) {
    const article = element('article', 'work-card catalog-card'); article.dataset.category = item.category;
    const button = element('button', 'catalog-open'); button.type = 'button'; button.setAttribute('aria-label', `${item.title} 자세히 보기`);
    const image = element('img', 'catalog-image'); image.src = item.image_url; image.alt = item.image_alt || item.title; image.loading = 'lazy'; image.width = 800; image.height = 600;
    const caption = element('div', 'work-caption'); const content = element('div');
    content.append(element('span', '', `${item.category} / ${item.kind === 'case' ? '가공 사례' : '제품 소개'}`), element('h3', '', item.title));
    if (item.summary) content.append(element('p', 'catalog-summary', item.summary));
    caption.append(content, element('span', 'catalog-arrow', '↗')); button.append(image, caption); article.append(button); button.addEventListener('click', () => detail(item)); return article;
  }
  function filterPlaceholders() {
    grid.querySelectorAll('[data-category]').forEach(card => card.hidden = category !== 'all' && card.dataset.category !== category);
    status.textContent = '제품과 가공 사례를 준비하고 있습니다.';
  }
  async function load(append = false) {
    if (location.protocol === 'file:') return filterPlaceholders();
    const number = ++generation; loading = true; more.disabled = true;
    grid.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(`/api/catalog?${new URLSearchParams({category, offset: append ? offset : 0})}`, {cache: 'no-store', signal: AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (number !== generation) return;
      connected = true;
      if (!append) grid.replaceChildren();
      grid.append(...data.items.map(card));
      offset = data.offset + data.items.length;
      more.hidden = offset >= data.total;
      const empty = section.querySelector('.catalog-empty'); if (empty) empty.remove();
      if (!data.total) grid.append(element('p', 'catalog-empty', '등록된 제품과 가공 사례를 준비하고 있습니다.'));
      section.querySelector('.section-heading > p').textContent = 'GTS KOREA의 제품과 가공 사례입니다.\n사진을 선택하면 상세 내용을 확인할 수 있습니다.';
      status.textContent = `${data.total}개 중 ${offset}개 표시`;
    } catch {
      if (number !== generation) return;
      if (!connected) filterPlaceholders();
      else {
        status.textContent = '목록을 불러오지 못했습니다. 다시 시도해 주세요.';
        more.hidden = false; more.textContent = '다시 시도 ↻'; more.dataset.retry = append ? 'append' : 'replace';
      }
    } finally { if (number === generation) { loading = false; more.disabled = false; grid.setAttribute('aria-busy', 'false'); } }
  }
  for (const button of filters) button.addEventListener('click', () => {
    category = button.dataset.filter;
    filters.forEach(filter => { filter.classList.toggle('active', filter === button); filter.setAttribute('aria-pressed', String(filter === button)); });
    more.textContent = '더 보기 +'; delete more.dataset.retry;
    load();
  });
  more.addEventListener('click', () => { if (!loading) { const append = more.dataset.retry !== 'replace'; more.textContent = '더 보기 +'; delete more.dataset.retry; load(append); } });
  load();
})();
