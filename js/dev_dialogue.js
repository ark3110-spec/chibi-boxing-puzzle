/* ?dev=1 専用。正本ファイルは書き換えず、このブラウザ内の台詞だけを差し替える。 */
(async () => {
  'use strict';
  if (new URLSearchParams(window.location.search).get('dev') !== '1') return;

  const C = window.CBP;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('../css/dev_dialogue.css', document.currentScript.src).href;
  document.head.append(stylesheet);
  await C.Custom.ready;

  const key = C.storageKey('cbp-dev-dialogue-v1');
  const entries = [];
  const name = id => { const c = C.charById(id); return c ? c.nick || c.name : id; };
  function entry(id, scene, character, original, apply) {
    entries.push({ id, scene, character, original, apply });
  }
  const fields = { intro: '試合開始', counter: 'カウンター', midFight: '試合中' + (C.RULES?.midFightEnabled === false ? '（現在は発動停止中）' : ''), win: '勝利', yandere: 'ヤンデレ（現在は無効）' };
  for (const c of [...C.CHARS, ...C.MOBS]) {
    for (const [field, scene] of Object.entries(fields)) {
      const value = c.lines[field];
      if (field === 'midFight' || Array.isArray(value)) {
        const lines = Array.isArray(value) && value.length ? value : [''];
        lines.forEach((text, i) => entry(`chars.${c.id}.${field}.${i}`, `${scene} ${i + 1}`, name(c.id), text,
          next => { (c.lines[field] ||= [])[i] = next; }));
      } else {
        entry(`chars.${c.id}.${field}`, scene, name(c.id), value || '', next => { c.lines[field] = next; });
      }
    }
  }
  C.DIALOGUE_PAIRS.forEach(pair => pair.lines.forEach((line, i) => {
    entry(`pairs.${pair.ids.join('+')}.${i}`, `試合前：${pair.ids.map(name).join(' × ')}／${i + 1}行目`,
      name(line.speaker), line.text, next => { line.text = next; });
  }));
  entry('fallback.ready', '試合前（固有会話なし）', C.DIALOGUE_FALLBACK.speaker, C.DIALOGUE_FALLBACK.ready,
    next => { C.DIALOGUE_FALLBACK.ready = next; });
  for (const c of C.CUSTOM_CHARS) {
    entry(`custom.${c.id}.intro`, '試合前のひとこと', name(c.id), c.intro,
      next => { c.intro = next; });
  }

  let overrides = {};
  let loadError = '';
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      if (saved?.format !== 'cbp-dev-dialogue' || saved.version !== 1 || !saved.overrides ||
          Array.isArray(saved.overrides) || typeof saved.overrides !== 'object' ||
          Object.values(saved.overrides).some(value => typeof value !== 'string')) throw Error('invalid');
      overrides = saved.overrides;
      // 旧対象IDを読み替え、新しいIDで保存済みの文面を優先する。
      for (const id of Object.keys(overrides)) {
        const match = /^chars\.([^.]+)\.taunt\.(\d+)$/.exec(id);
        if (!match) continue;
        const nextId = `chars.${match[1]}.midFight.${match[2]}`;
        if (!Object.hasOwn(overrides, nextId)) overrides[nextId] = overrides[id];
        delete overrides[id];
      }
    }
  } catch (_) {
    loadError = '保存データを読み込めません。上書きを防ぐため保存を停止しています。ブラウザの保存設定・保存データを確認してください。';
  }
  for (const item of entries) if (Object.hasOwn(overrides, item.id)) item.apply(overrides[item.id]);
  const pack = values => JSON.stringify({ format: 'cbp-dev-dialogue', version: 1, overrides: values }, null, 2);

  const panel = document.createElement('details');
  panel.id = 'dev-dialogue';
  panel.open = true;
  const summary = document.createElement('summary');
  summary.textContent = '開発者モード：セリフ編集（1行ずつ・空欄＝無言）';
  const content = document.createElement('div');
  content.className = 'dev-dialogue-content';
  const note = document.createElement('p');
  note.textContent = 'こちらは空欄を「無言」として保存し、もう一方の「スキル名・台詞」パネルは空欄で正本に戻すため、空欄の意味が逆です。各項目の「保存」で、このブラウザに保存します。反映は次にそのセリフを表示するときから。通常起動と正本ファイルには反映されません。「正本に戻す」でその行の上書きを解除できます。見出しを押すと編集一覧を閉じて遊べます。';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = loadError || 'セリフを編集して「保存」を押してください。';
  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'btn btn-ghost btn-sm';
  download.textContent = '保存済みの変更をJSONで書き出す';
  download.disabled = !!loadError;
  download.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([pack(overrides)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cbp-dev-dialogue.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = '保存済みの変更を書き出しました。';
  });
  content.append(note, download, status);
  const groups = new Map();
  for (const item of entries) {
    // キャラ・場面の組み合わせごとにまとめる。台詞をHTMLとして扱わない。
    const groupKey = item.character;
    if (!groups.has(groupKey)) {
      const group = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = item.character;
      group.append(legend);
      groups.set(groupKey, group);
      content.append(group);
    }
    const row = document.createElement('div');
    row.className = 'dev-dialogue-row';
    const label = document.createElement('label');
    label.textContent = item.scene;
    const text = document.createElement('textarea');
    text.rows = 2;
    text.value = Object.hasOwn(overrides, item.id) ? overrides[item.id] : item.original;
    text.dataset.dialogueId = item.id;
    label.append(text);
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn btn-ghost btn-sm';
    save.textContent = '保存';
    save.disabled = !!loadError;
    text.addEventListener('input', () => { status.textContent = `${item.character}／${item.scene}：未保存です。`; });
    save.addEventListener('click', () => {
      const next = { ...overrides };
      if (text.value === item.original) delete next[item.id];
      else next[item.id] = text.value;
      try { localStorage.setItem(key, pack(next)); }
      catch (_) { status.textContent = '保存できませんでした。ブラウザの保存設定・空き容量を確認してください。この変更は反映されていません。'; return; }
      overrides = next;
      item.apply(text.value);
      status.textContent = item.original.trim() && !text.value.trim()
        ? `${item.character}／${item.scene}：空欄（無言）として保存しました。元に戻すには「正本に戻す」を押してください。`
        : `${item.character}／${item.scene}：保存しました。`;
    });
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'btn btn-ghost btn-sm';
    restore.textContent = '正本に戻す';
    restore.disabled = !!loadError;
    restore.addEventListener('click', () => {
      const next = { ...overrides };
      delete next[item.id];
      try { localStorage.setItem(key, pack(next)); }
      catch (_) { status.textContent = '保存できませんでした。ブラウザの保存設定・空き容量を確認してください。この変更は反映されていません。'; return; }
      overrides = next;
      text.value = item.original;
      item.apply(item.original);
      status.textContent = `${item.character}／${item.scene}：正本に戻しました。`;
    });
    row.append(label, save, restore);
    groups.get(groupKey).append(row);
  }
  panel.append(summary, content);
  document.body.prepend(panel);
})();
