import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES 256 GCM for tool and credential passwords.
// Set CREDENTIALS_KEY to 32 random bytes in base64. Back it up separately from the database:
// without it, saved passwords cannot be read.
let warned = false;
function key(): Buffer {
  const k = process.env.CREDENTIALS_KEY;
  if (k) {
    const b = Buffer.from(k, "base64");
    if (b.length !== 32) throw new Error("CREDENTIALS_KEY must be 32 bytes in base64.");
    return b;
  }
  if (process.env.NODE_ENV === "production") throw new Error("CREDENTIALS_KEY is not set.");
  if (!warned) { console.warn("CREDENTIALS_KEY is not set; using a key derived from AUTH_SECRET for development only."); warned = true; }
  return createHash("sha256").update(String(process.env.AUTH_SECRET || "dev")).digest();
}

export function encrypt(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(stored: string): string {
  if (!stored) return "";
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) return "";
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
