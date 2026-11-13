/* ギャラリー：勝ち抜きをそのキャラで5人抜きすると、そのキャラの試合のポーズ（横向き12枚）が見られる。
 * 解放の記録は保存域（CBP.storageKey）に置く。対象は既存6人だけ（自作キャラ・モブは含めない）。 */
(() => {
  'use strict';
  const C = window.CBP;
  const KEY = 'cbp-gallery';
  C.GALLERY_LABELS = { guard: '構え', jab: 'ジャブ', straight: 'ストレート', hook: 'フック', upper: 'アッパー', body: 'ボディブロー',
    block: 'ガード', hitFace: '被弾（顔）', hitBody: '被弾（ボディ）', win: '勝ち', ko: 'ダウン', pinch: 'ピンチ' };
  const known = id => C.CHARS.some(c => c.id === id);
  function read() {
    try { const v = JSON.parse(localStorage.getItem(C.storageKey(KEY)) || '[]'); return Array.isArray(v) ? v.filter(known) : []; } catch (e) { return []; }
  }
  // 確認用：検証用の保存域（?testSave=…）のときだけ、&galleryAll=1 で全員を見られる。通常のセーブには効かない
  const showAll = () => !!C.TEST_SAVE && new URLSearchParams(window.location?.search || '').get('galleryAll') === '1';

  C.Gallery = {
    unlocked: () => showAll() ? C.CHARS.map(c => c.id) : read(),
    isUnlocked: id => C.Gallery.unlocked().includes(id),
    unlock(id) { // 新しく開いたときだけ true
      const list = read();
      if (!known(id) || list.includes(id)) return false;
      try { localStorage.setItem(C.storageKey(KEY), JSON.stringify([...list, id])); return true; } catch (e) { return false; }
    },
  };

  C.GalleryView = class {
    constructor(root, viewer) {
      this.root = root; this.viewer = viewer; this.id = null; this.index = 0;
      this.chars = root.querySelector('#gallery-chars'); this.poses = root.querySelector('#gallery-poses');
      this.chars.addEventListener('click', ev => { const b = ev.target.closest?.('[data-id]'); if (b && !b.disabled) this.select(b.dataset.id); });
      this.poses.addEventListener('click', ev => { const b = ev.target.closest?.('[data-index]'); if (b) this.open(+b.dataset.index); });
      viewer.querySelector('[data-gallery-prev]').addEventListener('click', () => this.open(this.index - 1));
      viewer.querySelector('[data-gallery-next]').addEventListener('click', () => this.open(this.index + 1));
      viewer.querySelector('[data-gallery-close]').addEventListener('click', () => viewer.close());
      viewer.addEventListener('keydown', ev => {
        if (ev.key === 'ArrowLeft') this.open(this.index - 1);
        else if (ev.key === 'ArrowRight') this.open(this.index + 1);
      });
    }

    render() {
      const open = C.Gallery.unlocked();
      if (!open.includes(this.id)) this.id = open[0] || null;
      this.chars.innerHTML = C.CHARS.map(c => {
        const ok = open.includes(c.id), name = C.escapeHTML(c.nick || c.name);
        return `<button class="gallery-char${ok ? '' : ' is-locked'}" data-id="${c.id}" type="button" style="--theme:${c.theme}"
          aria-pressed="${c.id === this.id}"${ok ? '' : ' disabled'}><img src="${C.spritePath(c.id, 'guard')}" alt="">
          <span>${ok ? name : 'まだ見られない'}</span></button>`;
      }).join('');
      this.root.querySelector('#gallery-empty').hidden = open.length > 0;
      this.renderPoses();
    }

    select(id) {
      this.id = id;
      this.chars.querySelectorAll('[data-id]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
      this.renderPoses();
    }

    // 横向きの絵は向きがまちまちなので、全部右向きにそろえて見せる
    flip(c, pose) { return C.sideFacing(c, pose) === 'L'; }

    renderPoses() {
      const c = this.id && C.charById(this.id);
      this.poses.hidden = !c;
      this.root.querySelector('#gallery-name').textContent = c ? `${c.nick || c.name}の試合のポーズ` : '';
      if (!c) { this.poses.innerHTML = ''; return; }
      this.poses.innerHTML = Object.keys(C.POSE_FILES).map((pose, i) => `<button class="gallery-pose" data-index="${i}" type="button">
        <img src="${C.spritePath(c.id, pose)}" alt="" class="${this.flip(c, pose) ? 'is-flip' : ''}"><span>${C.GALLERY_LABELS[pose]}</span></button>`).join('');
    }

    open(index) {
      const c = C.charById(this.id), poses = Object.keys(C.POSE_FILES);
      if (!c) return;
      this.index = (index + poses.length) % poses.length;
      const pose = poses[this.index], img = this.viewer.querySelector('img');
      C.setImage(img, C.spritePath(c.id, pose), C.spritePath(c.id, 'guard'));
      img.classList.toggle('is-flip', this.flip(c, pose));
      this.viewer.querySelector('figcaption').textContent = `${c.nick || c.name}：${C.GALLERY_LABELS[pose]}（${this.index + 1} / ${poses.length}）`;
      if (!this.viewer.open) this.viewer.showModal();
    }
  };
})();
