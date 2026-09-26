// スワイプ学習（2段階）
//   出題：答えを思い浮かべたら、自信をスワイプ（右＝自信アリ／下＝まあまあ／左＝自信なし）
//   答え：合っていたら右、間違っていたら左
// 答え始めるまでの時間も測り、2秒をこえたら「瞬発力不足」として苦手に入れる。

import { el, vibrate } from '../util.js';
import { icons } from '../icons.js';
import { pickDirection } from '../quiz.js';
import { makeSwipeable } from '../swipe.js';
import { canSpeak, speak } from '../speech.js';
import { dots, nextIfCorrect, similarWords, status, KNOWN_DAYS } from '../srs.js';
import { confirmExit, dotsEl, highlightTerm, isJapanese, lengthClass, recentDots, sessionTitle, studyHeader } from './common.js';
import { openWordSheet } from './word-sheet.js';

const CONF_OF = { right: 'high', down: 'mid', left: 'low' };
const TINT = {
  q: {
    right: [icons.checkCircle, '自信アリ'],
    left: [icons.xCircle, '自信なし'],
    down: [icons.tildeCircle, 'まあまあ'],
  },
  a: {
    right: [icons.checkCircle, '合っていた'],
    left: [icons.xCircle, '間違っていた'],
  },
};

export function render(ctx) {
  const { store, go, params } = ctx;
  const { session, before, opts } = params;
  if (!session) {
    queueMicrotask(() => go('home'));
    return { el: el('div') };
  }
  const settings = store.settings;
  const history = [];
  const { title, sub } = sessionTitle(store, opts);
  const finishParams = () => ({ summary: session.summary(), before, opts });

  const header = studyHeader({
    title,
    sub,
    onClose: () => confirmExit(ctx, session, finishParams()),
    onUndo: undo,
    sound: canSpeak() ? { value: () => settings.autoSpeak, set: (v) => store.setSetting('autoSpeak', v) } : null,
  });
  const stage = el('div', { class: 'stage' });
  const buttons = el('div', { class: 'judge-row', hidden: !settings.showButtons });

  let word = null;
  let direction = 'term';
  let phase = 'q';
  let t0 = 0;
  let startedAt = null;
  let confidence = 'mid';
  let ms = null;
  let card = null;
  let swiper = null;
  let coachOpen = false;
  let noteTimer = null;

  function next() {
    while (!session.done && !store.word(session.current)) session.answer(true); // 途中で消した単語は飛ばす
    header.update(session);
    header.setUndo(history.length > 0);
    if (session.done) {
      go('clear', finishParams());
      return;
    }
    word = store.word(session.current);
    direction = pickDirection(settings.direction);
    phase = 'q';
    startedAt = null;
    card = el('article', { class: 'scard', 'aria-live': 'polite' });
    stage.replaceChildren(card);
    paintQuestion();
    swiper = makeSwipeable(card, {
      directions: ['right', 'left', 'down'],
      onStart: markStart,
      onDrag: tint,
      onSwipe: (dir) => (phase === 'q' ? onConfidence(dir) : onJudge(dir)),
    });
    swiper.setCommitMode(() => phase === 'a');
    paintButtons();
    t0 = performance.now();
    if (!settings.coachQ) showCoach('q');
    else if (settings.autoSpeak && direction === 'term') speak(word.term);
  }

  function tintLayer() {
    return el('div', { class: 'tint', 'aria-hidden': 'true' }, el('div', { class: 'tint-inner' }));
  }

  function tint(dir, p) {
    if (!card) return;
    if (!dir) {
      card.style.setProperty('--p', '0');
      delete card.dataset.dir;
      return;
    }
    const [icon, label] = TINT[phase][dir] || [];
    card.dataset.dir = dir;
    card.style.setProperty('--p', String(Math.min(0.95, p * 1.1)));
    const inner = card.querySelector('.tint-inner');
    if (inner && inner.dataset.dir !== `${phase}-${dir}`) {
      inner.dataset.dir = `${phase}-${dir}`;
      inner.innerHTML = '';
      inner.append(el('span', { html: icon }), label);
    }
  }

  function markStart() {
    if (startedAt == null && !coachOpen) startedAt = performance.now();
  }

  function speakBtn() {
    return canSpeak() ? el('button', { class: 'speak-mini', type: 'button', 'aria-label': '発音を聞く', html: icons.speaker, onclick: () => speak(word.term) }) : null;
  }

  function stateTag(s) {
    if (session.isRetry) return el('span', { class: 'tag tag-ng' }, 'もう一度');
    const st = status(s);
    if (st === 'new') return el('span', { class: 'tag tag-accent' }, 'はじめて');
    if (st === 'weak') return el('span', { class: 'tag tag-ng' }, s.weak === 'slow' ? '苦手・瞬発力' : '苦手');
    if (st === 'learned') return el('span', { class: 'tag tag-ok' }, '覚えた');
    return el('span', { class: 'tag' }, '復習');
  }

  function paintQuestion() {
    const s = store.state(word.id);
    const prompt = direction === 'term' ? word.term : word.meaning;
    const days = nextIfCorrect(s);
    card.replaceChildren(
      tintLayer(),
      el('div', { class: 'scard-top' }, stateTag(s)),
      el(
        'div',
        { class: 'scard-body' },
        dotsEl(dots(s)),
        el('p', { class: `scard-word${isJapanese(prompt) ? ' is-jp' : ''}${lengthClass(prompt)}` }, prompt),
        direction === 'term' && speakBtn(),
      ),
      el(
        'div',
        { class: 'scard-foot' },
        s?.seen ? recentDots(s.hist) : null,
        el('span', {}, s?.seen ? `正解すると${days}日後にまた出ます` : 'はじめての単語です'),
      ),
    );
    card.setAttribute('aria-label', `問題：${prompt}`);
  }

  function paintAnswer() {
    const shown = direction === 'term' ? word.term : word.meaning;
    const answer = direction === 'term' ? word.meaning : word.term;
    const similar = similarWords(word, store.words('all'));
    card.replaceChildren(
      tintLayer(),
      el('div', { class: 'scard-top' }, el('span', { class: `tag ${confidence === 'high' ? 'tag-ok' : confidence === 'low' ? 'tag-ng' : 'tag-mid'}` }, { high: '自信アリ', mid: 'まあまあ', low: '自信なし' }[confidence])),
      el(
        'div',
        { class: 'scard-body' },
        el('p', { class: `ans-word${isJapanese(shown) ? ' is-jp' : ''}` }, shown),
        el('hr', { class: 'ans-rule' }),
        el('p', { class: `ans-meaning${direction === 'meaning' ? ' is-word' : ''}${lengthClass(answer)}` }, answer),
        direction === 'meaning' && speakBtn(),
        word.example && el('p', { class: 'ans-example' }, highlightTerm(word.example, word.term)),
        word.note && el('p', { class: 'ans-note' }, word.note),
        similar.length > 0 &&
          el(
            'details',
            { class: 'similar' },
            el('summary', {}, `つづりが似た単語 ${similar.length}`),
            el('ul', {}, similar.map((w) => el('li', {}, el('b', {}, w.term), w.meaning))),
          ),
      ),
      el(
        'div',
        { class: 'ans-actions' },
        el('button', { type: 'button', onclick: () => openWordSheet(store, { wordId: word.id, focus: 'note', onChange: refreshAnswer }) }, word.note ? '✎ メモ' : '＋ メモ'),
        el('button', { type: 'button', onclick: () => openWordSheet(store, { wordId: word.id, onChange: refreshAnswer }) }, '✎ 編集'),
      ),
    );
    card.setAttribute('aria-label', `答え：${answer}`);
  }

  function refreshAnswer() {
    word = store.word(word.id) || word;
    if (phase === 'a') paintAnswer();
  }

  function onConfidence(dir) {
    confidence = CONF_OF[dir];
    ms = startedAt == null ? performance.now() - t0 : startedAt - t0;
    phase = 'a';
    tint(null, 0);
    paintAnswer();
    swiper.setDirections(['right', 'left']);
    card.style.touchAction = 'pan-y'; // 答えの面は縦にスクロールできるように
    paintButtons();
    vibrate(6);
    if (!settings.coachA) showCoach('a');
    else if (settings.autoSpeak && direction === 'meaning') speak(word.term);
  }

  function onJudge(dir) {
    const correct = dir === 'right';
    const snap = session.snapshot();
    const token = store.record(word.id, { correct, confidence, ms: Math.round(ms) });
    const { requeued } = session.answer(correct, { confident: confidence !== 'low' && token.next.weak !== 'slow' });
    history.push({ token, snap });
    vibrate(correct ? 8 : 22);
    const note = noteFor(token, requeued);
    next();
    if (note) flash(note);
  }

  function noteFor({ prev, next: s }, requeued) {
    if (!s.hist.endsWith('1')) return requeued ? '5枚あとにもう一度出します' : null;
    if (s.known && !prev?.seen) return `もう知っている単語 → ${KNOWN_DAYS}日後に確認`;
    if (s.weak === 'slow' && prev?.weak !== 'slow') return `答えるのに${(s.ms / 1000).toFixed(1)}秒 → 苦手に追加`;
    if (prev?.weak && !s.weak) return '苦手から卒業！';
    return null;
  }

  function flash(text) {
    clearTimeout(noteTimer);
    const note = el('p', { class: 'flash-note', role: 'status' }, text);
    stage.append(note);
    noteTimer = setTimeout(() => note.remove(), 1800);
  }

  function undo() {
    const last = history.pop();
    if (!last) return;
    store.undo(last.token);
    session.restore(last.snap);
    next();
    flash('1つ前に戻しました');
  }

  function act(dir) {
    if (coachOpen || !swiper || swiper.busy) return;
    markStart();
    swiper.fling(dir, { away: phase === 'a' });
  }

  function paintButtons() {
    if (!settings.showButtons) return;
    const b = (dir, cls, icon, label) => el('button', { class: `judge ${cls}`, type: 'button', onclick: () => act(dir) }, el('span', { html: icon }), label);
    buttons.replaceChildren(
      ...(phase === 'q'
        ? [b('left', 'judge-ng', icons.x, '自信なし'), b('down', 'judge-mid', icons.arrowDown, 'まあまあ'), b('right', 'judge-ok', icons.check, '自信アリ')]
        : [b('left', 'judge-ng', icons.x, '間違っていた'), b('right', 'judge-ok', icons.check, '合っていた')]),
    );
  }

  function showCoach(which) {
    coachOpen = true;
    const item = (icon, text, cls = '') => el('div', { class: cls }, el('span', { html: icon }), text);
    const overlay = el(
      'div',
      { class: 'coach', role: 'dialog', 'aria-label': '操作の説明' },
      which === 'q'
        ? [
            el('p', { class: 'coach-text' }, 'まずは答えを', el('br'), '思い浮かべましょう'),
            el('p', { class: 'onboard-lead' }, '思い浮かべたら、合っている自信をスワイプ'),
            el(
              'div',
              { class: 'coach-map' },
              item(icons.arrowLeft, '自信なし'),
              item(icons.arrowRight, '自信アリ'),
              item(icons.arrowDown, 'まあまあ', 'full'),
            ),
          ]
        : [
            el('p', { class: 'coach-text' }, '思い浮かべた答えは', el('br'), '合っていましたか？'),
            el('div', { class: 'coach-map' }, item(icons.arrowLeft, '間違っていた'), item(icons.arrowRight, '合っていた')),
            el('p', { class: 'onboard-lead' }, '間違えた単語は5枚あとにもう一度出ます。答えるのに2秒以上かかった単語は「苦手」に入ります。'),
          ],
      el('p', { class: 'coach-tap' }, 'タップして続ける'),
    );
    const close = () => {
      overlay.remove();
      coachOpen = false;
      store.setSetting(which === 'q' ? 'coachQ' : 'coachA', true);
      if (which === 'q') t0 = performance.now();
    };
    overlay.addEventListener('click', close);
    stage.append(overlay);
  }

  function onKey(e) {
    if (e.target.closest?.('input, textarea, select, dialog')) return;
    if (coachOpen && (e.key === 'Enter' || e.key === ' ')) {
      stage.querySelector('.coach')?.click();
      e.preventDefault();
      return;
    }
    const map = { ArrowRight: 'right', ArrowLeft: 'left', ArrowDown: 'down' };
    const dir = map[e.key];
    if (!dir || (dir === 'down' && phase === 'a')) return;
    e.preventDefault();
    act(dir);
  }
  document.addEventListener('keydown', onKey);

  next();

  return {
    el: el('section', { class: 'study', 'aria-label': 'スワイプで学習' }, header.el, stage, buttons),
    cleanup: () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(noteTimer);
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* 読み上げ非対応 */
      }
    },
  };
}
