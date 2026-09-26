// 4択クイズ

import { el, vibrate } from '../util.js';
import { icons } from '../icons.js';
import { buildQuestion, pickDirection } from '../quiz.js';
import { canSpeak, speak } from '../speech.js';
import { status } from '../srs.js';
import { confirmExit, isJapanese, lengthClass, quizPool, sessionTitle, studyHeader } from './common.js';

export function render(ctx) {
  const { store, go, params } = ctx;
  const { session, before, opts } = params;
  if (!session) {
    queueMicrotask(() => go('home'));
    return { el: el('div') };
  }
  const settings = store.settings;
  const pool = quizPool(store, opts.deck);
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
  const cardSlot = el('div');
  const choices = el('ol', { class: 'choices', 'aria-label': '選択肢' });
  const foot = el('div', { class: 'quiz-foot' });
  const feedback = el('div', { class: 'feedback', hidden: true, role: 'status' });

  let q = null;
  let word = null;
  let answered = false;
  let advanceTimer = null;

  function next() {
    if (q && !answered) return; // 二重に「次へ」が押されても1問だけ進める
    clearTimeout(advanceTimer);
    while (!session.done && !store.word(session.current)) session.answer(true);
    header.update(session);
    header.setUndo(history.length > 0);
    if (session.done) {
      go('clear', finishParams());
      return;
    }
    word = store.word(session.current);
    const direction = pickDirection(settings.direction);
    q = buildQuestion(word, pool, { direction, confusions: store.state(word.id)?.conf || {} });
    answered = false;
    const st = status(store.state(word.id));

    cardSlot.replaceChildren(
      el(
        'div',
        { class: 'qcard' },
        canSpeak() && direction === 'term' && el('button', { class: 'speak-mini', type: 'button', 'aria-label': '発音を聞く', html: icons.speaker, onclick: () => speak(word.term) }),
        el('p', { class: 'q-ask' }, direction === 'term' ? 'この単語の意味は？' : 'この意味の単語は？'),
        el('p', { class: `q-prompt${isJapanese(q.prompt) ? ' is-jp' : ''}${lengthClass(q.prompt)}` }, q.prompt),
        session.isRetry ? el('span', { class: 'tag tag-ng' }, 'もう一度') : st === 'new' ? el('span', { class: 'tag tag-accent' }, 'はじめて') : st === 'weak' ? el('span', { class: 'tag tag-ng' }, '苦手') : null,
      ),
    );
    choices.replaceChildren(
      ...q.options.map((opt, i) =>
        el(
          'li',
          {},
          el(
            'button',
            { class: 'opt', type: 'button', onclick: () => answer(i) },
            el('span', { class: 'opt-key' }, String(i + 1)),
            el('span', { class: 'opt-text' }, opt.text),
          ),
        ),
      ),
    );
    foot.replaceChildren(el('button', { class: 'link-btn', type: 'button', onclick: () => answer(-1) }, 'わからない'));
    foot.hidden = false;
    feedback.hidden = true;
    if (settings.autoSpeak && direction === 'term') speak(word.term);
  }

  function answer(index) {
    if (answered) return;
    answered = true;
    const correct = index === q.correctIndex;
    const chosen = index >= 0 ? q.options[index] : null;
    const snap = session.snapshot();
    // 選択肢を読む時間があるので、4択では瞬発力は問わない
    const token = store.record(word.id, { correct, confidence: index < 0 ? 'low' : 'mid', ms: null, confusedWith: !correct && chosen ? chosen.id : null });
    const { requeued } = session.answer(correct);
    history.push({ token, snap });
    header.update(session);
    header.setUndo(true);
    vibrate(correct ? 8 : 22);

    [...choices.querySelectorAll('.opt')].forEach((button, i) => {
      button.disabled = true;
      if (i === q.correctIndex) {
        button.classList.add('is-correct');
        button.append(el('span', { class: 'opt-mark', html: icons.check }));
      } else if (i === index) {
        button.classList.add('is-wrong');
        button.append(el('span', { class: 'opt-mark', html: icons.x }));
        const other = store.word(q.options[i].id);
        if (other) button.querySelector('.opt-text').append(el('span', { class: 'opt-sub' }, q.direction === 'term' ? `＝ ${other.term} の意味` : `＝ ${other.meaning}`));
      } else button.classList.add('is-dim');
    });

    foot.hidden = true;
    if (correct && settings.autoAdvance) {
      advanceTimer = setTimeout(next, 750);
      return;
    }
    feedback.dataset.tone = correct ? 'ok' : 'ng';
    feedback.replaceChildren(
      el('p', { class: 'feedback-title' }, el('span', { html: correct ? icons.check : icons.x }), correct ? '正解！' : index < 0 ? 'わからなかった単語' : '不正解'),
      el(
        'div',
        { class: 'feedback-body' },
        el('p', {}, el('b', {}, word.term), ' … ', word.meaning),
        word.example && el('p', { class: 'muted' }, word.example),
        requeued && el('p', { class: 'small muted' }, 'この単語は5問あとにもう一度出します。'),
      ),
      el('button', { class: 'btn btn-dark btn-block', type: 'button', onclick: next }, '次へ', el('span', { html: icons.chevron })),
    );
    feedback.hidden = false;
    feedback.querySelector('.btn')?.focus({ preventScroll: true });
    feedback.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  function undo() {
    const last = history.pop();
    if (!last) return;
    clearTimeout(advanceTimer);
    store.undo(last.token);
    session.restore(last.snap);
    answered = true; // next() のガードを通す
    next();
  }

  function onKey(e) {
    if (e.target.closest?.('input, textarea, select, dialog')) return;
    if (e.target.closest?.('button') && (e.key === 'Enter' || e.key === ' ')) return;
    if (!answered && /^[1-4]$/.test(e.key) && Number(e.key) <= q.options.length) answer(Number(e.key) - 1);
    else if (answered && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) next();
    else return;
    e.preventDefault();
  }
  document.addEventListener('keydown', onKey);

  next();

  return {
    el: el('section', { class: 'study study-quiz', 'aria-label': '4択クイズ' }, header.el, cardSlot, choices, foot, feedback),
    cleanup: () => {
      clearTimeout(advanceTimer);
      document.removeEventListener('keydown', onKey);
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* 読み上げ非対応 */
      }
    },
  };
}
