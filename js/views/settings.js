import { el, copyText, downloadText, dayKey } from '../util.js';
import { icons } from '../icons.js';
import { segmented, toast, confirmDialog, openSheet } from '../ui.js';
import { decodeBytes } from '../parser.js';
import { canSpeak } from '../speech.js';
import { topbar } from './common.js';

export const APP_VERSION = '2.1.1';

export function render(ctx) {
  const { store, go, applyTheme } = ctx;
  const s = store.settings;
  const set = (key) => (value) => store.setSetting(key, value);

  function option(title, desc, control, inline = false) {
    return el(
      'div',
      { class: `setting${inline ? ' setting-inline' : ''}` },
      el('div', {}, el('p', { class: 'setting-title' }, title), desc && el('p', { class: 'setting-desc' }, desc)),
      control,
    );
  }

  function toggle(id, key, label) {
    return el('input', { type: 'checkbox', class: 'switch', id, role: 'switch', 'aria-label': label, checked: !!s[key], onchange: (e) => store.setSetting(key, e.target.checked) });
  }

  const nums = (list, key, unit = '') =>
    segmented({ label: key, value: s[key], options: list.map((n) => ({ value: n, label: `${n}${unit}` })), onChange: set(key) });

  const study = el(
    'section',
    { class: 'section' },
    el('div', { class: 'section-head' }, el('h2', {}, '学習')),
    el(
      'div',
      { class: 'card' },
      option('1日の目標', '1回の出題数にもなります。達成するとホームと終了画面にしるしが付きます。', nums([20, 30, 50, 100], 'dailyGoal', '問')),
      option(
        '出題の向き',
        null,
        segmented({
          label: '出題の向き',
          value: s.direction,
          options: [
            { value: 'term', label: '単語→意味' },
            { value: 'meaning', label: '意味→単語' },
            { value: 'mix', label: 'ミックス' },
          ],
          onChange: set('direction'),
        }),
      ),
      option('スワイプ用のボタンを表示', 'カードの下に「自信アリ」「合っていた」などのボタンを出します。', toggle('set-buttons', 'showButtons', 'スワイプ用のボタンを表示'), true),
      canSpeak() && option('単語を自動で読み上げる', '単語が表示されたときに発音します（端末の読み上げ機能を使います）。', toggle('set-auto-speak', 'autoSpeak', '自動で読み上げる'), true),
      option('4択で正解したら自動で次へ', null, toggle('set-auto-advance', 'autoAdvance', '正解したら自動で次へ'), true),
      option(
        '操作の説明',
        '学習画面の最初に出るスワイプの説明を、もう一度表示します。',
        el(
          'button',
          {
            class: 'btn btn-sm',
            style: { alignSelf: 'flex-start' },
            onclick: () => {
              store.setSetting('coachQ', false);
              store.setSetting('coachA', false);
              toast('次の学習で説明を表示します');
            },
          },
          'もう一度見る',
        ),
      ),
    ),
  );

  const look = el(
    'section',
    { class: 'section' },
    el('div', { class: 'section-head' }, el('h2', {}, '表示')),
    el(
      'div',
      { class: 'card' },
      option(
        'テーマ',
        null,
        segmented({
          label: 'テーマ',
          value: s.theme,
          options: [
            { value: 'auto', label: '自動' },
            { value: 'light', label: 'ライト' },
            { value: 'dark', label: 'ダーク' },
          ],
          onChange: (v) => {
            store.setSetting('theme', v);
            applyTheme(v);
          },
        }),
      ),
    ),
  );

  const wordCount = store.words('all').length;
  const data = el(
    'section',
    { class: 'section' },
    el('div', { class: 'section-head' }, el('h2', {}, 'データ')),
    el(
      'p',
      { class: 'small muted' },
      `単語帳${store.decks.length}冊・${wordCount}語と学習記録は、この端末の中だけに保存されています。機種変更やブラウザのデータ削除に備えて、ときどきバックアップを書き出してください。`,
    ),
    !store.persistent && el('p', { class: 'small', style: { color: 'var(--ng)' } }, 'この画面ではデータを保存できません。閉じると消えるため、バックアップを書き出してください。'),
    el(
      'div',
      { class: 'btn-row' },
      el('button', { class: 'btn', onclick: () => backup(store) }, el('span', { html: icons.download }), 'バックアップを書き出す'),
      el('button', { class: 'btn', onclick: () => restore(store, go) }, el('span', { html: icons.upload }), 'バックアップから戻す'),
    ),
    el(
      'div',
      { class: 'btn-row' },
      el(
        'button',
        {
          class: 'btn btn-sm',
          onclick: async () => {
            const ok = await confirmDialog({ title: '学習記録をリセットしますか？', body: 'すべての単語が未学習に戻ります。単語帳は消えません。', ok: 'リセット', danger: true });
            if (!ok) return;
            store.resetStats();
            toast('学習記録をリセットしました');
          },
        },
        '学習記録をリセット',
      ),
      el(
        'button',
        {
          class: 'btn btn-sm btn-danger',
          onclick: async () => {
            const ok = await confirmDialog({ title: 'すべてのデータを削除しますか？', body: '単語帳・学習記録・設定がすべて消えます。元に戻せません。', ok: 'すべて削除', danger: true });
            if (!ok) return;
            store.clearAll();
            applyTheme('auto');
            toast('すべてのデータを削除しました');
            go('home');
          },
        },
        el('span', { html: icons.trash }),
        'すべて削除',
      ),
    ),
  );

  const about = el(
    'section',
    { class: 'section' },
    el('div', { class: 'section-head' }, el('h2', {}, 'アプリとして使う')),
    el(
      'div',
      { class: 'card card-pad section' },
      el('p', { class: 'small' }, el('b', {}, 'iPhone / iPad：'), 'Safari で開き、共有ボタン →「ホーム画面に追加」。アプリのように全画面で使え、オフラインでも動きます。'),
      el('p', { class: 'small' }, el('b', {}, 'Android：'), 'Chrome のメニュー →「アプリをインストール」または「ホーム画面に追加」。'),
      el('p', { class: 'small muted' }, `めくる単語帳 v${APP_VERSION}`),
    ),
  );

  return { el: el('div', { class: 'page' }, topbar('設定', { back: () => go('home') }), study, look, data, about) };
}

/** テキストを「コピー」または「ファイルに保存」で持ち出すシート */
export function exportSheet({ title, text, filename, type = 'text/plain', download }) {
  const box = el('textarea', { class: 'input code-box', id: 'export-text', readonly: true, value: text, 'aria-label': title });
  openSheet({
    title,
    content: el(
      'div',
      { class: 'steps' },
      el('p', { class: 'small muted' }, 'ファイルとして保存するか、コピーしてメモアプリなどに貼り付けて保管してください。'),
      box,
      el(
        'div',
        { class: 'btn-row' },
        el(
          'button',
          {
            class: 'btn btn-primary',
            onclick: () => {
              const ok = download ? download() : downloadText(filename, text, type);
              if (!ok) toast('この画面ではファイルを保存できません。コピーを使ってください');
            },
          },
          el('span', { html: icons.download }),
          'ファイルに保存',
        ),
        el(
          'button',
          {
            class: 'btn',
            onclick: async () => toast((await copyText(text, box)) ? 'コピーしました' : '選択しました。長押しでコピーしてください'),
          },
          el('span', { html: icons.copy }),
          'コピー',
        ),
      ),
    ),
  });
}

function backup(store) {
  exportSheet({ title: 'バックアップを書き出す', text: store.exportBackup(), filename: `mekuru-backup-${dayKey()}.json`, type: 'application/json' });
}

function restore(store, go) {
  const box = el('textarea', { class: 'input code-box', id: 'restore-text', placeholder: 'バックアップの内容をここに貼り付け', 'aria-label': 'バックアップの内容' });
  const file = el('input', {
    type: 'file',
    id: 'restore-file',
    accept: '.json,application/json,text/plain',
    onchange: async (e) => {
      const f = e.target.files?.[0];
      if (f) box.value = decodeBytes(new Uint8Array(await f.arrayBuffer()));
    },
  });
  const sheet = openSheet({
    title: 'バックアップから戻す',
    content: el(
      'div',
      { class: 'steps' },
      el('p', { class: 'small muted' }, '書き出したバックアップ（.json）を選ぶか、中身を貼り付けてください。いまのデータは置き換えられます。'),
      el('label', { class: 'file-drop', for: 'restore-file' }, el('span', { html: icons.upload }), 'ファイルを選ぶ', file),
      box,
      el(
        'button',
        {
          class: 'btn btn-primary',
          onclick: async () => {
            if (!box.value.trim()) {
              toast('バックアップの内容が空です');
              return;
            }
            const ok = await confirmDialog({ title: 'いまのデータを置き換えますか？', body: 'この端末の単語帳と学習記録は、バックアップの内容に置き換わります。', ok: '置き換える', danger: true });
            if (!ok) return;
            try {
              const r = store.restoreBackup(box.value);
              sheet.close();
              toast(`単語帳${r.decks}冊・${r.words}語を戻しました`);
              go('home');
            } catch {
              toast('バックアップとして読み取れませんでした。内容を確認してください');
            }
          },
        },
        '戻す',
      ),
    ),
  });
}
