// カードを指ではじく操作（右・左・下）。
// ・onStart：指が触れた瞬間（答え始めた時間を測るのに使う）
// ・onDrag(dir, progress)：はじいている途中（色の重なりを出す）
// ・onSwipe(dir)：はじき終えたとき
// fling(dir, { away }) で、ボタンやキーボードからも同じ動きを出せる。

export function makeSwipeable(card, { onStart, onDrag, onSwipe, onTap, directions = ['left', 'right'], threshold = 80 }) {
  let allowed = [...directions];
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dy = 0;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let vx = 0;
  let vy = 0;
  let moved = false;
  let busy = false;
  let commitMode = () => true; // 指で確定したとき、カードを飛ばすか（true）その場に戻すか

  function directionOf(x, y) {
    if (allowed.includes('down') && y > 0 && y > Math.abs(x) * 1.1) return 'down';
    if (x > 0 && allowed.includes('right')) return 'right';
    if (x < 0 && allowed.includes('left')) return 'left';
    return null;
  }

  function progressOf(dir, x, y) {
    if (!dir) return 0;
    return Math.min(1, Math.abs(dir === 'down' ? y : x) / threshold);
  }

  function reset() {
    card.style.transition = 'transform 0.25s cubic-bezier(.2,.8,.3,1.15)';
    card.style.transform = '';
    onDrag?.(null, 0);
  }

  /** away: true でカードを画面外へ飛ばす／false で少し動いて戻る */
  function fling(dir, { away = true } = {}) {
    if (busy || !allowed.includes(dir)) return;
    busy = true;
    onDrag?.(dir, 1);
    const w = Math.max(window.innerWidth, 400);
    const h = Math.max(window.innerHeight, 600);
    const out = { right: [w * 1.1, dy * 0.3, 18], left: [-w * 1.1, dy * 0.3, -18], down: [0, h, 0] }[dir];
    const nudge = { right: [36, 0, 3], left: [-36, 0, -3], down: [0, 36, 0] }[dir];
    const [x, y, r] = away ? out : nudge;
    card.style.transition = away ? 'transform 0.3s ease-in, opacity 0.3s ease-in' : 'transform 0.16s ease-out';
    card.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg)`;
    if (away) card.style.opacity = '0';
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (!away) {
        card.style.transition = 'transform 0.18s ease-out';
        card.style.transform = '';
      }
      busy = false;
      onSwipe(dir);
    };
    setTimeout(finish, away ? 300 : 170);
  }

  card.addEventListener('pointerdown', (e) => {
    if (busy || pointerId !== null || e.button > 0) return;
    if (e.target.closest('button, a, input, summary, details')) return;
    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    dx = dy = vx = vy = 0;
    moved = false;
    card.style.transition = 'none';
    onStart?.();
    try {
      card.setPointerCapture(pointerId);
    } catch {
      /* 古いブラウザ */
    }
  });

  card.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    dx = e.clientX - startX;
    dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) > 8) moved = true;
    const dt = e.timeStamp - lastT;
    if (dt > 0) {
      vx = (e.clientX - lastX) / dt;
      vy = (e.clientY - lastY) / dt;
    }
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = e.timeStamp;
    if (!moved) return;
    const dir = directionOf(dx, dy);
    const ty = allowed.includes('down') ? Math.max(0, dy) * (dir === 'down' ? 1 : 0.25) : dy * 0.2;
    card.style.transform = `translate(${dir === 'down' ? dx * 0.3 : dx}px, ${ty}px) rotate(${dir === 'down' ? 0 : dx / 20}deg)`;
    onDrag?.(dir, progressOf(dir, dx, dy));
  });

  const end = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!moved) {
      reset();
      if (e.type === 'pointerup') onTap?.();
      return;
    }
    const dir = directionOf(dx, dy);
    const v = dir === 'down' ? vy : dir === 'right' ? vx : -vx;
    const far = progressOf(dir, dx, dy) >= 1;
    const quick = v > 0.55 && Math.abs(dir === 'down' ? dy : dx) > 36;
    if (dir && (far || quick)) fling(dir, { away: commitMode(dir) });
    else reset();
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);

  return {
    fling,
    setDirections(list) {
      allowed = [...list];
    },
    setCommitMode(fn) {
      commitMode = fn;
    },
    get busy() {
      return busy;
    },
  };
}
