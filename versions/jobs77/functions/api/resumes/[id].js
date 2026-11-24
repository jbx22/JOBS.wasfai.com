import { json } from "../_state.js";
import { decryptFile, requireFileStorage } from "./_files.js";

export async function onRequestGet(context) {
  const access = await requireFileStorage(context);
  if (access.error) return access.error;
  const row = await activeOwnedFile(access, context.params.id);
  if (!row) return json({ error: "Résumé file not found.", code: "FILE_NOT_FOUND" }, 404);
  const object = await access.bucket.get(row.object_key);
  if (!object) return json({ error: "Résumé object is unavailable.", code: "OBJECT_NOT_FOUND" }, 404);
  const plaintext = await decryptFile(await object.arrayBuffer(), context.env.FILE_ENCRYPTION_KEY);
  return new Response(plaintext, {
    headers: {
      "Content-Type": row.content_type,
      "Content-Length": String(row.size_bytes),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequestDelete(context) {
  const access = await requireFileStorage(context);
  if (access.error) return access.error;
  const row = await activeOwnedFile(access, context.params.id);
  if (!row) return json({ error: "Résumé file not found.", code: "FILE_NOT_FOUND" }, 404);
  await access.bucket.delete(row.object_key);
  await access.db.prepare(
    "UPDATE resume_files SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
  ).bind(row.id, access.user.sub).run();
  return new Response(null, { status: 204 });
}

async function activeOwnedFile(access, id) {
  return access.db.prepare(
    "SELECT * FROM resume_files WHERE id = ? AND user_id = ? AND status = 'active'",
  ).bind(id, access.user.sub).first();
}
