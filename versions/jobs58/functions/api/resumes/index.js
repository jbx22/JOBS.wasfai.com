import { json } from "../_state.js";
import { encryptFile, MAX_FILE_BYTES, publicFile, requireFileStorage, sha256, validateFile } from "./_files.js";

export async function onRequestGet(context) {
  const access = await requireFileStorage(context);
  if (access.error) return access.error;
  const row = await access.db.prepare(
    "SELECT * FROM resume_files WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
  ).bind(access.user.sub).first();
  return json({ file: publicFile(row), storage: "d1+r2-encrypted" });
}

export async function onRequestPost(context) {
  const access = await requireFileStorage(context);
  if (access.error) return access.error;
  const form = await context.request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Choose a résumé file.", code: "FILE_REQUIRED" }, 400);
  if (file.size > MAX_FILE_BYTES) return json({ error: "Résumé files cannot exceed 10 MB.", code: "FILE_TOO_LARGE" }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateFile(file, bytes);
  if (validation.error) return json({ error: validation.error, code: validation.code }, 415);

  const id = crypto.randomUUID();
  const objectKey = `users/${encodeURIComponent(access.user.sub)}/resumes/${id}.enc`;
  const digest = await sha256(bytes);
  const encrypted = await encryptFile(bytes, context.env.FILE_ENCRYPTION_KEY);
  await access.bucket.put(objectKey, encrypted, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { encryption: "AES-256-GCM", version: "1" },
  });

  try {
    const previous = await access.db.prepare(
      "SELECT id, object_key FROM resume_files WHERE user_id = ? AND status = 'active'",
    ).bind(access.user.sub).first();
    const statements = [];
    if (previous) statements.push(access.db.prepare(
      "UPDATE resume_files SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
    ).bind(previous.id, access.user.sub));
    statements.push(access.db.prepare(
      `INSERT INTO resume_files
       (id, user_id, object_key, original_name, content_type, size_bytes, sha256, encryption_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    ).bind(id, access.user.sub, objectKey, validation.name, validation.type, bytes.byteLength, digest));
    await access.db.batch(statements);
    if (previous) await access.bucket.delete(previous.object_key);
  } catch (error) {
    await access.bucket.delete(objectKey);
    throw error;
  }

  const row = await access.db.prepare("SELECT * FROM resume_files WHERE id = ?").bind(id).first();
  return json({ file: publicFile(row), storage: "d1+r2-encrypted" }, 201);
}
