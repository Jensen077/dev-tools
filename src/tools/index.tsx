import type { ComponentType, ReactNode } from "react";
import { Formatter } from "./json-formatter/Formatter";
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
import { ToolIcon } from "../components/icons";

export interface ToolDef {
  id: string;
  name: string;
  icon: ReactNode;
  component: ComponentType;
}

/** 工具注册表：新增工具只需在此追加一项 */
export const TOOLS: ToolDef[] = [
  { id: "json-formatter", name: "JSON 格式化", icon: <ToolIcon name="json-formatter" />, component: Formatter },
  { id: "json-diff", name: "JSON 比对", icon: <ToolIcon name="json-diff" />, component: JsonDiff },
  { id: "log-extractor", name: "日志提取", icon: <ToolIcon name="log-extractor" />, component: LogExtractor },
  { id: "text-diff", name: "文本比对", icon: <ToolIcon name="text-diff" />, component: TextDiff },
  { id: "json-table", name: "表格导出", icon: <ToolIcon name="json-table" />, component: JsonTable },
  { id: "json-field-extract", name: "字段提取", icon: <ToolIcon name="json-field-extract" />, component: JsonFieldExtract },
  { id: "history", name: "历史记录", icon: <ToolIcon name="history" />, component: History },
  { id: "curl-runner", name: "Curl 执行", icon: <ToolIcon name="curl-runner" />, component: CurlRunner },
  { id: "image-preview", name: "图片预览", icon: <ToolIcon name="image-preview" />, component: ImagePreview },
  { id: "encode-convert", name: "编码转换", icon: <ToolIcon name="encode-convert" />, component: EncodeConvert },
  { id: "timestamp", name: "时间戳", icon: <ToolIcon name="timestamp" />, component: Timestamp },
  { id: "hash", name: "Hash 计算", icon: <ToolIcon name="hash" />, component: Hash },
  { id: "regex-tester", name: "正则测试", icon: <ToolIcon name="regex-tester" />, component: RegexTester },
  { id: "jwt", name: "JWT 解析", icon: <ToolIcon name="jwt" />, component: Jwt },
  { id: "param-convert", name: "参数转换", icon: <ToolIcon name="param-convert" />, component: ParamConvert },
];
