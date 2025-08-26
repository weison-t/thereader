import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const VERSION = "v1";

const getAesKey = (): Buffer => {
  const base = process.env.CONFIG_ENCRYPTION_KEY || "";
  if (!base) {
    throw new Error("Missing CONFIG_ENCRYPTION_KEY env var for encryption");
  }
  // Derive a 32-byte key via SHA-256 so any string works
  return createHash("sha256").update(base).digest();
};

export const encryptSecret = (plaintext: string): string => {
  const key = getAesKey();
  const iv = randomBytes(12); // AES-GCM recommended IV length
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, ciphertext]).toString("base64");
  return `${VERSION}:${payload}`;
};

export const decryptSecret = (encoded: string): string => {
  if (!encoded) return "";
  const [version, payload] = encoded.split(":", 2);
  if (version !== VERSION || !payload) {
    throw new Error("Unsupported secret format");
  }
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const key = getAesKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
};

