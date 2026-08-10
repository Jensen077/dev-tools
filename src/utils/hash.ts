/** Hash 计算：SHA 系列用 Web Crypto，MD5 用内联实现 */

export type HashAlgorithm = "MD5" | "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

/** 字节数组转 hex 小写字符串 */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

const SHA_ALGOS: readonly HashAlgorithm[] = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];

/** 计算文本的 SHA 系列哈希（Web Crypto，异步） */
export async function shaHex(algorithm: HashAlgorithm, input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? textBytes(input) : input;
  const digest = await crypto.subtle.digest(algorithm, data);
  return bytesToHex(new Uint8Array(digest));
}

function textBytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

/** MD5 内联实现（RFC 1321）。约 40 行，避免引入第三方依赖。 */
export function md5Hex(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? textBytes(input) : input;
  const L = bytes.length;

  // 补位：先加 0x80，再补零到 64 字节对齐，最后 8 字节写原始 bit 长度（小端）
  const withLen = new Uint8Array(((L + 8) >> 6 << 6) + 64);
  withLen.set(bytes);
  withLen[L] = 0x80;
  const bitLen = BigInt(L) * 8n;
  const view = new DataView(withLen.buffer);
  for (let i = 0; i < 8; i++) view.setUint8(withLen.length - 8 + i, Number((bitLen >> BigInt(8 * i)) & 0xffn));

  const s: number[] = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const M = new Uint32Array(16);
  for (let off = 0; off < withLen.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      M[i] = view.getUint32(off + i * 4, true);
    }
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      const dTemp = D;
      D = C;
      C = B;
      B = (B + rotl(A + F + K[i]! + M[g]!, s[i]!)) >>> 0;
      A = dTemp;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new DataView(new ArrayBuffer(16));
  out.setUint32(0, a0, true);
  out.setUint32(4, b0, true);
  out.setUint32(8, c0, true);
  out.setUint32(12, d0, true);
  return bytesToHex(new Uint8Array(out.buffer));
}

function rotl(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c));
}

/** 一次性计算全部算法哈希（文本或二进制），返回 算法→hex */
export async function computeAll(
  algoList: readonly HashAlgorithm[],
  input: string | Uint8Array,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const algo of algoList) {
    if (algo === "MD5") {
      out[algo] = md5Hex(input);
    } else {
      out[algo] = await shaHex(algo, input);
    }
  }
  return out;
}

export const ALL_ALGORITHMS: readonly HashAlgorithm[] = ["MD5", ...SHA_ALGOS];

// 开发期自检：MD5 用 RFC 1321 已知向量验证，SHA 与 Web Crypto 基准核对
if (import.meta.env.DEV) {
  const md5Test = async () => {
    const cases: [string, string][] = [
      ["", "d41d8cd98f00b204e9800998ecf8427e"],
      ["a", "0cc175b9c0f1b6a831c399e269772661"],
      ["abc", "900150983cd24fb0d6963f7d28e17f72"],
      ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
    ];
    for (const [input, expect] of cases) {
      const actual = md5Hex(input);
      if (actual !== expect) {
        throw new Error(`[hash self-check] MD5("${input}") = ${actual}，期望 ${expect}`);
      }
    }
    const sha = await shaHex("SHA-256", "abc");
    if (sha !== "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") {
      throw new Error(`[hash self-check] SHA-256("abc") = ${sha}`);
    }
    console.log("[hash] 自检通过");
  };
  void md5Test();
}

