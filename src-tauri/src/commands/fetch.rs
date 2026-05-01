use reqwest::blocking::Client;

#[tauri::command]
pub fn fetch_url(url: String) -> Result<String, String> {
    // Allowlist of permitted external origins
    let allowed = [
        "https://skills.sh/",
        "https://registry.modelcontextprotocol.io/",
    ];
    if !allowed.iter().any(|prefix| url.starts_with(prefix)) {
        return Err("URL not in allowlist".to_string());
    }

    let client = Client::builder()
        .user_agent("Mozilla/5.0 (compatible; Agenture.md)")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .map_err(|e| format!("Fetch failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    response.text().map_err(|e| e.to_string())
}
