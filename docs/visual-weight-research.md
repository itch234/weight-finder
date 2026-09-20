# ビジュアルウェイト（視覚的重さ）: 調査レポート

**調査日**: 2026-09-20 / **モード**: Standard / **調べた問い**: 写真のビジュアルウェイトを決める要因として信頼できるソースが挙げているものは何で、ウェイトファインダーの解析はそのどれを取りこぼしているか。

## エグゼクティブサマリー

実務系の解説と学術研究を突き合わせると、視覚的重さの要因はおおむね一致しており、**サイズ・明度・彩度・色相・コントラスト・細部・ピント・孤立・位置・人物（顔）** の10項目に収束する。このうち本アプリが取りこぼしていたのは **「暗いものは重い」「顔・人物は他のすべてに優先する」「まわりが空いている要素は重い」** の3つで、いずれも今回実装した。加えて、重心を画面中心に合わせるという本アプリの基本設計は、知覚バランスの実験研究（DCM 指標）と大規模写真データの分析の両方に支持されていることを確認した。

最大の留保は2つある。第一に、顔の検出は肌色ベースの近似であり、木肌・砂・夕景を人物と誤ることがある（画面の35%以上が肌色なら効果を無効化して緩和している）。第二に、三分割モードが前提とする三分割法そのものは、美的評価との相関が弱いという実験報告があり、絶対的な正解ではない。

## 主要な発見

### 1. 実務系の解説は要因リストでほぼ一致している

**写真・デザイン系の解説は、独立した複数ソースが同じ要因を挙げており、リストとしての信頼度は高い。**

[logcamera](https://logcamera.com/weit/) は、大きさ・明度（暗いほど重い）・彩度・背景とのコントラスト・形の規則性・生き物や人を挙げる。[Smashing Magazine](https://www.smashingmagazine.com/2014/12/design-principles-visual-weight-direction/) はこれに加えて、位置（上が重い、中心から遠いほど重い、前景が重い）、テクスチャ、余白による孤立、被写界深度、色相（赤がもっとも重く、黄がもっとも軽い）を挙げる。[Photography Mad](https://www.photographymad.com/pages/view/balance) と [Digital Photography School](https://digital-photography-school.com/understanding-visual-weight-composition/) は、ピントが合ったものは重い、人物や動物は特に目が見えると強い、視線の方向も重さを生む、と書く。[Fstoppers](https://fstoppers.com/education/visual-weight-why-so-many-photographers-overlook-its-importance-686937) は「目・顔・人の形への視覚的引力は他のすべての要因を上回る」と、人物を最上位に置いている。

要因の重複が多い一方で、**優先順位を数値で示したソースは実務系には無い**。順位づけは次章の学術側に頼る必要がある。

### 2. 「重心を中心へ」は実験研究に支持されている

**知覚されるバランスをもっともよく説明する客観指標は、重心と幾何学的中心のずれ（DCM）だった。**

Hübner らの比較研究（[Frontiers in Psychology, 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4786554/)）は、DCM（Deviation of the Center of "Mass"）、Arnheim 由来の APB、鏡映対称性、均質性の4指標を比較し、バランス評価の予測では DCM が APB より有意に優れたと報告している。この DCM は **黒いピクセルの質量を1、白を0** として重心を計算する。つまり「暗いものほど重い」は、もっとも予測力の高いバランス指標が採用している定義そのものである。

写真の切り抜き選好を再分析した研究（[Preference for Well-Balanced Saliency in Details Cropped from Photographs](https://pmc.ncbi.nlm.nih.gov/articles/PMC4707557/)）では、選ばれた切り抜きはサリエンシーの重心が画面中心に近く、**その効果は縦方向（y軸）で顕著**、横方向では弱かった。Jahanian の大規模分析（[500px の高評価写真12万枚](https://people.csail.mit.edu/jahanian/papers/AliJahanian_VisualBalance_EI2015.pdf)）も、重心が幾何学的中心に近いほどバランスが良いという Arnheim の主張を支持している。

### 3. 顔と人物は低次の目立ちを上回る

**視線計測の研究は、顔が低次のコントラストや色を上回って注意を奪うことを一貫して示している。**

Judd らの研究（[Learning to predict where humans look, ICCV 2009](https://people.csail.mit.edu/torralba/publications/wherepeoplelook.pdf)）は、低次サリエンシーだけのモデルが明るい光点や建物のエッジを重要と判定する一方、実際の観察者は人物やテキストを見ていたと報告し、顔・人・テキストの検出器を加えることで予測が改善したとしている。Cerf らは、自由視聴で顔は同サイズ・同位置の領域より 16.6 倍、テキストは 11.1 倍多く見られたと報告している（[Journal of Vision, 2009](https://jov.arvojournals.org/article.aspx?articleid=2122098) の要旨経由。原論文は未読・単一ソース）。

ブラウザ内で顔を検出する標準 API（FaceDetector / Shape Detection API）は、[Chrome の公式ドキュメント](https://developer.chrome.com/docs/capabilities/shape-detection)によれば Chrome と Edge で実験的機能フラグが必要な段階にあり、配布物の前提にはできない。本アプリは単一ファイル・依存なしを維持するため、肌色の近似に留めた。

### 4. 三分割法は絶対的な根拠を持たない

**三分割法を支持する分析と、支持しない実験の両方がある。**

Jahanian の12万枚分析は三分割の妥当性を支持する一方、Amirshahi らの [Evaluating the Rule of Thirds in Photographs and Paintings](https://www.semanticscholar.org/paper/c0603b5133ff5c534e0e504af36b9422c47a65f9)（Art & Perception, 2014）は、美的評価と三分割スコアの相関は弱く、計算で求めた三分割値とは相関しなかったと報告する。[Rule-of-Thirds or Centered?](https://www.semanticscholar.org/paper/d6bdbdcf5d91ed6c7c98abe425a346b0931d0103) では、被験者は三分割配置より中央配置を好んだ。アプリの三分割モードは「そういう構図に寄せたいときの補助」であって、正解を示すものではない。

## 現行アプリとの突き合わせ

| 要因 | 主なソース | 変更前 | 今回の対応 |
|---|---|---|---|
| サイズ | 全ソース | 面積として自動的に反映 | 変更なし |
| 背景とのコントラスト | 全ソース | 大域・局所の目立ちで反映 | 変更なし |
| 細部・テクスチャ | Smashing, Fstoppers | Sobel勾配の密度で反映 | 変更なし |
| ピント | Photography Mad, Smashing | 勾配密度が近似として機能 | 変更なし（近似であることを明記） |
| 彩度 | logcamera, Smashing | 反映済み | 変更なし |
| 色相（赤が最重） | Smashing | 暖色補正はあるが橙〜黄寄り | **赤が最大になる向きに補正** |
| 明度（暗いほど重い） | logcamera, Smashing, Hübner 2016 | 平均からの差の絶対値のみ | **平均より暗い画素を最大1.35倍** |
| 孤立・余白 | Smashing, Red Dot Geek | 局所コントラストで部分的 | **近傍と広域の重さを比べて最大1.5倍** |
| 顔・人物 | Fstoppers, Judd 2009, Cerf 2009 | 未対応 | **肌色らしさで最大1.9倍。主役判定にも反映** |
| 上が重い | Arnheim, Smashing | ±10%の補正あり | 変更なし |
| 縦横の許容差 | McManus 再分析 | 縦を横より緩く設定 | **縦横同じ許容に統一** |

実装は `index.html` の解析コア（`WF.analyze`）にあり、各要因が実際に効いているかは `tests/core.test.cjs` の「ビジュアルウェイト理論の各要因」のテスト群で検証している。明度・彩度をそろえて一要因だけを変えた合成画像で、重心が理論どおりの側へ寄ることを確認する作りになっている。

## 矛盾・不確実な点

- **左右の非対称**: Arnheim は右側が重いとするが、左を重いとする研究者もおり、ある研究ではどちらとも言えなかったとされる。読みの方向に依存する可能性もあるため、**実装しなかった**。
- **上下の非対称**: 「上半分が重い」は Arnheim 系の主張として複数の解説に現れるが、一次の実験報告を確認できなかった（元論文が有料のため要旨のみ、単一ソース）。一方、もっとも予測力が高いとされる DCM には上下の重みづけが無い。そのため既存の±10%という小さな補正を維持し、強めなかった。
- **Cerf らの16.6倍・11.1倍**: 要旨の二次要約から得た数値で、原論文で未確認。顔が強いという質的な結論は Judd 2009 でも裏づけられる。
- **形の規則性・視線の方向・被写体までの距離**: 複数ソースが挙げるが、単一フレームの色と勾配だけでは推定できないため未実装。
- **肌色検出の限界**: 木肌・砂・夕景は肌色と重なる。テストでも、彩度の非常に高いオレンジの被写体は顔より重く判定される。面積ゲート（画面の35%超で無効化）は緩和策であって解決ではない。

## 推奨・次のアクション

1. 実機の写真で、人物が入った構図と入らない構図を何枚か試し、肌色補正の誤検出が実用上許容できるかを確認する。強すぎる／弱すぎると感じたら、解析コアの係数（`face` の 0.9、`dark` の 0.35、`iso` の 0.5）を触るだけで調整できる。
2. 顔検出を本格化するなら、ブラウザ標準 API ではなく軽量モデルの同梱が必要になる。単一ファイル・依存なしという方針とトレードオフになるため、方針の変更として判断する。
3. 三分割モードの説明は「補助」に留めたままにする。実験的な裏づけが弱いことを知ったうえで使うほうが、点数に振り回されない。

## 出典リスト

| # | ソース | Tier | 日付 | 使った主張 |
|---|---|---|---|---|
| 1 | [ビジュアルウェイトとは（logcamera）](https://logcamera.com/weit/) | 3 | 取得 2026-09 | 大きさ・暗さ・彩度・コントラスト・形・生き物 |
| 2 | [Design Principles: Visual Weight And Direction（Smashing Magazine）](https://www.smashingmagazine.com/2014/12/design-principles-visual-weight-direction/) | 2 | 2014-12 | 色相の順位、位置、余白、被写界深度、テクスチャ |
| 3 | [Understanding Balance and Visual Weight（Photography Mad）](https://www.photographymad.com/pages/view/balance) | 3 | 取得 2026-09 | 暗さ、ピント、人物と目、視線の方向 |
| 4 | [Understanding Visual Weight（Digital Photography School）](https://digital-photography-school.com/understanding-visual-weight-composition/) | 3 | 取得 2026-09 | 顔と目、ピント、孤立、色のポップ |
| 5 | [11 Visual Weight Elements（Red Dot Geek）](https://red-dot-geek.com/visual-weight-elements-photography/) | 3 | 取得 2026-09 | 孤立と負の空間、被写界深度、量とパターン |
| 6 | [Visual Weight（Fstoppers）](https://fstoppers.com/education/visual-weight-why-so-many-photographers-overlook-its-importance-686937) | 2 | 取得 2026-09 | 目・顔・人の形が他のすべてを上回る |
| 7 | [Comparison of Objective Measures for Predicting Perceptual Balance（Hübner & Fillinger, Frontiers in Psychology）](https://pmc.ncbi.nlm.nih.gov/articles/PMC4786554/) | 1 | 2016 | DCM が知覚バランスの最良予測、暗さ＝質量 |
| 8 | [Preference for Well-Balanced Saliency in Details Cropped from Photographs](https://pmc.ncbi.nlm.nih.gov/articles/PMC4707557/) | 1 | 2016 | 選ばれた切り抜きは重心が中心寄り、縦方向で顕著 |
| 9 | [Learning Visual Balance from Large-scale Datasets（Jahanian, EI 2015）](https://people.csail.mit.edu/jahanian/papers/AliJahanian_VisualBalance_EI2015.pdf) | 1 | 2015 | 高評価写真12万枚で重心中心説を支持 |
| 10 | [Learning to predict where humans look（Judd et al., ICCV 2009）](https://people.csail.mit.edu/torralba/publications/wherepeoplelook.pdf) | 1 | 2009 | 低次サリエンシーは人物・テキストを外す |
| 11 | [Faces and text attract gaze independent of the task（Cerf et al., Journal of Vision）](https://jov.arvojournals.org/article.aspx?articleid=2122098) | 1 | 2009 | 顔16.6倍・テキスト11.1倍（要旨経由・未確認） |
| 12 | [Evaluating the Rule of Thirds in Photographs and Paintings（Amirshahi et al.）](https://www.semanticscholar.org/paper/c0603b5133ff5c534e0e504af36b9422c47a65f9) | 1 | 2014 | 三分割法と美的評価の相関は弱い |
| 13 | [Rule-of-Thirds or Centered?（Hoh & Zhang）](https://www.semanticscholar.org/paper/d6bdbdcf5d91ed6c7c98abe425a346b0931d0103) | 2 | 取得 2026-09 | 被験者は中央配置を好んだ |
| 14 | [The Shape Detection API（Chrome for Developers）](https://developer.chrome.com/docs/capabilities/shape-detection) | 1 | 取得 2026-09 | FaceDetector は実験的でフラグが必要 |
| 15 | [Visual Balance and the Center of "Mass"（Konstanz 大学）](https://www.cogpsych.uni-konstanz.de/research/aesthetics/balance/) | 1 | 取得 2026-09 | DCM の定義、グレースケール前提 |
