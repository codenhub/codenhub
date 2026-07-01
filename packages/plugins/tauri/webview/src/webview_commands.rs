use tauri::{AppHandle, Manager, Url};

/// Tauri command to navigate a specific WebView window to a given URL.
///
/// # Errors
/// Returns an error if the window is not found or the URL is invalid.
#[tauri::command]
pub async fn navigate_webview<R: tauri::Runtime>(
    app: AppHandle<R>,
    label: String,
    url: String,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        let parsed_url = Url::parse(&url).map_err(|e| e.to_string())?;
        window.navigate(parsed_url).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("WebView window not found: {}", label))
    }
}

/// Tauri command to reload a specific WebView window.
///
/// # Errors
/// Returns an error if the window is not found or fails to reload.
#[tauri::command]
pub async fn reload_webview<R: tauri::Runtime>(
    app: AppHandle<R>,
    label: String,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.reload().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("WebView window not found: {}", label))
    }
}
