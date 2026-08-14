import type { ComponentType, ReactNode } from "react";
import { FormatterTabs } from "./json-formatter/FormatterTabs";
import { JsonDiff } from "./json-diff/JsonDiff";
import { LogExtractor } from "./log-extractor/LogExtractor";
import { TextDiff } from "./text-diff/TextDiff";
import { JsonTable } from "./json-table/JsonTable";
import { JsonFieldExtract } from "./json-field-extract/JsonFieldExtract";
import { History } from "./history/History";
import { EncodeConvert } from "./encode-convert/EncodeConvert";
import { Timestamp } from "./timestamp/Timestamp";
import { Hash } from "./hash/Hash";
import { RegexTester } from "./regex-tester/RegexTester";
import { Jwt } from "./jwt/Jwt";
import { CurlRunner } from "./curl-runner/CurlRunner";
import { ImagePreview } from "./image-preview/ImagePreview";
import { ParamConvert } from "./param-convert/ParamConvert";
import { Uuid } from "./uuid/Uuid";
import { Rsa } from "./rsa/Rsa";
import { Cron } from "./cron/Cron";
import { ToolIcon } from "../components/icons";

export interface ToolDef {
  id: string;
  name: string;
  icon: ReactNode;
  component: ComponentType;
  /** 侧边栏分组：JSON / 文本 / 编码与安全 / 通用 */
  cat: string;
}

/** 侧边栏分组顺序（与工具注册表的 cat 对应），也决定 ⌘1-⌘9 快捷键的分配顺序 */
export const GROUP_ORDER = ["JSON", "文本", "编码与安全", "通用"];

/**
 * 按侧边栏展示顺序返回工具：先按 GROUP_ORDER 分组，组内保持 settings.order 的相对顺序。
 * 侧边栏的 ⌘1-⌘9 徽标与 useKeyboardShortcuts 的触发逻辑共用此顺序，保证显示与按下一致。
 */
export function getDisplayTools(order: string[]): ToolDef[] {
  const byId = new Map(TOOLS.map((t) => [t.id, t]));
  const result: ToolDef[] = [];
  for (const cat of GROUP_ORDER) {
    for (const id of order) {
      const t = byId.get(id);
      if (t && t.cat === cat) result.push(t);
    }
  }
  return result;
}

/** 工具注册表：新增工具只需在此追加一项 */
export const TOOLS: ToolDef[] = [
  { id: "json-formatter", name: "JSON 格式化", icon: <ToolIcon name="json-formatter" />, component: FormatterTabs, cat: "JSON" },
  { id: "json-diff", name: "JSON 比对", icon: <ToolIcon name="json-diff" />, component: JsonDiff, cat: "JSON" },
  { id: "log-extractor", name: "日志提取", icon: <ToolIcon name="log-extractor" />, component: LogExtractor, cat: "JSON" },
  { id: "text-diff", name: "文本比对", icon: <ToolIcon name="text-diff" />, component: TextDiff, cat: "文本" },
  { id: "json-table", name: "表格导出", icon: <ToolIcon name="json-table" />, component: JsonTable, cat: "JSON" },
  { id: "json-field-extract", name: "字段提取", icon: <ToolIcon name="json-field-extract" />, component: JsonFieldExtract, cat: "JSON" },
  { id: "history", name: "历史记录", icon: <ToolIcon name="history" />, component: History, cat: "通用" },
  { id: "curl-runner", name: "Curl 执行", icon: <ToolIcon name="curl-runner" />, component: CurlRunner, cat: "文本" },
  { id: "image-preview", name: "图片预览", icon: <ToolIcon name="image-preview" />, component: ImagePreview, cat: "文本" },
  { id: "encode-convert", name: "编码转换", icon: <ToolIcon name="encode-convert" />, component: EncodeConvert, cat: "编码与安全" },
  { id: "timestamp", name: "时间戳", icon: <ToolIcon name="timestamp" />, component: Timestamp, cat: "编码与安全" },
  { id: "hash", name: "Hash 计算", icon: <ToolIcon name="hash" />, component: Hash, cat: "编码与安全" },
  { id: "regex-tester", name: "正则测试", icon: <ToolIcon name="regex-tester" />, component: RegexTester, cat: "文本" },
  { id: "jwt", name: "JWT 解析", icon: <ToolIcon name="jwt" />, component: Jwt, cat: "编码与安全" },
  { id: "param-convert", name: "参数转换", icon: <ToolIcon name="param-convert" />, component: ParamConvert, cat: "编码与安全" },
  { id: "uuid", name: "UUID", icon: <ToolIcon name="uuid" />, component: Uuid, cat: "编码与安全" },
  { id: "rsa", name: "RSA", icon: <ToolIcon name="rsa" />, component: Rsa, cat: "编码与安全" },
  { id: "cron", name: "Cron", icon: <ToolIcon name="cron" />, component: Cron, cat: "通用" },
];
