export const SMARTRECRUITERS_CONNECTOR = "smartrecruiters";
export const SMARTRECRUITERS_BOARDS = [
  { slug: "AECOM2", label: "AECOM" },
  { slug: "EgisGroup", label: "Egis" },
  { slug: "Assystem", label: "Assystem" },
  { slug: "SGS", label: "SGS" },
  { slug: "AccorHotel", label: "Accor" },
].map(({ slug, label }) => ({
  id: `ksa-${slug.toLowerCase()}-smartrecruiters`, slug, label,
  url: `https://api.smartrecruiters.com/v1/companies/${slug}/postings?destination=PUBLIC&country=sa`,
  portal: `https://careers.smartrecruiters.com/${slug}`,
  mode: SMARTRECRUITERS_CONNECTOR, region: "Saudi Arabia",
}));

export const PORTAL_ONLY_BOARDS = [{
  id: "hiringcafe", label: "HiringCafe", url: "https://hiringcafe.com/", region: "Global",
  connector_note: "ابحث وقدّم عبر بوابة HiringCafe الرسمية.",
}];

export const EMPLOYER_BOARDS = [
  { id: "tamara-greenhouse", label: "Tamara", url: "https://boards-api.greenhouse.io/v1/boards/tamara/jobs?content=true", portal: "https://job-boards.greenhouse.io/tamara", mode: "greenhouse" },
  { id: "careem-greenhouse", label: "Careem", url: "https://boards-api.greenhouse.io/v1/boards/careem/jobs?content=true", portal: "https://job-boards.greenhouse.io/careem", mode: "greenhouse" },
  { id: "foodics-workable", label: "Foodics", url: "https://apply.workable.com/api/v1/widget/accounts/foodics", portal: "https://apply.workable.com/foodics/", mode: "workable" },
  ...SMARTRECRUITERS_BOARDS,
];

export const GOVERNMENT_CONNECTOR = "saudi_government";
export const GOVERNMENT_BOARDS = [
  { id: "saudi-zatca", label: "هيئة الزكاة والضريبة والجمارك (ZATCA)", portal: "https://careers.zatca.gov.sa/" },
  { id: "saudi-expro", label: "هيئة كفاءة الإنفاق والمشروعات الحكومية (EXPRO)", portal: "https://careers.expro.gov.sa/" },
  { id: "saudi-sama", label: "البنك المركزي السعودي (SAMA)", portal: "https://careers.sama.gov.sa/ar/" },
  { id: "saudi-misa", label: "وزارة الاستثمار السعودية (MISA)", portal: "https://jobs.misa.gov.sa/" },
].map((board) => ({ ...board, url: new URL("/sitemap.xml", board.portal).href, mode: GOVERNMENT_CONNECTOR, region: "Saudi Arabia" }));

export const CENTRAL_BOARDS = [...EMPLOYER_BOARDS, ...GOVERNMENT_BOARDS];

export const SOURCE_CONNECTORS = ["public_html", "public_json", "greenhouse", "lever", "ashby", "workable"];

export async function ensureEmployerBoards(db) {
  const insert = `INSERT INTO sources (id, label, url, connector_mode, region, interval_minutes, owner_user_id, visibility)
    VALUES (?, ?, ?, ?, ?, 360, '', 'central') ON CONFLICT(id) DO NOTHING`;
  const portal = `INSERT INTO sources (id, label, url, connector_mode, region, enabled, owner_user_id, visibility)
    VALUES (?, ?, ?, 'portal_only', ?, 0, '', 'central')
    ON CONFLICT(id) DO UPDATE SET label=excluded.label, url=excluded.url, connector_mode='portal_only', enabled=0,
      next_scan_at='', last_error=''
    WHERE sources.visibility='central' AND sources.owner_user_id=''
      AND (sources.url<>excluded.url OR sources.connector_mode<>'portal_only' OR sources.enabled<>0 OR sources.last_error<>'')`;
  await db.batch([
    ...CENTRAL_BOARDS.map(({ id, label, url, mode, region }) => db.prepare(insert).bind(id, label, url, mode, region || "")),
    ...PORTAL_ONLY_BOARDS.map(({ id, label, url, region }) => db.prepare(portal).bind(id, label, url, region)),
  ]);
}

export function presentCentralSource(source) {
  const portal = PORTAL_ONLY_BOARDS.find(({ id }) => id === source.id);
  if (portal) return { ...source, ...portal, enabled: true, scheduled: false, job_count: 0,
    connector_mode: "portal_only", source_quality: "manual_review", last_error: "", next_scan_at: "" };
  return { ...source, url: CENTRAL_BOARDS.find(({ id }) => id === source.id)?.portal || source.url,
    scheduled: true, source_quality: source.last_error ? "needs_attention" : source.last_scanned_at ? "live_verified" : "not_verified" };
}
