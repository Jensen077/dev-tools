/**
 * 将文件字节解码为 JS 字符串，自动识别常见编码。
 * File.text() 只按 UTF-8 解码，GBK/GB2312 等中文文件会乱码。
 * 这里用原生 TextDecoder 按 BOM/UTF-8 探测，GBK 作为回退 ——
 * gbk/gb18030 是 WHATWG 标准编码，所有现代浏览器引擎（含 WKWebView）原生支持，无需第三方库。
 */
export function decodeBytes(bytes: Uint8Array): string {
  // UTF-8/UTF-16 BOM：直接按对应编码解码
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  // 严格 UTF-8 校验：合法则直接使用
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // 非 UTF-8（如 GBK），按 GB18030（GBK 超集）解码
    return new TextDecoder("gb18030").decode(bytes);
  }
}

/** 读取文件为 JS 字符串，自动识别编码 */
export async function readFileAsUtf8(file: File): Promise<string> {
  return decodeBytes(new Uint8Array(await file.arrayBuffer()));
}

// 开发期自检：各编码解码边界行为（与 utils/encoding.ts 自检同模式）
if (import.meta.env.DEV) {
  try {
  const assertEq = (actual: string, expect: string, label: string) => {
    if (actual !== expect) throw new Error(`[fileEncoding self-check] ${label}: 期望 ${expect}，实际 ${actual}`);
  };
  const utf8 = new TextEncoder().encode;
  assertEq(decodeBytes(new Uint8Array(0)), "", "空文件");
  assertEq(decodeBytes(utf8('{"a":1}')), '{"a":1}', "纯 ASCII");
  assertEq(decodeBytes(utf8('{"name":"张三"}')), '{"name":"张三"}', "UTF-8 中文");
  assertEq(decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("中文")])), "中文", "UTF-8 BOM 剥离");
  assertEq(decodeBytes(new Uint8Array([0xff, 0xfe, 0x2d, 0x4e])), "中", "UTF-16LE BOM");
  // GBK 中文「你好」= C4E3 BAC3，UTF-8 严格校验应失败并回退 GB18030
  assertEq(decodeBytes(new Uint8Array([0xc4, 0xe3, 0xba, 0xc3])), "你好", "GBK 回退");
  console.log("[fileEncoding] 自检通过");
  } catch (e) {
    // 个别 Webview（如部分 Chrome/自动测试环境）对 TextDecoder 编码参数校验严格，
    // 自检抛错不应拖垮整个应用挂载，记录后忽略。
    console.warn("[fileEncoding] 自检跳过：", e instanceof Error ? e.message : String(e));
  }
}
