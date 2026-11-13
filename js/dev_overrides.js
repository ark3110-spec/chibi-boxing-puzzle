/* ?dev=1 専用。スキル名・試合台詞をブラウザ内で試し、正本は変更しない。 */
(async () => {
  'use strict';
  if (new URLSearchParams(window.location.search).get('dev') !== '1') return;
  const C = window.CBP;
  const chars = [...C.CHARS, ...C.MOBS];
  const skillIds = new Set(['kurumi', 'natsume', 'raichi', 'ichigo', 'kanami']);
  const fields = { intro: '試合開始', counter: 'カウンター', win: '勝利', midFight: '試合中（1行につき1件' + (C.RULES?.midFightEnabled === false ? '・現在は発動停止中' : '') + '）' };
  const own = (value, key) => Object.hasOwn(value, key);
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const copy = value => JSON.parse(JSON.stringify(value));
  // index.html で既存devパネルの適用より先に確保した正本を使う。
  const originals = C.DEV_OVERRIDE_ORIGINALS || Object.fromEntries(chars.map(c => [c.id, { skillName: c.skill?.name, lines: copy(c.lines || {}) }]));

  function validate(saved) {
    const invalid = () => { throw Error('スキル名・台詞の保存形式が不正です'); };
    if (!plain(saved) || saved.format !== 'cbp-dev-overrides' || saved.version !== 1 || !plain(saved.overrides)) invalid();
    for (const [id, entry] of Object.entries(saved.overrides)) {
      if (!chars.some(c => c.id === id) || !plain(entry) || Object.keys(entry).some(k => !['skillName', 'lines'].includes(k))) invalid();
      if (own(entry, 'skillName') && (!skillIds.has(id) || !chars.find(c => c.id === id).skill || typeof entry.skillName !== 'string')) invalid();
      if (own(entry, 'lines')) {
        if (!plain(entry.lines) || Object.keys(entry.lines).some(k => !own(fields, k))) invalid();
        for (const [field, value] of Object.entries(entry.lines)) {
          if (field === 'midFight' ? !Array.isArray(value) || value.some(line => typeof line !== 'string') : typeof value !== 'string') invalid();
        }
      }
    }
    return copy(saved.overrides);
  }
  const nonempty = value => typeof value === 'string' ? !!value.trim() : Array.isArray(value) && value.some(line => line.trim());
  function apply(targets, base, values, previous = {}) {
    for (const c of targets) {
      const next = values[c.id] || {}, prev = previous[c.id] || {}, original = base[c.id];
      if (c.skill && skillIds.has(c.id) && (own(next, 'skillName') || own(prev, 'skillName'))) {
        c.skill.name = nonempty(next.skillName) ? next.skillName : original.skillName;
      }
      for (const field of Object.keys(fields)) {
        if (!own(next.lines || {}, field) && !own(prev.lines || {}, field)) continue;
        c.lines ||= {};
        const value = next.lines?.[field];
        if (nonempty(value)) c.lines[field] = Array.isArray(value) ? value.filter(line => line.trim()) : value;
        else if (own(original.lines, field)) c.lines[field] = copy(original.lines[field]);
        else delete c.lines[field];
      }
    }
  }
  function setCharacter(values, id, input, base) {
    // UIの空欄・正本と同じ値は保存済み上書きから除く。
    const entry = {}, lines = {};
    if (skillIds.has(id) && nonempty(input.skillName) && input.skillName !== base[id].skillName) entry.skillName = input.skillName;
    for (const field of Object.keys(fields)) {
      const value = input.lines[field];
      if (nonempty(value) && JSON.stringify(value) !== JSON.stringify(base[id].lines[field])) lines[field] = value;
    }
    if (Object.keys(lines).length) entry.lines = lines;
    const next = { ...values };
    if (Object.keys(entry).length) next[id] = entry;
    else delete next[id];
    return next;
  }
  C.DevOverrides = { validate, apply, setCharacter };
  await C.Custom.ready;

  const key = C.storageKey('cbp-dev-overrides-v1');
  const pack = values => JSON.stringify({ format: 'cbp-dev-overrides', version: 1, overrides: values }, null, 2);
  let overrides = {}, loadError = '';
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      // 旧区分は検証前に読み替える。新キーを優先し、保存域は次の保存まで変えない。
      if (plain(saved?.overrides)) for (const entry of Object.values(saved.overrides)) {
        if (plain(entry?.lines) && own(entry.lines, 'taunt')) {
          if (!own(entry.lines, 'midFight')) entry.lines.midFight = entry.lines.taunt;
          delete entry.lines.taunt;
        }
      }
      overrides = validate(saved);
    }
  } catch (_) {
    loadError = '保存データを読み込めません。上書きを防ぐため保存を停止しています。ブラウザの保存設定・保存データを確認してください。';
  }
  apply(chars, originals, overrides);

  const panel = document.createElement('details'); panel.id = 'dev-overrides'; panel.open = true;
  const summary = document.createElement('summary'); summary.textContent = '開発者モード：スキル名・台詞（キャラ単位・空欄＝正本に戻す）';
  const content = document.createElement('div'); content.className = 'dev-dialogue-content';
  const note = document.createElement('p');
  note.textContent = 'こちらは空欄で正本に戻し、もう一方の「セリフ編集」パネルは空欄を「無言」として保存するため、空欄の意味が逆です。スキル名は追加5人、台詞は全内蔵キャラが対象です。キャラごとの「保存」でこのブラウザに保存し、次の表示から反映します。空欄で保存すると上書きを解除して正本の値に戻します。通常起動と正本ファイルには反映されません。既存のセリフ編集と重なる項目は、起動時にこちらの保存値を優先し、編集中は最後の保存を反映します。';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  status.textContent = loadError || '編集してキャラごとの「保存」を押してください。見出しを押すと一覧を閉じて遊べます。';
  const download = document.createElement('button'); download.type = 'button'; download.className = 'btn btn-ghost btn-sm';
  download.textContent = '保存済みのキャラ上書きをJSONで書き出す'; download.disabled = !!loadError;
  download.addEventListener('click', () => {
    if (loadError) return;
    const url = URL.createObjectURL(new Blob([pack(overrides)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'cbp-dev-overrides.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = '保存済みのキャラ上書きを書き出しました。未保存の編集は含みません。';
  });
  content.append(note, download, status);
  for (const c of chars) {
    const group = document.createElement('fieldset'); group.dataset.charId = c.id;
    const legend = document.createElement('legend'); legend.textContent = c.nick || c.name;
    const state = document.createElement('span'); state.className = 'dev-overrides-state'; state.textContent = '保存済みの値';
    group.append(legend, state);
    const inputs = {};
    const addInput = (field, caption, single = false) => {
      const row = document.createElement('div'); row.className = 'dev-dialogue-row';
      const label = document.createElement('label'); label.textContent = caption;
      const input = document.createElement(single ? 'input' : 'textarea');
      if (single) input.type = 'text'; else input.rows = field === 'midFight' ? 3 : 2;
      input.dataset.overrideId = `${c.id}.${field}`;
      input.addEventListener('input', () => { state.textContent = '未保存の変更あり'; status.textContent = `${c.nick || c.name}：未保存です。`; });
      inputs[field] = input; label.append(input); row.append(label); group.append(row);
    };
    if (skillIds.has(c.id) && c.skill) addInput('skillName', 'スキル名', true);
    for (const [field, caption] of Object.entries(fields)) addInput(field, caption);
    const fill = () => {
      const entry = overrides[c.id] || {};
      for (const [field, input] of Object.entries(inputs)) {
        const value = field === 'skillName' ? entry.skillName ?? originals[c.id].skillName : entry.lines?.[field] ?? originals[c.id].lines[field];
        input.value = Array.isArray(value) ? value.join('\n') : value || '';
      }
    };
    fill();
    const save = document.createElement('button'); save.type = 'button'; save.className = 'btn btn-ghost btn-sm'; save.textContent = '保存（空欄は正本に戻す）'; save.disabled = !!loadError;
    save.addEventListener('click', () => {
      if (loadError) return;
      const input = { skillName: inputs.skillName?.value, lines: {} };
      for (const field of Object.keys(fields)) input.lines[field] = field === 'midFight' ? inputs[field].value.split(/\r?\n/).filter(line => line.trim()) : inputs[field].value;
      const next = setCharacter(overrides, c.id, input, originals);
      try { localStorage.setItem(key, pack(next)); }
      catch (_) { status.textContent = '保存できませんでした。ブラウザの保存設定・空き容量を確認してください。この変更は反映されていません。'; return; }
      apply([c], originals, next, { [c.id]: input }); overrides = next; fill(); state.textContent = '保存済み';
      status.textContent = `${c.nick || c.name}：保存しました。空欄の上書きは解除しました。`;
    });
    group.append(save); content.append(group);
  }
  panel.append(summary, content); document.body.prepend(panel);
})();
