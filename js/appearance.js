/* 画像参照と有限のfallback。未導入の追加絵は存在するものとして扱わない。 */
(() => {
  'use strict';
  const C = window.CBP;
  const sprite = C.spritePath, pov = C.povPath, rest = C.hasRest, bodyDown = C.hasBodyDown;
  const files = { normal: '01_normal', joy: '02_joy', angry: '03_angry', sad: '04_sad', fun: '05_fun', surprise: '06_surprise', shy: '07_shy' };
  C.EXPRESSION_FILES = files;
  const silhouette = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600"><g fill="#b9b2d6" stroke="#fff" stroke-width="12"><circle cx="500" cy="155" r="95"/><path d="M440 260 Q500 230 560 260 L595 390 L560 555 H520 L500 445 L480 555 H440 L405 390Z"/><ellipse cx="380" cy="310" rx="55" ry="65"/><ellipse cx="620" cy="310" rx="55" ry="65"/></g></svg>`;
  C.PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(silhouette);
  function custom(id) { const c = C.charById(id); return c?.custom ? c : null; }
  C.spritePath = (id, pose) => {
    const c = custom(id);
    if (pose === 'corner') return C.specialPath(id, 'corner') || C.spritePath(id, C.hasRest(id, 'restPinch') ? 'restPinch' : 'pinch');
    return c ? c.images.side[pose] || (pose === 'koBody' && c.images.side.ko) || c.images.side.guard || C.PLACEHOLDER : sprite(id, pose);
  };
  C.hasBodyDown = id => custom(id) ? !!custom(id).images.side.koBody : bodyDown(id);
  C.hasRest = (id, pose) => custom(id) ? !!custom(id).images.side[pose] : rest(id, pose);
  C.povPath = (id, pose) => custom(id) ? custom(id).images.front[pose] || C.spritePath(id, pose) : pov(id, pose);
  C.povAvailable = id => custom(id) ? Object.keys(custom(id).images.front) : (C.POV_AVAILABLE?.[id] || []);
  C.sideFacing = (c, pose) => c.facing[c.custom && !c.images.side[pose] && pose !== 'corner' ? (pose === 'koBody' && c.images.side.ko ? 'ko' : 'guard') : pose] || 'R';
  C.expressionPath = (id, pose = 'normal') => {
    const c = custom(id); if (c) return c.images.expression[pose] || c.images.expression.normal || C.spritePath(id, 'guard');
    // 表情差分の絵がないキャラ（expressions: false。投票企画の4人とかなみ）は、構えの絵を使う
    return C.CHARS.some(c => c.id === id && c.expressions !== false) ? `assets/chibi_expr/${id}/${files[pose] || files.normal}.webp` : C.spritePath(id, 'guard');
  };
  C.clearSpecialLayout = img => {
    for (const key of ['width', 'height', 'maxWidth', 'maxHeight', 'marginLeft', 'paddingLeft', 'paddingRight', 'boxSizing']) img.style[key] = '';
  };
  // 頭サイズをguardと揃える倍率。外側余白は人物の縮小率に含めない。
  C.specialGeometry = layout => {
    if (!layout || typeof layout !== 'object') return null;
    const { sourceWidth: w, sourceHeight: h, headPixels: head, guardHeadPixels: guard, extraLeft = 0, extraRight = 0 } = layout;
    if (![w, h, head, guard].every(n => Number.isFinite(n) && n > 0 && n <= 8192) || head > h || guard > 600 || ![extraLeft, extraRight].every(n => Number.isFinite(n) && n >= 0 && n <= 2048)) return null;
    const scale = guard / head;
    return { widthPercent: w / 1000 * scale * 100, heightPercent: h / 600 * scale * 100,
      leftPercent: extraLeft / 1000 * scale * 100, rightPercent: extraRight / 1000 * scale * 100 };
  };
  C.applySpecialLayout = (img, id, slot) => {
    C.clearSpecialLayout(img);
    const g = C.specialGeometry(C.SPECIAL_ASSETS?.[id]?.[slot]?.layout); if (!g) return false;
    // 幅に収めるfit処理を使わず、guardの頭サイズを基準に表示する。
    img.style.width = g.widthPercent + '%'; img.style.height = g.heightPercent + '%';
    img.style.maxWidth = 'none'; img.style.maxHeight = 'none'; img.style.boxSizing = 'content-box';
    img.style.marginLeft = (100 - g.widthPercent) / 2 - g.leftPercent + '%';
    img.style.paddingLeft = g.leftPercent + '%'; img.style.paddingRight = g.rightPercent + '%';
    return true;
  };
  C.setImage = (img, src, fallback = C.PLACEHOLDER) => {
    img.hidden = false; let tried = false;
    img.onerror = () => { C.clearSpecialLayout(img); if (tried) { img.onerror = null; img.hidden = true; return; } tried = true; img.src = fallback; };
    img.src = src || fallback;
  };
  const checked = new Map(), pending = new Map();
  C.specialPath = (id, slot) => {
    const c = custom(id); if (c) return c.images.special[slot] || null;
    const entry = C.SPECIAL_ASSETS?.[id]?.[slot];
    const path = typeof entry === 'string' ? entry : entry?.src;
    return typeof path === 'string' && /^assets\/chibi_special\/[a-z0-9_-]+\/[a-z0-9_-]+\.(png|webp|jpe?g)$/i.test(path) ? path : null;
  };
  C.probeSpecial = async (id, slot) => {
    const path = C.specialPath(id, slot); if (!path) return false;
    if (custom(id)) return true;
    if (checked.has(path)) return checked.get(path);
    if (!pending.has(path)) pending.set(path, new Promise(resolve => {
      const img = new Image(); let timedOut = false;
      const finish = ok => {
        clearTimeout(timer); img.onload = img.onerror = null;
        if (ok) checked.set(path, true);
        if (timedOut) return; // 遅れた成功は残し、失敗は確定させない
        if (checked.get(path) !== true) checked.set(path, ok);
        pending.delete(path); resolve(checked.get(path));
      };
      const timer = setTimeout(() => { timedOut = true; pending.delete(path); resolve(false); }, 6000);
      img.onload = () => finish(true); img.onerror = () => finish(false); img.src = path;
    }));
    return await pending.get(path);
  };
  C.hasSpecial = (id, slot) => { const path = C.specialPath(id, slot); return !!path && (custom(id) ? true : checked.get(path) === true); };
  C.resultKO = result => result.kind === 'KO' && result.winner ? (result.winner === 'p' ? result.e.id : result.p.id) : null;
})();
