/* 試合の進行：ラウンド・相手の予告・ガード/カウンター・ダウン・判定 */
window.CBP = window.CBP || {};

CBP.Fight = class {
  constructor(dom, { onEnd } = {}) {
    this.dom = dom; this.onEnd = onEnd;
    this.board = new CBP.Board(dom.board, {
      onChain: (r) => this.onChain(r),
      onLink: (n) => { if (n > 1) CBP.Sound.link(n); },
      onCancel: () => CBP.Sound.cancel(),
    });
    this.raf = null; this.jobs = []; this.paused = false;
    this.ringW = 0;
    this.freeze = 0;
    this.skill = { g: 0, on: 0 };
    this.autoSkill = false; this.autoT = 0; // オプション：満タンで自動発動（main.js が切り替える）
    this.hitstop = null; // ダウンの瞬間のストップモーション
    this.iv = null;      // ラウンドの間のインターバル
    dom.skill.addEventListener('click', () => this.useSkill());
    dom.interval.querySelector('.iv-next').addEventListener('click', () => this.nextRound());
  }

  /* ================= 開始・終了 ================= */
  async start(pId, eId, diffKey, view = 'side') {
    this.stop();
    const generation = this.generation;
    const R = CBP.RULES;
    this.pov = view === 'pov';
    this.povHave = new Set();
    this.dom.ring.classList.toggle('is-pov', this.pov);
    this.dom.gloves.hidden = !this.pov;
    this.dom.povNote.hidden = true;
    this.diff = CBP.DIFFICULTY[diffKey] || CBP.DIFFICULTY.normal;
    this.p = this.side(pId, 'p'); this.e = this.side(eId, 'e');
    this.round = 1; this.time = R.roundSeconds; this.phase = 'intro';
    this.now = 0; this.jobs = []; this.paused = false;
    this.tele = null; this.recover = null; this.flags = {};
    this.combo = { n: 0, at: -99 };
    this.skill = { g: 0, on: 0 }; this.freeze = 0; this.autoT = 0;
    this.endSkill(true);
    this.dom.cutin.hidden = true;
    this.hitstop = null; this.iv = null;
    this.dom.interval.hidden = true;
    this.dom.stopfx.hidden = true;
    this.dom.ring.classList.remove('is-stop');
    this.dom.fp.classList.remove('is-stopped'); this.dom.fe.classList.remove('is-stopped');
    this.dom.fx.querySelectorAll('.mouthpiece').forEach((el) => el.remove()); // 止まったまま残ったもの
    this.queue = [this.pickType(), this.pickType()];
    this.cpuTimer = 2.2;
    this.dom.root.classList.remove('is-over');
    this.setupHud();
    await this.preload();
    if (generation !== this.generation) return; // 中止・別試合開始後の古い画像loadを無効化
    if (this.pov) {
      this.dom.gloves.dataset.state = 'guard';
      this.dom.gloves.querySelectorAll('.glove').forEach((g) => { g.innerHTML = CBP.gloveSVG(this.p.c.glove); });
      this.dom.povNote.hidden = this.povHave.size > 0;
    }
    this.setPose(this.p, 'guard'); this.setPose(this.e, 'guard');
    this.board.setBias(null); this.board.reset(); this.board.setLocked(true);
    this.strip('intro');
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.tick(t));
    this.intro();
  }

  stop() {
    this.generation = (this.generation || 0) + 1;
    this.board.cancelPending?.();
    this.board.setLocked(true);
    this.phase = 'idle'; this.paused = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null; this.jobs = [];
    clearTimeout(this.bannerTimer);
    for (const s of [this.p, this.e]) if (s) { clearTimeout(s.poseTimer); clearTimeout(s.sayTimer); }
  }

  side(id, key) {
    const c = CBP.charById(id);
    const el = key === 'p' ? this.dom.fp : this.dom.fe;
    const hud = key === 'p' ? this.dom.hudP : this.dom.hudE;
    const maxHp = c.stats?.hp || CBP.RULES.maxHp;
    return { key, c, el, img: el.querySelector('img'), hud, hp: maxHp, maxHp, downs: 0,
      dealt: 0, counters: 0, guards: 0, maxChain: 0, yandere: 0, angry: false, pose: 'guard', poseTimer: null };
  }

  preload() {
    const IMAGE_TIMEOUT_MS = 6000;
    const load = src => new Promise(resolve => {
      const img = new Image(); let done = false;
      const finish = ok => {
        if (done) return;
        done = true; clearTimeout(timer);
        img.onload = img.onerror = null;
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), IMAGE_TIMEOUT_MS);
      img.onload = () => finish(true); img.onerror = () => finish(false); img.src = src;
    });
    const jobs = [];
    const povHave = this.povHave;
    for (const s of [this.p, this.e]) {
      if (this.cornerOk(s.c)) jobs.push(CBP.probeSpecial(s.c.id, 'corner'));
      jobs.push(CBP.probeSpecial(s.c.id, 'koBig'));
      const poses = [...Object.keys(CBP.POSE_FILES), ...Object.keys(CBP.REST_FILES).filter((k) => CBP.hasRest(s.c.id, k)),
        ...(CBP.hasBodyDown(s.c.id) ? Object.keys(CBP.BODY_DOWN_FILES) : [])];
      for (const pose of poses) {
        jobs.push(load(CBP.spritePath(s.c.id, pose)));
      }
    }
    if (this.pov) { // 正面の絵があるポーズだけ使う（ないポーズは横向きで代用）
      const have = CBP.povAvailable(this.e.c.id);
      for (const pose of have) {
        jobs.push(load(CBP.povPath(this.e.c.id, pose)).then(ok => { if (ok) povHave.add(pose); }));
      }
    }
    return Promise.all(jobs);
  }

  after(sec, fn) { this.jobs.push({ at: this.now + sec, fn }); }

  intro() {
    CBP.Sound.bell(1);
    this.banner('ROUND 1', 'round', 1.3);
    let t = 1.0;
    for (const s of [this.p, this.e]) {
      if (s.c.lines.intro) { const line = s.c.lines.intro; this.after(t, () => this.say(s, line, 2.2)); t += 0.9; }
    }
    this.after(Math.max(1.6, t + 0.4), () => this.fightStart());
  }

  fightStart() {
    this.phase = 'fight';
    this.banner('FIGHT!', 'fight', 0.9);
    this.board.setLocked(false);
    this.strip('idle');
  }

  /* ================= メインループ ================= */
  tick(ts) {
    const dt = Math.min(0.05, (ts - this.last) / 1000); this.last = ts;
    if (!this.paused && this.hitstop) { // ダウンの瞬間のストップモーション中は試合を止める
      this.tickStop(dt);
    } else if (!this.paused && this.freeze > 0) { // カットイン中は試合を止める
      this.freeze -= dt;
      if (this.freeze <= 0) { this.freeze = 0; this.startSkill(); }
    } else if (!this.paused) {
      this.now += dt;
      this.update(dt);
      const due = this.jobs.filter((j) => j.at <= this.now);
      this.jobs = this.jobs.filter((j) => j.at > this.now);
      for (const j of due) j.fn();
    }
    this.renderHud();
    this.renderSkill();
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  update(dt) {
    for (const s of [this.p, this.e]) if (s.yandere > 0) {
      s.yandere -= dt;
      if (s.yandere <= 0) { s.yandere = 0; s.el.classList.remove('is-yandere'); }
    }
    if (this.phase === 'interval') {
      this.iv.left -= dt;
      if (this.iv.left <= 0) this.nextRound(); else this.renderInterval();
      return;
    }
    if (this.phase !== 'fight') return;
    if (this.skill.on > 0) { this.skill.on -= dt; if (this.skill.on <= 0) this.endSkill(); }
    // 自動発動：満タンになって少し待ってから。なぞっている途中・消している途中は数えない（なぞりを途中で切らない）
    if (this.autoSkill && this.canSkill()) {
      if (this.board.pointerId === null && !this.board.busy) this.autoT += dt;
      if (this.autoT >= CBP.SKILL.autoDelay) { this.autoT = 0; this.useSkill(); }
    } else this.autoT = 0;
    this.time -= dt;
    if (this.time <= 0) { this.time = 0; this.endRound(); return; }
    if (this.tele) {
      this.tele.left -= dt;
      this.renderTele();
      if (this.tele.left <= 0) this.resolveIncoming();
    } else {
      this.cpuTimer -= dt;
      if (this.cpuTimer <= 0) this.startTele();
      // コンボ表示が切れたら帯を描き直す
      const comboOn = this.combo.n > 1 && this.now - this.combo.at <= 1.5;
      if (this.stripMode === 'idle' && comboOn !== this.comboOn) { this.comboOn = comboOn; this.renderStrip(); }
    }
    this.checkMidFight();
  }

  /* ================= 相手の攻撃（予告） ================= */
  pickType() {
    const w = { ...this.e.c.cpu.weights };
    let sum = 0; for (const k in w) sum += w[k];
    let x = Math.random() * sum;
    for (const k in w) { x -= w[k]; if (x <= 0) return k; }
    return 'jab';
  }

  cpuPower() {
    const id = this.e.c.id;
    let m = this.diff.power * this.e.c.cpu.power;
    if (id === 'yuki') m *= 1 + 0.12 * (this.round - 1);
    if (id === 'chiko' && this.round === 1) m *= 1.2;
    if (this.e.yandere > 0) m *= 1.5;
    if (this.e.angry) m *= 1.25;
    return m;
  }

  nextInterval() {
    const id = this.e.c.id;
    let t = this.diff.interval * this.e.c.cpu.interval;
    if (id === 'pink' && this.p.hp < this.p.maxHp * 0.4) t *= 0.7;
    if (id === 'chiko' && this.round === 1) t *= 0.8;
    if (this.e.yandere > 0) t *= 0.6;
    return t * (0.8 + Math.random() * 0.4);
  }

  counterNeed(t = this.tele) {
    const ratio = this.skillOn() && this.p.c.skill.charge === 'counter' ? CBP.SKILL.counterRatio : CBP.RULES.counterRatio;
    return Math.ceil(t.req * ratio);
  }

  startTele() {
    const type = this.queue.shift(); this.queue.push(this.pickType());
    const dur = this.diff.windup;
    this.tele = { type, req: CBP.PUNCHES[type].req, dur, left: dur, got: 0, guardShown: false };
    this.board.setBias(type);
    this.e.el.classList.add('is-windup');
    if (this.pov) this.setPose(this.e, 'windup');
    CBP.Sound.warn();
    this.showTele();
    this.strip('tele');
  }

  clearTele() {
    this.tele = null;
    this.board.setBias(null);
    this.e.el.classList.remove('is-windup');
    this.dom.tele.hidden = true;
    if (this.e.pose === 'windup') this.setPose(this.e, this.idlePose(this.e));
  }

  resolveIncoming() {
    const t = this.tele; this.clearTele();
    let base = CBP.PUNCHES[t.type].cpu * this.cpuPower();
    if (t.type === this.e.c.fav) base *= CBP.SKILL.favMult;
    const weak = t.type === this.p.c.weak;
    if (weak) base *= CBP.SKILL.weakMult;
    this.attackAnim(this.e, t.type);
    if (t.got >= t.req) {
      this.setPose(this.p, 'block', 0.55);
      this.pulse(this.p.el, 'is-block');
      if (this.pov) this.pulse(this.dom.gloves, 'is-blocked');
      this.p.guards++;
      CBP.Sound.guard();
      this.floatText(this.p, 'GUARD', 'guard');
      if (this.p.c.skill.charge === 'counter') this.charge(CBP.SKILL.guard);
    } else {
      const dmg = base * (1 - CBP.RULES.partialBlock * Math.min(1, t.got / t.req));
      this.hitAnim(this.p, t.type, dmg >= 12);
      this.damage(this.p, dmg);
      if (weak) this.floatText(this.p, '苦手…', 'weak');
    }
    this.cpuTimer = this.nextInterval();
    if (this.phase === 'fight') this.strip('idle');
  }

  /* ================= 自分の操作 ================= */
  onChain({ type, count }) {
    this.p.maxChain = Math.max(this.p.maxChain, count);
    if (this.phase === 'pdown' && this.recover) {
      this.recover.got += count;
      CBP.Sound.link(count);
      this.renderStrip();
      if (this.recover.got >= this.recover.need) this.stand(this.p);
      return;
    }
    if (this.phase !== 'fight') return;
    const pc = this.p.c;
    if (pc.skill.charge === 'fav' && type === pc.fav) this.charge(count * CBP.SKILL.perIcon);
    const any = this.skillOn() && pc.skill.charge === 'counter'; // 椿・チコのスキル中はどのパンチでも返せる
    if (this.tele && (type === this.tele.type || any)) {
      this.tele.got += count;
      CBP.Sound.guard();
      if (this.tele.got >= this.counterNeed()) { this.doCounter(type); return; }
      if (this.tele.got >= this.tele.req && !this.tele.guardShown) {
        this.tele.guardShown = true;
        this.floatText(this.p, 'ガードOK', 'guard');
      }
      this.renderStrip();
      return;
    }
    this.playerAttack(type, count);
  }

  /* 自分の攻撃の倍率：得意パンチ・相手の苦手パンチ・スキル */
  playerPower(type) {
    const p = this.p, e = this.e, R = CBP.RULES, S = CBP.SKILL;
    let m = p.c.stats?.power || 1;
    if (type === p.c.fav) m *= S.favMult;
    if (type === e.c.weak) m *= S.weakMult;
    if (this.skillOn()) {
      switch (p.c.id) {
        case 'yuki': if (type === 'straight') m *= 1.2 + S.yukiMax * (1 - p.hp / p.maxHp); break;
        case 'pink': if (e.hp <= e.maxHp * S.pinkHp) m *= S.pinkMult; break;
        case 'tsubaki': if (type === 'straight') m *= S.boost; break;
        case 'chiko': if (type === 'body') m *= S.boost; break;
        default: break;
      }
      // skillType：自作キャラと、型でスキルを決めたキャラ（投票企画の4人とかなみ）。型のない既存6人には付いていない
      if (['power', 'counter'].includes(p.c.skillType) && type === p.c.fav) m *= S.boost;
    }
    if (p.yandere > 0) m *= 1.6;
    if (p.angry) m *= 1.25;
    return m;
  }

  playerAttack(type, count) {
    const p = this.p, e = this.e;
    this.combo.n = this.now - this.combo.at <= 1.5 ? this.combo.n + 1 : 1;
    this.combo.at = this.now;
    const comboMult = 1 + Math.min(0.3, 0.06 * (this.combo.n - 1));

    if (e.c.id === 'tsubaki' && count < 5 && Math.random() < 0.2) { // 椿の見切り
      this.attackAnim(p, type);
      this.setPose(e, 'block', 0.5);
      this.floatText(e, '見切り', 'guard');
      CBP.Sound.guard();
      this.renderStrip();
      return;
    }

    const dmg = CBP.PUNCHES[type].atk * (1 + 0.5 * (count - 3)) * comboMult * this.playerPower(type);
    const big = count >= 7 || dmg >= 10;
    if (count >= 7) this.banner('ラッシュ！', 'special', 0.8);
    this.attackAnim(p, type);
    this.hitAnim(e, type, big);
    this.damage(e, dmg);
    if (type === e.c.weak) this.floatText(e, '苦手！', 'weak');
    this.renderStrip();
  }

  doCounter(type) {
    const t = this.tele; this.clearTele();
    const back = type || t.type; // 返すパンチ（ふつうは来たパンチと同じ。椿・チコのスキル中は好きなパンチ）
    const dmg = CBP.PUNCHES[t.type].cpu * 1.6 * this.playerPower(back);
    if (this.p.c.lines.counter) this.say(this.p, this.p.c.lines.counter, 2);
    this.p.counters++;
    if (this.p.c.skill.charge === 'counter') this.charge(CBP.SKILL.counter);
    this.banner('COUNTER!', 'counter', 1.0);
    CBP.Sound.counter();
    this.attackAnim(this.p, back);
    this.hitAnim(this.e, back, true);
    this.damage(this.e, dmg);
    if (back === this.e.c.weak) this.floatText(this.e, '苦手！', 'weak');
    this.cpuTimer = this.nextInterval() + 1.0;
    if (this.phase === 'fight') this.strip('idle');
  }

  /* ================= スキル ================= */
  skillOn() { return this.skill.on > 0; }

  charge(amount) {
    if (this.skillOn() || this.freeze > 0) return; // 発動中はたまらない
    const S = CBP.SKILL, before = this.skill.g;
    this.skill.g = Math.min(S.max, this.skill.g + amount);
    if (before < S.max && this.skill.g >= S.max) { CBP.Sound.skillFull(); this.pulse(this.dom.skill, 'is-full'); }
  }

  canSkill() {
    return this.phase === 'fight' && !this.paused && this.freeze <= 0 && !this.skillOn() && this.skill.g >= CBP.SKILL.max;
  }

  useSkill() {
    if (!this.canSkill()) return;
    const c = this.p.c;
    this.skill.g = 0;
    this.board.setLocked(true);
    this.freeze = CBP.SKILL.cutin;
    // カットイン（自分の得意パンチのポーズ）
    const pose = c.fav || 'guard';
    const img = this.dom.cutin.querySelector('img');
    CBP.setImage(img, CBP.spritePath(c.id, pose));
    img.style.setProperty('--flip', CBP.sideFacing(c, pose) === 'L' ? -1 : 1);
    this.dom.cutin.querySelector('.cutin-who').textContent = c.nick || c.name;
    this.dom.cutin.querySelector('.cutin-name').textContent = c.skill.name;
    this.dom.cutin.style.setProperty('--theme', c.theme);
    this.dom.cutin.hidden = false;
    this.dom.cutin.classList.remove('is-play'); void this.dom.cutin.offsetWidth; this.dom.cutin.classList.add('is-play');
    CBP.Sound.special(); CBP.Sound.duck(CBP.SKILL.cutin + 0.3);
  }

  startSkill() {
    const S = CBP.SKILL, id = this.p.c.id;
    this.dom.cutin.hidden = true;
    if (this.phase !== 'fight') return;
    this.skill.on = S.duration;
    this.p.el.classList.add('is-skill');
    this.dom.root.classList.add('is-skill-on');
    if (id === 'ren') { this.board.convert('upper', S.renConvert); this.board.skillBias = 'upper'; }
    if (id === 'amane' || this.p.c.skillType === 'rush') this.board.setMinChain(S.amaneChain);
    this.board.setLocked(false);
    this.renderStrip();
  }

  endSkill(silent) {
    this.skill.on = 0;
    if (this.p) this.p.el.classList.remove('is-skill');
    this.dom.root.classList.remove('is-skill-on');
    this.board.skillBias = null;
    this.board.setMinChain(CBP.RULES.minChain);
    if (!silent) this.renderStrip();
  }

  renderSkill() {
    const b = this.dom.skill, S = CBP.SKILL;
    if (!this.p) return;
    const on = this.skillOn();
    const frac = on ? this.skill.on / S.duration : this.skill.g / S.max;
    b.style.setProperty('--g', frac.toFixed(3));
    const ready = !on && this.skill.g >= S.max;
    b.classList.toggle('is-ready', ready);
    b.classList.toggle('is-on', on);
    b.classList.toggle('is-auto', this.autoSkill);
    b.disabled = !this.canSkill();
    const label = on ? `あと${Math.ceil(this.skill.on)}秒` : ready ? (this.autoSkill ? '発動！' : '使う！')
      : `${this.autoSkill ? '自動 ' : ''}${Math.floor(this.skill.g)}%`;
    if (b._label !== label) { b._label = label; b.querySelector('.sk-state').textContent = label; }
  }

  /* ================= 試合中の台詞・ヤンデレ ================= */
  checkMidFight() {
    if (!CBP.RULES.midFightEnabled) return;
    const p = this.p, e = this.e, max = CBP.RULES.maxHp, f = this.flags;
    if (!f.pMidFight) {
      if (p.c.id === 'pink' && e.hp < e.maxHp * 0.4) { f.pMidFight = true; this.sayMidFight(p, e); }
      else if (p.c.id === 'chiko' && p.hp - e.hp >= 25) {
        f.pMidFight = true; this.sayMidFight(p, e);
        e.angry = true; this.banner('相手が怒った！', 'warn', 1.1);
      }
    }
    if (!f.eMidFight) {
      if (e.c.id === 'pink' && p.hp < p.maxHp * 0.4) { f.eMidFight = true; this.sayMidFight(e, p); }
      else if (e.c.id === 'chiko' && e.hp - p.hp >= 25) {
        f.eMidFight = true; this.sayMidFight(e, p);
        p.angry = true; this.banner('反撃のチャンス！', 'special', 1.1);
      }
    }
  }

  sayMidFight(from, to) {
    const lines = from.c.lines.midFight || [];
    if (lines.length) this.say(from, lines[Math.floor(Math.random() * lines.length)], 2.4);
    if (to.c.id === 'yuki' && CBP.RULES.yandere) this.after(0.9, () => this.yandere(to));
  }

  yandere(s) {
    if (this.phase !== 'fight') return;
    s.yandere = 8;
    s.el.classList.add('is-yandere');
    this.banner('ヤンデレモード', 'yandere', 1.3);
    CBP.Sound.special();
    if (!s.yandereSaid) { s.yandereSaid = true; this.say(s, s.c.lines.yandere, 3.2); }
  }

  /* ================= ダメージ・ダウン ================= */
  damage(s, amount, { quiet = false } = {}) {
    const dmg = Math.max(1, Math.round(amount));
    (s === this.p ? this.e : this.p).dealt += Math.min(dmg, s.hp);
    s.hp = Math.max(0, s.hp - dmg);
    if (!quiet) this.floatText(s, `-${dmg}`, 'dmg');
    if (s.hp <= 0 && this.phase === 'fight') this.down(s);
    else if (s.pose === 'guard' || s.pose === 'pinch') this.setPose(s, this.idlePose(s));
  }

  down(s) {
    const R = CBP.RULES;
    const other = s === this.p ? this.e : this.p;
    s.downs++;
    const last = s.downs >= 3;
    this.clearTele();
    this.board.setLocked(true);
    clearTimeout(s.poseTimer); clearTimeout(other.poseTimer); // 打った・打たれたポーズのまま止める
    this.phase = last ? 'ending' : s === this.p ? 'pdown' : 'edown';
    const lh = s.lastHit; // アッパー・フックでダウンしたら、マウスピースが飛ぶ
    const mouth = lh && this.now - lh.at < 0.6 && (lh.type === 'upper' || lh.type === 'hook') ? lh.type : null;
    const body = !!lh && this.now - lh.at < 0.6 && lh.type === 'body'; // ボディでダウンしたら、うずくまる絵
    // ストップモーション：パンチが当たりきったところ（pre 秒後）で画面を止め、hold 秒たってから倒れる
    this.hitstop = { s, other, mouth, body, pre: 0.12, hold: last ? R.downStopLast : R.downStop, held: this.holdPulses(), mp: null };
  }

  /* パンチ・被弾の動き（pulse のクラス）を、ストップモーションのあいだ消さずに残す */
  holdPulses() {
    const held = [];
    for (const el of [this.dom.ring, this.dom.gloves, this.p.el, this.e.el]) {
      for (const k of Object.keys(el)) {
        if (k.startsWith('_t') && el.classList.contains(k.slice(2))) { clearTimeout(el[k]); held.push([el, k.slice(2)]); }
      }
    }
    return held;
  }

  tickStop(dt) {
    const h = this.hitstop;
    if (h.pre > 0) { h.pre -= dt; if (h.pre <= 0) this.stopStart(h); return; }
    h.hold -= dt;
    if (h.hold <= 0) { this.hitstop = null; this.stopEnd(h); }
  }

  stopStart(h) {
    const fx = this.dom.stopfx, self = this.pov && h.s === this.p;
    fx.style.setProperty('--sx', this.pov ? '50%' : h.s.key === 'p' ? '31%' : '69%');
    fx.style.setProperty('--sy', self ? '78%' : this.pov ? '42%' : '52%');
    fx.hidden = false;
    fx.classList.remove('is-play'); void fx.offsetWidth; fx.classList.add('is-play');
    this.dom.ring.classList.add('is-stop');
    h.s.el.classList.add('is-stopped');
    if (h.mouth) h.mp = this.mouthpiece(h.s, h.mouth, true); // 空中で止まったマウスピース
    CBP.Sound.stop(); CBP.Sound.duck(1.6);
  }

  stopEnd(h) {
    const R = CBP.RULES, s = h.s, other = h.other;
    this.dom.stopfx.hidden = true;
    this.dom.ring.classList.remove('is-stop');
    s.el.classList.remove('is-stopped');
    for (const [el, cls] of h.held) el.classList.remove(cls);
    if (h.mp) { h.mp.play(); CBP.Sound.mouthpiece(); }
    this.after(0.35, () => { this.setPose(s, this.downPose(s, h.body)); this.setPose(other, 'guard'); });
    CBP.Sound.down();
    this.banner('DOWN!', 'down', 1.1);
    this.dom.ring.classList.add('is-shake');
    setTimeout(() => this.dom.ring.classList.remove('is-shake'), 400);
    if (this.phase === 'ending') { this.after(1.3, () => this.finish('TKO', other)); return; }
    if (s === this.p) {
      this.recover = { need: R.getUpNeed[s.downs - 1], got: 0, n: 0 };
      this.after(0.6, () => { if (this.phase === 'pdown') this.board.setLocked(false); });
      this.after(R.countStep + 0.4, () => this.countTick());
    } else {
      let chance = R.enemyGetUp[s.downs - 1] + this.diff.getUp;
      if (this.p.c.id === 'pink' && this.skillOn()) chance *= CBP.SKILL.pinkGetUp; // 小悪魔アッパー中のダウン
      const ok = Math.random() < chance;
      this.recover = { n: 0, upAt: ok ? 4 + Math.floor(Math.random() * 5) : 99 };
      this.after(R.enemyCountStep + 0.4, () => this.countTick());
    }
    this.strip(this.phase);
  }

  countTick() {
    const isP = this.phase === 'pdown';
    if (!isP && this.phase !== 'edown') return;
    const r = this.recover; r.n++;
    this.showCount(r.n);
    CBP.Sound.count();
    if (!isP && r.n === r.upAt) { this.after(0.3, () => this.stand(this.e)); return; }
    if (r.n >= 10) {
      this.phase = 'ending'; this.board.setLocked(true);
      this.after(0.6, () => this.finish('KO', isP ? this.e : this.p));
      return;
    }
    this.after(isP ? CBP.RULES.countStep : CBP.RULES.enemyCountStep, () => this.countTick());
  }

  stand(s) {
    if (this.phase !== 'pdown' && this.phase !== 'edown') return;
    const R = CBP.RULES;
    s.hp = (s === this.p ? R.getUpHp : R.enemyGetUpHp)[s.downs - 1];
    this.recover = null;
    this.dom.count.hidden = true;
    this.setPose(s, this.idlePose(s));
    this.phase = 'fight';
    this.cpuTimer = 2.4;
    this.board.setLocked(false);
    this.banner('ファイト！', 'fight', 0.8);
    this.strip('idle');
  }

  /* ================= ラウンド・決着 ================= */
  endRound() {
    const R = CBP.RULES;
    this.phase = 'break';
    this.clearTele();
    this.board.setLocked(true);
    CBP.Sound.bell(1);
    this.banner(`ROUND ${this.round} 終了`, 'round', 1.6);
    this.strip('break');
    if (this.round >= R.rounds) { this.after(2.0, () => this.decision()); return; }
    this.after(1.5, () => this.openInterval());
  }

  /* ラウンドの間：盤面の上にインターバル画面。体力を少し回復して、ここまでの様子とヒントを出す */
  openInterval() {
    const R = CBP.RULES, iv = this.dom.interval;
    this.phase = 'interval';
    const healed = [this.p, this.e].map((s) => {
      const before = s.hp;
      s.hp = Math.min(s.maxHp, s.hp + R.roundRecover);
      if (s.hp > before) this.floatText(s, `+${s.hp - before}`, 'heal');
      this.setPose(s, this.restPose(s));
      return s.hp - before;
    });
    const tips = CBP.TIPS || [];
    const tip = tips.length ? tips[(this.tipAt = ((this.tipAt ?? Math.floor(Math.random() * tips.length)) + 1) % tips.length)] : '';
    const d = this.p.dealt - this.e.dealt;
    const lead = Math.abs(d) < 3 ? 'ほぼ互角' : d > 0 ? `あなたがリード（+${d}）` : `相手がリード（${d}）`;
    const row = (label, a, b) => `<tr><th>${label}</th><td>${a}</td><td>${b}</td></tr>`;
    const hp = (s, h) => `${Math.ceil(s.hp)}${h ? `<small>+${h}</small>` : ''}`;
    iv.querySelector('.iv-round').textContent = `ROUND ${this.round} 終了 → 次は ROUND ${this.round + 1}`;
    iv.querySelector('.iv-table').innerHTML = `
      <thead><tr><th></th><td>あなた</td><td>相手</td></tr></thead>
      <tbody>${row('体力', hp(this.p, healed[0]), hp(this.e, healed[1]))}${row('与えたダメージ', this.p.dealt, this.e.dealt)}${row('ダウン', this.p.downs, this.e.downs)}</tbody>`;
    iv.querySelector('.iv-lead').textContent = `ここまでのポイント：${lead}`;
    iv.querySelector('.iv-tip').textContent = tip;
    iv.querySelector('.iv-tip').hidden = !tip;
    this.iv = { left: R.intervalSeconds, shown: null };
    this.renderInterval();
    iv.hidden = false;
    CBP.Sound.interval();
    CBP.Sound.duckHold(true);
  }

  renderInterval() {
    const sec = Math.max(1, Math.ceil(this.iv.left));
    if (this.iv.shown === sec) return;
    this.iv.shown = sec;
    this.dom.interval.querySelector('.iv-sec').textContent = `あと${sec}秒`;
  }

  nextRound() {
    if (this.phase !== 'interval' || this.paused) return;
    const R = CBP.RULES;
    this.phase = 'break';
    this.iv = null;
    this.dom.interval.hidden = true;
    CBP.Sound.duckHold(false);
    this.round++;
    this.time = R.roundSeconds;
    this.flags = {};
    this.p.angry = false; this.e.angry = false;
    for (const s of [this.p, this.e]) this.setPose(s, this.idlePose(s));
    this.queue = [this.pickType(), this.pickType()];
    CBP.Sound.bell(1);
    this.banner(`ROUND ${this.round}`, 'round', 1.2);
    this.after(1.4, () => { this.cpuTimer = 2.0; this.fightStart(); });
  }

  decision() {
    const d = this.p.dealt - this.e.dealt;
    this.finish('判定', Math.abs(d) < 3 ? null : d > 0 ? this.p : this.e);
  }

  finish(kind, winner) {
    this.phase = 'over';
    this.endSkill(true);
    this.clearTele();
    this.board.setLocked(true);
    this.dom.count.hidden = true;
    this.dom.root.classList.add('is-over');
    CBP.Sound.bell(3);
    const loser = winner === this.p ? this.e : winner === this.e ? this.p : null;
    for (const s of [this.p, this.e]) clearTimeout(s.poseTimer);
    if (winner) {
      this.setPose(winner, 'win');
      if (kind === '判定') this.setPose(loser, 'pinch');
      if (winner.c.lines.win) this.after(0.6, () => this.say(winner, winner.c.lines.win, 3));
    }
    this.banner(kind === 'KO' ? 'K.O.!' : kind === 'TKO' ? 'T.K.O.!' : '判定', 'ko', 1.8);
    this.strip('over');
    const result = {
      kind, winner: winner ? winner.key : null, round: this.round,
      p: this.stats(this.p), e: this.stats(this.e),
    };
    this.after(2.2, () => this.onEnd && this.onEnd(result));
  }

  stats(s) {
    return { id: s.c.id, dealt: s.dealt, counters: s.counters, guards: s.guards, maxChain: s.maxChain, downs: s.downs };
  }

  setPaused(v) {
    if (this.phase === 'over') return;
    this.paused = v;
    if (v) this.board.setLocked(true);
    else if (!this.hitstop && ((this.phase === 'fight' && this.freeze <= 0) || (this.phase === 'pdown' && this.recover))) this.board.setLocked(false);
  }

  /* ================= 表示 ================= */
  idlePose(s) { return s.hp < s.maxHp * 0.3 ? 'pinch' : 'guard'; }

  /* コーナーにもたれる休憩絵を使うか：既存キャラは CBP.RULES.cornerRest に書いたキャラだけ（空なら全員スツール）。自作キャラは登録した画像があれば使う */
  cornerOk(c) { return !!c.custom || (CBP.RULES.cornerRest || []).includes(c.id); }

  /* インターバルの絵：椅子に座って休む（体力3割未満はピンチの絵）。絵がないキャラは構え・ピンチの絵のまま */
  restPose(s) {
    const pinch = s.hp < s.maxHp * 0.3;
    if (pinch && this.cornerOk(s.c) && CBP.hasSpecial(s.c.id, 'corner')) return 'corner';
    if (pinch && CBP.hasRest(s.c.id, 'restPinch')) return 'restPinch';
    if (CBP.hasRest(s.c.id, 'rest')) return 'rest';
    return this.idlePose(s);
  }

  /* ダウンの絵：ボディで倒れたら、うずくまる絵（絵があるときだけ）。1人称の自分はグローブで見せるので通常のダウンのまま */
  downPose(s, body) {
    if (!body || (this.pov && s === this.p)) return 'ko';
    if (this.pov) return this.povHave.has('koBody') ? 'koBody' : 'ko';
    return CBP.hasBodyDown(s.c.id) ? 'koBody' : 'ko';
  }

  setPose(s, pose, hold) {
    clearTimeout(s.poseTimer);
    CBP.clearSpecialLayout(s.img);
    s.pose = pose;
    if (this.pov && s === this.p) {
      this.dom.gloves.dataset.state = pose; // 1人称では自分の姿は出さず、グローブで見せる
    } else if (this.pov && this.povHave.has(pose)) {
      CBP.setImage(s.img, CBP.povPath(s.c.id, pose), CBP.spritePath(s.c.id, 'guard'));
      s.el.style.setProperty('--flip', 1);
    } else {
      const side = this.pov ? (CBP.POV_FALLBACK[pose] || pose) : pose;
      const native = CBP.sideFacing(s.c, side);
      const want = s.key === 'p' ? 'R' : 'L';
      const flip = native !== 'F' && native !== want;
      const fallback = side === 'corner' && CBP.hasRest(s.c.id, 'restPinch') ? 'restPinch' : side === 'koBody' ? 'ko' : 'guard';
      CBP.setImage(s.img, CBP.spritePath(s.c.id, side), CBP.spritePath(s.c.id, fallback));
      if (side === 'corner') CBP.applySpecialLayout(s.img, s.c.id, 'corner');
      s.el.style.setProperty('--flip', flip ? -1 : 1);
    }
    s.el.dataset.pose = pose;
    if (hold) {
      s.poseTimer = setTimeout(() => {
        if (this.phase === 'over' || this.phase === 'ending' || s.pose === 'ko' || s.pose === 'koBody') return;
        if (this.phase === 'pdown' && s === this.p) return;
        if (this.phase === 'edown' && s === this.e) return;
        this.setPose(s, this.pov && s === this.e && this.tele ? 'windup' : this.idlePose(s));
      }, hold * 1000);
    }
  }

  attackAnim(s, type) {
    this.setPose(s, type, 0.45);
    this.pulse(s.el, 'is-lunge');
    if (this.pov && s === this.p) this.pulse(this.dom.gloves, `punch-${type}`);
  }

  hitAnim(s, type, big) {
    s.lastHit = { type, at: this.now };
    this.setPose(s, type === 'body' ? 'hitBody' : 'hitFace', 0.5);
    this.pulse(s.el, 'is-hit');
    CBP.Sound.hit(big, type);
    if (this.pov && s === this.p) { this.pulse(this.dom.ring, 'is-hurt'); this.pulse(this.dom.gloves, 'is-hurt'); }
    if (big || (this.pov && s === this.p)) { this.pulse(this.dom.ring, 'is-shake'); }
  }

  /* マウスピースが放物線で飛んで、マットで小さく跳ねる（1人称で自分が飛ばされたときは、画面の手前を横切って下へ消える） */
  mouthpiece(s, type, hold = false) { // hold：ストップモーション用に、飛び出したところで止めて返す（再生と音は呼んだ側で）
    const W = this.dom.ring.clientWidth, H = this.dom.ring.clientHeight;
    if (!W || !H) return;
    const self = this.pov && s === this.p;
    const upper = type === 'upper';
    const dir = this.pov ? (Math.random() < 0.5 ? -1 : 1) : (s.key === 'p' ? -1 : 1); // 打たれた向きに飛ぶ
    const x0 = this.pov ? W * 0.5 : W * (s.key === 'p' ? 0.31 : 0.69);
    const y0 = self ? H * 0.95 : H * (this.pov ? 0.3 : 0.36);
    const peak = self ? H * 0.8 : y0 * (upper ? 0.78 : 0.34);    // 打ち上がる高さ（リングの上にはみ出さない）
    const dx = W * (self ? 0.32 : upper ? 0.12 : 0.2) * dir;      // 横に飛ぶ距離
    const floor = self ? H * 1.35 : H * 0.86;                     // 落ちる先（マット／画面の外）
    const D = floor - y0;
    const u = Math.sqrt(2 * peak) + Math.sqrt(2 * peak + 2 * D);
    const g = u * u, v = Math.sqrt(2 * g * peak);
    const spin = dir * (upper ? 900 : 620);
    const size = Math.max(26, Math.min(W, H * 1.6) * 0.1) * (this.pov && !self ? 1.4 : 1);
    const el = document.createElement('div');
    el.className = 'mouthpiece';
    el.style.width = `${size}px`;
    el.innerHTML = CBP.mouthpieceSVG(s.c.theme || '#ffffff');
    this.dom.fx.appendChild(el);
    const at = (x, y, r, sc, o = 1) => ({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${r}deg) scale(${sc})`, opacity: o });
    const frames = [], flight = self ? 1 : 0.62, N = 12;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const sc = self ? 1.6 + 1.6 * Math.sin(Math.PI * t * 0.8) : 1;
      frames.push({ ...at(x0 + dx * t, y0 - v * t + (g * t * t) / 2, spin * t, sc), offset: t * flight });
    }
    if (!self) { // マットで小さく跳ねて、止まって、消える
      const xl = x0 + dx, hop = H * 0.06, bx = W * 0.04 * dir;
      frames.push({ ...at(xl + bx * 0.5, floor - hop, spin + dir * 120, 1), offset: 0.7 });
      frames.push({ ...at(xl + bx, floor, spin + dir * 180, 1), offset: 0.78 });
      frames.push({ ...at(xl + bx, floor, spin + dir * 180, 1), offset: 0.9 });
      frames.push({ ...at(xl + bx, floor, spin + dir * 180, 1, 0), offset: 1 });
    }
    const dur = self ? 1100 : 1900;
    const anim = el.animate(frames, { duration: dur, easing: 'linear', fill: 'forwards' });
    anim.onfinish = () => el.remove();
    if (hold) { anim.currentTime = dur * (self ? 0.16 : 0.12); anim.pause(); return anim; }
    CBP.Sound.mouthpiece();
    return anim;
  }

  pulse(el, cls) {
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    clearTimeout(el['_t' + cls]);
    el['_t' + cls] = setTimeout(() => el.classList.remove(cls), 500);
  }

  floatText(s, text, kind) {
    const d = document.createElement('div');
    d.className = `float float-${kind} float-${s.key}`;
    d.textContent = text;
    this.dom.fx.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  banner(text, kind, sec) {
    const b = this.dom.banner;
    b.className = `banner banner-${kind}`;
    b.textContent = text;
    void b.offsetWidth; b.classList.add('is-show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('is-show'), sec * 1000);
  }

  say(s, text, sec) {
    if (!text) return;
    const b = s.key === 'p' ? this.dom.bubbleP : this.dom.bubbleE;
    b.textContent = text; b.hidden = false;
    b.classList.remove('is-show'); void b.offsetWidth; b.classList.add('is-show');
    clearTimeout(s.sayTimer);
    s.sayTimer = setTimeout(() => { b.hidden = true; }, sec * 1000);
  }

  showCount(n) {
    const c = this.dom.count;
    c.hidden = false; c.textContent = n;
    c.classList.remove('is-pop'); void c.offsetWidth; c.classList.add('is-pop');
  }

  showTele() {
    const t = this.tele, P = CBP.PUNCHES[t.type];
    const el = this.dom.tele;
    el.hidden = false;
    el.style.setProperty('--tk', P.color);
    el.querySelector('.tele-token').innerHTML = CBP.tokenHTML(t.type);
    el.querySelector('.tele-num').textContent = `×${t.req}`;
    el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in');
    this.renderTele();
  }

  renderTele() {
    const t = this.tele; if (!t) return;
    const ring = this.dom.tele.querySelector('.tele-timer circle');
    const frac = Math.max(0, t.left / t.dur);
    ring.style.strokeDashoffset = String(100 - frac * 100);
    this.dom.tele.classList.toggle('is-urgent', t.left < 1.2);
  }

  setupHud() {
    for (const s of [this.p, this.e]) {
      s.hud.querySelector('.nm').textContent = s.c.nick || s.c.name;
      s.hud.querySelector('.st').textContent = s.c.style;
      s.hud.style.setProperty('--theme', s.c.theme);
      s.el.style.setProperty('--theme', s.c.theme);
      s.el.classList.remove('is-yandere', 'is-windup');
      s.img.alt = s.c.nick || s.c.name;
    }
    this.dom.skill.querySelector('.sk-name').textContent = this.p.c.skill.name;
    this.dom.skill.style.setProperty('--theme', this.p.c.theme);
    this.dom.skill._label = null;
    this.dom.bubbleP.hidden = true; this.dom.bubbleE.hidden = true;
    this.dom.count.hidden = true; this.dom.tele.hidden = true;
    this.renderHud();
  }

  renderHud() {
    const R = CBP.RULES;
    for (const s of [this.p, this.e]) {
      const pct = (s.hp / s.maxHp) * 100;
      s.hud.querySelector('.hp-fill').style.width = `${pct}%`;
      s.hud.querySelector('.hp-trail').style.width = `${pct}%`;
      s.hud.classList.toggle('is-danger', s.hp < s.maxHp * 0.3);
      s.hud.querySelectorAll('.downs i').forEach((d, i) => d.classList.toggle('is-on', i < s.downs));
    }
    const sec = Math.ceil(this.time);
    this.dom.clock.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    this.dom.clock.classList.toggle('is-low', sec <= 10 && this.phase === 'fight');
    this.dom.round.textContent = `R${this.round}`;
  }

  /* 盤面の上の帯：今やるべきことを1行で */
  strip(mode) { this.stripMode = mode; this.renderStrip(); }

  renderStrip() {
    const el = this.dom.strip, mode = this.stripMode;
    el.dataset.mode = mode;
    if (mode === 'tele' && this.tele) {
      const t = this.tele, P = CBP.PUNCHES[t.type], need = this.counterNeed();
      const fill = Math.min(100, (t.got / need) * 100), mark = (t.req / need) * 100;
      el.innerHTML = `
        <div class="st-row"><span class="mini" style="--tk:${P.color}">${P.kana}</span>
          <span class="st-text"><b>${P.name}</b>が来る！${this.skillOn() && this.p.c.skill.charge === 'counter' ? ' どれでも返せる' : ''}</span>
          <span class="st-num">${t.got}<small>/${need}</small></span></div>
        <div class="meter ${t.got >= t.req ? 'is-guard' : ''}" style="--tk:${P.color}">
          <div class="meter-fill" style="width:${fill}%"></div>
          <i class="mk" style="left:${mark}%"><span>ガード ${t.req}</span></i>
          <i class="mk mk-counter" style="left:100%"><span>カウンター ${need}</span></i>
        </div>`;
    } else if (mode === 'pdown' && this.recover) {
      const r = this.recover, left = Math.max(0, r.need - r.got);
      el.innerHTML = `
        <div class="st-row"><span class="st-text"><b>立ち上がれ！</b> どれでも消す</span>
          <span class="st-num">あと${left}</span></div>
        <div class="meter is-down"><div class="meter-fill" style="width:${Math.min(100, (r.got / r.need) * 100)}%"></div></div>`;
    } else if (mode === 'edown') {
      el.innerHTML = `<div class="st-row"><span class="st-text"><b>相手がダウン！</b> カウントを待つ</span></div>`;
    } else if (mode === 'break') {
      el.innerHTML = `<div class="st-row"><span class="st-text">インターバル</span></div>`;
    } else if (mode === 'over' || mode === 'intro') {
      el.innerHTML = `<div class="st-row"><span class="st-text">${mode === 'intro' ? 'ゴングを待つ' : '試合終了'}</span></div>`;
    } else {
      const combo = this.combo && this.combo.n > 1 && this.now - this.combo.at <= 1.5
        ? `<span class="st-combo">${this.combo.n} コンボ</span>` : '';
      const n = this.board.minChain;
      el.innerHTML = `<div class="st-row"><span class="st-text">同じパンチを<b>${n}つ以上</b>つないで攻撃</span>${combo}</div>`;
    }
  }
};
