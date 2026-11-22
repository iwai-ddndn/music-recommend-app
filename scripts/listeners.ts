// Last.fm のリスナー数を取得・更新する
import { refreshListeners } from "../src/lib/pipeline/listeners";
import { run } from "./_run";

run("listeners", (db) => refreshListeners(db, { log: console.log }));
