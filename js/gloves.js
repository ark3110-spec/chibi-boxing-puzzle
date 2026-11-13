/* 画像を使わずに描く小物。
 * - 1人称モードの「自分のグローブ」：キャラごとのグローブの色で描く。右手を後ろから見た形。左手は CSS で左右反転して使う。
 * - マウスピース：ダウンのとき（アッパー・フック）に飛ぶ。キャラのテーマ色。 */
window.CBP = window.CBP || {};

CBP.mouthpieceSVG = (color) => {
  const ink = '#1c1a26';
  const arch = 'M8 46 C2 22 14 6 32 6 C50 6 62 22 56 46 C55 50 47 50 46 46 C47 30 42 20 32 20 C22 20 17 30 18 46 C17 50 9 50 8 46 Z';
  return `<svg viewBox="-4 0 72 54" aria-hidden="true">
    <path d="${arch}" fill="#fff" stroke="#fff" stroke-width="9" stroke-linejoin="round"/>
    <path d="${arch}" fill="${color}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M23 15 l1.5 4 M32 13 l0 4 M41 15 l-1.5 4 M16 24 l3 3 M48 24 l-3 3" stroke="rgba(28,26,38,.25)" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M13 34 C13 22 20 12 31 11" stroke="rgba(255,255,255,.75)" stroke-width="3.5" stroke-linecap="round" fill="none"/>
  </svg>`;
};

CBP.gloveSVG = (g) => {
  const ink = '#1c1a26';
  const mitt = 'M44 118 C34 62 60 16 108 16 C156 16 180 58 174 112 C170 152 150 180 104 182 C64 182 48 160 44 118 Z';
  const thumb = 'M66 112 C42 104 28 128 38 150 C46 168 70 168 80 150 Z';
  const cuff = 'M68 166 L140 166 Q152 166 152 178 L152 222 Q152 234 140 234 L68 234 Q56 234 56 222 L56 178 Q56 166 68 166 Z';
  const heart = g.heart
    ? '<path d="M104 210 c-5 -8 -17 -5 -14 5 c2 6 14 13 14 13 s12 -7 14 -13 c3 -10 -9 -13 -14 -5z" fill="#ff3d9a"/>' : '';
  return `<svg viewBox="0 0 200 244" aria-hidden="true">
    <g fill="#fff" stroke="#fff" stroke-width="18" stroke-linejoin="round"><path d="${cuff}"/><path d="${mitt}"/><path d="${thumb}"/></g>
    <g stroke="${ink}" stroke-width="5" stroke-linejoin="round">
      <path d="${cuff}" fill="${g.cuff}"/>
      <path d="${mitt}" fill="${g.main}"/>
    </g>
    <path d="M60 188 L148 184 M60 204 L148 200 M60 220 L148 216" stroke="rgba(28,26,38,.18)" stroke-width="3" fill="none"/>
    ${heart}
    <path d="M52 136 C62 168 100 176 142 168" fill="none" stroke="rgba(0,0,0,.2)" stroke-width="12" stroke-linecap="round"/>
    <path d="M78 98 C100 110 134 110 158 96" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="92" cy="52" rx="28" ry="15" fill="${g.light}" opacity=".85" transform="rotate(-16 92 52)"/>
    <ellipse cx="128" cy="40" rx="8" ry="5" fill="#fff" opacity=".8"/>
    <path d="${thumb}" fill="${g.main}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <ellipse cx="52" cy="128" rx="7" ry="10" fill="${g.light}" opacity=".7"/>
  </svg>`;
};
