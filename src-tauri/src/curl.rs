use serde::{Deserialize, Serialize};

/// HTTP 执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResult {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub duration_ms: u64,
}

/// 判断一个分词 token 是否是 curl 可执行名（支持 `curl` / `curl.exe` / `/path/curl` / `C:\path\curl.exe`）
fn is_curl_name(token: &str) -> bool {
    let name = token.rsplit(|c| c == '/' || c == '\\').next().unwrap_or(token);
    name == "curl" || name == "curl.exe"
}

/// 检测脚本是否为 PowerShell 格式（浏览器「Copy as PowerShell」），命中则给出友好提示。
fn detect_powershell(script: &str) -> bool {
    script.contains("Invoke-WebRequest")
        || script.contains("Invoke-RestMethod")
        || (script.contains("curl.exe") && script.contains('`'))
        || script.contains("$headers")
        || script.contains("@{")
}

/// 检测脚本是否为 Windows CMD 格式（cmd.exe 用 `^` 转义引号与续行）。
///
/// 典型特征：包含 `^"`（CMD 转义的引号）或行尾 `^`（CMD 续行）。
fn detect_cmd_escape(script: &str) -> bool {
    script.contains("^\"") || script.contains("^\n") || script.contains("^\r\n")
}

/// 剥离 Windows CMD 的 `^` 转义字符，产出干净的 bash 风格命令文本。
///
/// CMD 转义规则：
/// - `^"` → `"`（转义的双引号）
/// - `^` + 换行 → 删除续行标记（连接多行为一行）
/// - `^` + 其他任意字符 → 删除 `^` 保留原字符
fn strip_cmd_escapes(script: &str) -> String {
    let mut out = String::with_capacity(script.len());
    let mut chars = script.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '^' {
            // `^` 后面跟着的字符直接保留（去掉 `^` 本身）
            if let Some(&next) = chars.peek() {
                // `^` + 换行：续行，两者都丢弃
                if next == '\r' {
                    chars.next(); // consume \r
                    if let Some(&nn) = chars.peek() {
                        if nn == '\n' {
                            chars.next(); // consume \n
                        }
                    }
                    // 不写入任何内容（续行变空格分隔？CMD 续行是直接拼接）
                    // 为安全起见插入一个空格，避免前后 token 粘连
                    out.push(' ');
                } else if next == '\n' {
                    chars.next(); // consume \n
                    out.push(' ');
                } else {
                    chars.next(); // consume 并丢弃 `^`，保留 next（下次循环会处理）
                               // 但这里需要手动追加 next
                    out.push(next);
                }
            }
            // 如果 `^` 是最后一个字符，直接丢弃
        } else {
            out.push(c);
        }
    }
    out
}

/// 移除与「本工具自行追加的控制参数」冲突的用户参数，确保我们总能正确捕获响应。
///
/// 会删除：-o/--output(+值)、-O/--remote-name、-w/--write-out(+值)、
/// -D/--dump-header(+值)、-s、-S、-v/--verbose、-#（进度条）。
/// 这样即便用户脚本自带 `-o`（下载类 curl 很常见），也不会与我们追加的 `-o` 冲突
/// 导致 curl 报 `(23) client returned ERROR on write`。
fn sanitize_curl_args(tokens: &mut Vec<String>) {
    let mut i = 0;
    while i < tokens.len() {
        let t = &tokens[i];
        let (strip_self, strip_next) = if t == "-o"
            || t == "--output"
            || t == "-w"
            || t == "--write-out"
            || t == "-D"
            || t == "--dump-header"
        {
            (true, true)
        } else if t == "-O"
            || t == "--remote-name"
            || t == "-s"
            || t == "-S"
            || t == "-v"
            || t == "--verbose"
            || t == "-#"
        {
            (true, false)
        } else if t.starts_with("--output=")
            || t.starts_with("--write-out=")
            || t.starts_with("--dump-header=")
        {
            (true, false)
        } else {
            (false, false)
        };
        if strip_self {
            tokens.remove(i);
            if strip_next && i < tokens.len() {
                tokens.remove(i);
            }
            // 不前进 i：被删除后下一 token 已移位到当前位置
        } else {
            i += 1;
        }
    }
}

/// 直接调用系统 curl 执行脚本。
///
/// 不自行解析脚本——系统 curl 天然支持 `--url`、`-X`、`-H`、`-b`、`-d`、`-o` 等全部语法，
/// 且保留脚本原始行为。通过追加控制参数提取状态码 / 耗时 / 响应头 / 响应体。
///
/// 这里仅做「粘贴友好」的预处理：归一化换行（Windows 剪贴板常见于 `\r\n`，否则 `\`
/// 续行后会残留 `\r` 变成脏参数）、剥离误粘贴的终端提示符前缀、拦截 PowerShell 格式。
pub async fn run_curl_script(script: &str) -> Result<HttpResult, String> {
    // 1) 换行归一化：Windows 剪贴板常为 CRLF，否则 `\` 续行后会残留 `\r` 变成脏参数导致失败
    let normalized = script.replace("\r\n", "\n").replace('\r', "\n");

    // 2) 剥离 Windows CMD 的 `^` 转义（cmd.exe 用 `^"` 转引号、`^` 续行）
    //    常见于从 Windows 命令提示符复制的 curl
    let cleaned = if detect_cmd_escape(&normalized) {
        strip_cmd_escapes(&normalized)
    } else {
        normalized
    };

    // 3) 友好拦截 PowerShell 格式（应改用浏览器的「Copy as cURL (bash)」）
    if detect_powershell(&cleaned) {
        return Err(
            "检测到 PowerShell 格式脚本。本工具只执行 bash 版 curl——请在浏览器开发者工具里选「Copy as cURL (bash)」后重新复制再试。".to_string(),
        );
    }

    let mut tokens = match shell_words::split(&cleaned) {
        Ok(t) => t,
        Err(e) => return Err(format!("命令分词失败: {}", e)),
    };
    if tokens.is_empty() {
        return Err("空命令".to_string());
    }

    // 3) 去掉可能误粘贴的 shell 提示符前缀，如 `user@host:~$ curl ...` 或 `PS C:\> curl ...`
    let should_strip_prompt = if !is_curl_name(&tokens[0]) {
        let first = tokens[0].as_str();
        let looks_like_prompt = first.contains('@')
            || first.ends_with('$')
            || first.ends_with('>')
            || first.eq_ignore_ascii_case("ps");
        looks_like_prompt && tokens.iter().skip(1).any(|t| is_curl_name(t))
    } else {
        false
    };
    if should_strip_prompt {
        while !tokens.is_empty() && !is_curl_name(&tokens[0]) {
            tokens.remove(0);
        }
    }

    // 4) 去掉开头的 curl 可执行名（`curl ...` / `curl.exe` / `/path/curl ...`）
    if let Some(first) = tokens.first() {
        if is_curl_name(first) {
            tokens.remove(0);
        }
    }
    if tokens.is_empty() {
        return Err("命令缺少内容".to_string());
    }

    // 5) 剥离与捕获冲突的用户输出参数，统一由本工具控制 -o/-D/-w
    sanitize_curl_args(&mut tokens);
    if tokens.is_empty() {
        return Err("命令缺少内容".to_string());
    }

    // 响应头/响应体写临时文件，避免与 -w 元数据混淆
    let uid = format!("{}-{}", std::process::id(), std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0));
    let header_file = std::env::temp_dir().join(format!("devbox-hdr-{}.txt", uid));
    let body_file = std::env::temp_dir().join(format!("devbox-body-{}.txt", uid));

    // 控制参数追加在脚本参数之后（-o/-D/-w 以最后出现者生效）
    let start = std::time::Instant::now();
    let output = tokio::process::Command::new("curl")
        .args(&tokens)
        .arg("-sS")
        .arg("--max-time")
        .arg("60")
        .arg("-D")
        .arg(&header_file)
        .arg("-o")
        .arg(&body_file)
        .arg("-w")
        .arg("__DEVBOX__%{http_code} %{time_total}")
        .output()
        .await
        .map_err(|e| format!("启动 curl 失败: {}", e))?;
    let wall_ms = start.elapsed().as_millis() as u64;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // 从 stdout 末尾解析 `__DEVBOX__<status> <seconds>`
    let (status, seconds) = match stdout.rfind("__DEVBOX__") {
        Some(i) => {
            let meta = &stdout[i + "__DEVBOX__".len()..];
            let parts: Vec<&str> = meta.split_whitespace().collect();
            let status = parts.first().and_then(|s| s.parse::<u16>().ok()).unwrap_or(0);
            let seconds = parts.get(1).and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
            (status, seconds)
        }
        None => (0, 0.0),
    };
    // curl 自身耗时优先，墙钟兜底
    let duration_ms = if seconds > 0.0 { (seconds * 1000.0) as u64 } else { wall_ms };

    if !output.status.success() && status == 0 {
        // 网络层失败（连接失败/超时/DNS 等），curl 退出码非 0
        let msg = stderr.trim();
        return Err(if msg.is_empty() {
            format!("curl 执行失败，退出码 {}", output.status)
        } else {
            msg.to_string()
        });
    }

    let body = std::fs::read_to_string(&body_file).unwrap_or_default();
    let _ = std::fs::remove_file(&body_file);

    let raw_headers = std::fs::read_to_string(&header_file).unwrap_or_default();
    let _ = std::fs::remove_file(&header_file);
    let (headers, status_text) = parse_http_headers(&raw_headers);

    Ok(HttpResult {
        status,
        status_text,
        headers,
        body,
        duration_ms,
    })
}

/// 解析 `-D` 输出：可能含多个 HTTP 块（重定向），取最后一个作为最终响应。
/// 返回 (headers, status_text)，status_text 从状态行取 reason phrase。
fn parse_http_headers(raw: &str) -> (Vec<(String, String)>, String) {
    let blocks: Vec<&str> = raw.split("\r\n\r\n").collect();
    let block = blocks.iter().filter(|b| b.contains("HTTP/")).next_back().unwrap_or(&"");
    let mut headers = Vec::new();
    let mut status_text = String::new();
    for line in block.lines().skip(1) {
        if let Some(idx) = line.find(':') {
            let name = line[..idx].trim();
            let value = line[idx + 1..].trim();
            if !name.is_empty() {
                headers.push((name.to_string(), value.to_string()));
            }
        }
    }
    if let Some(first) = block.lines().next() {
        // `HTTP/1.1 200 OK` / `HTTP/2 200`
        let parts = first.split_whitespace().skip(2);
        status_text = parts.collect::<Vec<_>>().join(" ");
    }
    (headers, status_text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_http_headers_last_block_wins() {
        let raw = "HTTP/1.1 302 Found\r\nLocation: /new\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Test: 1\r\n\r\n";
        let (headers, status_text) = parse_http_headers(raw);
        assert_eq!(status_text, "OK");
        assert_eq!(headers.len(), 2);
        assert_eq!(headers[0], ("Content-Type".to_string(), "application/json".to_string()));
        assert!(headers.iter().all(|(n, _)| n != "Location"));
    }

    #[test]
    fn parse_http_headers_empty() {
        let (headers, status_text) = parse_http_headers("");
        assert!(headers.is_empty());
        assert_eq!(status_text, "");
    }

    #[test]
    fn parse_http_headers_http2() {
        let raw = "HTTP/2 503\r\nserver: awselb/2.0\r\n\r\n";
        let (headers, status_text) = parse_http_headers(raw);
        assert_eq!(status_text, "");
        assert_eq!(headers, vec![("server".to_string(), "awselb/2.0".to_string())]);
    }

    /// 内嵌 HTTP 服务器：读取请求并回显关键信息（模拟用户目标 API）
    fn spawn_echo_server() -> std::net::SocketAddr {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        use std::thread;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        thread::spawn(move || {
            loop {
                let Ok((mut stream, _)) = listener.accept() else { break };
                let mut buf = [0u8; 8192];
                let n = stream.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                // 解析请求行与 header、body
                let (head, body) = match req.find("\r\n\r\n") {
                    Some(i) => (&req[..i], &req[i + 4..]),
                    None => (&req[..], ""),
                };
                let mut head_lines = head.lines();
                let req_line = head_lines.next().unwrap_or("").to_string();
                let headers: Vec<String> = head_lines.map(|l| l.to_string()).collect();
                let cookie = headers
                    .iter()
                    .find(|l| l.to_lowercase().starts_with("cookie:"))
                    .map(|l| l[l.find(':').unwrap() + 1..].trim().to_string())
                    .unwrap_or_default();
                let method = req_line.split_whitespace().next().unwrap_or("").to_string();
                let path = req_line.split_whitespace().nth(1).unwrap_or("").to_string();
                let accept = headers
                    .iter()
                    .find(|l| l.to_lowercase().starts_with("accept:"))
                    .map(|l| l[l.find(':').unwrap() + 1..].trim().to_string())
                    .unwrap_or_default();
                // 从 Body 提取 `{"a":1}`（curl -d 自动加 Content-Type: application/x-www-form-urlencoded）
                let body_trim = body.trim_end_matches('\0').trim();

                let payload = serde_json::json!({
                    "method": method,
                    "path": path,
                    "cookie": cookie,
                    "accept": accept,
                    "body": body_trim,
                })
                .to_string();
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Echo: yes\r\nContent-Length: {}\r\n\r\n{}",
                    payload.len(),
                    payload
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = stream.flush();
            }
        });
        addr
    }

    /// 端到端：真实执行系统 curl（模拟用户脚本含 --url / -b / -X / -d）
    #[tokio::test]
    async fn run_curl_script_executes_real_script() {
        let addr = spawn_echo_server();
        let script = format!(
            r#"curl --url 'http://{addr}/api/test?q=1' \
  -X 'POST' \
  -H 'accept: application/json' \
  -b 'Hm_lvt_a=1777737923; XSRF-TOKEN=064368806_; isfcid=1' \
  -d '{{"a":1}}'"#
        );
        let result = run_curl_script(&script).await.unwrap();
        assert_eq!(result.status, 200, "body={} err={:?}", result.body, result.status_text);
        let parsed: serde_json::Value = serde_json::from_str(&result.body).unwrap();
        assert_eq!(parsed["method"], "POST");
        assert_eq!(parsed["path"], "/api/test?q=1");
        assert_eq!(parsed["cookie"], "Hm_lvt_a=1777737923; XSRF-TOKEN=064368806_; isfcid=1");
        assert_eq!(parsed["accept"], "application/json");
        assert_eq!(parsed["body"], r#"{"a":1}"#);
        assert!(result.headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("X-Echo")));
        assert!(result.duration_ms < 5000);
    }

    /// 端到端：脚本带 -o 写文件时不应报错，响应体仍由本工具捕获（工具会剥离用户的 -o）
    #[tokio::test]
    async fn run_curl_script_with_output_flag() {
        let addr = spawn_echo_server();
        let out = std::env::temp_dir().join(format!("devbox-test-out-{}.txt", std::process::id()));
        let script = format!("curl http://{addr}/api/test -X POST -o {}", out.display());
        let result = run_curl_script(&script).await.unwrap();
        assert_eq!(result.status, 200);
        // 工具会剥离用户的 -o，响应体应被捕获到结果中（而非写入用户的 out 文件）
        assert!(!result.body.is_empty(), "响应体未被捕获");
        assert!(!out.exists(), "用户的 -o 文件不应被创建（已由工具统一捕获）");
        let _ = std::fs::remove_file(&out);
    }

    #[test]
    fn sanitize_curl_args_strips_conflicting_flags() {
        // 剥离独立参数 + 其取值
        let mut t1 = vec!["-X".into(), "POST".into(), "-o".into(), "a.bin".into(), "-w".into(), "%{url}".into(), "https://x".into()];
        sanitize_curl_args(&mut t1);
        assert_eq!(t1, vec!["-X", "POST", "https://x"]);

        // 剥离开关类与 --xxx=值 形式
        let mut t2 = vec!["-s".into(), "-v".into(), "--output=out.bin".into(), "-D".into(), "h.txt".into(), "https://x".into()];
        sanitize_curl_args(&mut t2);
        assert_eq!(t2, vec!["https://x"]);

        // 不应误伤普通 header / data
        let mut t3 = vec!["-H".into(), "accept: json".into(), "-d".into(), "x=1".into()];
        sanitize_curl_args(&mut t3);
        assert_eq!(t3, vec!["-H", "accept: json", "-d", "x=1"]);
    }

    /// 端到端：Windows 剪贴板常见的 CRLF 行尾应被归一化，否则残留 \r 会变成脏参数
    #[tokio::test]
    async fn run_curl_script_normalizes_crlf() {
        let addr = spawn_echo_server();
        let script = format!(
            "curl 'http://{addr}/api/test?q=1' \\\r\n  -X 'POST' \\\r\n  -H 'accept: application/json' \\\r\n  -d '{{\"a\":1}}'"
        );
        let result = run_curl_script(&script).await.unwrap();
        assert_eq!(result.status, 200, "CRLF 未归一化导致 curl 收到脏参数");
        let parsed: serde_json::Value = serde_json::from_str(&result.body).unwrap();
        assert_eq!(parsed["method"], "POST");
        assert_eq!(parsed["body"], r#"{"a":1}"#);
    }

    /// 端到端：误粘贴的终端提示符前缀应被剥离
    #[tokio::test]
    async fn run_curl_script_strips_prompt_prefix() {
        let addr = spawn_echo_server();
        let script = format!("user@host:~$ curl 'http://{addr}/api/test' -H 'accept: application/json'");
        let result = run_curl_script(&script).await.unwrap();
        assert_eq!(result.status, 200);
    }

    /// 端到端：PowerShell 格式应给出友好提示而非把脏参数塞给 curl
    #[tokio::test]
    async fn run_curl_script_rejects_powershell() {
        let script = "curl.exe --request POST --url 'https://example.com' `\\n  --header 'accept: application/json'";
        let err = run_curl_script(script).await.unwrap_err();
        assert!(err.contains("PowerShell"), "实际错误: {err}");
    }

    #[test]
    fn is_curl_name_variants() {
        assert!(is_curl_name("curl"));
        assert!(is_curl_name("curl.exe"));
        assert!(is_curl_name("/usr/bin/curl"));
        assert!(is_curl_name("C:\\tools\\curl.exe"));
        assert!(!is_curl_name("user@host:~$"));
        assert!(!is_curl_name("-H"));
    }

    #[test]
    fn detect_powershell_variants() {
        assert!(detect_powershell("Invoke-WebRequest -Uri 'https://x'"));
        assert!(detect_powershell("curl.exe -Uri x `\\n  -H y"));
        assert!(detect_powershell("curl --url x $headers = @{}"));
        assert!(!detect_powershell("curl 'https://x' -H 'accept: application/json'"));
    }

    #[test]
    fn detect_cmd_escape_variants() {
        // 典型 cmd.exe 复制：^" 转义引号
        assert!(detect_cmd_escape("curl ^\"https://x^\""));
        // 行尾 ^ 续行
        assert!(detect_cmd_escape("curl x ^\n  -H y"));
        // CRLF 续行
        assert!(detect_cmd_escape("curl x ^\r\n  -H y"));
        // 普通 bash 不应误判
        assert!(!detect_cmd_escape("curl 'https://x' -H 'y'"));
    }

    #[test]
    fn strip_cmd_escapes_basic() {
        // ^" → "
        assert_eq!(strip_cmd_escapes("^\"hello^\""), "\"hello\"");
        // 行尾 ^\n → 空格拼接（原空格 + 替换空格可能多出，但不残留 ^）
        let r = strip_cmd_escapes("curl url ^\n  -H header");
        assert!(!r.contains('^'), "残留 ^: {r}");
        assert!(r.contains("url") && r.contains("-H") && r.contains("header"), "实际: {r}");
        // ^后跟普通字符 → 去掉 ^
        assert_eq!(strip_cmd_escapes("^@"), "@");
    }

    #[test]
    fn strip_cmd_escapes_real_world_cmd_curl() {
        // 模拟用户从 cmd.exe 复制的真实 curl（简化版）
        let cmd_curl = "curl ^\"https://test-admin.example.com/api/x^\" \
  -H ^\"Accept: application/json^\" \
  -H ^\"Authorization: Bearer token123^\"";
        let cleaned = strip_cmd_escapes(cmd_curl);
        assert!(!cleaned.contains('^'), "CMD 转义未完全剥离: {cleaned}");
        // 剥离后应能被 shell_words 正确分词
        let tokens = shell_words::split(&cleaned).expect("剥离后的文本应能正确分词");
        assert_eq!(tokens[0], "curl");
        // URL 应干净无 ^ 残留
        assert!(tokens[1].starts_with("https://"), "URL 含残留: {}", tokens[1]);
    }

    /// 端到端：从 cmd.exe 复制的完整 curl 应能正常执行
    #[tokio::test]
    async fn run_curl_script_handles_cmd_style() {
        let addr = spawn_echo_server();
        // 用 ^" 包裹参数、^ 续行——模拟 Windows cmd.exe 剪贴板
        let script = format!(
            "curl ^\"http://{addr}/api/test?q=1^\" \
  -X ^\"POST^\" \
  -H ^\"accept: application/json^\" \
  -b ^\"session=abc^\""
        );
        let result = run_curl_script(&script).await.unwrap();
        assert_eq!(result.status, 200, "body={} err={:?}", result.body, result.status_text);
        let parsed: serde_json::Value = serde_json::from_str(&result.body).unwrap();
        assert_eq!(parsed["method"], "POST");
        assert_eq!(parsed["cookie"], "session=abc");
    }
}
