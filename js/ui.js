// 画面部品：トースト、確認ダイアログ、下から出るシート、切り替えボタン

import { el } from './util.js';
import { icons } from './icons.js';

let toastHost = null;
let toastTimer = null;

export function toast(message, { duration = 2400 } = {}) {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  clearTimeout(toastTimer);
  toastHost.replaceChildren(el('div', { class: 'toast' }, message));
  toastTimer = setTimeout(() => toastHost.replaceChildren(), duration);
}

function openDialog(className, box, { onCancel } = {}) {
  const dialog = el('dialog', { class: className }, box);
  document.body.append(dialog);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    onCancel?.();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) onCancel?.();
  });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
  return dialog;
}

/** window.confirm の代わり（アプリ内で完結させる） */
export function confirmDialog({ title, body = '', ok = 'OK', cancel = 'キャンセル', danger = false }) {
  return new Promise((resolve) => {
    let dialog;
    const done = (value) => {
      dialog.close();
      resolve(value);
    };
    const box = el(
      'form',
      { class: 'modal-box', method: 'dialog', onsubmit: (e) => (e.preventDefault(), done(true)) },
      el('h2', {}, title),
      body && el('p', { class: 'modal-body' }, body),
      el(
        'div',
        { class: 'modal-actions' },
        el('button', { type: 'button', class: 'btn', onclick: () => done(false) }, cancel),
        el('button', { type: 'submit', class: danger ? 'btn btn-danger-solid' : 'btn btn-primary', autofocus: true }, ok),
      ),
    );
    dialog = openDialog('modal', box, { onCancel: () => done(false) });
  });
}

export function promptDialog({ title, label, value = '', ok = '保存' }) {
  return new Promise((resolve) => {
    let dialog;
    const input = el('input', { class: 'input', id: 'prompt-input', value, autocomplete: 'off' });
    const done = (v) => {
      dialog.close();
      resolve(v);
    };
    const box = el(
      'form',
      { class: 'modal-box', onsubmit: (e) => (e.preventDefault(), done(input.value.trim() || null)) },
      el('h2', {}, title),
      el('label', { class: 'field' }, el('span', {}, label), input),
      el(
        'div',
        { class: 'modal-actions' },
        el('button', { type: 'button', class: 'btn', onclick: () => done(null) }, 'キャンセル'),
        el('button', { type: 'submit', class: 'btn btn-primary' }, ok),
      ),
    );
    dialog = openDialog('modal', box, { onCancel: () => done(null) });
    input.select();
  });
}

/** 下から出るシート。content は要素、戻り値の close() で閉じる */
export function openSheet({ title, content, onClose }) {
  let dialog;
  const close = () => {
    if (dialog.open) dialog.close();
    onClose?.();
  };
  const box = el(
    'div',
    { class: 'sheet-box' },
    el('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    el('div', { class: 'sheet-head' }, el('h2', {}, title), el('button', { class: 'icon-btn', 'aria-label': '閉じる', onclick: close, html: icons.close })),
    content,
  );
  dialog = openDialog('sheet', box, { onCancel: close });
  return { close, dialog };
}

/** 切り替えボタン（どれか1つを選ぶ） */
export function segmented({ options, value, onChange, label, className = 'segmented' }) {
  const buttons = options.map((opt) =>
    el(
      'button',
      {
        type: 'button',
        'aria-pressed': String(opt.value === value),
        onclick: () => {
          for (const b of buttons) b.setAttribute('aria-pressed', String(b === buttonFor(opt.value)));
          onChange(opt.value);
        },
      },
      opt.label,
    ),
  );
  const buttonFor = (v) => buttons[options.findIndex((o) => o.value === v)];
  return el('div', { class: className, role: 'group', 'aria-label': label }, buttons);
}
