// 学習セッションの進行。
// ・間違えた単語は5枚あとにもう一度出し、正解するまでくり返す（最大3回）。
// ・スキミングでは、自信のなかった正解を最後にもう一周させる。
// ・1つ前に戻せるように、状態をまるごと写し取れる。

export class Session {
  constructor(ids, { requeueGap = 5, maxRepeats = 3, secondLap = false } = {}) {
    this.queue = [...new Set(ids)];
    this.pos = 0;
    this.total = this.queue.length;
    this.requeueGap = requeueGap;
    this.maxRepeats = maxRepeats;
    this.secondLap = secondLap;
    this.lap2 = [];
    this.lap2Added = false;
    this.results = new Map(); // id → { attempts, misses, cleared, firstCorrect }
    this.log = []; // { id, correct }
  }

  get current() {
    return this.queue[this.pos] ?? null;
  }

  get done() {
    return this.pos >= this.queue.length;
  }

  /** 今のカードが同じセッション内の出し直しか */
  get isRetry() {
    return this.results.has(this.current);
  }

  get cleared() {
    let n = 0;
    for (const r of this.results.values()) if (r.cleared) n += 1;
    return n;
  }

  answer(correct, { confident = true } = {}) {
    const id = this.current;
    if (id == null) return { requeued: false };
    const r = this.results.get(id) ?? { attempts: 0, misses: 0, cleared: false, firstCorrect: null };
    const firstAttempt = r.attempts === 0;
    r.attempts += 1;
    if (r.firstCorrect === null) r.firstCorrect = correct;
    let requeued = false;
    if (correct) {
      r.cleared = true;
      if (this.secondLap && firstAttempt && !confident) this.lap2.push(id);
    } else {
      r.misses += 1;
      if (r.misses <= this.maxRepeats) {
        const at = Math.min(this.pos + 1 + this.requeueGap, this.queue.length);
        this.queue.splice(at, 0, id);
        requeued = true;
      } else r.cleared = true;
    }
    this.results.set(id, r);
    this.log.push({ id, correct });
    this.pos += 1;
    if (this.done && this.secondLap && !this.lap2Added && this.lap2.length) {
      this.lap2Added = true;
      this.queue.push(...this.lap2);
    }
    return { requeued };
  }

  snapshot() {
    return {
      queue: [...this.queue],
      pos: this.pos,
      lap2: [...this.lap2],
      lap2Added: this.lap2Added,
      results: [...this.results.entries()].map(([id, r]) => [id, { ...r }]),
      log: this.log.map((l) => ({ ...l })),
    };
  }

  restore(snap) {
    this.queue = [...snap.queue];
    this.pos = snap.pos;
    this.lap2 = [...snap.lap2];
    this.lap2Added = snap.lap2Added;
    this.results = new Map(snap.results.map(([id, r]) => [id, { ...r }]));
    this.log = snap.log.map((l) => ({ ...l }));
  }

  summary() {
    const entries = [...this.results.entries()];
    const firstTry = entries.filter(([, r]) => r.firstCorrect).length;
    const missed = entries
      .filter(([, r]) => r.misses > 0)
      .sort((a, b) => b[1].misses - a[1].misses)
      .map(([id, r]) => ({ id, misses: r.misses, recovered: r.cleared && r.attempts > r.misses }));
    return {
      ids: entries.map(([id]) => id),
      total: entries.length,
      firstTry,
      accuracy: entries.length ? firstTry / entries.length : 0,
      answers: this.log.length,
      missed,
    };
  }
}
