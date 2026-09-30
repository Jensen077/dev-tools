/**
 * 测试卡号逻辑（纯函数，无 React / 无 Tauri 依赖，桌面与网页版共用）。
 *
 * 设计约束：只使用各支付网关公开文档里的**沙箱测试段**（Stripe / Adyen /
 * Authorize.Net / PayPal 等文档中的卡号所对应的 BIN）。不预置任何真实发卡行的
 * BIN 号段——按真实 BIN 批量生成卡号是盗刷素材，而沙箱环境也只认各家自己的
 * 测试段，真实段在生产环境无测试价值。
 */

export type Brand =
  | "Visa"
  | "Mastercard"
  | "American Express"
  | "Discover"
  | "JCB"
  | "Diners Club";

export interface TestBinRange {
  brand: Brand;
  /** 公开测试段前缀（6 位 BIN） */
  prefix: string;
  /** 该段卡号总长度 */
  length: number;
  /** CVC 位数（Amex 为 4） */
  cvcLen: number;
  /** 来源说明，用于 UI 提示 */
  source: string;
}

/** 各卡组织常见长度（用于校验时的「位数是否符合该品牌」判断） */
const BRAND_LENGTHS: Record<Brand, number[]> = {
  Visa: [13, 16, 19],
  Mastercard: [16],
  "American Express": [15],
  Discover: [16, 19],
  JCB: [16, 17, 18, 19],
  "Diners Club": [14, 16, 19],
};

/**
 * 公开沙箱测试段白名单。新增条目只允许来自网关公开文档的测试卡号，
 * 禁止加入真实发卡行 BIN。
 */
export const TEST_BIN_RANGES: readonly TestBinRange[] = [
  { brand: "Visa", prefix: "424242", length: 16, cvcLen: 3, source: "Stripe 通用成功卡段" },
  { brand: "Visa", prefix: "400000", length: 16, cvcLen: 3, source: "Stripe Visa 测试段（成功 / 拒付 / 3DS 语义）" },
  { brand: "Visa", prefix: "400005", length: 16, cvcLen: 3, source: "Stripe Visa 借记测试段" },
  { brand: "Visa", prefix: "411111", length: 16, cvcLen: 3, source: "Authorize.Net / Adyen 通用成功卡段" },
  { brand: "Mastercard", prefix: "555555", length: 16, cvcLen: 3, source: "Stripe Mastercard 成功卡段" },
  { brand: "Mastercard", prefix: "520082", length: 16, cvcLen: 3, source: "Stripe Mastercard 借记测试段" },
  { brand: "Mastercard", prefix: "510510", length: 16, cvcLen: 3, source: "Authorize.Net Mastercard 成功卡段" },
  { brand: "Mastercard", prefix: "222300", length: 16, cvcLen: 3, source: "Stripe Mastercard 2 系列 BIN 测试段" },
  { brand: "American Express", prefix: "378282", length: 15, cvcLen: 4, source: "Stripe Amex 成功卡段" },
  { brand: "American Express", prefix: "371449", length: 15, cvcLen: 4, source: "Authorize.Net Amex 成功卡段" },
  { brand: "Discover", prefix: "601111", length: 16, cvcLen: 3, source: "Stripe Discover 成功卡段" },
  { brand: "Discover", prefix: "601100", length: 16, cvcLen: 3, source: "PayPal 沙箱 Discover 卡段" },
  { brand: "JCB", prefix: "356600", length: 16, cvcLen: 3, source: "Stripe JCB 成功卡段" },
  { brand: "JCB", prefix: "353011", length: 16, cvcLen: 3, source: "Stripe JCB 测试段" },
  { brand: "Diners Club", prefix: "305693", length: 14, cvcLen: 3, source: "Stripe Diners 成功卡段" },
  { brand: "Diners Club", prefix: "385200", length: 14, cvcLen: 3, source: "PayPal 沙箱 Diners 卡段" },
];

export interface PresetCard {
  brand: Brand;
  /** 纯数字卡号（官方文档原号） */
  number: string;
  /** 沙箱语义：成功 / 3DS / 拒付原因 */
  note: string;
}

/** 官方文档原号：语义固定（成功、3DS、余额不足等），适合做分支流程测试 */
export const PRESET_TEST_CARDS: readonly PresetCard[] = [
  { brand: "Visa", number: "4242424242424242", note: "成功" },
  { brand: "Visa", number: "4000000000000002", note: "成功" },
  { brand: "Visa", number: "4000002500003155", note: "需 3DS 验证" },
  { brand: "Visa", number: "4000000000009995", note: "余额不足被拒" },
  { brand: "Visa", number: "4000000000000069", note: "卡已过期" },
  { brand: "Visa", number: "4000056655665556", note: "借记卡成功" },
  { brand: "Mastercard", number: "5555555555554444", note: "成功" },
  { brand: "Mastercard", number: "5200828282828210", note: "借记卡成功" },
  { brand: "Mastercard", number: "5105105105105100", note: "成功" },
  { brand: "Mastercard", number: "2223000048400011", note: "2 系列 BIN 成功" },
  { brand: "American Express", number: "378282246310005", note: "成功（CVC 4 位）" },
  { brand: "Discover", number: "6011111111111117", note: "成功" },
  { brand: "JCB", number: "3566002020360505", note: "成功" },
  { brand: "Diners Club", number: "30569309025904", note: "成功" },
];

/** 迭代法 Luhn（模 10）：校验位是否正确 */
export function luhnOk(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** 计算卡号末位（校验位）：传入不含校验位的数字串 */
export function luhnCheckDigit(payload: string): number {
  let sum = 0;
  let double = true;
  for (let i = payload.length - 1; i >= 0; i--) {
    let d = payload.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

/** 只保留数字 */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

/** 按 IIN 规则识别卡组织（识别不出返回 null） */
export function brandOf(input: string): Brand | null {
  const n = digitsOnly(input);
  if (!n) return null;
  if (/^4/.test(n)) return "Visa";
  if (/^3[47]/.test(n)) return "American Express";
  if (/^5[1-5]/.test(n)) return "Mastercard";
  if (n.length >= 4) {
    const p4 = Number(n.slice(0, 4));
    if (p4 >= 2221 && p4 <= 2720) return "Mastercard";
  }
  if (/^3(0[0-5]|[689])/.test(n)) return "Diners Club";
  if (/^35(2[89]|[3-8]\d)/.test(n)) return "JCB";
  if (/^6011/.test(n) || /^65/.test(n) || /^64[4-9]/.test(n)) return "Discover";
  if (n.length >= 6) {
    const p6 = Number(n.slice(0, 6));
    if (p6 >= 622126 && p6 <= 622925) return "Discover";
  }
  return null;
}

/** 卡号分组显示：Amex 4-6-5、Diners 14 位 4-6-4、其余每 4 位一组 */
export function formatCard(input: string, brand?: Brand | null): string {
  const n = digitsOnly(input);
  const b = brand ?? brandOf(n);
  if (b === "American Express" && n.length === 15) {
    return `${n.slice(0, 4)} ${n.slice(4, 10)} ${n.slice(10)}`;
  }
  if (b === "Diners Club" && n.length === 14) {
    return `${n.slice(0, 4)} ${n.slice(4, 10)} ${n.slice(10)}`;
  }
  return n.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** 命中的公开测试段（长度也要吻合） */
export function matchRange(input: string): TestBinRange | null {
  const n = digitsOnly(input);
  for (const r of TEST_BIN_RANGES) {
    if (n.length === r.length && n.startsWith(r.prefix)) return r;
  }
  return null;
}

/** 是否落在公开测试段内（仅看前缀，长度不足也能判断） */
export function isTestRange(input: string): boolean {
  const n = digitsOnly(input);
  return n.length >= 6 && TEST_BIN_RANGES.some((r) => n.startsWith(r.prefix));
}

export interface TemplateParse {
  ok: boolean;
  error?: string;
  /** 固定前缀（BIN，含用户额外固定的位数） */
  bin?: string;
  /** 卡号总长度 */
  length?: number;
  /** 命中的公开测试段 */
  range?: TestBinRange;
}

/**
 * 解析卡段模板：BIN + 尾部 x 占位符，如 `400000xxxxxxxxxx`。
 * 支持空格与 `-` 分隔（`4000 00xx xxxx xxxx`）、`*` 等同 `x`。
 * 生成的最后一位（占位符末位）由 Luhn 计算，保证校验位正确。
 */
export function parseTemplate(raw: string): TemplateParse {
  const tpl = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!tpl) return { ok: false, error: "请输入卡段模板，例如 400000xxxxxxxxxx" };
  if (!/^[0-9X*]+$/.test(tpl)) {
    return { ok: false, error: "模板只允许数字与占位符 x（也支持 *）" };
  }
  const norm = tpl.replace(/\*/g, "X");
  const firstPlaceholder = norm.indexOf("X");
  if (firstPlaceholder < 0) {
    return { ok: false, error: "模板需包含占位符 x，例如 400000xxxxxxxxxx（想校验完整卡号请切到「校验」）" };
  }
  const bin = norm.slice(0, firstPlaceholder);
  if (bin.length < 6) return { ok: false, error: "BIN 至少 6 位，例如 400000xxxxxxxxxx" };
  if (!/^X+$/.test(norm.slice(firstPlaceholder))) {
    return { ok: false, error: "占位符只能连续出现在尾部，中间不可夹固定数字" };
  }
  const length = norm.length;
  if (length < 12 || length > 19) return { ok: false, error: "卡号长度需在 12–19 位之间" };

  const range = TEST_BIN_RANGES.find((r) => r.length === length && bin.startsWith(r.prefix));
  if (!range) {
    const allowed = Array.from(new Set(TEST_BIN_RANGES.map((r) => r.prefix))).join(" / ");
    return {
      ok: false,
      error: `BIN ${bin} 不在网关公开测试段内。仅支持：${allowed}`,
    };
  }
  return { ok: true, bin, length, range };
}

/** 由测试段生成一个可直接用的模板（点击 BIN 胶囊用） */
export function templateForRange(range: TestBinRange): string {
  return range.prefix + "x".repeat(range.length - range.prefix.length);
}

function randomDigits(n: number): string {
  if (n <= 0) return "";
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += String(b % 10);
  return out;
}

function randomInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  // 64 位浮点可精确表示 Uint32，取模偏差可忽略（仅用于假数据）
  return (buf[0] ?? 0) % maxExclusive;
}

/** 未来有效期（当前年份起 0–4 年内），格式 MM/YY */
function randomExpiry(): string {
  const year = new Date().getFullYear() + randomInt(5);
  const month = 1 + randomInt(12);
  return `${String(month).padStart(2, "0")}/${String(year % 100).padStart(2, "0")}`;
}

export interface CardRow {
  /** 纯数字卡号 */
  number: string;
  /** 分组显示卡号 */
  formatted: string;
  brand: Brand;
  /** MM/YY，未勾选「含有效期与 CVC」时为空串 */
  expiry: string;
  /** CVC / Amex CID，未勾选时为空串 */
  cvc: string;
  /** 命中的测试段来源 */
  source: string;
}

/** 按模板批量生成测试卡号（末位为 Luhn 校验位，必然通过校验） */
export function generateFromTemplate(
  parsed: TemplateParse,
  count: number,
  withExtras: boolean,
): CardRow[] {
  if (!parsed.ok || !parsed.bin || !parsed.length || !parsed.range) return [];
  const { bin, length, range } = parsed;
  const randomLen = length - bin.length - 1;
  const n = Math.max(0, Math.min(50, Math.floor(count)));
  const rows: CardRow[] = [];
  for (let i = 0; i < n; i++) {
    const payload = bin + randomDigits(randomLen);
    const number = payload + String(luhnCheckDigit(payload));
    rows.push({
      number,
      formatted: formatCard(number, range.brand),
      brand: range.brand,
      expiry: withExtras ? randomExpiry() : "",
      cvc: withExtras ? randomDigits(range.cvcLen) : "",
      source: range.source,
    });
  }
  return rows;
}

export interface ValidationRow {
  /** 原样输入（用于回显） */
  raw: string;
  /** 纯数字 */
  digits: string;
  brand: Brand | null;
  length: number;
  luhn: boolean;
  /** 位数是否符合该卡组织常见长度 */
  lengthOk: boolean;
  /** 是否落在公开测试段内 */
  testRange: boolean;
  /** Luhn + 可识别卡组织即视为通过 */
  ok: boolean;
  reason: string;
}

/** 批量校验（每行一个卡号，忽略空行；空格与 - 不计入） */
export function validateCards(input: string): ValidationRow[] {
  const rows: ValidationRow[] = [];
  for (const line of input.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    const digits = digitsOnly(raw);
    const brand = brandOf(digits);
    const luhn = luhnOk(digits);
    const lengthOk = brand !== null && BRAND_LENGTHS[brand].includes(digits.length);
    const testRange = isTestRange(digits);
    const ok = luhn && brand !== null;
    let reason: string;
    if (digits.length < 12) reason = "位数不足（< 12）";
    else if (!brand) reason = "无法识别卡组织前缀";
    else if (!luhn) reason = "Luhn 校验失败";
    else if (!lengthOk) reason = `${brand} 常见长度不含 ${digits.length} 位`;
    else if (!testRange) reason = "Luhn 合法，但不在公开测试段";
    else reason = "Luhn 合法 · 公开测试段";
    rows.push({
      raw,
      digits,
      brand,
      length: digits.length,
      luhn,
      lengthOk,
      testRange,
      ok,
      reason,
    });
  }
  return rows;
}
