use crate::curl::{HttpResult, run_curl_script};
use crate::diff::{DiffNode, diff_json};
use crate::extract::{JsonMatch, extract_json};
use crate::format::{ParseError, format_json, minify_json, unescape_json};
use crate::props::{CompareResult, compare_kv};
use serde_json::Value;

/// 格式化 JSON 文本（缩进美化）
#[tauri::command]
pub async fn fmt_json(input: String, indent: usize) -> Result<String, ParseError> {
    // 钳制缩进上限，避免异常值导致 OOM
    let indent = indent.clamp(2, 8);
    format_json(&input, indent)
}

/// 压缩 JSON 为单行
#[tauri::command]
pub async fn min_json(input: String) -> Result<String, ParseError> {
    minify_json(&input)
}

/// 反转义并格式化 JSON 字符串
#[tauri::command]
pub async fn fmt_unescape(input: String) -> Result<String, ParseError> {
    unescape_json(&input)
}

/// 从日志文本中提取 JSON 片段
#[tauri::command]
pub async fn extract_json_cmd(input: String) -> Vec<JsonMatch> {
    extract_json(&input)
}

/// 结构化比对两个 JSON 文本
#[tauri::command]
pub async fn compare_json(left: String, right: String) -> Result<DiffNode, ParseError> {
    let l: Value = serde_json::from_str(&left).map_err(|e| ParseError {
        message: format!("左值解析失败: {}", e),
        line: e.line() as usize,
        column: e.column() as usize,
    })?;
    let r: Value = serde_json::from_str(&right).map_err(|e| ParseError {
        message: format!("右值解析失败: {}", e),
        line: e.line() as usize,
        column: e.column() as usize,
    })?;
    Ok(diff_json(&l, &r))
}

/// 按键值比对两侧配置（各自可为 .properties 或 YAML，自动识别）
#[tauri::command]
pub async fn compare_props(left: String, right: String) -> Result<CompareResult, ParseError> {
    compare_kv(&left, &right)
}

/// 直接执行 curl 脚本（调用系统 curl）
#[tauri::command]
pub async fn run_curl_script_cmd(script: String) -> Result<HttpResult, String> {
    run_curl_script(&script).await
}

/// 将文本写入用户选择的路径（导出 CSV/JSONL 用）
#[tauri::command]
pub fn save_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("写入失败: {}", e))
}
