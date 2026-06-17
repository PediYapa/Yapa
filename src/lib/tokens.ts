import "server-only";
import crypto from "crypto";

const TOKEN_PREFIX = "yapa_";

/** Gera um token de API. O plaintext é exibido UMA vez; só o hash é persistido. */
export function generateToken(): { plaintext: string; hash: string; prefixo: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  const plaintext = `${TOKEN_PREFIX}${raw}`;
  const hash = hashToken(plaintext);
  const prefixo = plaintext.slice(0, 12);
  return { plaintext, hash, prefixo };
}

export function hashToken(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}
