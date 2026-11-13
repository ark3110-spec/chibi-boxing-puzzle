/* 効果音と曲。js/sound_manifest.js（CBP.SOUND_FILES）に書いた音のファイルがあればそれを鳴らし、
 * 書いていない音・読み込めなかった音は WebAudio の合成音で鳴らす。
 * ファイルは HTMLAudioElement で鳴らす（index.html をダブルクリックで開いたときは、fetch でファイルを読めないため）。
 * 音量は「曲」と「効果音」に分けてブラウザが覚える。音オン／オフは両方に効く。 */
window.CBP = window.CBP || {};

CBP.Sound = (() => {
  const store = {
    get(k, d) { try { const v = localStorage.getItem(CBP.storageKey(k)); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(CBP.storageKey(k), v); } catch (e) { /* 保存できない環境では覚えない */ } },
  };
  const clamp = (v) => Math.min(1, Math.max(0, Number.isFinite(+v) ? +v : 0));
  let ctx = null;
  let sfx = null; // 合成音の効果音をまとめる音量つまみ
  let muted = store.get('cbp-muted', '0') === '1';
  const volume = { bgm: clamp(store.get('cbp-vol-bgm', '0.6')), se: clamp(store.get('cbp-vol-se', '1')) };

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (!sfx) {
      sfx = ctx.createGain(); sfx.gain.value = volume.se; sfx.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, { type = 'sine', gain = 0.2, slide = 0, delay = 0 } = {}) {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfx); o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, { gain = 0.25, freq = 900, delay = 0 } = {}) {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + delay;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(sfx); s.start(t);
  }

  /* ---------- 音のファイル ---------- */
  const FILES = CBP.SOUND_FILES || {};
  const failed = new Set(); // 読み込めなかったファイル（このあとは合成音で鳴らす）
  const loaded = new Map(); // src → 読み込みを始めた audio（鳴らすときは複製して重ねて鳴らせるようにする）
  const playing = new Set(), fileTimers = new Set();
  function entry(group, name) {
    const v = FILES[group]?.[name]; if (!v) return null;
    const o = typeof v === 'string' || Array.isArray(v) ? { src: v } : v;
    const list = [].concat(o.src).filter((s) => typeof s === 'string' && s && !failed.has(s));
    return list.length ? { list, gain: clamp(o.volume ?? 1), loop: o.loop !== false } : null;
  }
  function load(src) {
    if (!loaded.has(src)) {
      const a = new Audio(); a.preload = 'auto';
      a.addEventListener('error', () => failed.add(src));
      a.src = src; loaded.set(src, a);
    }
    return loaded.get(src);
  }
  // 効果音のファイルを鳴らす。ファイルがあれば true（音オフでも true）、なければ false で、呼んだ側が合成音を鳴らす
  function file(name, { rate = 1, delay = 0 } = {}) {
    const e = entry('se', name); if (!e) return false;
    if (muted) return true;
    const src = e.list[Math.floor(Math.random() * e.list.length)];
    const a = load(src).cloneNode();
    a.addEventListener('ended', () => playing.delete(a));
    a.addEventListener('error', () => { failed.add(src); playing.delete(a); });
    a.volume = clamp(volume.se * e.gain); a.preservesPitch = false; a.playbackRate = rate;
    const go = () => {
      if (muted) return;
      playing.add(a);
      a.play().catch(() => playing.delete(a));
    };
    if (delay) {
      const timer = setTimeout(() => { fileTimers.delete(timer); go(); }, delay * 1000);
      fileTimers.add(timer);
    } else go();
    return true;
  }
  for (const name of Object.keys(FILES.se || {})) entry('se', name)?.list.forEach(load); // 先に読み込みを始めておく

  /* ---------- 曲 ---------- */
  let unlocked = false; // ブラウザは、画面を一度さわるまで音を鳴らさせない
  let bgm = null, bgmName = '', ducked = false, duckTimer = null, duckHeld = false;
  function bgmVolume() { if (bgm) bgm.volume = clamp(volume.bgm * bgm.cbpGain * ((ducked || duckHeld) ? 0.35 : 1)); }
  function bgmPlay() { if (bgm && !muted && unlocked && !document.hidden && bgm.paused && !bgm.cbpDone) bgm.play().catch(() => {}); }
  function music(name = '') {
    if (name === bgmName) return;
    duckHeld = false; // 曲が切り替わったら、下げたままの保持は解く
    bgmName = name;
    if (bgm) { bgm.pause(); bgm = null; }
    const e = name ? entry('bgm', name) : null; if (!e) return;
    const src = e.list[Math.floor(Math.random() * e.list.length)], a = new Audio(src);
    a.loop = e.loop; a.preload = 'auto'; a.cbpGain = e.gain;
    a.addEventListener('error', () => failed.add(src));
    a.addEventListener('ended', () => { a.cbpDone = true; }); // 1回だけの曲（ジングル）は流し終わったら止めたまま
    bgm = a; bgmVolume(); bgmPlay();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) bgm?.pause(); else bgmPlay(); });
  const firstTouch = () => { api.unlock(); ['pointerdown', 'keydown'].forEach((ev) => window.removeEventListener(ev, firstTouch, true)); };
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, firstTouch, true));

  const api = {
    get muted() { return muted; },
    get volume() { return { ...volume }; },
    toggle() {
      muted = !muted;
      store.set('cbp-muted', muted ? '1' : '0');
      if (muted) {
        bgm?.pause();
        if (sfx) { sfx.gain.value = 0; sfx.disconnect?.(); sfx = null; }
        for (const a of playing) a.pause();
        playing.clear();
        for (const timer of fileTimers) clearTimeout(timer);
        fileTimers.clear();
      } else bgmPlay();
      return muted;
    },
    setVolume(kind, value) { // kind：'bgm'（曲）か 'se'（効果音）、value：0〜1
      if (!(kind in volume)) return;
      volume[kind] = clamp(value); store.set(`cbp-vol-${kind}`, String(volume[kind]));
      if (sfx) sfx.gain.value = volume.se;
      bgmVolume();
    },
    unlock() { unlocked = true; ensure(); bgmPlay(); },
    music, // 場面の曲に切り替える（'title'・'fight'・'win'・'lose'、'' で止める）
    duck(sec) { // 必殺技のカットインやダウンの瞬間に、曲を少し下げる
      if (!bgm) return;
      ducked = true; bgmVolume(); clearTimeout(duckTimer);
      duckTimer = setTimeout(() => { ducked = false; bgmVolume(); }, sec * 1000);
    },
    duckHold(on) { // インターバルの間など、曲を下げたままにする（duck の保持版）
      duckHeld = !!on; bgmVolume();
    },
    link(n) { if (!file('link', { rate: 1 + Math.min(n, 12) * 0.04 })) tone(420 + n * 70, 0.07, { type: 'triangle', gain: 0.08 }); },
    cancel() { if (!file('cancel')) tone(220, 0.08, { type: 'triangle', gain: 0.05 }); },
    hit(big, type) { // type：当たったパンチの種類（jab など）。種類別のファイル → 強い当たり → 共通の順に探す
      const rate = 0.95 + Math.random() * 0.1, kind = type ? 'punch' + type[0].toUpperCase() + type.slice(1) : '';
      if ((big && file('punchBig', { rate })) || (kind && file(kind, { rate })) || file('punch', { rate })) return;
      noise(big ? 0.22 : 0.14, { gain: big ? 0.45 : 0.3, freq: big ? 700 : 1100 }); tone(big ? 90 : 120, 0.18, { type: 'sine', gain: 0.35, slide: -50 });
    },
    guard() { if (!file('guard')) { noise(0.08, { gain: 0.2, freq: 2500 }); tone(600, 0.09, { type: 'square', gain: 0.05 }); } },
    counter() { if (!file('counter')) { tone(1320, 0.35, { gain: 0.16 }); tone(1980, 0.3, { gain: 0.08, delay: 0.04 }); } this.hit(true); },
    warn() { if (!file('warn')) tone(330, 0.12, { type: 'square', gain: 0.05 }); },
    bell(times = 1) { // ゴング：ラウンドの始めと終わり、試合終了は3回
      for (let i = 0; i < times; i++) if (!file('gong', { delay: i * 0.32 })) { tone(880, 1.1, { gain: 0.22, delay: i * 0.32 }); tone(1760, 0.6, { gain: 0.06, delay: i * 0.32 }); }
    },
    skillFull() { // スキルのゲージが満タン（ゴングとは別の音）
      if (!file('skillFull')) { tone(988, 0.09, { type: 'triangle', gain: 0.1 }); tone(1319, 0.09, { type: 'triangle', gain: 0.1, delay: 0.07 }); tone(1976, 0.3, { gain: 0.08, delay: 0.14 }); }
    },
    down() { if (!file('down')) tone(140, 0.5, { type: 'sawtooth', gain: 0.08, slide: -80 }); },
    stop() { if (!file('stop')) { tone(2400, 0.06, { type: 'square', gain: 0.035 }); tone(1200, 0.5, { type: 'triangle', gain: 0.07, slide: -700, delay: 0.03 }); } }, // ダウンのストップモーション
    interval() { if (!file('interval')) { tone(523, 0.18, { type: 'triangle', gain: 0.1 }); tone(659, 0.18, { type: 'triangle', gain: 0.1, delay: 0.12 }); tone(784, 0.3, { type: 'triangle', gain: 0.1, delay: 0.24 }); } },
    count() { if (!file('count')) tone(520, 0.08, { type: 'square', gain: 0.05 }); },
    mouthpiece() { if (!file('mouthpiece')) { tone(700, 0.14, { type: 'triangle', gain: 0.1, slide: 900 }); tone(1500, 0.05, { type: 'square', gain: 0.03, delay: 0.95 }); } },
    special() { if (!file('special')) { tone(660, 0.12, { type: 'triangle', gain: 0.12 }); tone(990, 0.2, { type: 'triangle', gain: 0.12, delay: 0.08 }); } },
  };
  return api;
})();
