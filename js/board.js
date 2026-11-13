/* パズル盤面：同じパンチアイコンを指でなぞってつなぎ、3個以上で消す（斜めもつながる） */
window.CBP = window.CBP || {};

CBP.glyph = (type) => {
  const p = {
    jab: '<path d="M4 12h11M11 7l5 5-5 5"/>',
    straight: '<path d="M2 12h17M15 6l6 6-6 6"/><path d="M2 8h6M2 16h6" opacity=".55"/>',
    hook: '<path d="M5 18c0-7 4-11 12-11"/><path d="M13 3l4 4-4 4"/>',
    upper: '<path d="M6 21c0-8 3-12 10-14"/><path d="M12 4l5 2-2 5"/>',
    body: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>',
    wild: '<path d="M12 3l2.6 5.8 6.3.6-4.8 4.2 1.4 6.2L12 16.6 6.5 19.8l1.4-6.2L3.1 9.4l6.3-.6z" fill="currentColor" stroke="none"/>',
  }[type];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
};

CBP.tokenHTML = (type) => {
  if (type === 'wild') return `<span class="tk-kana">${CBP.glyph('wild')}</span>`;
  return `<span class="tk-kana">${CBP.PUNCHES[type].kana}</span><span class="tk-glyph">${CBP.glyph(type)}</span>`;
};

CBP.Board = class {
  constructor(root, { cols = 6, rows = 7, onChain, onLink, onCancel } = {}) {
    this.root = root; this.cols = cols; this.rows = rows;
    this.onChain = onChain; this.onLink = onLink; this.onCancel = onCancel;
    this.layer = root.querySelector('.board-tokens');
    this.svg = root.querySelector('.board-line');
    this.countEl = root.querySelector('.board-count');
    this.grid = [];
    this.chain = []; this.chainType = null; this.pointerId = null;
    this.locked = true; this.busy = false; this.bias = null; this.skillBias = null; this.uid = 0;
    this.epoch = 0; this.collapseTimer = null; this.checkTimer = null; this.checkPending = false;
    this.minChain = CBP.RULES.minChain;
    this.bind();
    new ResizeObserver(() => this.layout(false)).observe(root);
  }

  /* ---------- 盤面の生成と配置 ---------- */
  reset() {
    this.cancelPending();
    this.cancelChain();
    this.layer.innerHTML = '';
    this.grid = Array.from({ length: this.cols }, () => Array(this.rows).fill(null));
    for (let c = 0; c < this.cols; c++) for (let r = 0; r < this.rows; r++) this.grid[c][r] = this.make(this.randomType(), c, r);
    if (!this.hasMove()) this.shuffle();
    this.layout(false);
  }

  cancelPending() {
    this.epoch++;
    clearTimeout(this.collapseTimer); clearTimeout(this.checkTimer);
    this.collapseTimer = null; this.checkTimer = null; this.checkPending = false;
    this.busy = false;
  }

  randomType() {
    const w = { jab: 1, straight: 1, hook: 1, upper: 1, body: 1, wild: 0.1 };
    if (this.skillBias) w[this.skillBias] = 2.2; // スキル（蓮華）で出やすくする
    if (this.bias) w[this.bias] = 2.4;
    let sum = 0; for (const k in w) sum += w[k];
    let x = Math.random() * sum;
    for (const k in w) { x -= w[k]; if (x <= 0) return k; }
    return 'jab';
  }

  make(type, c, r) {
    const el = document.createElement('div');
    el.className = 'token'; el.dataset.type = type;
    el.style.setProperty('--tk', type === 'wild' ? '#ffd23f' : CBP.PUNCHES[type].color);
    el.innerHTML = CBP.tokenHTML(type);
    this.layer.appendChild(el);
    return { id: ++this.uid, type, el, c, r };
  }

  get cell() { return this.root.clientWidth / this.cols; }

  place(t, animate) {
    const s = this.cell;
    t.el.style.transition = animate ? '' : 'none';
    t.el.style.transform = `translate(${t.c * s}px, ${t.r * s}px)`;
  }

  layout(animate) {
    const s = this.cell;
    this.root.style.setProperty('--cell', `${s}px`);
    this.root.style.height = `${s * this.rows}px`;
    for (const col of this.grid) for (const t of col) if (t) this.place(t, animate);
    this.drawLine();
  }

  setLocked(v) { this.locked = v; this.root.classList.toggle('is-locked', v); if (v) this.cancelChain(); }
  setBias(type) { this.bias = type; this.root.dataset.bias = type || ''; }
  setMinChain(n) { this.minChain = n; this.drawLine(); }

  setType(t, type) {
    t.type = type; t.el.dataset.type = type;
    t.el.style.setProperty('--tk', type === 'wild' ? '#ffd23f' : CBP.PUNCHES[type].color);
    t.el.innerHTML = CBP.tokenHTML(type);
  }

  /* スキル（蓮華）：ランダムなアイコンを n 個、type に変える */
  convert(type, n) {
    const pool = this.grid.flat().filter((t) => t && t.type !== type && t.type !== 'wild' && !this.chain.includes(t));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    for (const t of pool.slice(0, n)) {
      this.setType(t, type);
      t.el.classList.remove('is-converted'); void t.el.offsetWidth; t.el.classList.add('is-converted');
    }
  }

  /* ---------- 入力 ---------- */
  bind() {
    const r = this.root;
    r.addEventListener('pointerdown', (e) => this.down(e));
    r.addEventListener('pointermove', (e) => this.move(e));
    r.addEventListener('pointerup', (e) => this.up(e));
    r.addEventListener('pointercancel', () => this.cancelChain());
    r.addEventListener('lostpointercapture', (e) => { if (e.pointerId === this.pointerId) this.up(e); });
  }

  local(e) {
    const b = this.root.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }

  hit(x, y, radius) {
    const s = this.cell;
    const c = Math.floor(x / s), r = Math.floor(y / s);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null;
    const dx = x - (c + 0.5) * s, dy = y - (r + 0.5) * s;
    if (Math.hypot(dx, dy) > s * radius) return null;
    return this.grid[c][r];
  }

  down(e) {
    if (this.locked || this.busy || this.pointerId !== null) return;
    const p = this.local(e);
    const t = this.hit(p.x, p.y, 0.5);
    if (!t) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    try { this.root.setPointerCapture(e.pointerId); } catch (err) { /* 古いブラウザ */ }
    this.chain = [t]; this.chainType = t.type === 'wild' ? null : t.type;
    t.el.classList.add('is-linked');
    this.link();
  }

  move(e) {
    if (e.pointerId !== this.pointerId || !this.chain.length) return;
    const p = this.local(e);
    const t = this.hit(p.x, p.y, 0.4);
    if (!t) return;
    const last = this.chain[this.chain.length - 1];
    if (t === last) return;
    const prev = this.chain[this.chain.length - 2];
    if (t === prev) { // 戻ると1つ取り消し
      last.el.classList.remove('is-linked');
      this.chain.pop();
      this.chainType = this.chain.find((x) => x.type !== 'wild')?.type || null;
      this.link();
      return;
    }
    if (this.chain.includes(t)) return;
    if (Math.abs(t.c - last.c) > 1 || Math.abs(t.r - last.r) > 1) return;
    if (t.type !== 'wild' && this.chainType && t.type !== this.chainType) return;
    this.chain.push(t);
    if (!this.chainType && t.type !== 'wild') this.chainType = t.type;
    t.el.classList.add('is-linked');
    this.link();
  }

  up(e) {
    if (e && e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    const chain = this.chain;
    if (chain.length >= this.minChain && !this.locked) {
      const type = this.chainType || 'jab';
      const wild = chain.filter((t) => t.type === 'wild').length;
      this.chain = []; this.chainType = null; this.drawLine();
      this.clear(chain);
      this.onChain && this.onChain({ type, count: chain.length, wild });
    } else {
      if (chain.length) this.onCancel && this.onCancel();
      this.cancelChain();
    }
  }

  cancelChain() {
    for (const t of this.chain) t.el.classList.remove('is-linked');
    this.chain = []; this.chainType = null; this.pointerId = null;
    this.drawLine();
    if (this.checkPending && !this.busy) this.scheduleMoveCheck();
  }

  link() {
    this.drawLine();
    this.onLink && this.onLink(this.chain.length, this.chainType);
  }

  drawLine() {
    const s = this.cell;
    if (this.chain.length < 1) { this.svg.innerHTML = ''; this.countEl.hidden = true; return; }
    const pts = this.chain.map((t) => `${(t.c + 0.5) * s},${(t.r + 0.5) * s}`).join(' ');
    const color = this.chainType ? CBP.PUNCHES[this.chainType].color : '#ffd23f';
    this.svg.setAttribute('viewBox', `0 0 ${this.root.clientWidth} ${this.root.clientHeight}`);
    this.svg.innerHTML = `<polyline points="${pts}" stroke="#fff" stroke-width="${s * 0.3}" />` +
      `<polyline points="${pts}" stroke="${color}" stroke-width="${s * 0.18}" />`;
    const last = this.chain[this.chain.length - 1];
    this.countEl.hidden = false;
    this.countEl.textContent = `×${this.chain.length}`;
    this.countEl.classList.toggle('is-ready', this.chain.length >= this.minChain);
    this.countEl.style.transform = `translate(${(last.c + 0.5) * s}px, ${last.r * s - 6}px)`;
  }

  /* ---------- 消去と落下 ---------- */
  clear(chain) {
    this.cancelPending();
    this.busy = true;
    for (const t of chain) {
      this.grid[t.c][t.r] = null;
      t.el.classList.remove('is-linked');
      t.el.classList.add('is-popping');
      setTimeout(() => t.el.remove(), 220);
    }
    const epoch = this.epoch;
    this.collapseTimer = setTimeout(() => {
      if (epoch !== this.epoch) return;
      this.collapseTimer = null;
      this.collapse();
    }, 120);
  }

  collapse() {
    const s = this.cell;
    for (let c = 0; c < this.cols; c++) {
      const col = this.grid[c].filter(Boolean);
      const missing = this.rows - col.length;
      const fresh = [];
      for (let i = 0; i < missing; i++) {
        const t = this.make(this.randomType(), c, i - missing);
        t.el.style.transition = 'none';
        t.el.style.transform = `translate(${c * s}px, ${(i - missing) * s}px)`;
        fresh.push(t);
      }
      this.grid[c] = [...fresh, ...col];
      this.grid[c].forEach((t, r) => { t.r = r; t.c = c; });
    }
    void this.layer.offsetWidth; // 新しいアイコンの初期位置を確定させてから落とす
    for (const col of this.grid) for (const t of col) this.place(t, true);
    this.busy = false; // 落下中もすぐ次をなぞれる
    this.scheduleMoveCheck();
  }

  scheduleMoveCheck() {
    clearTimeout(this.checkTimer);
    this.checkPending = false;
    const epoch = this.epoch;
    this.checkTimer = setTimeout(() => {
      if (epoch !== this.epoch) return;
      this.checkTimer = null;
      if (this.busy) return;
      if (this.chain.length) { this.checkPending = true; return; }
      if (!this.hasMove()) this.shuffle();
    }, 230);
  }

  hasMove() {
    for (const type of CBP.PUNCH_KEYS) {
      const seen = new Set();
      for (let c = 0; c < this.cols; c++) for (let r = 0; r < this.rows; r++) {
        const t = this.grid[c][r];
        if (!t || seen.has(t.id) || (t.type !== type)) continue;
        let size = 0; const stack = [t]; seen.add(t.id);
        const local = new Set([t.id]);
        while (stack.length) {
          const x = stack.pop(); size++;
          if (size >= this.minChain) return true;
          for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
            const n = this.grid[x.c + dc]?.[x.r + dr];
            if (!n || local.has(n.id) || (n.type !== type && n.type !== 'wild')) continue;
            local.add(n.id); if (n.type === type) seen.add(n.id); stack.push(n);
          }
        }
      }
    }
    return false;
  }

  shuffle() {
    const all = this.grid.flat();
    let tries = 0;
    do {
      for (const t of all) this.setType(t, this.randomType());
    } while (!this.hasMove() && ++tries < 20);
  }
};
