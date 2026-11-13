/* 画面の切り替え：タイトル → キャラ選択 → 試合 → 結果 */
(async () => {
  await CBP.Custom.ready;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = CBP.escapeHTML;
  const screens = { title: $('#screen-title'), select: $('#screen-select'), dialogue: $('#screen-dialogue'), fight: $('#screen-fight'), gallery: $('#screen-gallery') };
  let startSerial = 0;
  const dialogue = new CBP.DialogueView(screens.dialogue);
  const gallery = new CBP.GalleryView(screens.gallery, $('#dlg-gallery'));

  const store = {
    get(k, d) { try { const v = localStorage.getItem(CBP.storageKey(k)); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(CBP.storageKey(k), v); } catch (e) { /* 保存できない環境では覚えない */ } },
  };

  const state = {
    p: store.get('cbp-p', 'yuki'),
    e: store.get('cbp-e', 'random'),
    diff: store.get('cbp-diff', 'normal'),
    view: store.get('cbp-view', 'side'), // オプション：side=3人称（横から） / pov=1人称
    skillMode: store.get('cbp-skill', 'manual'), // オプション：manual=ボタンで / auto=満タンで自動発動
    slot: 'p',
    mode: 'vs', // vs=対戦（相手を選ぶ） / arcade=勝ち抜き
  };
  let arcade = null; // 勝ち抜き中：{ ladder: [相手ID...], stage: 何戦目（0から） }
  if (state.view !== 'pov') state.view = 'side';
  if (state.skillMode !== 'auto') state.skillMode = 'manual';
  if (!CBP.charById(state.p)) state.p = 'yuki';
  if (state.e !== 'random' && !CBP.charById(state.e)) state.e = 'random';
  if (!CBP.DIFFICULTY[state.diff]) state.diff = 'normal';

  function show(name) {
    if (name !== 'dialogue') { startSerial++; dialogue.sequence?.cancel(); }
    for (const k in screens) screens[k].hidden = k !== name;
    document.body.dataset.screen = name;
    CBP.Sound.music(name === 'fight' ? 'fight' : 'title'); // 場面の曲（曲のファイルがなければ無音）
    window.scrollTo(0, 0);
  }

  /* ---------- タイトル ---------- */
  const lineup = $('#title-lineup');
  lineup.innerHTML = CBP.CHARS.map((c, i) =>
    `<img src="${CBP.spritePath(c.id, 'guard')}" alt="" style="--i:${i}" class="${i % 2 ? 'is-flip' : ''}">`).join('');
  const openSelect = (mode) => { CBP.Sound.unlock(); state.mode = mode; state.slot = 'p'; renderSelect(); show('select'); };
  $('#btn-play').addEventListener('click', () => openSelect('vs'));
  $('#btn-arcade').addEventListener('click', () => openSelect('arcade'));
  $('#btn-gallery').addEventListener('click', () => { gallery.render(); show('gallery'); });
  $('#btn-gallery-back').addEventListener('click', () => show('title'));
  document.querySelectorAll('[data-open-howto]').forEach((b) => b.addEventListener('click', () => openDialog('#dlg-howto')));

  /* ---------- キャラ選択 ---------- */
  const grid = $('#char-grid');
  const punchChip = (label, type) => type
    ? `<span class="pc"><small>${label}</small><span class="mini" style="--tk:${CBP.PUNCHES[type].color}">${CBP.PUNCHES[type].kana}</span>${CBP.PUNCHES[type].name}</span>` : '';
  function renderCards() { grid.innerHTML = CBP.playableChars().map((c) => `
    <button class="card" data-id="${c.id}" style="--theme:${c.theme}" type="button">
      <span class="card-img"><img src="${CBP.spritePath(c.id, 'guard')}" alt=""></span>
      <span class="card-body">
        <span class="card-style">${esc(c.style)}</span>
        <span class="card-name">${c.nick ? `${esc(c.nick)}<small>${esc(c.name)}</small>` : `${esc(c.name)}<small>${esc(c.ruby)}</small>`}</span>
        <span class="card-punch">${punchChip('得意', c.fav)}${punchChip('苦手', c.weak)}</span>
        <span class="card-ability"><b>スキル「${esc(c.skill.name)}」</b>${esc(c.skill.desc)}<small>ゲージ：${c.skill.charge === 'counter' ? 'カウンター・ガードでたまる' : `${CBP.PUNCHES[c.fav].name}を消すとたまる`}</small></span>
      </span>
      <span class="card-badge card-badge-p">赤</span><span class="card-badge card-badge-e">青</span>
    </button>`).join(''); }
  renderCards();

  grid.addEventListener('click', (ev) => {
    const card = ev.target.closest('.card'); if (!card) return;
    const id = card.dataset.id;
    if (state.mode === 'arcade') { state.p = id; }
    else if (state.slot === 'p') { state.p = id; state.slot = 'e'; }
    else { state.e = id; }
    renderSelect();
  });
  document.querySelectorAll('.slot').forEach((s) => s.addEventListener('click', () => {
    if (state.mode === 'arcade') return;
    state.slot = s.dataset.slot; renderSelect();
  }));
  $('#btn-random').addEventListener('click', () => { state.e = 'random'; state.slot = 'e'; renderSelect(); });
  document.querySelectorAll('[name="diff"]').forEach((r) => r.addEventListener('change', () => { state.diff = r.value; store.set('cbp-diff', r.value); }));
  $('#btn-back-title').addEventListener('click', () => show('title'));

  function slotHTML(id) {
    if (id === 'random') return `<span class="slot-img is-random">?</span><span class="slot-name">おまかせ</span>`;
    const c = CBP.charById(id);
    return `<span class="slot-img"><img src="${CBP.spritePath(id, 'guard')}" alt=""></span><span class="slot-name">${esc(c.nick || c.name)}</span>`;
  }

  function renderSelect() {
    const arc = state.mode === 'arcade';
    if (arc) state.slot = 'p';
    screens.select.classList.toggle('is-arcade', arc);
    $('#select-title').textContent = arc ? '勝ち抜き' : '対戦カード';
    $('#slot-p .slot-face').innerHTML = slotHTML(state.p);
    $('#slot-e .slot-face').innerHTML = arc
      ? `<span class="slot-img is-random">${CBP.ARCADE.stages}</span><span class="slot-name">${CBP.ARCADE.stages}人と連戦</span>`
      : slotHTML(state.e);
    $('#slot-e').disabled = arc;
    $('#btn-random').hidden = arc;
    $('#arcade-hint').hidden = !arc;
    document.querySelectorAll('.slot').forEach((s) => s.classList.toggle('is-active', s.dataset.slot === state.slot));
    $('#select-hint').textContent = arc ? 'あなたのキャラを選んでください'
      : state.slot === 'p' ? '赤コーナー（あなた）を選んでください' : '青コーナー（相手）を選んでください。おまかせでもOK';
    grid.querySelectorAll('.card').forEach((c) => {
      c.classList.toggle('is-p', c.dataset.id === state.p);
      c.classList.toggle('is-e', !arc && c.dataset.id === state.e);
      c.setAttribute('aria-pressed', String(c.dataset.id === (state.slot === 'p' ? state.p : state.e)));
    });
    document.querySelectorAll('[name="diff"]').forEach((r) => { r.checked = r.value === state.diff; });
    $('#pov-hint').hidden = state.view !== 'pov' || arc;
    $('#opt-summary').textContent = `${state.view === 'pov' ? '1人称' : '3人称'}・スキル${state.skillMode === 'auto' ? '自動' : '手動'}`;
  }

  /* ---------- オプション（タイトル・選択画面・一時停止から開く） ---------- */
  function openOptions() {
    document.querySelectorAll('[name="view"]').forEach((r) => { r.checked = r.value === state.view; });
    document.querySelectorAll('[name="skillmode"]').forEach((r) => { r.checked = r.value === state.skillMode; });
    $('#opt-note').hidden = screens.fight.hidden; // 試合中に開いたときだけ
    for (const kind of ['bgm', 'se']) { $(`#opt-vol-${kind}`).value = Math.round(CBP.Sound.volume[kind] * 100); paintVolume(kind); }
    openDialog('#dlg-options');
  }
  const paintVolume = (kind) => { $(`#opt-vol-${kind}-out`).textContent = `${$(`#opt-vol-${kind}`).value}%`; };
  for (const kind of ['bgm', 'se']) {
    const slider = $(`#opt-vol-${kind}`);
    slider.addEventListener('input', () => { CBP.Sound.setVolume(kind, slider.value / 100); paintVolume(kind); });
    if (kind === 'se') slider.addEventListener('change', () => CBP.Sound.hit(false)); // 離したときに試しに鳴らす
  }
  document.querySelectorAll('[data-open-options]').forEach((b) => b.addEventListener('click', openOptions));
  document.querySelectorAll('[name="view"]').forEach((r) => r.addEventListener('change', () => { state.view = r.value; store.set('cbp-view', r.value); renderSelect(); }));
  document.querySelectorAll('[name="skillmode"]').forEach((r) => r.addEventListener('change', () => {
    state.skillMode = r.value; store.set('cbp-skill', r.value);
    fight.autoSkill = state.skillMode === 'auto'; // 試合中でもすぐ切り替わる
    renderSelect();
  }));

  $('#btn-gong').addEventListener('click', () => {
    store.set('cbp-p', state.p); store.set('cbp-e', state.e);
    if (state.mode === 'arcade') startArcade(); else { arcade = null; startFight(); }
  });

  /* ---------- 試合 ---------- */
  const dom = {
    root: screens.fight, ring: $('#ring'), board: $('#board'), strip: $('#strip'),
    fp: $('#f-p'), fe: $('#f-e'), hudP: $('#hud-p'), hudE: $('#hud-e'),
    clock: $('#hud-clock'), round: $('#hud-round'), tele: $('#tele'),
    banner: $('#banner'), fx: $('#fx'), count: $('#count'), bubbleP: $('#bubble-p'), bubbleE: $('#bubble-e'),
    gloves: $('#pov-gloves'), povNote: $('#pov-note'),
    skill: $('#btn-skill'), cutin: $('#cutin'),
    interval: $('#interval'), stopfx: $('#stopfx'),
  };
  const fight = new CBP.Fight(dom, { onEnd: showResult });
  fight.autoSkill = state.skillMode === 'auto';
  let current = null;

  function startFight(eId) {
    let e = eId || state.e;
    if (e === 'random') {
      const others = CBP.playableChars().filter((c) => c.id !== state.p);
      const front = others.filter((c) => CBP.povAvailable(c.id).length); // 1人称は正面の絵がある相手から
      const pool = state.view === 'pov' && front.length ? front : others;
      e = pool[Math.floor(Math.random() * pool.length)].id;
    }
    current = { p: state.p, e, diff: state.diff, view: state.view };
    beginMatch();
  }

  // 対戦・勝ち抜きの各stage・もう一戦・continueの共通入口。
  function beginMatch() {
    fight.stop(); fight.board.setLocked(true);
    closeDialog('#dlg-ladder');
    closeDialog('#dlg-result');
    show('dialogue');
    const token = ++startSerial, match = { ...current };
    let started = false;
    dialogue.start(CBP.charById(match.p), CBP.charById(match.e), () => {
      if (started || token !== startSerial || screens.dialogue.hidden) return;
      started = true; show('fight'); CBP.Sound.unlock();
      fight.start(match.p, match.e, match.diff, match.view);
    });
  }

  $('#btn-pause').addEventListener('click', () => { fight.setPaused(true); openDialog('#dlg-pause'); });
  $('#btn-resume').addEventListener('click', () => { closeDialog('#dlg-pause'); fight.setPaused(false); });
  $('#btn-quit').addEventListener('click', () => { closeDialog('#dlg-pause'); fight.stop(); arcade = null; renderSelect(); show('select'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !screens.fight.hidden && fight.phase !== 'over' && !fight.paused) {
      fight.setPaused(true); openDialog('#dlg-pause');
    }
  });

  const soundBtns = document.querySelectorAll('[data-sound]');
  const paintSound = () => soundBtns.forEach((b) => { b.setAttribute('aria-pressed', String(!CBP.Sound.muted)); b.querySelector('span').textContent = CBP.Sound.muted ? '音オフ' : '音オン'; });
  soundBtns.forEach((b) => b.addEventListener('click', () => { CBP.Sound.toggle(); paintSound(); }));
  paintSound();

  /* ---------- 結果 ---------- */
  /* 結果の絵：上が相手、下が自分を1人ずつ。KOで負けた側は大判KOの絵（読めなければ通常のダウン絵） */
  function resultFigure(key, c, pose, koBig) {
    const fig = $(`#result-fig-${key}`), img = fig.querySelector('img');
    const sprite = () => {
      const native = CBP.sideFacing(c, pose);
      fig.classList.remove('is-big');
      img.classList.toggle('is-flip', native !== 'F' && native !== (key === 'p' ? 'R' : 'L'));
      CBP.setImage(img, CBP.spritePath(c.id, pose));
    };
    fig.querySelector('figcaption').textContent = `${key === 'p' ? 'あなた' : '相手'}：${c.nick || c.name}`;
    if (koBig && CBP.hasSpecial(c.id, 'koBig')) {
      fig.classList.add('is-big'); img.classList.remove('is-flip'); img.hidden = false;
      img.onerror = () => { img.onerror = null; sprite(); };
      img.src = CBP.specialPath(c.id, 'koBig');
    } else sprite();
  }

  function showResult(r) {
    const pc = CBP.charById(r.p.id), ec = CBP.charById(r.e.id);
    const win = r.winner === 'p', lose = r.winner === 'e';
    CBP.Sound.music(win ? 'win' : lose ? 'lose' : ''); // 引き分けは曲を止める
    const ko = !!CBP.resultKO(r);
    resultFigure('e', ec, win ? 'ko' : lose ? 'win' : 'guard', ko && win);
    resultFigure('p', pc, lose ? 'ko' : win ? 'win' : 'guard', ko && lose);
    const head = r.winner === null ? '引き分け' : win ? `${r.kind === '判定' ? '判定' : r.kind}勝ち！` : `${r.kind === '判定' ? '判定' : r.kind}負け…`;
    const dlg = $('#dlg-result');
    dlg.dataset.outcome = r.winner === null ? 'draw' : win ? 'win' : 'lose';
    $('#result-title').textContent = head;
    $('#result-sub').textContent = `${pc.nick || pc.name} vs ${ec.nick || ec.name}・${current.view === 'pov' ? '1人称・' : ''}${CBP.DIFFICULTY[current.diff].label}・${r.round}ラウンド`;
    const again = $('#btn-again'), back = $('#btn-reselect'), note = $('#result-arcade'), unlock = $('#result-unlock');
    note.hidden = !arcade; unlock.hidden = true;
    if (arcade) {
      const n = arcade.ladder.length, no = arcade.stage + 1;
      arcade.won = win;
      if (win && no >= n) {
        note.textContent = `${n}人抜き達成！`; again.textContent = 'もう一度（最初から）'; back.textContent = 'タイトルへ';
        if (CBP.Gallery.unlock(pc.id)) { unlock.hidden = false; unlock.textContent = `ギャラリーで${pc.nick || pc.name}の試合のポーズが見られるようになりました`; }
      } else if (win) { note.textContent = `勝ち抜き ${no}/${n}`; again.textContent = '次の試合へ'; back.textContent = 'やめる'; }
      else { note.textContent = `第${no}戦で止まった…（${no - 1}/${n}）`; again.textContent = 'コンティニュー'; back.textContent = 'やめる'; }
    } else {
      again.textContent = 'もう一戦'; back.textContent = 'キャラを選びなおす';
    }
    const row = (label, a, b) => `<tr><th>${label}</th><td>${a}</td><td>${b}</td></tr>`;
    $('#result-table').innerHTML = `
      <thead><tr><th></th><td>あなた</td><td>相手</td></tr></thead>
      <tbody>${row('与えたダメージ', r.p.dealt, r.e.dealt)}${row('ダウン', r.p.downs, r.e.downs)}</tbody>
      <tbody class="is-you">${row('カウンター', r.p.counters, '')}${row('ガード', r.p.guards, '')}${row('最大つなぎ', r.p.maxChain, '')}</tbody>`;
    openDialog('#dlg-result');
  }
  $('#btn-again').addEventListener('click', () => {
    closeDialog('#dlg-result'); fight.stop();
    current.view = state.view; // 試合中にオプションで視点を変えていたら、次の試合から
    if (!arcade || !arcade.won) { beginMatch(); return; } // 対戦のもう一戦／勝ち抜きのコンティニュー
    if (arcade.stage + 1 >= arcade.ladder.length) { startArcade(); return; }
    arcade.stage++;
    openLadder();
  });
  $('#btn-reselect').addEventListener('click', () => {
    closeDialog('#dlg-result'); fight.stop();
    if (arcade) { arcade = null; show('title'); return; }
    renderSelect(); show('select');
  });

  /* ---------- 勝ち抜き ---------- */
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function buildLadder(pId) {
    const A = CBP.ARCADE;
    const mobs = CBP.MOBS.map((m) => m.id).filter((id) => (CBP.MOBS_READY || []).includes(id));
    const named = shuffle(CBP.playableChars().filter((c) => c.id !== pId).map((c) => c.id));
    return [...mobs, ...named.slice(0, Math.max(A.minNamed, A.stages - mobs.length))];
  }

  function startArcade() {
    arcade = { ladder: buildLadder(state.p), stage: 0, won: false };
    openLadder();
  }

  function openLadder() {
    const id = arcade.ladder[arcade.stage], c = CBP.charById(id), n = arcade.ladder.length;
    $('#ladder-stage').textContent = arcade.stage + 1 === n ? `最終戦（${n}/${n}）` : `第${arcade.stage + 1}戦（${arcade.stage + 1}/${n}）`;
    $('#ladder-p').src = CBP.spritePath(state.p, 'guard');
    $('#ladder-e').src = CBP.spritePath(id, 'guard');
    $('#ladder-name').textContent = c.nick || c.name;
    $('#ladder-list').innerHTML = arcade.ladder.map((lid, i) => {
      const lc = CBP.charById(lid);
      const st = i < arcade.stage ? 'is-done' : i === arcade.stage ? 'is-now' : '';
      const face = i > arcade.stage && !lc.mob ? '<span class="lad-q">?</span>' : `<img src="${CBP.spritePath(lid, 'guard')}" alt="">`;
      return `<li class="${st}" aria-label="第${i + 1}戦${i <= arcade.stage || lc.mob ? `：${esc(lc.nick || lc.name)}` : ''}">${face}<span class="lad-no">${i + 1}</span></li>`;
    }).join('');
    openDialog('#dlg-ladder');
  }

  $('#btn-ladder-go').addEventListener('click', () => startFight(arcade.ladder[arcade.stage]));
  const quitLadder = () => { closeDialog('#dlg-ladder'); arcade = null; renderSelect(); show('select'); };
  $('#btn-ladder-quit').addEventListener('click', quitLadder);
  $('#dlg-ladder').addEventListener('cancel', (e) => { e.preventDefault(); quitLadder(); });

  /* ---------- ダイアログ ---------- */
  function openDialog(sel) { const d = $(sel); if (!d.open) d.showModal(); }
  function closeDialog(sel) { const d = $(sel); if (d.open) d.close(); }
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeDialog(`#${b.closest('dialog').id}`)));
  $('#dlg-pause').addEventListener('cancel', (e) => { e.preventDefault(); closeDialog('#dlg-pause'); fight.setPaused(false); });
  $('#dlg-result').addEventListener('cancel', (e) => e.preventDefault());

  CBP.initCustomEditor();
  $('#test-save-note').hidden = !CBP.TEST_SAVE;
  window.addEventListener('cbp-custom-change', () => {
    if (!CBP.charById(state.p)) state.p = 'yuki';
    if (state.e !== 'random' && !CBP.charById(state.e)) state.e = 'random';
    renderCards(); renderSelect();
  });
  renderSelect();
  show('title');
  window.CBP.app = { fight, state, startFight, show, beginMatch, buildLadder, dialogue, get arcade() { return arcade; } }; // 動作確認用
})();
