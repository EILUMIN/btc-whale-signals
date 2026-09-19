import { createHash, timingSafeEqual } from "node:crypto";

/**
 * SHA-256 of the local ALERT_TEST_TOKEN. The plaintext token is never
 * committed and never sent to the browser. Production checks the header
 * against this hash so DISCORD_WEBHOOK_URL stays the only Discord secret.
 */
export const WATCH_TEST_TOKEN_SHA256 =
  "b1c586b42ffdc3847b750631e25711bb56177dd1c96e79b04f1a11bc023a9fae";

export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqualHex(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function watchTestTokenAuthorized(
  provided: string,
  expectedHash = WATCH_TEST_TOKEN_SHA256
) {
  const token = provided.trim();
  if (!token || token.length < 16) return false;
  return safeEqualHex(sha256Hex(token), expectedHash.toLowerCase());
}

export function readWatchTestToken(request: Request): string {
  const header = request.headers.get("x-watch-test-token")?.trim() ?? "";
  if (header) return header;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}
