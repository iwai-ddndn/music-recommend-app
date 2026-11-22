# マイナー曲発掘プレイヤー（仮称）

再生数に左右されず、マイナーな曲に出会える Web 音楽プレイヤー。曲そのものは配信せず、Apple Music・SoundCloud・Bandcamp の公式プレイヤーを **1本のキュー** で切り替えて再生します。

- **目利き起点の収集**: 信頼できるディガーの X ポストから曲リンクを集める（日次バッチ）
- **人気度を割り引くスコア**: いいね・再生数は使わず、少数の目利きの熱量 × 無名度で並べる
- **推薦キャンペーン**: 目利きとアーティスト本人が「このアーティストが好きな人へ」を添えて推薦し、リスナーの好きなアーティストと突き合わせて届ける

## すぐ試す（fixtures モード）

外部 API のキーが無くても、`fixtures/` のサンプル応答とローカル DB（`.data/`）で一通り動きます。

```bash
npm install
npm run dev          # Supabase の設定が無ければ自動で fixtures モード
```

http://localhost:3000 を開くと、初回アクセス時にシード投入 → 収集 → 人気度取得 → スコア計算のパイプラインが fixtures 応答で流れ、すぐ再生できます。

- ログイン画面の「デモ用アカウント」から、リスナー / 目利き（本人確認済み）/ アーティスト / 管理者 を切り替えられます
- fixtures の曲 URL は架空のため、再生は各サービスの性質（Bandcamp は自動送り不可など）を保ったまま **模擬** します。実際の埋め込みで確認したいときは `NEXT_PUBLIC_PLAYER_MODE=real`
- DB を作り直す: `npm run db:reset`

## 画面と導線

| 画面 | 内容 |
| --- | --- |
| 発見 `/` | 今日のキュー（最大30曲）。各曲に「なぜ出てきたか」。「深さ」スライダーで人気度の割り引きを調整。ログイン不要で即再生 |
| 目利き `/curators` | フォロー / 解除、直近30日の推薦曲数、最近推した3曲。「目利きを推薦」（同じハンドルは票として加算） |
| キャンペーン `/campaigns` | 募集中のキャンペーン。好みに一致した推薦を「あなたへの推薦」として先頭に。目利き・アーティストは投稿フォーム（URL を入れると曲を事前確認） |
| ライブラリ `/library` | 保存した曲 |
| 設定 `/settings` | 好きなアーティスト、優先サービス、深さ、Apple Music 接続、アーティストとして参加、目利きの本人確認、テーマ |
| 管理 `/admin` | X API 予算と警告、収集バッチの手動実行、解決できなかった URL、目利きの承認 / 停止 / ウェイト、推薦審査、キャンペーン作成 |

UX 上の設計判断:

- **聴くまでを最短に**: ログインの壁を置かず、フォロー・保存・推薦など「自分のデータを作る操作」のときだけログインを案内し、ログイン後は元の画面へ戻す
- **常駐プレイヤー**: キューと埋め込み iframe はレイアウトに1つだけ置き、画面遷移で再生が途切れない。PC は右カラム、スマホはミニプレイヤー → 全画面パネル（閉じてもアンマウントしない）
- **Bandcamp の制約を正直に見せる**: 自動送りできないため、カードで「再生する / スキップ」を出して止まる。「元のサービスで開く」は Bandcamp だけ「購入ページへ」
- **モバイルの自動再生制限**: 自動送りで再生が始まらなければ「タップして続きを再生」を出して止まる
- **オンボーディングは発見画面の中で**: 未設定の項目（目利きのフォロー、好きなアーティスト）だけをカードで案内。一致した推薦があれば最上段で知らせる

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
fixtures/                   USE_FIXTURES=true のときのサンプル応答とシード
src/lib/
  resolver/parse.ts           曲 URL パーサー（純粋関数）
  resolver/resolve.ts         URL リゾルバ（外部取得・DB upsert）。収集とキャンペーン投稿で共通
  scoring/score.ts            スコア計算（純粋関数）
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
npm test            # Vitest: URL パーサー、スコアの性質、キュー構築、X クエリ、ストア遷移、CSV
npm run test:e2e    # Playwright: 再生フロー（fixtures + 模擬再生）、フォロー、深さ、推薦〜審査、管理、スマホ
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
- なお、この開発環境からは各社のドキュメントサイトに直接アクセスできず、検索結果経由で確認しました。実キーでの疎通は未確認です

**仕様書に無く、仮置きした点（要確認）**

- 受け取った PDF は 8章（目利き登録）までで、9章（推薦キャンペーン詳細）・12章（フェーズと受け入れ条件）・13章（未決事項）が含まれていませんでした。キャンペーンは 2章のスコープと 4章のデータモデルから実装しています
- 追加したテーブル / カラム: `curator_suggestions`（推薦の票）、`resolve_failures`、`app_state`（since_id など）、`users.email` / `users.preferred_service`、`curators.bio`、`tracks.artwork_url`、`track_scores.contributions` / `mention_count`
- 言及の無い（キャンペーン経由だけの）曲は heat が 0 になりフィードに出ないため、好きなアーティストに一致した承認済み推薦がある場合は heat の下限を `pitchBaseHeat = 1.0`（設定ファイル）としています
- pitchBoost の「一致1件」は「好きなアーティストに一致する承認済み推薦1件」と解釈。フィードに反映するのは募集中（open）のキャンペーンの推薦のみ
- アーティストのロールは設定画面での自己申告（投稿は管理者が審査）。本人確認の方法は未定
- 目利き申請の却下は行を削除（`status` に rejected は追加していません）
- ストアフロントの無い Apple Music URL は `jp` を既定に
- プロダクト名は未定のため「マイナー曲発掘プレイヤー」を仮置き（`NEXT_PUBLIC_APP_NAME` で変更可）
- Bandcamp の「再生開始」は、外部から検知できないため「再生する」を押した時点で記録
- MVP として、フィード等は対象テーブルをまとめて読み込んでいます。データが増えたら SQL ビュー / RPC への置き換えを想定
