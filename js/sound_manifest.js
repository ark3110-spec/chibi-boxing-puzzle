/* 曲と効果音のファイルの一覧。ファイルは assets/sound/ に置き、ここに書いたものだけをファイルで鳴らす。
 * 書いていない音・読み込めなかった音は、今までどおり js/audio.js の合成音で鳴る（ファイルがなくても遊べる）。
 * - 形式は mp3 がおすすめ（どのブラウザでも鳴る。index.html をダブルクリックで開いたときも鳴る）。
 * - 書き方：'assets/sound/xxx.mp3' か { src: 'assets/sound/xxx.mp3', volume: 0.8 }。volume（0〜1）はその音だけの大きさで、オプションの音量にかけ合わせる。
 * - src を配列にすると、鳴らすたびにどれか1つを選ぶ（パンチ音を2〜3種類にして、聞き飽きないようにするとき）。
 * - fight は、採用済みの戦闘曲4曲をランダム再生するために配列で登録する。
 *   js/audio.js がBGM切替時に配列からランダムに1曲を選ぶ。
 * - 曲は loop: false にすると1回だけ流す（勝ち・負けのジングルなど）。 */
window.CBP = window.CBP || {};
CBP.SOUND_FILES = {
  // 曲（場面ごと。書いていない場面は無音）
  bgm: {
    title: { src: 'assets/sound/bgm_title.mp3', volume: 0.85 },               // タイトル・キャラ選択・ギャラリー・試合前の掛け合い
    fight: { src: ['assets/sound/bgm_fight1.mp3', 'assets/sound/bgm_fight2.mp3', 'assets/sound/bgm_fight3.mp3', 'assets/sound/bgm_fight4.mp3'], volume: 0.8 }, // 試合中（インターバルも）。戦闘曲だけ0.8倍（2026-11-12 本人所感：試合の曲が全体に大きい）
    // win: { src: 'assets/sound/jingle_win.mp3', loop: false },   // 勝ったときの結果画面
    // lose: { src: 'assets/sound/jingle_lose.mp3', loop: false }, // 負けたときの結果画面
  },
  // 効果音（名前は js/audio.js の鳴らし分けと同じ）
  se: {
    // gong: 'assets/sound/gong.mp3',                  // ゴング：ラウンドの始めと終わり。試合終了は3回続けて鳴らす
    // skillFull: 'assets/sound/skill_full.mp3',       // スキルのゲージが満タンになった
    // punch: ['assets/sound/punch1.mp3', 'assets/sound/punch2.mp3'], // パンチが当たった（全種類共通）
    // punchBig: 'assets/sound/punch_big.mp3',         // 強い当たり（大きなダメージ・カウンター）。なければ punch
    // punchJab: 'assets/sound/punch_jab.mp3',         // 種類別（あればこちらを優先）。punchStraight・punchHook・punchUpper・punchBody も同じ
    // guard: 'assets/sound/guard.mp3',                // ガードした
    // counter: 'assets/sound/counter.mp3',            // カウンター（このあとに強い当たりの音も鳴る）
    // down: 'assets/sound/down.mp3',                  // ダウン
    // link: 'assets/sound/link.mp3',                  // アイコンをつないだ（つなぐほど少し高く鳴る）
    // cancel / warn / stop / interval / count / mouthpiece / special も同じ名前で書ける
  },
};
