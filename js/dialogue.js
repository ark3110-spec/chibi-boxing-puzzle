(() => {
  const C = window.CBP;
  /* next/skipが競合しても終了コールバックは一度だけ。テストからも同じ進行器を使う。 */
  C.DialogueSequence = class {
    constructor(lines, render, finish) { this.lines = lines; this.render = render; this.finish = finish; this.index = 0; this.done = false; }
    start() { if (this.done) return; if (!this.lines.length) this.end(); else this.render(this.lines[0], 0, this.lines.length); }
    next() { if (this.done) return; if (++this.index >= this.lines.length) this.end(); else this.render(this.lines[this.index], this.index, this.lines.length); }
    end() { if (this.done) return; this.done = true; this.finish(); }
    cancel() { this.done = true; }
  };
  C.DialogueView = class {
    constructor(root) {
      this.root = root; this.sequence = null;
      root.querySelector('[data-dialogue-next]').addEventListener('click', () => this.sequence?.next());
      root.querySelector('[data-dialogue-skip]').addEventListener('click', () => this.sequence?.end());
      root.querySelector('.dialogue-text').addEventListener('click', () => this.sequence?.next());
      root.addEventListener('keydown', ev => {
        if (root.hidden || ev.repeat) return;
        if (ev.key === 'Escape') { ev.preventDefault(); this.sequence?.end(); }
        else if (['Enter', ' ', 'ArrowRight'].includes(ev.key) && ev.target.tagName !== 'BUTTON') { ev.preventDefault(); this.sequence?.next(); }
      });
    }
    start(p, e, finish) {
      this.sequence?.cancel();
      const characters = { p, e }, expressions = { p: 'normal', e: 'normal' };
      this.sequence = new C.DialogueSequence(C.buildDialogue(p, e), (line, index, total) => {
        if (line.side) expressions[line.side] = line.expression;
        for (const side of ['p', 'e']) {
          const c = characters[side], el = this.root.querySelector('[data-dialogue-side="' + side + '"]');
          C.setImage(el.querySelector('img'), C.expressionPath(c.id, expressions[side]), C.spritePath(c.id, 'guard'));
          el.querySelector('figcaption').textContent = c.nick || c.name;
          el.classList.toggle('is-speaking', line.side === side);
        }
        this.root.querySelector('.dialogue-speaker').textContent = line.side ? characters[line.side].nick || characters[line.side].name : line.speaker;
        this.root.querySelector('.dialogue-line').textContent = line.text;
        this.root.querySelector('.dialogue-page').textContent = `${index + 1} / ${total}`;
        this.root.querySelector('[data-dialogue-next]').textContent = index + 1 === total ? '試合へ' : '次へ';
      }, finish);
      this.sequence.start(); this.root.focus();
    }
  };
})();
