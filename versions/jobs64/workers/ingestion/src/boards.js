export const EMPLOYER_BOARDS = [
  { id: "tamara-greenhouse", label: "Tamara", url: "https://boards-api.greenhouse.io/v1/boards/tamara/jobs?content=true", portal: "https://job-boards.greenhouse.io/tamara", mode: "greenhouse" },
  { id: "careem-greenhouse", label: "Careem", url: "https://boards-api.greenhouse.io/v1/boards/careem/jobs?content=true", portal: "https://job-boards.greenhouse.io/careem", mode: "greenhouse" },
  { id: "foodics-workable", label: "Foodics", url: "https://apply.workable.com/api/v1/widget/accounts/foodics", portal: "https://apply.workable.com/foodics/", mode: "workable" },
];

export const SOURCE_CONNECTORS = ["public_html", "public_json", "greenhouse", "lever", "ashby", "workable"];

export async function ensureEmployerBoards(db) {
  const insert = `INSERT INTO sources (id, label, url, connector_mode, interval_minutes, owner_user_id, visibility)
    VALUES (?, ?, ?, ?, 360, '', 'central') ON CONFLICT(id) DO NOTHING`;
  await db.batch(EMPLOYER_BOARDS.map(({ id, label, url, mode }) => db.prepare(insert).bind(id, label, url, mode)));
}
