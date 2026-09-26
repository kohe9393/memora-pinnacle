// 単語の追加・編集シート

import { el, relativeDays, agoLabel } from '../util.js';
import { icons } from '../icons.js';
import { openSheet, toast, confirmDialog } from '../ui.js';
import { STATUS, status, weakReasons, dots } from '../srs.js';
import { canSpeak, speak } from '../speech.js';
import { dotsEl, recentDots } from './common.js';

export function openWordSheet(store, { wordId = null, deckId = null, focus = null, onChange = () => {} }) {
  const word = wordId ? store.word(wordId) : null;
  const targetDeck = word ? store.deckOf(word.id) : store.deck(deckId);
  if (!targetDeck) return;
  let changed = false;

  const term = el('input', { class: 'input', id: 'word-term', value: word?.term ?? '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const meaning = el('textarea', { class: 'input', id: 'word-meaning', rows: '2', value: word?.meaning ?? '' });
  const example = el('textarea', { class: 'input', id: 'word-example', rows: '2', value: word?.example ?? '', placeholder: '任意' });
  const note = el('input', { class: 'input', id: 'word-note', value: word?.note ?? '', placeholder: '任意（品詞・覚え方など）' });

  const info = [];
  if (word) {
    const s = store.state(word.id);
    if (s?.seen) {
      const st = status(s);
      info.push(
        el(
          'div',
          { class: 'card-pad', style: { background: 'var(--card-2)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '10px' } },
          el(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
            el('span', { class: `tag ${st === 'weak' ? 'tag-ng' : st === 'learned' ? 'tag-ok' : ''}` }, STATUS[st].label),
            dotsEl(dots(s)),
            el('span', { class: 'small muted' }, '直近'),
            recentDots(s.hist),
          ),
          el(
            'p',
            { class: 'stat-line' },
            el('span', {}, '正解 ', el('b', {}, s.correct)),
            el('span', {}, 'ミス ', el('b', {}, s.wrong)),
            el('span', {}, '最後 ', el('b', {}, agoLabel(s.last))),
            el('span', {}, '次の出題 ', el('b', {}, relativeDays(s.due))),
          ),
          s.weak &&
            el(
              'div',
              { class: 'tags' },
              weakReasons(word, s, { lookup: (id) => store.word(id), neighbors: targetDeck.words }).map((r) => el('span', { class: r.kind === 'similar' || r.kind === 'confused' ? 'tag tag-mid' : 'tag tag-ng' }, r.text)),
            ),
        ),
      );
    } else info.push(el('p', { class: 'stat-line' }, 'まだ学習していません'));
  }

  const form = el(
    'form',
    { class: 'steps', onsubmit: (e) => (e.preventDefault(), save()) },
    ...info,
    el('label', { class: 'field' }, el('span', {}, '単語'), term),
    el('label', { class: 'field' }, el('span', {}, '意味'), meaning),
    el('label', { class: 'field' }, el('span', {}, '例文'), example),
    el('label', { class: 'field' }, el('span', {}, 'メモ'), note),
    el(
      'div',
      { class: 'btn-row' },
      canSpeak() && el('button', { type: 'button', class: 'btn', onclick: () => speak(term.value) }, el('span', { html: icons.speaker }), '発音'),
      el('button', { type: 'submit', class: 'btn btn-dark' }, word ? '保存する' : '追加する'),
    ),
    word &&
      el(
        'div',
        { class: 'btn-row' },
        el('button', { type: 'button', class: 'btn btn-sm', onclick: resetStats }, '学習記録をリセット'),
        el('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: remove }, el('span', { html: icons.trash }), '削除'),
      ),
  );

  const sheet = openSheet({
    title: word ? '単語を編集' : `「${targetDeck.name}」に追加`,
    content: form,
    onClose: () => changed && onChange(),
  });
  if (!word) setTimeout(() => term.focus(), 50);
  else if (focus === 'note') setTimeout(() => note.focus(), 50);

  function save() {
    const entry = { term: term.value, meaning: meaning.value, example: example.value, note: note.value };
    if (!entry.term.trim() || !entry.meaning.trim()) {
      toast('単語と意味を入力してください');
      return;
    }
    changed = true;
    if (word) {
      store.updateWord(word.id, entry);
      toast('保存しました');
      sheet.close();
      return;
    }
    const { added } = store.addEntries(targetDeck.id, [entry]);
    if (!added) {
      toast('同じ単語がすでにあります');
      return;
    }
    toast(`「${entry.term.trim()}」を追加しました`);
    for (const input of [term, meaning, example, note]) input.value = '';
    term.focus();
  }

  function resetStats() {
    store.resetStats([word.id]);
    changed = true;
    toast('学習記録をリセットしました');
    sheet.close();
  }

  async function remove() {
    const ok = await confirmDialog({ title: `「${word.term}」を削除しますか？`, body: '学習記録も消えます。', ok: '削除する', danger: true });
    if (!ok) return;
    store.deleteWord(word.id);
    changed = true;
    toast('削除しました');
    sheet.close();
  }
}
