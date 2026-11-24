// Index public vacancy facts only. Official detail pages host the full posting and application flow.
export const GOVERNMENT_DESCRIPTION = "المتطلبات والتقديم في الإعلان الرسمي.";

function text(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:\d{1,7}|x[\da-f]{1,6});/gi, (entity) => {
    if (!entity.startsWith("&#")) return ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " })[entity.toLowerCase()];
    const numeric = entity.slice(2, -1);
    const code = numeric[0].toLowerCase() === "x" ? Number.parseInt(numeric.slice(1), 16) : Number(numeric);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
  }).replace(/\s+/gu, " ").trim();
}

export function governmentJobUrl(value, board) {
  try {
    const url = new URL(value);
    if (url.origin !== new URL(board.url).origin || url.username || url.password || url.pathname.length > 2000 || !/^\/job\/[^/]+\/[0-9]{4,20}\/?$/.test(url.pathname)) return null;
    const requisition = url.pathname.split("/").filter(Boolean).at(-1);
    return { url: url.origin + url.pathname.replace(/\/?$/, "/"), requisition };
  } catch { return null; }
}

export function parseGovernmentSitemap(xml, board) {
  if (!/^\s*(?:<\?xml[^>]*>\s*)*<urlset\b[^>]*>[\s\S]*<\/urlset>\s*$/i.test(xml)) throw new Error("Government sitemap returned invalid XML");
  const links = new Map();
  for (const entry of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const link = governmentJobUrl(text(entry[1]), board);
    if (link && !links.has(link.requisition)) links.set(link.requisition, link);
  }
  return [...links.values()];
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((part) => [part[1].toLowerCase(), part[2] ?? part[3]]));
}

function date(value) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Official vacancy has an unrecognized date");
  return new Date(timestamp).toISOString();
}

export function parseGovernmentPosting(html, link, board) {
  if (!/<[^>]+itemtype\s*=\s*["']https?:\/\/schema\.org\/JobPosting["']/i.test(html)) {
    if (/position (?:has been filled|is no longer available)|job (?:is no longer available|you are trying to apply for has been filled)|الوظيفة لم تعد متاحة/i.test(html)) return null;
    throw new Error("Official vacancy is missing its job metadata");
  }
  const metadata = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const fields = attributes(tag);
    if (fields.itemprop && fields.content && !Object.hasOwn(metadata, fields.itemprop)) metadata[fields.itemprop] = text(fields.content);
  }
  const title = text(html.match(/<h1\b[^>]*itemprop\s*=\s*["']title["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || metadata.title).slice(0, 200);
  if (!title) throw new Error("Official vacancy is missing its title");
  const city = metadata.addressLocality || metadata.streetAddress || "";
  const location = city ? /\bSaudi Arabia\b|السعودية/i.test(city) ? city : `${city.replace(/,\s*SA$/i, "")}, Saudi Arabia` : board.region;
  return {
    requisition: link.requisition,
    title,
    employer: board.label,
    location: location.slice(0, 180),
    url: link.url,
    description: GOVERNMENT_DESCRIPTION,
    posted_at: date(metadata.datePosted),
    valid_through: date(metadata.validThrough),
    score: 50,
  };
}
