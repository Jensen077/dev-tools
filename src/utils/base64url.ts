/** base64url 编解码（JWT 用），自动补齐 padding */

/** 标准 base64 字符表 → URL 安全变体 */
function toUrlSafe(s: string): string {
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL 安全变体 → 标准 base64，补齐 padding */
function toStd(s: string): string {
  let out = s.replace(/-/g, "+").replace(/_/g, "/");
  while (out.length % 4 !== 0) out += "=";
  return out;
}

/** 字符串 → base64url（UTF-8 安全） */
export function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return toUrlSafe(btoa(bin));
}

/** base64url → 字符串（UTF-8），非法输入抛异常 */
export function base64UrlDecode(input: string): string {
  const bin = atob(toStd(input.trim()));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// 开发期自检：URL 安全字符与 padding 补齐
if (import.meta.env.DEV) {
  const assertEq = (actual: string, expect: string, label: string) => {
    if (actual !== expect) {
      throw new Error(`[base64url self-check] ${label}: 期望 ${expect}，实际 ${actual}`);
    }
  };
  assertEq(base64UrlEncode("hello"), "aGVsbG8", "无 padding 编码");
  assertEq(base64UrlEncode("hello?"), "aGVsbG8_", "URL 安全字符");
  assertEq(base64UrlDecode("aGVsbG8"), "hello", "无 padding 解码");
  assertEq(base64UrlDecode("aGVsbG8_"), "hello?", "URL 安全字符解码");
  console.log("[base64url] 自检通过");
}

