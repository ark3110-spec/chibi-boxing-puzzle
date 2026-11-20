/* ちびキャラボクシング～パズル編～ — キャラ・パンチ・数値のデータ
 * 台詞は docs/CHARACTERS.md に出典がある文だけを使う（新しい台詞は作らない）。
 * 能力・数値はすべて仮。ここを書き換えれば調整できる。 */
window.CBP = window.CBP || {};

CBP.PUNCHES = {
  // req=予告をガードするのに消す数 / atk=自分の攻撃の基本値（3個つなぎで atk、1個増えるごとに +50%） / cpu=相手から受ける基本ダメージ
  jab:      { name: 'ジャブ',     kana: 'ジ', color: '#38c3df', glyph: 'jab',      req: 3, atk: 2.2, cpu: 9 },
  straight: { name: 'ストレート', kana: 'ス', color: '#ff6a5c', glyph: 'straight', req: 4, atk: 2.8, cpu: 13 },
  hook:     { name: 'フック',     kana: 'フ', color: '#86cf45', glyph: 'hook',     req: 4, atk: 2.8, cpu: 13 },
  upper:    { name: 'アッパー',   kana: 'ア', color: '#a679f2', glyph: 'upper',    req: 6, atk: 3.2, cpu: 17 },
  body:     { name: 'ボディ',     kana: 'ボ', color: '#ffa22b', glyph: 'body',     req: 5, atk: 2.8, cpu: 12 },
};
CBP.PUNCH_KEYS = ['jab', 'straight', 'hook', 'upper', 'body'];

CBP.POSE_FILES = {
  guard: '01_guard', jab: '02_jab', straight: '03_straight', hook: '04_hook', upper: '05_uppercut',
  body: '06_body_blow', block: '07_block', hitFace: '08_hit_face', hitBody: '09_hit_body',
  win: '10_win', ko: '11_ko_lose', pinch: '12_pinch',
};

/* 難易度ごとの相手の強さ */
CBP.DIFFICULTY = {
  easy:   { label: 'やさしい', interval: 6.0, windup: 4.4, power: 0.8, getUp: -0.15 },
  normal: { label: 'ふつう',   interval: 4.6, windup: 3.6, power: 1.0, getUp: 0 },
  hard:   { label: 'つよい',   interval: 3.3, windup: 2.8, power: 1.3, getUp: 0.1 },
};

CBP.RULES = {
  rounds: 3,
  roundSeconds: 60,
  maxHp: 100,
  minChain: 3,
  counterRatio: 2,       // 必要数の何倍でカウンターか
  partialBlock: 0.5,     // 必要数に届かなかったとき、消した割合に応じて軽減する最大割合
  countStep: 0.85,       // ダウン時のカウント1つの秒数（自分）
  enemyCountStep: 0.7,   // ダウン時のカウント1つの秒数（相手）
  getUpNeed: [10, 16],   // 立ち上がるのに消す数（1回目・2回目）
  getUpHp: [45, 30],
  enemyGetUp: [0.85, 0.45],
  enemyGetUpHp: [40, 25],
  roundRecover: 5,
  intervalSeconds: 10,   // ラウンドの間のインターバル（「次のラウンドへ」で飛ばせる）
  downStop: 0.75,        // ダウンの瞬間のストップモーション（秒）
  downStopLast: 1.1,     // 3回目のダウン（TKO）のときのストップモーション（秒）
  yandere: false,        // 雪のヤンデレモード（煽られると発動）。保留中なので切っている（2026-10-20）。true で元に戻る
  midFightEnabled: true, // 2026-11-20 本人判断で再開（全員分のセリフが揃ったため）。演出のみで、パラメータ変動（怒りの攻撃1.25倍）は付けない
  cornerRest: [],        // インターバルのピンチで、スツールの代わりにコーナーポストにもたれる絵を使うキャラ（例：['pink', 'ren']）。空なら全員スツール（2026-10-24）
};

/* スキル：得意パンチを消すと（椿・チコはカウンター・ガードで）ゲージがたまり、満タンでボタンを押すと発動（オプションで自動発動にもできる）。
 * 自分だけが使える（相手のCPUはまだ使わない）。発動のときはカットインが入る。 */
CBP.SKILL = {
  max: 100,
  perIcon: 6,          // 得意パンチを1個消すごとにたまる量
  counter: 45,         // 椿・チコ：カウンター1回でたまる量
  guard: 15,           // 椿・チコ：ガード1回でたまる量
  duration: 8,         // 効果の秒数
  autoDelay: 0.25,     // オプション「自動」：満タンになってから発動するまでの秒数（なぞっている間は数えない）
  cutin: 1.1,          // カットインのあいだ試合を止める秒数
  favMult: 1.2,        // 得意パンチの威力（自分も相手も）
  weakMult: 1.25,      // 苦手パンチを打たれたときの痛さ（自分も相手も）
  counterRatio: 1.5,   // 椿・チコのスキル中、カウンターに必要な数（通常は2倍）
  boost: 1.3,          // 椿・チコのスキル中、ストレート／ボディの威力
  yukiMax: 0.8,        // 雪：ストレート1.2倍＋（減った体力の割合×これ）
  pinkHp: 0.3,         // ピンクちゃん：相手の体力がこれ以下なら
  pinkMult: 1.5,       //   攻撃がこの倍率
  pinkGetUp: 0.4,      //   スキル中にダウンさせた相手が立ち上がる確率をこの倍率に
  renConvert: 9,       // 蓮華：アッパーに変えるアイコンの数（8秒間はアッパーが出やすい）
  amaneChain: 2,       // 甘音：スキル中は何個からつなげるか
};

/* インターバルの画面に1つずつ出すヒント（遊び方の説明。キャラの台詞ではない） */
CBP.TIPS = [
  '予告と同じアイコンを、必要な数の2倍まで消すとカウンター。',
  '★はどのパンチの代わりにもなる。長いつなぎに混ぜよう。',
  '7つ以上つなぐとラッシュ。長くつなぐほど強い。',
  '相手の苦手パンチで攻めると1.25倍のダメージ。',
  '得意パンチを消すとスキルのゲージがたまる（椿・チコはカウンターとガード）。',
  'ダウンしたら、どのアイコンでもいいので急いで消そう。',
  '判定になったら、与えたダメージが多いほうの勝ち。',
];

/* fav: 得意パンチ（打つと強い。スキルのゲージもこれでたまる）／ weak: 苦手パンチ（打たれると痛い）
 * skill: name=スキル名（蓮華・椿・甘音は boxing_heroine_project の必殺技名。雪・ピンクちゃん・チコはユーザーが決めた名前、2026-10-20）、
 *        charge=ゲージのため方（fav=得意パンチを消す、counter=カウンター・ガード）、desc=カードの説明
 * facing: 画像の向き。R=画面の右を向いている、L=左、F=正面（反転しない）
 * 雪は新master系列の右向き画像を使用（2026-10-31）。
 * ko（大の字）はどのキャラも頭が左＝右向きの選手が後ろに倒れた絵なので R。右側の選手は反転して頭が右に来る。 */
const ALL_RIGHT = { guard: 'R', jab: 'R', straight: 'R', hook: 'R', upper: 'R', body: 'R', block: 'R',
  hitFace: 'R', hitBody: 'R', win: 'F', ko: 'R', pinch: 'R' };
/* 投票企画の4人（2026-11-05 追加）とかなみ（2026-11-06 追加）は、勝ちの絵も画面の右を向いている */
const ALL_RIGHT_WIN_R = { ...ALL_RIGHT, win: 'R' };

CBP.CHARS = [
  {
    id: 'yuki', name: '山宮 雪', ruby: 'やまみや ゆき', nick: '', style: 'インファイター', theme: '#3cc0d2',
    fav: 'straight', weak: 'hook',
    skill: { name: '雪下しストレート', charge: 'fav', desc: '8秒間ストレートが強くなる。自分の体力が少ないほど強い。' },
    glove: { main: '#16adbf', light: '#86e6f0', cuff: '#f3f7fa' },
    facing: ALL_RIGHT,
    cpu: { interval: 1.0, power: 1.0, weights: { jab: 1, straight: 3, hook: 1.5, upper: 1, body: 1.5 } },
    lines: {
      intro: 'よろしくお願いします。',
      counter: '負けませんっ！',
      midFight: ['このままいきます'],
      win: 'ふぅ、ありがとうございました。',
      // 設定PDF（ヤンデレ時）
      yandere: '謝ったって許しませんし、ご希望通り、試合で決着をつけましょう？',
    },
  },
  {
    id: 'pink', name: '黄桜 桃', ruby: '', nick: 'ピンクちゃん', style: 'インファイター', theme: '#ff5fa8',
    fav: 'upper', weak: 'body',
    skill: { name: '小悪魔アッパー', charge: 'fav', desc: '8秒間、相手の体力が3割以下なら攻撃1.5倍。ダウンさせると相手が立ち上がりにくい。' },
    glove: { main: '#ff3d9a', light: '#ffa3cf', cuff: '#ffffff', heart: true },
    facing: ALL_RIGHT,
    cpu: { interval: 1.0, power: 1.0, weights: { jab: 2.5, straight: 1.5, hook: 2, upper: 2, body: 1.5 } },
    lines: {
      intro: 'ふふ、油断したらぼっこぼこにしちゃいますよ♪',
      counter: 'ふふっ、だ～めっ♪',
      // ピンクPDF（抜粋）＋本人のセリフ書き出し（2026-11-06）
      midFight: ['ほらっ、ほらっ', 'このままじゃ負けちゃいますよ、よわよわボクサーさん♪'],
      win: '私の勝ちですね♪',
    },
  },
  {
    id: 'chiko', name: '青山 チコ', ruby: 'あおやま ちこ', nick: '', style: 'カウンター', theme: '#f07aa8',
    fav: 'body', weak: 'straight',
    skill: { name: 'ちくちくカウンター', charge: 'counter', desc: '8秒間、どのパンチでもガード・カウンターでき、カウンターに必要な数が減る。ボディがさらに強くなる。' },
    glove: { main: '#26262e', light: '#6c6c7a', cuff: '#f4f4f7' },
    facing: ALL_RIGHT,
    cpu: { interval: 1.0, power: 1.0, weights: { jab: 1.5, straight: 1.5, hook: 1, upper: 1, body: 3 } },
    lines: {
      // 設定PDF＋本人のセリフ書き出し（2026-11-06）
      intro: '手加減してあげよっか～？',
      counter: 'おっとあぶないな〜',
      midFight: ['も〜、そんなパンチみえみえだよ〜', 'ほらっ、だめだよっ！'],
      win: '残念でした〜。ボクとまたやるんだったらもっと練習しておいで〜',
    },
  },
  {
    id: 'ren', name: '紅 蓮華', ruby: 'くれない れんげ', nick: '', style: 'パワー', theme: '#e8303c',
    fav: 'upper', weak: 'straight',
    skill: { name: 'アッパーカット', charge: 'fav', desc: '盤面のアイコンをアッパーに変える。8秒間アッパーが出やすい。' },
    glove: { main: '#b5132c', light: '#ff6175', cuff: '#ffffff' },
    facing: ALL_RIGHT,
    cpu: { interval: 1.1, power: 1.25, weights: { jab: 1, straight: 2, hook: 2, upper: 3, body: 1 } },
    lines: {
      // boxing_heroine_project lore/ren.md
      intro: '結果で黙らせてあげる。見てなさい！',
      counter: '甘いわねっ！',
      midFight: ['さあ、ドンドン行くわよ！'],
      win: 'あたしは誰にも負けない',
    },
  },
  {
    id: 'tsubaki', name: '氷室 椿', ruby: 'ひむろ つばき', nick: '', style: 'テクニック', theme: '#4d7fe0',
    fav: 'straight', weak: 'jab',
    skill: { name: '見切りカウンター', charge: 'counter', desc: '8秒間、どのパンチでもガード・カウンターでき、カウンターに必要な数が減る。ストレートがさらに強くなる。' },
    glove: { main: '#2457c8', light: '#7fa8ff', cuff: '#ffffff' },
    facing: ALL_RIGHT,
    cpu: { interval: 1.0, power: 1.0, weights: { jab: 2, straight: 2.5, hook: 1, upper: 1, body: 1 } },
    lines: {
      // boxing_heroine_project lore/tsubaki.md（抜粋）
      intro: '……よろしく。',
      counter: 'そこ',
      midFight: ['予想通りでよかったわ'],
      win: 'いい経験になったわ。ありがとう。',
    },
  },
  {
    id: 'amane', name: '因幡 甘音', ruby: 'いなば あまね', nick: '', style: 'スピード', theme: '#f5a623',
    fav: 'jab', weak: 'upper',
    skill: { name: 'コーナーラッシュ', charge: 'fav', desc: '8秒間、どのパンチも2個からつなげる。' },
    glove: { main: '#efa514', light: '#ffdc73', cuff: '#ffffff' },
    facing: ALL_RIGHT,
    cpu: { interval: 0.8, power: 0.85, weights: { jab: 3, straight: 2.5, hook: 1, upper: 0.5, body: 1 } },
    lines: {
      // boxing_heroine_project lore/amane.md（抜粋）
      intro: 'いっぱい走るよー！',
      counter: '私の番っ！',
      midFight: ['止まってあげないよ～！'],
      win: 'えへへ～勝った～！ぶいっ！',
    },
  },
  /* 投票企画（セコンド視点の選手応援企画）の4人。2026-11-05 追加。
   * 名前はリングネーム。スタイルと能力はプロフィール画像（chara_lore_box/00_INBOX/10・12・14・16.png）、
   * 得意・苦手・スキルの型は 2026-11-05 にユーザーが決めたもの。スキル名は 2026-11-20 にユーザーが決定。
   * skillType：fight.js が見るスキルの型（power=得意パンチ強化、counter=カウンター強化、rush=つなぎ短縮。自作キャラと同じ効果）。
   * 台詞は本人のセリフ書き出し（2026-11-06）を 2026-11-20 に正本へ取り込み。cpu の数値はプロフィールの能力からの仮。
   * expressions: false＝表情差分の絵がない（試合前の会話では構えの絵を使う。js/appearance.js）。 */
  {
    id: 'kurumi', name: 'クルミ', ruby: '', nick: '', style: 'アウトボクサー', theme: '#2f5fe0',
    fav: 'jab', weak: 'straight', skillType: 'power',
    skill: { name: '華麗なフルコース', charge: 'fav', desc: '8秒間、ジャブの威力がさらに1.3倍。' },
    glove: { main: '#2448c8', light: '#7f9cff', cuff: '#ffffff' },
    facing: ALL_RIGHT_WIN_R, expressions: false,
    cpu: { interval: 0.85, power: 0.85, weights: { jab: 3, straight: 1.5, hook: 1, upper: 0.5, body: 1 } },
    lines: {
      intro: 'さあ、美麗な戦い方、見せてあげるわ',
      counter: 'あら、引き立てありがとっ！',
      midFight: ['見とれてもいいけど、手加減しないわよ～？'],
      win: 'まあ、これくらい当然ね。',
    },
  },
  {
    id: 'natsume', name: 'ナツメ', ruby: '', nick: '', style: 'カウンター', theme: '#8f7fe8',
    fav: 'hook', weak: 'jab', skillType: 'counter',
    skill: { name: '味変にこんなパンチはどうかしら？', charge: 'counter', desc: '8秒間、どのパンチでもガード・カウンターでき、カウンターに必要な数が減る。フックがさらに1.3倍。' },
    glove: { main: '#2a3a99', light: '#7b8de0', cuff: '#ffffff' },
    facing: ALL_RIGHT_WIN_R, expressions: false,
    cpu: { interval: 1.15, power: 1.05, weights: { jab: 1, straight: 1.5, hook: 3, upper: 1, body: 1 } },
    lines: {
      intro: 'よろしくお願いしますね～',
      counter: '油断しちゃ、だ～め♪',
      midFight: ['負けませんよ～'],
      win: 'ふぅ、いい試合でしたね♪',
    },
  },
  {
    id: 'raichi', name: 'ライチ', ruby: '', nick: '', style: 'インファイター', theme: '#ff4b2b',
    fav: 'straight', weak: 'hook', skillType: 'power',
    skill: { name: '私の一撃食らってみろ！', charge: 'fav', desc: '8秒間、ストレートの威力がさらに1.3倍。' },
    glove: { main: '#d8222a', light: '#ff7a6e', cuff: '#26262e' },
    facing: ALL_RIGHT_WIN_R, expressions: false,
    cpu: { interval: 0.95, power: 1.2, weights: { jab: 1, straight: 3, hook: 2, upper: 1, body: 1.5 } },
    lines: {
      intro: 'さあ、楽しい試合にしようっ！！',
      counter: 'そこだっ！',
      midFight: ['どうした、もっと打ち合おう！'],
      win: 'いい試合だったな！またやりたいな！',
    },
  },
  {
    id: 'ichigo', name: 'イチゴ', ruby: '', nick: '', style: 'オールラウンダー', theme: '#ff4d6d',
    fav: 'body', weak: 'upper', skillType: 'rush',
    skill: { name: 'あま～いパンチ召し上がれ', charge: 'fav', desc: '8秒間、どのパンチも2個からつなげる。' },
    glove: { main: '#e2324c', light: '#ff9aaa', cuff: '#ffffff' },
    facing: ALL_RIGHT_WIN_R, expressions: false,
    cpu: { interval: 1.0, power: 1.0, weights: { jab: 1.5, straight: 1.5, hook: 1.5, upper: 1, body: 3 } },
    lines: {
      intro: 'いい試合にしましょうね♪',
      counter: 'こっちですっ',
      midFight: ['倒しちゃいますよ～？'],
      win: 'ふぅ、お疲れ様でした♪',
    },
  },
  /* かなみ。2026-11-06 追加。絵は黄色い百合の衣装（黒×ピンクの案は illustmake に残してあり、ゲームには入れていない）。
   * 得意・苦手・スキルの型は 2026-11-06 にユーザーが決めたもの。スキル名は 2026-11-20 にユーザーが決定。
   * style は資料に戦い方の記述がないので、決め技（アッパー）を仮に出している。
   * 台詞は本人のセリフ書き出し（2026-11-06）を 2026-11-20 に正本へ取り込み。cpu の interval・power は資料に能力の数値がないので標準の1.0（仮）。 */
  {
    id: 'kanami', name: 'かなみ', ruby: '', nick: '', style: 'アッパー', theme: '#e8c21a',
    fav: 'upper', weak: 'hook', skillType: 'power',
    skill: { name: 'ルーキーラッキーパンチ❤', charge: 'fav', desc: '8秒間、アッパーの威力がさらに1.3倍。' },
    glove: { main: '#f2447a', light: '#ff9ab8', cuff: '#ffe75a' },
    facing: ALL_RIGHT_WIN_R, expressions: false,
    cpu: { interval: 1.0, power: 1.0, weights: { jab: 1.5, straight: 1.5, hook: 1, upper: 3, body: 1.5 } },
    lines: {
      intro: 'お手柔らかにお願いしますねえ♪',
      counter: 'あはっ、ざ～んねんっ♪',
      midFight: ['まさか手加減してくれてるんですかぁ？な～んて♪'],
      win: 'あはっ、私の勝ちですねぇ♪聞こえてますかぁ。くす',
    },
  },
];

/* 勝ち抜きモードの前座のモブ（名前・設定なし。目元はいつも前髪で隠れている）。
 * 絵は illustmake の「モブ男子ボクサー」「モブ女子ボクサー」候補001。
 * 絵ができるまでは勝ち抜きに出ない（どのモブの絵があるかは js/mob_manifest.js。tools/make_sprites.py が書く）。 */
CBP.MOBS = [
  {
    id: 'mob_m', mob: true, name: 'モブ男子', ruby: '', nick: '', style: 'モブ', theme: '#8b93a6',
    fav: null, weak: null, skill: null, facing: ALL_RIGHT,
    lines: { intro: '手加減しない', counter: 'ふんっ！', midFight: ['なんだ、こんなもんか'], win: '家でおとなしくしてるんだな' },
    cpu: { interval: 1.15, power: 0.8, weights: { jab: 3, straight: 2, hook: 1.5, upper: 0.5, body: 1 } },
  },
  {
    id: 'mob_f', mob: true, name: 'モブ女子', ruby: '', nick: '', style: 'モブ', theme: '#7fa38a',
    fav: null, weak: null, skill: null, facing: ALL_RIGHT,
    lines: { intro: 'はあ、ケガしても知らないわよ', counter: 'こんなパンチ当たるわけないでしょ？', midFight: ['なんだ、こんなもん？'], win: 'ふう、準備運動にはよかったかも' },
    cpu: { interval: 1.1, power: 0.85, weights: { jab: 2.5, straight: 2, hook: 1.5, upper: 0.7, body: 1.3 } },
  },
];

/* 勝ち抜き：モブ（絵があるぶん）→ 名前のあるキャラ（ランダム）で、全部で stages 戦 */
CBP.ARCADE = { stages: 5, minNamed: 3 };

CBP.charById = (id) => CBP.CHARS.find((c) => c.id === id) || CBP.MOBS.find((c) => c.id === id);
/* インターバル（ラウンドの間）に椅子に座って休む絵。絵があるキャラだけ使う（js/rest_manifest.js の CBP.REST_READY）。
 * ないキャラは構え・ピンチの絵のまま。 */
CBP.REST_FILES = { rest: '13_interval', restPinch: '14_interval_pinch' };
CBP.hasRest = (id, pose) => ((CBP.REST_READY || {})[id] || []).includes(pose);
/* ボディで倒れたときの「お腹を押さえてうずくまる」ダウンの絵（2026-11-01）。絵があるキャラだけ使う（js/body_down_manifest.js の CBP.BODY_DOWN_READY）。
 * ないキャラは通常のダウン（ko）の絵のまま。1人称の正面の絵は POV_FILES の koBody。 */
CBP.BODY_DOWN_FILES = { koBody: '15_ko_body' };
CBP.hasBodyDown = (id) => (CBP.BODY_DOWN_READY || []).includes(id);
CBP.spritePath = (id, pose) => `assets/chibi/${id}/${CBP.POSE_FILES[pose] || CBP.REST_FILES[pose] || CBP.BODY_DOWN_FILES[pose]}.webp`;

/* 1人称モード：相手を正面向きで出す。正面の絵は assets/chibi_pov/<キャラID>/ に入れる。
 * 絵がまだないキャラは、横向きの絵で代用する（POV_FALLBACK の対応）。 */
CBP.POV_FILES = {
  guard: '01_guard', windup: '02_windup', jab: '03_jab', straight: '04_straight', hook: '05_hook',
  upper: '06_uppercut', body: '07_body_blow', block: '08_block', hitFace: '09_hit_face',
  hitBody: '10_hit_body', ko: '11_down', win: '12_win', pinch: '13_pinch', koBody: '14_down_body',
};
CBP.POV_FALLBACK = { windup: 'guard' };
CBP.povPath = (id, pose) => `assets/chibi_pov/${id}/${CBP.POV_FILES[pose]}.webp`;
