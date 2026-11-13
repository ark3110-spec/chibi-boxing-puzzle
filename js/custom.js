/* 自分用キャラ。既存キャラ・cbp-* の選択保存は変更しない。通常script / file://対応。 */
(() => {
  'use strict';
  const C = window.CBP;
  // UI QA専用。指定時だけ全保存キーを隔離し、通常のセーブを読まず書かない。
  const testSave = new URLSearchParams(window.location?.search || '').get('testSave') || '';
  C.TEST_SAVE = /^[a-z0-9_-]{8,80}$/i.test(testSave) ? testSave : '';
  C.storageKey = key => C.TEST_SAVE ? 'cbp-test-' + C.TEST_SAVE + '-' + key : key;
  const LIMIT = { characters: 20, imageBytes: 3 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, dimension: 2048 };
  const EXPRESSIONS = { normal: 'ふつう', joy: '喜び', angry: '怒り', sad: '悲しい', fun: '得意げ', surprise: '驚き', shy: '照れ' };
  const POSES = { guard: '構え', jab: 'ジャブ', straight: 'ストレート', hook: 'フック', upper: 'アッパー', body: 'ボディ', block: 'ガード', hitFace: '顔の被弾', hitBody: '腹の被弾', win: '勝利', ko: '通常ダウン', pinch: 'ピンチ', rest: '休憩', restPinch: 'ピンチ休憩', koBody: 'ボディダウン（お腹を押さえてうずくまる）' };
  const SLOTS = { side: POSES, front: Object.fromEntries(Object.keys(C.POV_FILES).map(k => [k, POSES[k] || '予備動作'])), expression: EXPRESSIONS, special: { koBig: '大の字ダウン（KO結果のみ）', corner: 'コーナー休憩' } };
  const REQUIRED_SLOTS = Object.freeze(['side.guard']);
  const poseUsage = { guard: '試合中の基本姿勢・不足画像の代用', jab: 'ジャブを打つとき', straight: 'ストレートを打つとき', hook: 'フックを打つとき', upper: 'アッパーを打つとき', body: 'ボディを打つとき', block: '攻撃をガードしたとき', hitFace: '顔に当たったとき', hitBody: 'お腹に当たったとき', win: '勝ったとき', ko: '通常のダウン時', pinch: '体力が少ないとき', rest: 'ラウンド間の休憩', restPinch: '体力が少ないときの休憩', koBody: 'ボディで倒れたとき', windup: '相手の攻撃予告中' };
  const SLOT_INFO = Object.fromEntries(Object.entries(SLOTS).map(([group, slots]) => [group,
    Object.fromEntries(Object.keys(slots).map(slot => [slot, {
      required: REQUIRED_SLOTS.includes(`${group}.${slot}`),
      usage: group === 'expression' ? `試合前の掛け合いで「${EXPRESSIONS[slot]}」の表情` : group === 'special' ? (slot === 'koBig' ? 'KO負けの結果画面に出る大の字ダウンの絵' : '体力が少ないときのコーナー休憩') : (group === 'front' ? '1人称の相手：' : '') + poseUsage[slot],
    }]))]));
  const SKILLS = {
    power: { label: '得意パンチ強化', charge: 'fav', desc: '8秒間、得意パンチの威力がさらに1.3倍。' },
    counter: { label: 'カウンター強化', charge: 'counter', desc: '8秒間、どのパンチでもガード・カウンター。必要数が減り、得意パンチがさらに1.3倍。' },
    rush: { label: 'つなぎ短縮', charge: 'fav', desc: '8秒間、どのパンチも2個からつなげる。' },
  };
  /* 能力ポイント（2026-11-12 本人決定・総10点）。初期値（体力100／攻撃1.0／間隔1.0）は0点で、強くする分だけ払う。
   * 体力+10、攻撃倍率+0.05、CPU攻撃間隔-0.05ごとに1点（端数は切り上げ）。弱くする方向は0点で、点数は戻らない。
   * 検査は登録画面からの保存（save）だけ。読み込み・追加読み込み・復元は従来どおり通す。 */
  const STAT_BUDGET = 10;
  function statPoints(stats = {}) {
    const cost = (value, base, step) => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.ceil(Math.round((n - base) / step * 1e6) / 1e6)) : 0; };
    const hp = cost(stats.hp, 100, 10), power = cost(stats.power, 1, 0.05), interval = cost(stats.interval, 1, -0.05);
    return { hp, power, interval, total: hp + power + interval };
  }
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const clone = x => JSON.parse(JSON.stringify(x));
  function plain(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function text(v, max, label, fallback = '') {
    if (v === undefined) return fallback;
    if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw Error(label + 'の文字数・形式を確認してください');
    return v.trim();
  }
  function number(v, min, max, initial, label) {
    if (v === undefined) return initial;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw Error(label + 'は' + min + '〜' + max + 'です');
    return v;
  }
  function imageDimensions(bytes, type) {
    const n = i => bytes.charCodeAt(i), be = i => n(i) * 256 + n(i + 1), le = i => n(i) + n(i + 1) * 256;
    const be32 = i => be(i) * 65536 + be(i + 2), le24 = i => le(i) + n(i + 2) * 65536;
    let w, h;
    if (type === 'png' && bytes.length >= 24 && bytes.slice(12, 16) === 'IHDR') { w = be32(16); h = be32(20); }
    if (type === 'jpeg') {
      let i = 2;
      while (i + 4 < bytes.length) {
        if (n(i++) !== 255) break;
        while (n(i) === 255) i++;
        const marker = n(i++); if (marker === 218 || marker === 217) break;
        const size = be(i); if (size < 2 || i + size > bytes.length) break;
        if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && size >= 7) { h = be(i + 3); w = be(i + 5); break; }
        i += size;
      }
    }
    if (type === 'webp' && bytes.length >= 30) {
      const format = bytes.slice(12, 16);
      if (format === 'VP8X') { w = le24(24) + 1; h = le24(27) + 1; }
      else if (format === 'VP8 ' && bytes.slice(23, 26) === '\x9d\x01\x2a') { w = le(26) & 16383; h = le(28) & 16383; }
    }
    if (type === 'webp' && bytes.length >= 25 && bytes.slice(12, 16) === 'VP8L' && n(20) === 47) { w = 1 + (le(21) & 16383); h = 1 + (((n(22) >> 6) | (n(23) << 2) | (n(24) << 10)) & 16383); }
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 64 || h < 64 || w > LIMIT.dimension || h > LIMIT.dimension) throw Error('画像の縦横は64〜2048pxにしてください（画像ヘッダーも検証します）');
    return { w, h };
  }
  function imageData(url) {
    if (typeof url !== 'string' || url.length > LIMIT.imageBytes * 1.4) throw Error('画像は1枚3MiB以下です');
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
    if (!m || m[2].length % 4) throw Error('画像はPNG・JPEG・WebPのみ対応しています');
    let bytes; try { bytes = atob(m[2]); } catch (_) { throw Error('画像データが壊れています'); }
    if (bytes.length > LIMIT.imageBytes) throw Error('画像は1枚3MiB以下です');
    const good = m[1] === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : m[1] === 'jpeg' ? bytes.startsWith('\xff\xd8\xff') : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
    if (!good) throw Error('画像の拡張子と中身が一致しません');
    imageDimensions(bytes, m[1]); // 巨大寸法の画像をブラウザが展開する前に拒否
    return url;
  }
  async function decodeImage(url) {
    imageData(url);
    await new Promise((resolve, reject) => {
      const img = new Image(); const timer = setTimeout(() => reject(Error('画像の読み取りが時間切れになりました')), 10000);
      img.onload = () => { clearTimeout(timer); const w = img.naturalWidth, h = img.naturalHeight;
        if (w < 64 || h < 64 || w > LIMIT.dimension || h > LIMIT.dimension) reject(Error('画像の縦横は64〜2048pxにしてください')); else resolve(); };
      img.onerror = () => { clearTimeout(timer); reject(Error('画像を読み取れませんでした')); }; img.src = url;
    });
    return url;
  }
  const newId = () => 'custom_' + crypto.randomUUID();
  function normalize(raw) {
    if (!plain(raw) || typeof raw.id !== 'string' || !/^custom_[a-z0-9-]{8,64}$/i.test(raw.id)) throw Error('カスタムキャラのIDが不正です');
    for (const key of ['stats', 'images', 'facing']) if (raw[key] !== undefined && !plain(raw[key])) throw Error(key + 'の形式が不正です');
    for (const group of Object.keys(SLOTS)) if (raw.images?.[group] !== undefined && !plain(raw.images[group])) throw Error('画像スロットの形式が不正です');
    const name = text(raw.name, 40, '名前'); if (!name) throw Error('名前を入力してください');
    const theme = raw.theme === undefined ? '#53b7d4' : raw.theme;
    if (typeof theme !== 'string' || !/^#[0-9a-f]{6}$/i.test(theme)) throw Error('色は6桁のカラーコードです');
    const skillType = raw.skillType ?? 'power'; if (typeof skillType !== 'string' || !own(SKILLS, skillType)) throw Error('未対応のスキルです');
    const fav = raw.fav || 'jab', weak = raw.weak || 'body';
    if (!C.PUNCH_KEYS.includes(fav) || !C.PUNCH_KEYS.includes(weak)) throw Error('得意・苦手のパンチを確認してください');
    const stats = raw.stats || {};
    const images = {}, facing = {};
    for (const [group, slots] of Object.entries(SLOTS)) {
      images[group] = {};
      for (const slot of Object.keys(slots)) {
        const value = raw.images?.[group]?.[slot]; if (value !== undefined) images[group][slot] = imageData(value);
        if (group === 'side') {
          const dir = raw.facing?.[slot] || 'R'; if (!['R', 'L', 'F'].includes(dir)) throw Error('画像の向きを確認してください'); facing[slot] = dir;
        }
      }
    }
    const expression = raw.introExpression || 'normal'; if (!own(EXPRESSIONS, expression)) throw Error('表情が不正です');
    return { id: raw.id, name, nick: text(raw.nick, 30, '表示名'), theme, fav, weak, skillType,
      skillName: text(raw.skillName, 40, 'スキル名', SKILLS[skillType].label) || SKILLS[skillType].label,
      stats: { hp: number(stats.hp, 60, 160, 100, '体力'), power: number(stats.power, 0.5, 1.5, 1, '攻撃倍率'), interval: number(stats.interval, 0.65, 1.5, 1, 'CPU攻撃間隔倍率') },
      intro: text(raw.intro, 240, '試合前のひとこと'), introExpression: expression, images, facing };
  }
  function normalizeList(list) {
    if (!Array.isArray(list) || list.length > LIMIT.characters) throw Error('カスタムキャラは20人までです');
    const result = list.map(normalize);
    if (new Set(result.map(x => x.id)).size !== result.length) throw Error('キャラIDが重複しています');
    if (JSON.stringify(result).length > LIMIT.totalBytes) throw Error('画像込みの保存量は32MiBまでです');
    return result;
  }
  function runtime(d) {
    const skill = SKILLS[d.skillType];
    return { ...d, custom: true, ruby: '', style: 'オリジナル', lines: {},
      skill: { name: d.skillName, charge: skill.charge, desc: skill.desc },
      cpu: { interval: d.stats.interval, power: d.stats.power, weights: Object.fromEntries(C.PUNCH_KEYS.map(k => [k, k === d.fav ? 3 : 1])) },
      glove: { main: d.theme, light: '#ffffff', cuff: '#ffffff' } };
  }
  /* current/previous を1トランザクションで保存。別タブの更新は上書きせず知らせる。 */
  function indexedAdapter(factory, name = 'cbp-custom-v1') {
    let pending;
    function open() { return pending ||= new Promise((resolve, reject) => {
      if (!factory) { reject(Error('この環境ではキャラを保存できません。通常のブラウザで開いてください')); return; }
      const request = factory.open(name, 1);
      const timer = setTimeout(() => reject(Error('保存領域が応答しません。別のゲーム画面を閉じて再読み込みしてください')), 12000);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onerror = () => { clearTimeout(timer); reject(Error('保存領域を開けませんでした')); };
      request.onblocked = () => { clearTimeout(timer); reject(Error('別のゲーム画面を閉じて再読み込みしてください')); };
      request.onsuccess = () => { clearTimeout(timer); request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    }); }
    return {
      async read() { const db = await open(); return new Promise((resolve, reject) => {
        const tx = db.transaction('state', 'readonly'), r = tx.objectStore('state').get('data');
        r.onsuccess = () => resolve(r.result || { version: 1, revision: 0, current: [], previous: null });
        r.onerror = () => reject(Error('保存データを読み取れませんでした'));
      }); },
      async write(next, revision) { const db = await open(); return new Promise((resolve, reject) => {
        const tx = db.transaction('state', 'readwrite'), store = tx.objectStore('state'); let conflict = false;
        const r = store.get('data'); r.onsuccess = () => {
          if ((r.result?.revision || 0) !== revision) { conflict = true; tx.abort(); } else store.put(next, 'data');
        };
        tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(Error(conflict ? '別の画面で更新されました。バックアップを書き出してから再読み込みしてください' : '保存に失敗しました。空き容量を確認してください。以前のデータは保持しています'));
      }); },
    };
  }
  function createRepository(adapter, validateImages = decodeImage) {
    let state = { version: 1, revision: 0, current: [], previous: null }, loaded = false, busy = false;
    async function commit(next) {
      if (!loaded) throw Error('保存領域の読み込みが完了していません');
      if (busy) throw Error('保存処理中です。少し待ってください');
      busy = true;
      try {
        const current = normalizeList(next);
        const oldImages = new Set(state.current.flatMap(c => Object.values(c.images).flatMap(Object.values)));
        for (const c of current) for (const group of Object.values(c.images)) for (const url of Object.values(group)) if (!oldImages.has(url)) await validateImages(url);
        const nextState = { version: 1, revision: state.revision + 1, current, previous: state.current };
        await adapter.write(nextState, state.revision); state = clone(nextState); return clone(state.current);
      } finally { busy = false; }
    }
    return {
      async load() { const data = await adapter.read(); if (data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0) throw Error('未対応の保存形式です。データは変更していません');
        state = { ...data, current: normalizeList(data.current), previous: data.previous === null ? null : normalizeList(data.previous) }; loaded = true; return clone(state.current); },
      list: () => clone(state.current),
      async save(raw) {
        const c = normalize(raw);
        for (const required of REQUIRED_SLOTS) {
          const [group, slot] = required.split('.');
          if (!c.images[group][slot]) throw Error('構え（横向き）の画像は必須です。画像を選んでから保存してください');
        }
        const points = statPoints(c.stats);
        if (points.total > STAT_BUDGET) throw Error(`能力ポイントが${points.total}点で、上限の${STAT_BUDGET}点を${points.total - STAT_BUDGET}点超えています。体力・攻撃倍率・CPU攻撃間隔のどれかを下げてから保存してください（以前に保存したキャラも、保存し直すときはこの上限がかかります）`);
        const next = state.current.filter(x => x.id !== c.id); next.push(c); return commit(next);
      },
      async remove(id) { if (!state.current.some(x => x.id === id)) throw Error('削除するキャラがありません'); return commit(state.current.filter(x => x.id !== id)); },
      async restore() { if (!state.previous) throw Error('復元できる変更履歴がありません'); return commit(state.previous); },
      export: () => JSON.stringify({ format: 'cbp-custom', version: 1, characters: state.current }, null, 2),
      async import(json) {
        if (typeof json !== 'string' || json.length > LIMIT.totalBytes * 1.15) throw Error('バックアップが大きすぎます');
        let file; try { file = JSON.parse(json); } catch (_) { throw Error('バックアップJSONを読み取れません'); }
        if (file?.format !== 'cbp-custom' || file.version !== 1) throw Error('対応するキャラバックアップではありません');
        const added = normalizeList(file.characters), used = new Set(state.current.map(x => x.id));
        for (const c of added) { if (used.has(c.id)) c.id = newId(); used.add(c.id); }
        return commit([...state.current, ...added]);
      },
    };
  }
  const repository = createRepository(indexedAdapter(window.indexedDB, C.storageKey('cbp-custom-v1')));
  C.Custom = { LIMIT, SLOTS, REQUIRED_SLOTS, SLOT_INFO, SKILLS, STAT_BUDGET, statPoints, EXPRESSIONS, normalize, normalizeList, runtime, imageData, decodeImage, newId, createRepository, indexedAdapter, repository, error: '', records: [] };
  function refresh(records) { C.Custom.records = records; C.CUSTOM_CHARS = records.map(runtime); window.dispatchEvent(new Event('cbp-custom-change')); }
  C.CUSTOM_CHARS = [];
  C.Custom.ready = repository.load().then(refresh).catch(e => { C.Custom.error = e.message; });
  C.Custom.mutate = async (method, value) => { const records = await repository[method](value); refresh(records); return records; };
  C.playableChars = () => [...C.CHARS, ...C.CUSTOM_CHARS];
  const originalLookup = C.charById;
  C.charById = id => originalLookup(id) || C.CUSTOM_CHARS.find(c => c.id === id);
  C.escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
})();
