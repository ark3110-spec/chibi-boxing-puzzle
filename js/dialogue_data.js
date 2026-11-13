/* 2026-11-10 本人決定により全ペア汎用fallback。未承認の下書きは採用しない。 */
(() => {
  const C = window.CBP;
  C.DIALOGUE_PAIRS = [];
  // 名前付きキャラに新しい設定や台詞を与えない中立的な試合案内。
  C.DIALOGUE_FALLBACK = { speaker: '試合案内', ready: '準備が整いました。まもなく試合開始です。' };
  C.buildDialogue = (p, e) => {
    const pair = C.DIALOGUE_PAIRS.find(pair => pair.ids.includes(p.id) && pair.ids.includes(e.id) && p.id !== e.id);
    if (pair?.lines?.length) return pair.lines.filter(line => typeof line?.text === 'string' && line.text.trim()).map(line => ({
      text: line.text, expression: Object.hasOwn(C.Custom.EXPRESSIONS, line.expression) ? line.expression : 'normal',
      speaker: [p.id, e.id].includes(line.speaker) ? line.speaker : C.DIALOGUE_FALLBACK.speaker,
      side: line.speaker === p.id ? 'p' : line.speaker === e.id ? 'e' : null,
    }));
    const lines = [{ side: null, speaker: C.DIALOGUE_FALLBACK.speaker, expression: 'normal', text: `${p.nick || p.name} 対 ${e.nick || e.name}` }];
    for (const [side, c] of [['p', p], ['e', e]]) if (c.custom && c.intro) lines.push({ side, speaker: c.id, expression: c.introExpression, text: c.intro });
    lines.push({ side: null, speaker: C.DIALOGUE_FALLBACK.speaker, expression: 'normal', text: C.DIALOGUE_FALLBACK.ready });
    return lines;
  };
})();
