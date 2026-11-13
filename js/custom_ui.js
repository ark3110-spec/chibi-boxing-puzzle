(() => {
  'use strict';
  const C = window.CBP, X = C.Custom;
  // 登録画面内の確認。ブラウザ全体を止める同期confirmを使わない。
  C.createCustomConfirmation = () => {
    const modal = document.createElement('dialog'); modal.className = 'dlg'; modal.setAttribute('aria-labelledby', 'custom-confirm-title');
    const title = document.createElement('h2'); title.id = 'custom-confirm-title'; title.textContent = '変更の確認';
    const body = document.createElement('p'), buttons = document.createElement('div'); buttons.className = 'custom-tools';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn-ghost'; cancel.textContent = 'キャンセル';
    const accept = document.createElement('button'); accept.type = 'button'; accept.className = 'btn btn-gong'; accept.textContent = '確認して実行';
    buttons.appendChild(cancel); buttons.appendChild(accept); modal.appendChild(title); modal.appendChild(body); modal.appendChild(buttons); document.body.appendChild(modal);
    let resolvePending = null;
    const finish = value => { if (!resolvePending) return; const resolve = resolvePending; resolvePending = null; modal.close(); resolve(value); };
    cancel.addEventListener('click', () => finish(false)); accept.addEventListener('click', () => finish(true));
    modal.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    return text => {
      if (resolvePending) return Promise.resolve(false);
      body.textContent = text;
      return new Promise(resolve => { resolvePending = resolve; modal.showModal(); cancel.focus(); });
    };
  };
  C.initCustomEditor = () => {
    const dialog = document.querySelector('#dlg-custom'), form = dialog.querySelector('form');
    const pick = dialog.querySelector('#custom-pick'), status = dialog.querySelector('#custom-status');
    const slots = dialog.querySelector('#custom-images'), points = dialog.querySelector('#custom-points');
    // 能力ポイントの使用量。数値を変えるたびに計算し直す（保存できるかの判定は X の save 側）。
    function updatePoints() {
      if (!points) return;
      const p = X.statPoints({ hp: Number(field('hp').value), power: Number(field('power').value), interval: Number(field('interval').value) });
      const over = p.total - X.STAT_BUDGET;
      points.textContent = `能力ポイント ${p.total} ／ ${X.STAT_BUDGET}（体力${p.hp}・攻撃${p.power}・間隔${p.interval}）` + (over > 0 ? `　${over}点オーバーです。このままでは保存できません` : '');
      points.classList?.toggle('is-over', over > 0);
    }
    let draft, dirty = false, busy = false;
    const confirmChange = C.createCustomConfirmation();
    const field = name => form.elements.namedItem(name);
    const message = (value, error = false) => { status.textContent = value; status.classList.toggle('is-error', error); };
    const option = (parent, value, label) => { const el = document.createElement('option'); el.value = value; el.textContent = label; parent.appendChild(el); };
    for (const name of ['fav', 'weak']) for (const k of C.PUNCH_KEYS) option(field(name), k, C.PUNCHES[k].name);
    for (const [k, skill] of Object.entries(X.SKILLS)) option(field('skillType'), k, skill.label + '：' + skill.desc);
    for (const [k, label] of Object.entries(X.EXPRESSIONS)) option(field('introExpression'), k, label);
    function populatePick() {
      pick.replaceChildren(); option(pick, '', '新しいキャラ');
      for (const c of X.records) option(pick, c.id, `${c.nick || c.name}（${c.name}・${c.id.slice(-6)}）`);
    }
    function blank() { return X.normalize({ id: X.newId(), name: 'オリジナルボクサー' }); }
    function load(id) {
      draft = JSON.parse(JSON.stringify(X.records.find(c => c.id === id) || blank()));
      populatePick(); pick.value = X.records.some(c => c.id === draft.id) ? draft.id : '';
      for (const name of ['name', 'nick', 'theme', 'fav', 'weak', 'skillName', 'skillType', 'intro', 'introExpression']) field(name).value = draft[name];
      for (const name of ['hp', 'power', 'interval']) field(name).value = draft.stats[name];
      dialog.querySelector('#custom-delete').disabled = !pick.value;
      renderImages(); updatePoints(); dirty = false;
    }
    async function canLeave() { return !busy && (!dirty || await confirmChange('保存していない変更を破棄しますか？')); }
    function lock(value) {
      busy = value;
      dialog.querySelectorAll('input, select, textarea, button').forEach(el => { el.disabled = value; });
      if (!value) dialog.querySelector('#custom-delete').disabled = !pick.value;
    }
    async function action(fn) {
      if (busy) return; lock(true);
      try { await fn(); } catch (e) { message(e.message, true); } finally { lock(false); }
    }
    function renderImages() {
      const opened = new Set([...slots.querySelectorAll('details[open]')].map(el => el.dataset.group)); slots.replaceChildren();
      const labels = { side: '横向き（試合・ダウン・休憩／構え1枚のみ必須・他は任意）', front: '正面（1人称の相手／全枠任意）', expression: '表情（試合前の掛け合い／全枠任意）', special: '追加ポーズ（結果・コーナー休憩／全枠任意）' };
      for (const [group, definitions] of Object.entries(X.SLOTS)) {
        const details = document.createElement('details'); details.dataset.group = group; details.open = opened.has(group);
        const summary = document.createElement('summary'); summary.textContent = `${labels[group]}：${Object.keys(draft.images[group]).length} / ${Object.keys(definitions).length}`; details.appendChild(summary);
        for (const [slot, label] of Object.entries(definitions)) {
          const row = document.createElement('div'); row.className = 'custom-image-row';
          const img = document.createElement('img'); img.alt = label + 'のプレビュー'; C.setImage(img, draft.images[group][slot]); row.appendChild(img);
          const chooser = document.createElement('label'); chooser.textContent = label;
          const info = X.SLOT_INFO[group][slot];
          const badge = document.createElement('span'); badge.className = 'custom-slot-badge' + (info.required ? ' is-required' : ''); badge.textContent = info.required ? '必須（簡易版はこれだけ）' : '任意'; chooser.appendChild(badge);
          const usage = document.createElement('small'); usage.className = 'custom-slot-usage'; usage.textContent = info.usage; chooser.appendChild(usage);
          const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; chooser.appendChild(input); row.appendChild(chooser);
          input.addEventListener('change', () => action(async () => {
            const file = input.files[0]; if (!file) return;
            if (file.size > X.LIMIT.imageBytes || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('PNG・JPEG・WebP、1枚3MiB以下を選んでください');
            const url = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('画像を読み取れません')); r.readAsDataURL(file); });
            await X.decodeImage(url); draft.images[group][slot] = url; dirty = true; renderImages(); message('画像を選びました。「保存して登録」で確定します');
          }));
          if (group === 'side') {
            const label = document.createElement('label'); label.textContent = '元絵の向き'; const direction = document.createElement('select');
            for (const [value, caption] of [['R', '右向き'], ['L', '左向き'], ['F', '正面・反転なし']]) option(direction, value, caption);
            direction.value = draft.facing[slot]; direction.addEventListener('change', () => { draft.facing[slot] = direction.value; dirty = true; }); label.appendChild(direction); row.appendChild(label);
          }
          const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-ghost btn-sm'; remove.textContent = '画像を外す';
          remove.addEventListener('click', () => { delete draft.images[group][slot]; dirty = true; renderImages(); }); row.appendChild(remove);
          details.appendChild(row);
        }
        slots.appendChild(details);
      }
    }
    form.addEventListener('input', () => { dirty = true; updatePoints(); });
    form.addEventListener('submit', ev => {
      ev.preventDefault(); action(async () => {
        const next = { ...draft, stats: {} };
        for (const name of ['name', 'nick', 'theme', 'fav', 'weak', 'skillName', 'skillType', 'intro', 'introExpression']) next[name] = field(name).value;
        for (const name of ['hp', 'power', 'interval']) next.stats[name] = Number(field(name).value);
        // 必須の構えが無いときは、閉じている「横向き」欄を開いて入れる場所を見せる。
        if (!next.images?.side?.guard) { const side = slots.querySelector?.('details[data-group="side"]'); if (side) side.open = true; }
        await X.mutate('save', next); load(next.id); message('保存しました。キャラ選択から使用できます');
      });
    });
    pick.addEventListener('change', async () => { const id = pick.value; if (await canLeave()) { load(id); message(''); } else pick.value = X.records.some(c => c.id === draft.id) ? draft.id : ''; });
    dialog.querySelector('#custom-new').addEventListener('click', async () => { if (await canLeave()) { load(''); message(''); } });
    dialog.querySelector('#custom-delete').addEventListener('click', async () => {
      if (!await confirmChange('このカスタムキャラを削除しますか？ 直前の変更は復元できます。大切なキャラは先にバックアップを書き出してください。')) return;
      action(async () => { await X.mutate('remove', draft.id); load(''); message('削除しました。「直前の変更を戻す」で復元できます'); });
    });
    dialog.querySelector('#custom-restore').addEventListener('click', async () => {
      if (!await canLeave() || !await confirmChange('全カスタムキャラを直前の保存状態に戻しますか？ 今の状態も次の復元対象として残ります。')) return;
      action(async () => { await X.mutate('restore'); load(''); message('直前の保存状態に戻しました'); });
    });
    dialog.querySelector('#custom-export').addEventListener('click', () => {
      if (X.error) { message(X.error, true); return; }
      const blob = new Blob([X.repository.export()], { type: 'application/json' }); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'chibi-boxer-characters-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      message('保存済みの全カスタムキャラと画像を書き出しました。未保存の編集は含みません');
    });
    dialog.querySelector('#custom-import').addEventListener('change', ev => action(async () => {
      const file = ev.target.files[0]; ev.target.value = ''; if (!file) return;
      if (dirty && !await confirmChange('未保存の編集を破棄してバックアップを読み込みますか？')) return;
      if (file.size > X.LIMIT.totalBytes * 1.15) throw Error('バックアップは約36MiB以下にしてください');
      await X.mutate('import', await file.text()); load(''); message('追加読み込みしました。同じIDのキャラは新しいIDで複製し、元のキャラを保持しました');
    }));
    const close = async () => { if (await canLeave()) dialog.close(); };
    dialog.querySelector('#custom-close').addEventListener('click', close);
    dialog.addEventListener('cancel', ev => { ev.preventDefault(); close(); });
    document.querySelectorAll('[data-open-custom]').forEach(button => button.addEventListener('click', async () => {
      await X.ready; load(''); message(X.error || 'このブラウザ・同じ起動場所に保存します。画像込みのバックアップを定期的に書き出してください', !!X.error); dialog.showModal();
      if (X.error) { lock(true); dialog.querySelector('#custom-close').disabled = false; busy = false; }
    }));
  };
})();
