// fixtures モードのローカルDBを作り直す
import fs from "node:fs";
import path from "node:path";
import { env, useFixtures } from "../src/lib/env";
import { getDb } from "../src/lib/db";
import { bootstrapLocal } from "../src/lib/pipeline/bootstrap";

if (!useFixtures()) {
  console.error("db:reset is only available with USE_FIXTURES=true");
  process.exit(1);
}
const file = path.resolve(process.cwd(), env.localDbFile);
fs.rmSync(file, { force: true });
bootstrapLocal(getDb(), console.log).then(() => console.log(`seeded ${file}`));
