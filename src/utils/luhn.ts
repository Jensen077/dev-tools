/**
 * Luhn（模 10）校验与数字生成逻辑（纯函数，无 React / 无 Tauri 依赖，桌面与网页共同）。
 *
 * 工具定位：给表单 / 接口做「带 Luhn 校验位的数字」技术测试数据。模板 = 任意固定前缀 +
 * 尾部若干个 `x` 占位符，生成时占位位随机、末位由 Luhn 推算（保证通过校验）。
 *
 * 重要：产物只是「能过 Luhn 的数字串」，不保证是真实卡号，禁止用于任何支付 / 授权 /
 * 实名场景。因此本模块**不做卡组织识别、不做 BIN 测试段判定**——那些判断只在「针对
 * 特定 BIN」时才有意义，而这里不预设任何卡组织概念。
 */

/** Luhn（模 10）校验：返回数字串的校验位是否正确 */
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

/** 计算校验位（末位）：传入不含校验位的数字串，返回 0–9 */
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

/** 每 4 位分组显示（适用于任意位数数字串） */
export function formatLuhn(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export interface TemplateParse {
  ok: boolean;
  error?: string;
  /** 固定前缀（占位符前所有数字） */
  prefix?: string;
  /** 目标总长度（固定段 + x 占位数） */
  length?: number;
}

/**
 * 解析模板：固定数字前缀 + 尾部连续 `x`（或 `*`）占位符。
 * 支持空格 / `-` 分隔。例：`400004xxxxxxxxxx`、`1234 56xx xxxx`。
 * 生成时占位位随机、末位由 Luhn 推算。
 */
export function parseTemplate(raw: string): TemplateParse {
  const norm = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!norm) {
    return { ok: false, error: "请输入模板，例如 400004xxxxxxxxxx（x 为随机占位）" };
  }
  if (!/^[0-9X*]+$/.test(norm)) {
    return { ok: false, error: "模板只允许数字与占位符 x（也支持 *）" };
  }
  const tpl = norm.replace(/\*/g, "X");
  const placeholderIdx = tpl.indexOf("X");
  if (placeholderIdx < 0) {
    return { ok: false, error: "模板需包含占位符 x，例如 400004xxxxxxxxxx（想校验完整数字请用「校验」）" };
  }
  if (!/^X+$/.test(tpl.slice(placeholderIdx))) {
    return { ok: false, error: "x 只能连续出现在尾部（固定段后只能跟 x，不可夹数字）" };
  }
  const prefix = tpl.slice(0, placeholderIdx);
  if (prefix.length < 1) return { ok: false, error: "占位符前至少要有 1 位固定数字" };
  const length = tpl.length;
  if (length < 3 || length > 24) {
    return { ok: false, error: "总长度需在 3–24 位之间（固定段 + x）" };
  }
  return { ok: true, prefix, length };
}

function randomDigits(n: number): string {
  if (n <= 0) return "";
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += String(b % 10);
  return out;
}

export interface LuhnRow {
  /** 纯数字串（末位为 Luhn 校验位） */
  number: string;
  /** 每 4 位分组显示 */
  formatted: string;
  length: number;
}

/** 按模板批量生成 Luhn 合法数字（占位位随机 + 末位补校验位） */
export function generateLuhn(parsed: TemplateParse, count: number): LuhnRow[] {
  if (!parsed.ok || !parsed.prefix || !parsed.length) return [];
  const { prefix, length } = parsed;
  const randomLen = length - prefix.length - 1;
  const n = Math.max(0, Math.min(200, Math.floor(count)));
  const rows: LuhnRow[] = [];
  for (let i = 0; i < n; i++) {
    const payload = prefix + randomDigits(randomLen);
    const number = payload + String(luhnCheckDigit(payload));
    rows.push({ number, formatted: formatLuhn(number), length });
  }
  return rows;
}

export interface ValidationRow {
  /** 原样输入（回显用） */
  raw: string;
  /** 纯数字 */
  digits: string;
  length: number;
  luhn: boolean;
  ok: boolean;
  reason: string;
}

/** 批量校验（每行一个数字，忽略空行；空格与 - 不计入）。只报 Luhn 与位数，不做卡组织判定。 */
export function validateNumbers(input: string): ValidationRow[] {
  const rows: ValidationRow[] = [];
  for (const line of input.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    const digits = digitsOnly(raw);
    const luhn = luhnOk(digits);
    let reason: string;
    if (digits.length < 2) reason = "位数过短（<2）";
    else if (!luhn) reason = "Luhn 校验失败";
    else reason = "Luhn 通过";
    rows.push({ raw, digits, length: digits.length, luhn, ok: luhn && digits.length >= 2, reason });
  }
  return rows;
}