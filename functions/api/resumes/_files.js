import { getAuthenticatedUser, json } from "../_state.js";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const FILE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS resume_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  encryption_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
)`;

const FILE_INDEX_SQL = "CREATE INDEX IF NOT EXISTS idx_resume_files_user_created ON resume_files(user_id, created_at DESC)";

const ALLOWED = new Map([
  ["application/pdf", { extensions: [".pdf"], signature: [0x25, 0x50, 0x44, 0x46, 0x2d] }],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", { extensions: [".docx"], signature: [0x50, 0x4b, 0x03, 0x04] }],
  ["text/plain", { extensions: [".txt", ".md"], signature: null }],
  ["text/markdown", { extensions: [".md"], signature: null }],
]);

export async function requireFileStorage(context) {
  const user = await getAuthenticatedUser(context);
  if (!user) return { error: json({ error: "Sign in to manage résumé files.", code: "AUTH_REQUIRED" }, 401) };
  if (!context.env?.JOBS_DB || !context.env?.RESUME_FILES || !context.env?.FILE_ENCRYPTION_KEY) {
    return { error: json({ error: "Private résumé storage is not configured.", code: "STORAGE_NOT_CONFIGURED" }, 503) };
  }
  await context.env.JOBS_DB.prepare(FILE_TABLE_SQL).run();
  await context.env.JOBS_DB.prepare(FILE_INDEX_SQL).run();
  const account = await context.env.JOBS_DB.prepare("SELECT account_status FROM users WHERE id = ?").bind(user.sub).first();
  if (account && account.account_status !== "active") {
    return { error: json({ error: "This account cannot access private résumé storage.", code: "ACCOUNT_RESTRICTED" }, 403) };
  }
  return { user, db: context.env.JOBS_DB, bucket: context.env.RESUME_FILES };
}

export function validateFile(file, bytes) {
  if (!(file instanceof File) || !file.name) return { error: "Choose a résumé file.", code: "FILE_REQUIRED" };
  if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) return { error: "Résumé files must be between 1 byte and 10 MB.", code: "FILE_SIZE_INVALID" };
  const type = normalizeType(file.type, file.name);
  const rule = ALLOWED.get(type);
  if (!rule) return { error: "Only PDF, DOCX, TXT, and MD résumé files are accepted.", code: "FILE_TYPE_INVALID" };
  const lower = file.name.toLowerCase();
  if (!rule.extensions.some((extension) => lower.endsWith(extension))) return { error: "The filename extension does not match its type.", code: "FILE_EXTENSION_INVALID" };
  if (rule.signature && !rule.signature.every((value, index) => bytes[index] === value)) return { error: "The file contents do not match the declared format.", code: "FILE_SIGNATURE_INVALID" };
  if (type.startsWith("text/") && hasBinaryNull(bytes)) return { error: "The text résumé contains binary data.", code: "FILE_CONTENT_INVALID" };
  return { type, name: safeFilename(file.name) };
}

export async function encryptFile(bytes, encodedKey) {
  const key = await importKey(encodedKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  const envelope = new Uint8Array(1 + iv.length + ciphertext.length);
  envelope[0] = 1;
  envelope.set(iv, 1);
  envelope.set(ciphertext, 13);
  return envelope;
}

export async function decryptFile(envelope, encodedKey) {
  const bytes = envelope instanceof Uint8Array ? envelope : new Uint8Array(envelope);
  if (bytes[0] !== 1 || bytes.byteLength < 30) throw new Error("Unsupported encrypted file envelope.");
  const key = await importKey(encodedKey);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(1, 13) }, key, bytes.slice(13));
}

export async function sha256(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function publicFile(row) {
  return row ? {
    id: row.id,
    name: row.original_name,
    content_type: row.content_type,
    size_bytes: Number(row.size_bytes),
    sha256: row.sha256,
    created_at: row.created_at,
    download_url: `/api/resumes/${encodeURIComponent(row.id)}`,
  } : null;
}

function normalizeType(type, filename) {
  const value = String(type || "").toLowerCase();
  if (ALLOWED.has(value)) return value;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".txt")) return "text/plain";
  return value;
}

function safeFilename(value) {
  return String(value).normalize("NFKC").replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 180);
}

function hasBinaryNull(bytes) {
  return bytes.slice(0, Math.min(bytes.length, 8192)).includes(0);
}

async function importKey(encodedKey) {
  let raw;
  try {
    raw = Uint8Array.from(atob(String(encodedKey)), (char) => char.charCodeAt(0));
  } catch {
    throw new Error("FILE_ENCRYPTION_KEY must be base64.");
  }
  if (raw.byteLength !== 32) throw new Error("FILE_ENCRYPTION_KEY must decode to 32 bytes.");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
