# マイナー曲発掘プレイヤー（仮称）

再生数に左右されず、マイナーな曲に出会える Web 音楽プレイヤー。曲そのものは配信せず、Apple Music・SoundCloud・Bandcamp の公式プレイヤーを **1本のキュー** で切り替えて再生します。

- **目利き起点の収集**: 信頼できるディガーの X ポストから曲リンクを集める（日次バッチ）
- **人気度を割り引くスコア**: いいね・再生数は使わず、少数の目利きの熱量 × 無名度で並べる
- **推薦キャンペーン**: 目利きとアーティスト本人が「このアーティストが好きな人へ」を添えて推薦し、リスナーの好きなアーティストと突き合わせて届ける

## すぐ試す（デモモード）

外部 API のキーが無くても、実在の曲で **音を出して** 一通り試せます。

```bash
npm install
npm run dev          # Supabase の設定が無ければ自動でデモモード
```

http://localhost:3000 をスマホ（またはブラウザのモバイル表示）で開きます。

1. 好きなシーンをタップ → よく聴くアーティストをタップ → 「聴きはじめる」
2. そのまま1曲目が鳴ります（Apple Music の30秒プレビュー。ネット接続が必要）
3. スキップ・最後まで聴く・保存、の反応で以降の選曲が変わります

- デモの曲とアートワークは iTunes Search API が返した実データ（`fixtures/demo/itunes-raw.json`）。**目利き・ポスト・リスナー数は架空**のデモデータです
- ログインは不要。好みは端末（localStorage）に保存され、ログインするとアカウントに統合されます
- 「デモ用アカウント」（ログイン画面）で、リスナー / 目利き / アーティスト / 管理者 を切り替えられます
- DB を作り直す: `npm run db:reset`

### 音が出る仕組み

| 状態 | Apple Music の曲 | SoundCloud | Bandcamp |
| --- | --- | --- | --- |
| キーなし / Apple Music 未接続 | 30秒プレビュー（`<audio>`、iTunes Lookup API でURLを取得） | 埋め込みウィジェット | 公式の埋め込み（手動再生） |
| Apple Music 接続済み | MusicKit でフル再生 | 同上 | 同上 |

- プレビューは1つの `<audio>` 要素を使い回します。スマホでは iframe を作り直すより自動送りが止められにくく、ロック画面の操作（Media Session）も効きます
- Apple の利用条件上、プレビューはストアへの導線とセットで使う必要があるため、再生画面に必ず「Apple Musicで開く」を出しています。連続再生での利用は条件の解釈がグレーなので、**本番公開前に Apple の規約を確認してください**（フル再生は MusicKit ＋ユーザーの認可が正式な経路）
- 模擬再生（音なし）は E2E 専用です（`NEXT_PUBLIC_PLAYER_MODE=simulated`）

### 初回から「自分向け」にする仕組み（コールドスタート）

曲・目利き・ユーザーを同じ「シーン」のタグ空間に置きます（語彙は `config/onboarding.json`）。

```
score = heat′ × obscurity^(2d) × (1 + pitchBoost) × tasteMult
tasteMult = 1 + 1.5 × clamp(cos(ユーザーの好み, 曲のタグ), 0, 1) × min(1, シグナル数 / 5)
```

- **好みの取得**: 初回にシーンとアーティストをタップ。選んだアーティストは「好きなアーティスト」にも入り、推薦キャンペーンのマッチングが最初から効きます
- **目利きの仮フォロー**: 好みに近い目利き上位3人を自動で仮フォロー（倍率 1.8。本フォローは 3.0）。ホームに並び、その場でフォローできます
- **再生中の学習**: 保存 ＋、完聴 ＋、スキップ −（10秒未満のスキップは強め）。曲のタグと、その曲を推した目利きとの相性を更新します。使うのは本人の反応だけで、他人の再生数やいいね数は使いません
- **並べ直し**: 学習のたびに、これから流れる曲（直近2曲より後ろ）だけを並べ直します
- **無名優先は維持**: 好みは上限つきの倍率で、熱量を足しません。目利きの言及が無い曲は好みに合っていても出ません。埋もれた曲の3枠は好みに関係なく選びます。同じ目利きが先頭に立つ曲は1キュー4曲まで
- **曲のタグ**: アーティストのタグ（Last.fm `artist.getTopTags` をシーンに正規化、無ければ Apple のジャンル）→ それも無ければ、推した目利きのプロフィール（推した曲のタグの平均）で補います
- 係数は `config/app-config.json` の `taste`、純粋関数は `src/lib/scoring/taste.ts`

## 画面と導線（スマホ前提）

Material Design / Human Interface Guidelines の考え方に沿って、説明文ではなく配置と形で伝えるようにしています。

- **下部ナビ4項目**（ホーム / 目利き / 推薦 / 保存）。設定は右上のアバターから。広い画面では左のナビゲーションレールに変わります
- **ミニプレイヤー → 全画面プレイヤー**。画面を移っても再生は途切れません
- **主操作は1画面に1つ**、親指の届く位置に大きく置く（再生の丸ボタン、オンボーディングの「次へ」、推薦の投稿）
- **「なぜ出てきたか」は形で**: 推した目利きのアバター（×回数）、推薦キャンペーンはハート、埋もれた曲は星。文としての理由は読み上げ用ラベルに残しています
- **深さ**は両端のアイコン（波 → 錨）と現在値だけ
- **入力は下からのシート**（目利きの推薦、曲の推薦）。タップ領域は44pt以上
- **Bandcamp** は埋め込みプレイヤーの下に「再生する / スキップ」の2ボタンだけ。自動送りが止められたら再生ボタンが強調表示に変わります

| 画面 | 内容 |
| --- | --- |
| ホーム `/` | 初回はオンボーディング。以降は、好みのチップ、先頭曲の大きなカード、深さ、あなたへの推薦、合う目利きの棚、キュー |
| 目利き `/curators` | 検索、シーンで絞り込み、フォロー、最近推した3曲（タップで再生）。右上から目利きを推薦 |
| 推薦 `/campaigns` | キャンペーン。好みに一致した推薦を「あなたへ」として先頭に。目利き・アーティストは投稿 |
| 保存 `/library` | 保存した曲 |
| 設定 `/settings` | 好みの選び直し、好きなアーティスト、優先サービス、Apple Music 接続、アーティスト登録、目利きの本人確認、掲載停止の申し出先 |
| 管理 `/admin` | X API 予算と警告、バッチの手動実行、解決できなかった URL、目利きの承認 / 停止 / ウェイト、推薦審査、キャンペーン作成 |

## 構成

Next.js 16（App Router / Cache Components）+ TypeScript + Tailwind CSS v4 + **shadcn/ui**、Supabase（Postgres / Auth）、Vitest、Playwright。

```
config/app-config.json      係数・しきい値（スコア式、キュー、収集、キャンペーン）。コードに埋め込まない
supabase/migrations/        スキーマと行レベルセキュリティ
scripts/                    バッチ（cron から起動）
  collect.ts                  日次: X 収集 → Last.fm → スコア再計算
  score.ts / listeners.ts     個別実行
  import-curators.ts          目利きの CSV 一括登録（ハンドル, 表示名, ウェイト）
  db-reset.ts                 fixtures 用ローカル DB の作り直し
fixtures/demo/              デモ用（実在曲。scripts/dev/ で iTunes Search API から生成）
fixtures/e2e/               E2E 用（架空の曲。外部に出ない）
config/onboarding.json      シーンの語彙（タグの対応表）とオンボーディング用アーティスト
src/lib/
  resolver/parse.ts           曲 URL パーサー（純粋関数）
  resolver/resolve.ts         URL リゾルバ（外部取得・DB upsert）。収集とキャンペーン投稿で共通
  scoring/score.ts            スコア計算（純粋関数）
  scoring/taste.ts            好みのモデル（純粋関数）
  feed/build-queue.ts         キューの組み立て（純粋関数）
  x/query.ts                  検索クエリのグループ化（純粋関数）
  pipeline/                   収集・人気度・スコア・予算ガード
  repo/                       フィード / 目利き / キャンペーン / 管理のドメインロジック
  db/                         薄い CRUD（ローカル JSON 実装と Supabase 実装で同じロジックを共有）
  player/                     統一キューのストア、PlayerAdapter（Apple / SoundCloud / Bandcamp / 模擬）
src/components/ui/          shadcn/ui コンポーネント
```

### スコア（仕様書 6章）

```
score(t,u)   = heat(t,u) × obscurity(t)^(2·d_u) × (1 + pitchBoost(t,u))
heat(t,u)    = Σ_{c∈top5(t)} w_c · f_{u,c} · min(1 + 0.25(n_{c,t}−1), 2) · 0.5^(Δ_{c,t}/30)
obscurity(t) = 1 / (1 + log10(1 + L_t / 10000))
```

バッチは目利き別の寄与（f を掛ける前）と obscurity を `track_scores` に保存し、フォロー倍率・深さ・推薦加点はリクエスト時に適用します。フォロー倍率を掛けた後の寄与で上位5人を選ぶため、寄与の内訳を `track_scores.contributions` に持たせています。

## 本番セットアップ

1. Supabase プロジェクトを作り、`supabase/migrations/` を適用（`supabase db push` など）
2. Auth で **Email（マジックリンク）** を有効化。目利きの本人確認用に **X プロバイダー** と、メールでログイン済みのユーザーが X を連携できるよう **Manual identity linking** を有効化。リダイレクト URL に `https://<host>/api/auth/callback` を追加
3. `.env.example` を参考に環境変数を設定（Vercel / `.env.local`）。`X_MONTHLY_BUDGET_USD` が未設定だと収集しません
4. 最初の管理者は SQL で `update public.users set role = 'admin' where email = '...'`
5. 目利きの初期データ: `npm run curators:import -- curators.csv`（`--no-lookup` で X API を呼ばずに登録）
6. 日次バッチは `.github/workflows/daily-batch.yml`（GitHub Actions の Secrets に環境変数を登録）。Vercel Cron を使う場合も `npm run batch:daily` 相当を呼ぶ

## テスト

```bash
npm test            # Vitest: URL パーサー、スコアと好みの性質、キュー構築、X クエリ、ストア遷移、CSV
npm run test:e2e    # Playwright: オンボーディング、再生フロー、フォロー、深さ、推薦〜審査、管理（PCとスマホの画面サイズ）
npm run lint && npm run typecheck
```

E2E は事前インストール済みの Chromium を使う環境なら `PW_CHROMIUM_PATH=/path/to/chromium` を指定できます。

## 仕様書との差分・確認したいこと

実装時に公式ドキュメントを確認した結果と、仕様書に記載が無く仮置きした点です。

**公式ドキュメントとの差分**（公式を優先して実装）

- X: `url:` 演算子はトークン化マッチのため、ドメインを `url:"soundcloud.com"` のようにクオートする。pay-per-use の検索クエリ長は 512 文字
- X: ユーザー取得（承認時の `x_user_id` 取得）は Posts とは別の **User: Read（1件 $0.010）** で課金される。`api_usage` には現状ポスト読み取りのみ記録
- X: 同じリソースは UTC 日内なら再課金されない（推定費用は保守的に毎回加算）
- Apple Music API: `attributes.isrc` は任意項目。無い場合は「同一アーティスト＋同名タイトル」で曲を統合
- SoundCloud: `/resolve` は OAuth 2.1 のアクセストークン（client credentials）が必要。`client_id` クエリだけでは不可
- Bandcamp: 公式の開発者ドキュメントは無い。公開ページの `bc-page-properties` と `og:*` から取得しており、変更されうる
- iTunes Search / Lookup API は実際に呼んで確認済み（曲IDは Apple Music の `?i=` の値と一致、プレビューURLは音声を返す）。それ以外の API は、この開発環境から各社のサイトに届かず検索結果経由の確認で、実キーでの疎通は未確認です
- 開発環境のブラウザでは音声の再生（AAC のデコードと外部ホストへの接続）ができないため、**プレビューが実際に鳴るところは実機で確認していません**

**仕様書に無く、仮置きした点（要確認）**

- **好みの倍率（tasteMult）と仮フォロー・相性は仕様書 6章の式への追加**です。好みが空のときは元の式と同じ結果になります。係数はすべて初期値の当て推量なので、運用で調整してください
- **Last.fm のタグを選曲の下地に使う**点は、仕様書が「後回し」とした「タグによる類似曲探索（MusicBrainz）」と近い領域です。ユーザー向けの類似曲検索ではなく内部の並べ替えの材料に限っていますが、方針として問題ないか確認してください
- プレビュー（30秒）を最後まで聴いた場合も「完聴」として扱っています（次のキューから外し、好みに加点）
- 未ログインの間、好み・聴いた曲・好きなアーティストは端末に保存し、キュー取得のたびにサーバーへ送ります（サーバーには保存しません）
- デモのリスナー数は概算の架空値です（Last.fm に接続できない環境で作成したため）

- 受け取った PDF は 8章（目利き登録）までで、9章（推薦キャンペーン詳細）・12章（フェーズと受け入れ条件）・13章（未決事項）が含まれていませんでした。キャンペーンは 2章のスコープと 4章のデータモデルから実装しています
- 追加したテーブル / カラム: `user_taste`、`artists.tags`、`curators.profile_tags`、`track_scores.tags`、`listen_events.position_sec`、`curator_suggestions`（推薦の票）、`resolve_failures`、`app_state`（since_id など）、`users.email` / `users.preferred_service`、`curators.bio`、`tracks.artwork_url`、`track_scores.contributions` / `mention_count`
- 言及の無い（キャンペーン経由だけの）曲は heat が 0 になりフィードに出ないため、好きなアーティストに一致した承認済み推薦がある場合は heat の下限を `pitchBaseHeat = 1.0`（設定ファイル）としています
- pitchBoost の「一致1件」は「好きなアーティストに一致する承認済み推薦1件」と解釈。フィードに反映するのは募集中（open）のキャンペーンの推薦のみ
- アーティストのロールは設定画面での自己申告（投稿は管理者が審査）。本人確認の方法は未定
- 目利き申請の却下は行を削除（`status` に rejected は追加していません）
- ストアフロントの無い Apple Music URL は `jp` を既定に
- プロダクト名は未定のため「マイナー曲発掘プレイヤー」を仮置き（`NEXT_PUBLIC_APP_NAME` で変更可）
- Bandcamp の「再生開始」は、外部から検知できないため「再生する」を押した時点で記録
- MVP として、フィード等は対象テーブルをまとめて読み込んでいます。データが増えたら SQL ビュー / RPC への置き換えを想定
