import { el } from '../util.js';
import { icons } from '../icons.js';
import { toast } from '../ui.js';
import { decodeBytes, delimiterLabel, DELIMITER_OPTIONS, parseWordList } from '../parser.js';
import { SAMPLE_WORDS } from '../sample.js';
import { topbar } from './common.js';

const PLACEHOLDER = `apple\tりんご
abandon, 捨てる, They abandoned the plan.
give up 諦める
take off - 離陸する`;

function defaultName() {
  const d = new Date();
  return `単語帳 ${d.getMonth() + 1}/${d.getDate()}`;
}

export function render({ store, go, params }) {
  const presetDeck = store.deck(params.deck);
  let result = { entries: [], skipped: [], delimiter: 'auto', hasHeader: false };
  let timer = null;

  const text = el('textarea', {
    class: 'textarea',
    id: 'import-text',
    placeholder: PLACEHOLDER,
    spellcheck: 'false',
    autocapitalize: 'off',
    'aria-label': '単語リスト',
    oninput: () => {
      clearTimeout(timer);
      timer = setTimeout(update, 150);
    },
  });

  const fileInput = el('input', { type: 'file', id: 'import-file', accept: '.csv,.tsv,.txt,.text,text/plain,text/csv,text/tab-separated-values', onchange: (e) => readFile(e.target.files?.[0]) });
  const drop = el('label', { class: 'file-drop', for: 'import-file' }, el('span', { html: icons.upload }), 'ファイルを選ぶ（CSV・TSV・TXT）', fileInput);
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('is-over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    readFile(e.dataTransfer?.files?.[0]);
  });

  async function readFile(file) {
    if (!file) return;
    if (/\.(xlsx?|numbers)$/i.test(file.name)) {
      toast('Excel・Numbers のファイルは、CSV で書き出すか、セルをコピーして貼り付けてください');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      text.value = decodeBytes(new Uint8Array(buffer));
      if (!nameInput.value || nameInput.dataset.auto === '1') {
        nameInput.value = file.name.replace(/\.[^.]+$/, '');
        nameInput.dataset.auto = '1';
      }
      update();
    } catch {
      toast('ファイルを読み込めませんでした');
    }
  }

  const delimiter = el(
    'select',
    { class: 'select', id: 'import-delimiter', onchange: update, 'aria-label': '区切り方' },
    DELIMITER_OPTIONS.map((o) => el('option', { value: o.id }, o.label)),
  );
  const swap = el('input', { type: 'checkbox', id: 'import-swap', onchange: update });

  const status = el('p', { class: 'status-line' });
  const skippedNote = el('p', { class: 'hint' });
  const preview = el('div', { class: 'table-wrap', hidden: true });

  const nameInput = el('input', { class: 'input', id: 'import-name', value: defaultName(), 'aria-label': '新しい単語帳の名前', oninput: () => (nameInput.dataset.auto = '0') });
  nameInput.dataset.auto = '1';
  const deckSelect = el(
    'select',
    { class: 'select', id: 'import-deck', 'aria-label': '追加先の単語帳' },
    store.decks.map((d) => el('option', { value: d.id, selected: d.id === presetDeck?.id }, `${d.name}（${d.words.length}語）`)),
  );
  const toNew = el('input', { type: 'radio', name: 'import-target', id: 'import-target-new', checked: !presetDeck, onchange: syncTarget });
  const toExisting = el('input', { type: 'radio', name: 'import-target', id: 'import-target-existing', checked: !!presetDeck, disabled: !store.decks.length, onchange: syncTarget });

  function syncTarget() {
    nameInput.disabled = !toNew.checked;
    deckSelect.disabled = !toExisting.checked;
  }
  syncTarget();

  const submit = el('button', { class: 'btn btn-dark btn-block', disabled: true, onclick: doImport }, '取り込む');

  function update() {
    result = parseWordList(text.value, { delimiter: delimiter.value, swap: swap.checked });
    const n = result.entries.length;
    if (!text.value.trim()) {
      status.textContent = 'まだ何も入っていません';
      status.dataset.tone = '';
    } else if (!n) {
      status.textContent = '単語と意味の組を読み取れませんでした。区切り方を変えてみてください';
      status.dataset.tone = 'again';
    } else {
      status.textContent = `${n}語を読み取りました（${delimiterLabel(result.delimiter)}${result.hasHeader ? '・見出し行あり' : ''}）`;
      status.dataset.tone = 'good';
    }
    skippedNote.textContent = result.skipped.length
      ? `${result.skipped.length}行は意味が見つからないため読み飛ばします：「${result.skipped.slice(0, 2).join('」「')}」${result.skipped.length > 2 ? ' など' : ''}`
      : '';
    skippedNote.hidden = !result.skipped.length;

    preview.hidden = !n;
    if (n) {
      const hasExample = result.entries.some((e) => e.example);
      const rows = result.entries.slice(0, 8).map((e) => el('tr', {}, el('td', {}, e.term), el('td', {}, e.meaning), hasExample && el('td', {}, e.example)));
      const table = el(
        'table',
        { class: 'preview' },
        el('thead', {}, el('tr', {}, el('th', {}, '単語'), el('th', {}, '意味'), hasExample && el('th', {}, '例文'))),
        el('tbody', {}, rows),
      );
      preview.replaceChildren(table);
      if (n > 8) preview.append(el('p', { class: 'hint', style: { padding: '8px 10px' } }, `ほか ${n - 8}語`));
    }
    submit.disabled = !n;
    submit.textContent = n ? `${n}語を取り込む` : '取り込む';
  }

  function doImport() {
    if (!result.entries.length) return;
    try {
      navigator.storage?.persist?.();
    } catch {
      /* 対応していない端末 */
    }
    let deckId;
    let added;
    let duplicates;
    if (toExisting.checked && store.deck(deckSelect.value)) {
      deckId = deckSelect.value;
      ({ added, duplicates } = store.addEntries(deckId, result.entries));
    } else {
      const created = store.createDeck(nameInput.value.trim() || defaultName(), result.entries);
      deckId = created.deck.id;
      ({ added, duplicates } = created);
    }
    if (!store.lastSaveOk) {
      toast('端末に保存できませんでした。空き容量を確認してください');
      return;
    }
    toast(duplicates ? `${added}語を追加しました（重複${duplicates}語はスキップ）` : `${added}語を追加しました`);
    if (presetDeck) go('deck', { id: deckId });
    else {
      store.setSetting('deck', deckId);
      go('home');
    }
  }

  const fillSample = () => {
    text.value = SAMPLE_WORDS.slice(0, 10)
      .map((w) => `${w.term}\t${w.meaning}\t${w.example}`)
      .join('\n');
    update();
  };

  update();

  return {
    el: el(
      'div',
      { class: 'page' },
      topbar(presetDeck ? `「${presetDeck.name}」に追加` : '単語帳を読み込む', { back: () => (presetDeck ? go('deck', { id: presetDeck.id }) : store.decks.length ? go('library') : go('home')) }),
      el(
        'div',
        { class: 'steps' },
        el(
          'section',
          { class: 'card step' },
          el('h2', { class: 'step-title' }, el('span', { class: 'step-no' }, '1'), '単語リストを入れる'),
          drop,
          el('p', { class: 'hint' }, 'または下に貼り付け：'),
          text,
          el(
            'p',
            { class: 'hint' },
            '1行に「単語」と「意味」（あれば例文・メモ）を並べます。Excel・Numbers・Googleスプレッドシートのセルはそのままコピーして貼り付けられます。Quizlet・Anki の書き出しファイルも読み込めます。',
          ),
          el('button', { class: 'link-btn', style: { alignSelf: 'flex-start' }, onclick: fillSample }, '例を入れてみる'),
        ),
        el(
          'section',
          { class: 'card step' },
          el('h2', { class: 'step-title' }, el('span', { class: 'step-no' }, '2'), '読み取り結果を確認'),
          el('label', { class: 'field' }, el('span', {}, '区切り方'), delimiter),
          el('label', { class: 'check' }, swap, '単語と意味を入れ替える'),
          status,
          skippedNote,
          preview,
        ),
        el(
          'section',
          { class: 'card step' },
          el('h2', { class: 'step-title' }, el('span', { class: 'step-no' }, '3'), '追加先'),
          el(
            'div',
            { class: 'radio-card' },
            el('label', { class: 'radio' }, toNew, '新しい単語帳を作る'),
            nameInput,
            store.decks.length > 0 && el('label', { class: 'radio' }, toExisting, 'いまある単語帳に追加'),
            store.decks.length > 0 && deckSelect,
          ),
          submit,
        ),
      ),
    ),
    cleanup: () => clearTimeout(timer),
  };
}
