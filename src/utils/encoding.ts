/** 编码转换工具函数 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** UTF-8 安全的 Base64 编码 */
export function base64Encode(input: string): string {
  const bytes = textEncoder.encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** UTF-8 安全的 Base64 解码，非法输入抛异常 */
export function base64Decode(input: string): string {
  const bin = atob(input.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return textDecoder.decode(bytes);
}

/** URL 编码（组件级，空格变 %20） */
export function urlEncode(input: string): string {
  return encodeURIComponent(input);
}

/** URL 解码，非法序列抛异常 */
export function urlDecode(input: string): string {
  return decodeURIComponent(input);
}

export function toUpperCase(input: string): string {
  return input.toUpperCase();
}

export function toLowerCase(input: string): string {
  return input.toLowerCase();
}

// 开发期自检：UTF-8 Base64 与 URL 编码边界行为
if (import.meta.env.DEV) {
  const assertEq = (actual: string, expect: string, label: string) => {
    if (actual !== expect) {
      throw new Error(`[encoding self-check] ${label}: 期望 ${expect}，实际 ${actual}`);
    }
  };
  assertEq(base64Encode("hello"), "aGVsbG8=", "ASCII base64");
  assertEq(base64Encode("你好"), "5L2g5aW9", "中文 UTF-8 base64");
  assertEq(base64Decode("5L2g5aW9"), "你好", "UTF-8 base64 解码");
  assertEq(urlEncode("a b&c=1"), "a%20b%26c%3D1", "URL 编码");
  assertEq(urlDecode("a%20b%26c%3D1"), "a b&c=1", "URL 解码");
  assertEq(toUpperCase("abc"), "ABC", "转大写");
  assertEq(toLowerCase("ABC"), "abc", "转小写");
  console.log("[encoding] 自检通过");
}

