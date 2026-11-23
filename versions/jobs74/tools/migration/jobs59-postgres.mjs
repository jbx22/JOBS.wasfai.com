import { readFileSync } from "node:fs";
import { convertDdl } from "./d1_to_postgres.mjs";

const migrations = ["009_recruitment.sql", "010_payment_activations.sql"];
for (const filename of migrations) {
  const path = new URL(`../../workers/ingestion/migrations/${filename}`, import.meta.url);
  process.stdout.write(convertDdl(readFileSync(path, "utf8")) + "\n");
}
