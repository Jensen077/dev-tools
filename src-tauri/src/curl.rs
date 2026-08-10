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

/// 直接调用系统 curl 执行脚本。
///
/// 不自行解析脚本——系统 curl 天然支持 `--url`、`-X`、`-H`、`-b`、`-d`、`-o` 等全部语法，
/// 且保留脚本原始行为。通过追加控制参数提取状态码 / 耗时 / 响应头 / 响应体。
pub async fn run_curl_script(script: &str) -> Result<HttpResult, String> {
    let mut tokens = match shell_words::split(script) {
        Ok(t) => t,
        Err(e) => return Err(format!("命令分词失败: {}", e)),
    };
    if tokens.is_empty() {
        return Err("空命令".to_string());
    }

    // 去掉开头的 curl 可执行名（`curl ...` 或 `/path/curl ...`）
    if let Some(first) = tokens.first() {
        let name = first.rsplit('/').next().unwrap_or(first);
        if name == "curl" {
            tokens.remove(0);
        }
    }
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

    /// 端到端：脚本带 -o 写文件时不应报错，且仍能拿到状态码
    #[tokio::test]
    async fn run_curl_script_with_output_flag() {
        let addr = spawn_echo_server();
        let out = std::env::temp_dir().join(format!("devbox-test-out-{}.txt", std::process::id()));
        let script = format!("curl http://{addr}/api/test -X POST -o {}", out.display());
        let result = run_curl_script(&script).await.unwrap();
        assert_eq!(result.status, 200);
        assert!(out.exists());
        let _ = std::fs::remove_file(&out);
    }
}
