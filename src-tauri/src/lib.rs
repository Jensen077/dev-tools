pub mod commands;
pub mod curl;
pub mod diff;
pub mod extract;
pub mod format;
pub mod props;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::fmt_json,
            commands::min_json,
            commands::fmt_unescape,
            commands::extract_json_cmd,
            commands::compare_json,
            commands::compare_props,
            commands::run_curl_script_cmd,
            commands::save_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
