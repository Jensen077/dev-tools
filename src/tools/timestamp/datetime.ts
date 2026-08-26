/**
 * 时间戳工具的纯函数模块：智能解析 + 多时区格式化
 *
 * 解析规则（无时区后缀一律按 UTC 解释）：
 * - 紧凑格式：8 位 yyyyMMdd、14 位 yyyyMMddHHmmss（按 UTC）
 * - 纯数字：|v| < 1e12 按秒，否则按毫秒
 * - 日期串：yyyy-MM-dd [HH:mm[:ss[.SSS]]]，分隔符支持 - / .，月日时分秒可不补零
 * - ISO 变体：T 分隔、尾缀 Z / ±HH:MM / ±HHmm / ±HH（带 offset 按该 offset）
 * - 兜底 Date.parse（覆盖自带时区的 ISO/RFC2822），再失败报错
 */

export interface ParseOk {
  ms: number;
}
export interface ParseErr {
  error: string;
}

/** 25 个整点时区（UTC-12 .. UTC+12）与代表城市 */
export const TIMEZONES: { offset: number; label: string }[] = [
  { offset: -12, label: "贝克岛" },
  { offset: -11, label: "帕戈帕戈" },
  { offset: -10, label: "檀香山" },
  { offset: -9, label: "安克雷奇" },
  { offset: -8, label: "洛杉矶" },
  { offset: -7, label: "丹佛" },
  { offset: -6, label: "芝加哥" },
  { offset: -5, label: "纽约" },
  { offset: -4, label: "圣地亚哥" },
  { offset: -3, label: "圣保罗" },
  { offset: -2, label: "南乔治亚" },
  { offset: -1, label: "亚速尔群岛" },
  { offset: 0, label: "伦敦" },
  { offset: 1, label: "巴黎" },
  { offset: 2, label: "开罗" },
  { offset: 3, label: "莫斯科" },
  { offset: 4, label: "迪拜" },
  { offset: 5, label: "卡拉奇" },
  { offset: 6, label: "达卡" },
  { offset: 7, label: "曼谷" },
  { offset: 8, label: "北京" },
  { offset: 9, label: "东京" },
  { offset: 10, label: "悉尼" },
  { offset: 11, label: "努美阿" },
  { offset: 12, label: "奥克兰" },
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 用 UTC 字段构造毫秒，并往返校验真实日历（拒绝 2024-02-30 这类假日期） */
function utcMs(y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number): number | null {
  const t = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const dt = new Date(t);
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d ||
    dt.getUTCHours() !== h ||
    dt.getUTCMinutes() !== mi ||
    dt.getUTCSeconds() !== s
  ) {
    return null;
  }
  return t;
}

/** 解析尾缀时区：Z / ±HH:MM / ±HHmm / ±HH，返回偏移分钟数；无匹配返回 null */
function parseTzSuffix(rest: string): number | null {
  const m = rest.match(/^(?:Z|z|[+-]\d{2}(?::?\d{2})?)$/);
  if (!m) return null;
  const s = m[0]!;
  if (s === "Z" || s === "z") return 0;
  const sign = s[0] === "-" ? -1 : 1;
  const hh = Number(s.slice(1, 3));
  const hasMm = s.length > 3;
  const mm = hasMm ? Number(s.slice(-2)) : 0;
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return sign * (hh * 60 + mm);
}

/**
 * 智能解析输入：时间戳数字或日期字符串
 * 返回 null 表示空输入；{ error } 表示无法识别；{ ms } 表示成功
 */
export function parseSmart(input: string): ParseOk | ParseErr | null {
  const s = input.trim();
  if (!s) return null;

  // 1. 紧凑格式：yyyyMMdd（8 位）/ yyyyMMddHHmmss（14 位），按 UTC（须先于纯数字分支，否则会被当成时间戳）
  if (/^\d{8}$/.test(s) || /^\d{14}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const mo = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    if (/^\d{14}$/.test(s)) {
      const h = Number(s.slice(8, 10));
      const mi = Number(s.slice(10, 12));
      const sec = Number(s.slice(12, 14));
      const t = utcMs(y, mo, d, h, mi, sec, 0);
      if (t === null) return { error: "日期不存在" };
      return { ms: t };
    }
    const t = utcMs(y, mo, d, 0, 0, 0, 0);
    if (t === null) return { error: "日期不存在" };
    return { ms: t };
  }

  // 2. 纯数字时间戳（秒/毫秒按量级自动识别）
  if (/^[+-]?\d+$/.test(s)) {
    const raw = Number(s);
    const ms = Math.abs(raw) < 1e12 ? raw * 1000 : raw;
    return Number.isFinite(ms) ? { ms } : { error: "时间戳超出可表示范围" };
  }

  // 3. 日期字符串：日期部分（分隔符 - / .）+ 可选时间部分 + 可选时区尾缀
  const m = s.match(
    /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:[.,](\d{1,9}))?)?)?\s*(.*)$/
  );
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[3]);
    const d = Number(m[4]);
    const h = m[5] !== undefined ? Number(m[5]) : 0;
    const mi = m[6] !== undefined ? Number(m[6]) : 0;
    const sec = m[7] !== undefined ? Number(m[7]) : 0;
    const frac = m[8] !== undefined ? Number(`0.${m[8]}`) * 1000 : 0;
    const tzRest = m[9] ?? "";
    // 时间部分出现则必须完整（时:分），不允许只有日期+孤立尾缀
    if (tzRest) {
      const off = parseTzSuffix(tzRest);
      if (off === null) return { error: "无法识别的时区后缀" };
      const t = utcMs(y, mo, d, h, mi, sec, Math.round(frac));
      if (t === null) return { error: "日期不存在" };
      return { ms: t - off * 60000 };
    }
    const t = utcMs(y, mo, d, h, mi, sec, Math.round(frac));
    if (t === null) return { error: "日期不存在" };
    return { ms: t }; // 无时区后缀按 UTC
  }

  // 4. 兜底：自带时区的 ISO / RFC2822 等（Date.parse 对无时区串按本地解释，但走到这里的都已在前面的分支处理过）
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return { ms: t };
  return { error: "无法识别的时间格式" };
}

/** 在固定偏移时区内格式化：yyyy-MM-dd HH:mm:ss（不依赖 Intl） */
export function fmtAtOffset(ms: number, offsetMinutes: number): string {
  const d = new Date(ms + offsetMinutes * 60000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** UTC 时间格式化：yyyy-MM-dd HH:mm:ss */
export function fmtUTC(ms: number): string {
  return fmtAtOffset(ms, 0);
}

/** 本地时间格式化：yyyy-MM-dd HH:mm:ss */
export function fmtLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 与当前时间的相对差（过去/未来） */
export function diffLabel(diffMs: number): string {
  const abs = Math.abs(diffMs);
  const s = Math.floor(abs / 1000);
  const past = diffMs < 0 ? "已过去" : "之后";
  if (s < 60) return `${past} ${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${past} ${m} 分 ${s % 60} 秒`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${past} ${h} 时 ${m % 60} 分`;
  const d = Math.floor(h / 24);
  return `${past} ${d} 天 ${h % 24} 时`;
}
