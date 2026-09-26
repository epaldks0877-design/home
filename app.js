"use strict";
const header = document.querySelector('.header');
function updateHeader() {
  header.classList.toggle('scrolled', window.scrollY > 30);
}
window.addEventListener('scroll', updateHeader, {passive: true});
updateHeader();
const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
function closeMenu() {
  navigation.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', '메뉴 열기');
}
menuToggle.addEventListener('click', () => {
  const open = navigation.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigation.classList.contains('open')) {
    closeMenu();
    menuToggle.focus();
  }
});
document.addEventListener('click', event => {
  if (!event.target.closest('.header')) closeMenu();
});
window.matchMedia('(min-width: 721px)').addEventListener('change', closeMenu);
document.querySelectorAll('[data-service]').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelector('#material').value = link.dataset.service;
  });
});
document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(item => {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    let count = 0;
    document.querySelectorAll('[data-category]').forEach(card => {
      card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter;
      if (!card.hidden) count++;
    });
    document.querySelector('.filter-status').textContent = `${button.textContent} 분류: 등록 예정 항목 ${count}개`;
  });
});
const form = document.querySelector('#inquiry-form');
const dialog = document.querySelector('#preview-dialog');
const fieldNames = {name: '회사명 / 성함', contact: '연락처', material: '문의 소재', quantity: '예상 수량', message: '문의 내용'};
form.querySelectorAll('input[required], textarea[required]').forEach(input => {
  input.addEventListener('input', () => input.setCustomValidity(input.value.trim() ? '' : '내용을 입력해 주세요.'));
});
form.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(form);
  const fields = document.querySelector('#preview-fields');
  fields.replaceChildren();
  for (const [key, label] of Object.entries(fieldNames)) {
    const value = String(data.get(key) || '').trim() || '미정';
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    fields.append(term, description);
  }
  dialog.showModal();
  form.dispatchEvent(new CustomEvent('inquiry-preview', {detail: Object.fromEntries(data)}));
});
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
document.querySelector('#edit-inquiry').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (dialog.dataset.sending === 'true') return;
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
});
document.querySelector('#year').textContent = new Date().getFullYear();
