use reqwest::{redirect::Policy, Client, Method, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use uuid::Uuid;

static CONFIG_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Integration {
    pub id: String,
    pub kind: String,
    pub base_url: String,
    pub label: String,
    #[serde(default)]
    pub authenticated: bool,
}

fn config_lock() -> &'static Mutex<()> { CONFIG_LOCK.get_or_init(|| Mutex::new(())) }

fn normalize_url(raw: &str, kind: &str) -> Result<Url, String> {
    if kind != "bitbucket_dc" {
        return Err("Unsupported integration type".into());
    }
    let mut url = Url::parse(raw.trim()).map_err(|_| "Enter a valid server URL".to_string())?;
    if !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err("The server URL must not contain credentials, a query, or a fragment".into());
    }
    let host = url.host_str().ok_or("The server URL needs a host")?;
    let local = matches!(host, "localhost" | "127.0.0.1" | "::1");
    if url.scheme() != "https" && !(url.scheme() == "http" && local) {
        return Err("Use HTTPS for self-hosted servers".into());
    }
    if host == "bitbucket.org" || host.ends_with(".bitbucket.org")
    {
        return Err("This connection is for a self-hosted server, not Bitbucket Cloud".into());
    }
    let path = format!("{}/", url.path().trim_end_matches('/'));
    url.set_path(&path);
    Ok(url)
}

fn endpoint(base: &str, kind: &str, segments: &[&str]) -> Result<Url, String> {
    let mut url = normalize_url(base, kind)?;
    {
        let mut path = url.path_segments_mut().map_err(|_| "Invalid server URL")?;
        path.pop_if_empty();
        for segment in segments {
            if segment.is_empty() || *segment == "." || *segment == ".." {
                return Err("Invalid server path segment".into());
            }
            path.push(segment);
        }
    }
    Ok(url)
}

pub(crate) fn client() -> Result<Client, String> {
    Client::builder()
        .use_native_tls()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("Gitter/", env!("CARGO_PKG_VERSION")))
        .build().map_err(|error| error.to_string())
}

pub(crate) async fn request_json(client: &Client, method: Method, url: Url, token: &str, body: Option<Value>) -> Result<Value, String> {
    let mut request = client.request(method, url).bearer_auth(token).header("Accept", "application/json");
    if let Some(value) = body { request = request.json(&value); }
    let response = request.send().await.map_err(|error| format!("Could not reach the server: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("The server returned HTTP {status}. Check the URL, token permissions, and server logs."));
    }
    response.json().await.map_err(|error| format!("The server returned an invalid response: {error}"))
}

fn read_config(path: &Path) -> Result<Vec<Integration>, String> {
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| format!("Could not read integration settings: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(format!("Could not read integration settings: {error}")),
    }
}

fn write_config(path: &Path, integrations: &[Integration]) -> Result<(), String> {
    use std::io::Write;
    let parent = path.parent().ok_or("Invalid integration settings path")?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temp = parent.join(format!(".integrations-{}.tmp", Uuid::new_v4()));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temp).map_err(|error| error.to_string())?;
    let data = serde_json::to_vec_pretty(integrations).map_err(|error| error.to_string())?;
    if let Err(error) = file.write_all(&data).and_then(|_| file.sync_all()).and_then(|_| std::fs::rename(&temp, path)) {
        let _ = std::fs::remove_file(temp);
        return Err(format!("Could not save integration settings: {error}"));
    }
    Ok(())
}

fn read_secret(path: &Path, id: &str) -> Result<zeroize::Zeroizing<String>, String> {
    crate::credential_store::load(path, id)?
        .ok_or_else(|| "Enter your Bitbucket token in Integrations to connect".into())
}

pub fn list(path: &Path) -> Result<Vec<Integration>, String> {
    let _guard = config_lock().lock().map_err(|_| "Integration settings are busy")?;
    Ok(read_config(path)?.into_iter().filter(|entry| entry.kind == "bitbucket_dc").map(|mut entry| {
        // If a saved token is unreadable, allow the user to reconnect and replace it.
        entry.authenticated = crate::credential_store::load(path, &entry.id).ok().flatten().is_some();
        entry
    }).collect())
}

pub(crate) fn find(path: &Path, id: &str, expected: &str) -> Result<Integration, String> {
    list(path)?.into_iter().find(|entry| entry.id == id && entry.kind == expected)
        .ok_or_else(|| "Integration not found".into())
}

pub async fn connect(path: &Path, kind: &str, base: &str, label: &str, token: &str) -> Result<Integration, String> {
    if token.trim().is_empty() || token.contains(['\r', '\n']) {
        return Err("Enter a valid personal access token".into());
    }
    let base_url = normalize_url(base, kind)?.to_string();
    let url = match kind {
        "bitbucket_dc" => endpoint(&base_url, kind, &["rest", "api", "1.0", "projects"])?,
        _ => return Err("Unsupported integration type".into()),
    };
    request_json(&client()?, Method::GET, url, token, None).await?;
    let entry = Integration {
        id: Uuid::new_v4().to_string(),
        kind: kind.into(),
        base_url,
        label: if label.trim().is_empty() { base.trim().into() } else { label.trim().into() },
        authenticated: false,
    };
    let _guard = config_lock().lock().map_err(|_| "Integration settings are busy")?;
    let mut integrations = read_config(path)?;
    integrations.push(entry.clone());
    crate::credential_store::save(path, &entry.id, token)?;
    if let Err(error) = write_config(path, &integrations) {
        if let Err(cleanup) = crate::credential_store::remove(path, &entry.id) {
            return Err(format!("{error}; could not remove the token: {cleanup}"));
        }
        return Err(error);
    }
    Ok(Integration { authenticated: true, ..entry })
}

pub async fn reconnect(path: &Path, id: &str, token: &str) -> Result<(), String> {
    if token.trim().is_empty() || token.contains(['\r', '\n']) {
        return Err("Enter a valid personal access token".into());
    }
    let entry = find(path, id, "bitbucket_dc")?;
    let url = endpoint(&entry.base_url, &entry.kind, &["rest", "api", "1.0", "projects"])?;
    request_json(&client()?, Method::GET, url, token, None).await?;
    let _guard = config_lock().lock().map_err(|_| "Integration settings are busy")?;
    if !read_config(path)?.iter().any(|connection| connection.id == id && connection.kind == "bitbucket_dc") {
        return Err("Integration not found".into());
    }
    crate::credential_store::save(path, id, token)
}

pub fn disconnect(path: &Path, id: &str) -> Result<(), String> {
    let _guard = config_lock().lock().map_err(|_| "Integration settings are busy")?;
    let mut entries = read_config(path)?;
    if !entries.iter().any(|entry| entry.id == id) { return Err("Integration not found".into()); }
    crate::credential_store::remove(path, id)?;
    entries.retain(|entry| entry.id != id);
    write_config(path, &entries)
}

pub async fn bitbucket_repositories(path: &Path, id: &str, start: u64, search: &str) -> Result<Value, String> {
    let integration = find(path, id, "bitbucket_dc")?;
    let token = read_secret(path, id)?;
    let mut url = endpoint(&integration.base_url, &integration.kind, &["rest", "api", "1.0", "repos"])?;
    url.query_pairs_mut().append_pair("limit", "50").append_pair("start", &start.to_string());
    if !search.trim().is_empty() { url.query_pairs_mut().append_pair("name", search.trim()); }
    let value = request_json(&client()?, Method::GET, url, &token, None).await?;
    let repos = value.get("values").and_then(Value::as_array).ok_or("The server did not return repositories")?;
    let repos: Vec<Value> = repos.iter().map(|repo| {
        let clones = repo.pointer("/links/clone").and_then(Value::as_array);
        let clone_url = |name: &str| -> Option<String> {
            clones.and_then(|items| items.iter().find(|item| item.get("name").and_then(Value::as_str) == Some(name)))
                .and_then(|item| item.get("href")).and_then(Value::as_str).map(str::to_string)
        };
        json!({
            "name": repo.get("name").and_then(Value::as_str).unwrap_or(""),
            "slug": repo.get("slug").and_then(Value::as_str).unwrap_or(""),
            "projectKey": repo.pointer("/project/key").and_then(Value::as_str).unwrap_or(""),
            "httpsUrl": clone_url("http"),
            "sshUrl": clone_url("ssh"),
            "webUrl": repo.pointer("/links/self/0/href").and_then(Value::as_str),
        })
    }).collect();
    Ok(json!({ "values": repos, "nextPageStart": value.get("nextPageStart"), "isLastPage": value.get("isLastPage").and_then(Value::as_bool).unwrap_or(true) }))
}

pub async fn bitbucket_pull_requests(path: &Path, id: &str, project: &str, slug: &str, start: u64) -> Result<Value, String> {
    if project.is_empty() || slug.is_empty() { return Err("A project and repository are required".into()); }
    let integration = find(path, id, "bitbucket_dc")?;
    let token = read_secret(path, id)?;
    let mut url = endpoint(&integration.base_url, &integration.kind, &["rest", "api", "1.0", "projects", project, "repos", slug, "pull-requests"])?;
    url.query_pairs_mut().append_pair("state", "OPEN").append_pair("limit", "50").append_pair("start", &start.to_string());
    let value = request_json(&client()?, Method::GET, url, &token, None).await?;
    let pulls = value.get("values").and_then(Value::as_array).ok_or("The server did not return pull requests")?;
    let pulls: Vec<Value> = pulls.iter().map(map_bitbucket_pull_request).collect();
    Ok(json!({ "values": pulls, "nextPageStart": value.get("nextPageStart"), "isLastPage": value.get("isLastPage").and_then(Value::as_bool).unwrap_or(true) }))
}

enum TemplateSetting { Missing, Disabled, Text(String) }

// Bitbucket's UI currently uses this endpoint, but it is not part of the
// documented public REST API. Treat an unknown response as an error rather
// than guessing, and only call it when the user explicitly asks for a template.
async fn read_template(client: &Client, url: Url, token: &str) -> Result<TemplateSetting, String> {
    let mut response = client.get(url).bearer_auth(token).header("Accept", "application/json")
        .send().await.map_err(|error| format!("Could not reach Bitbucket: {error}"))?;
    let status = response.status();
    if status == reqwest::StatusCode::NO_CONTENT { return Ok(TemplateSetting::Missing); }
    if !status.is_success() { return Err(format!("Bitbucket could not provide its template (HTTP {status}).")); }
    const LIMIT: usize = 96_000;
    if response.content_length().is_some_and(|length| length > LIMIT as u64) { return Err("The Bitbucket template response is too large.".into()); }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| format!("Could not read the Bitbucket template: {error}"))? {
        if bytes.len() + chunk.len() > LIMIT { return Err("The Bitbucket template response is too large.".into()); }
        bytes.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "Bitbucket returned an unsupported template response.")?;
    match value.get("enabled").and_then(Value::as_bool) {
        Some(false) => Ok(TemplateSetting::Disabled),
        Some(true) => {
            let text = value.get("description").and_then(Value::as_str).ok_or("Bitbucket returned an unsupported template response.")?;
            if text.encode_utf16().count() > 16_000 || text.contains('\0') { return Err("The Bitbucket template is too large or contains a null character.".into()); }
            Ok(TemplateSetting::Text(text.to_owned()))
        }
        None => Err("Bitbucket returned an unsupported template response.".into()),
    }
}

pub async fn bitbucket_pull_request_template(path: &Path, id: &str, project: &str, slug: &str) -> Result<Option<Value>, String> {
    if project.is_empty() || slug.is_empty() { return Err("A project and repository are required".into()); }
    let integration = find(path, id, "bitbucket_dc")?;
    let token = read_secret(path, id)?;
    let client = client()?;
    let repo_url = endpoint(&integration.base_url, &integration.kind, &["rest", "ui", "latest", "projects", project, "repos", slug, "pull-request-templates"])?;
    match read_template(&client, repo_url, &token).await? {
        TemplateSetting::Text(text) => return Ok(Some(json!({ "text": text, "source": "Bitbucket repository" }))),
        TemplateSetting::Disabled => return Ok(None),
        TemplateSetting::Missing => {}
    }
    let project_url = endpoint(&integration.base_url, &integration.kind, &["rest", "ui", "latest", "projects", project, "pull-request-templates"])?;
    match read_template(&client, project_url, &token).await? {
        TemplateSetting::Text(text) => Ok(Some(json!({ "text": text, "source": "Bitbucket project" }))),
        TemplateSetting::Disabled | TemplateSetting::Missing => Ok(None),
    }
}

fn map_bitbucket_pull_request(pull: &Value) -> Value {
    json!({
        "id": pull.get("id"),
        "title": pull.get("title").and_then(Value::as_str).unwrap_or(""),
        "state": pull.get("state").and_then(Value::as_str).unwrap_or(""),
        "author": pull.pointer("/author/user/displayName").and_then(Value::as_str).unwrap_or(""),
        "source": pull.pointer("/fromRef/displayId").and_then(Value::as_str).unwrap_or(""),
        "target": pull.pointer("/toRef/displayId").and_then(Value::as_str).unwrap_or(""),
        "url": pull.pointer("/links/self/0/href").and_then(Value::as_str),
        "description": pull.get("description").and_then(Value::as_str).unwrap_or(""),
        "draft": pull.get("draft").and_then(Value::as_bool).unwrap_or(false),
        "createdAt": pull.get("createdDate").and_then(Value::as_u64),
        "updatedAt": pull.get("updatedDate").and_then(Value::as_u64),
        "sourceProjectKey": pull.pointer("/fromRef/repository/project/key").and_then(Value::as_str),
        "sourceRepositorySlug": pull.pointer("/fromRef/repository/slug").and_then(Value::as_str),
    })
}

pub async fn bitbucket_pull_request(path: &Path, id: &str, project: &str, slug: &str, number: u64) -> Result<Value, String> {
    if number == 0 || project.is_empty() || slug.is_empty() { return Err("A repository and pull request number are required".into()); }
    let integration = find(path, id, "bitbucket_dc")?;
    let token = read_secret(path, id)?;
    let url = endpoint(&integration.base_url, &integration.kind, &["rest", "api", "1.0", "projects", project, "repos", slug, "pull-requests", &number.to_string()])?;
    let pull = request_json(&client()?, Method::GET, url, &token, None).await?;
    Ok(map_bitbucket_pull_request(&pull))
}

async fn bitbucket_pages(client: &Client, mut url: Url, token: &str) -> Result<Vec<Value>, String> {
    let mut start = 0u64;
    let mut values = Vec::new();
    for _ in 0..100 {
        url.set_query(None);
        url.query_pairs_mut().append_pair("limit", "100").append_pair("start", &start.to_string());
        let page = request_json(client, Method::GET, url.clone(), token, None).await?;
        values.extend(page.get("values").and_then(Value::as_array).ok_or("The server did not return a page")?.iter().cloned());
        if page.get("isLastPage").and_then(Value::as_bool).unwrap_or(true) { return Ok(values); }
        let next = page.get("nextPageStart").and_then(Value::as_u64).ok_or("The server returned invalid pagination")?;
        if next <= start { return Err("The server returned invalid pagination".into()); }
        start = next;
    }
    Err("The server returned too many pages".into())
}

fn pull_url(integration: &Integration, project: &str, slug: &str, number: u64, suffix: Option<&str>) -> Result<Url, String> {
    if number == 0 || project.is_empty() || slug.is_empty() { return Err("A repository and pull request number are required".into()); }
    let number = number.to_string();
    let mut parts = vec!["rest", "api", "1.0", "projects", project, "repos", slug, "pull-requests", &number];
    if let Some(suffix) = suffix { parts.push(suffix); }
    endpoint(&integration.base_url, &integration.kind, &parts)
}

pub async fn bitbucket_review(path: &Path, id: &str, project: &str, slug: &str, number: u64) -> Result<Value, String> {
    let integration = find(path, id, "bitbucket_dc")?;
    let token = read_secret(path, id)?;
    let client = client()?;
    let pull = request_json(&client, Method::GET, pull_url(&integration, project, slug, number, None)?, &token, None).await?;
    let head = pull.pointer("/fromRef/latestCommit").and_then(Value::as_str).ok_or("The server did not return the pull request head")?;
    let base = pull.pointer("/toRef/latestCommit").and_then(Value::as_str).ok_or("The server did not return the pull request target")?;
    if !valid_hash(head) || !valid_hash(base) { return Err("The server returned invalid pull request revisions".into()); }
    let diff_path = format!("{number}.diff");
    let diff_url = endpoint(&integration.base_url, &integration.kind, &["rest", "api", "1.0", "projects", project, "repos", slug, "pull-requests", &diff_path])?;
    let response = client.get(diff_url).bearer_auth(&*token).header("Accept", "text/plain").send().await.map_err(|e| format!("Could not reach the server: {e}"))?;
    if !response.status().is_success() { return Err(format!("Could not load the diff: HTTP {}", response.status())); }
    if response.content_length().unwrap_or(0) > 20_000_000 { return Err("The pull request diff exceeds 20 MB".into()); }
    let diff = response.text().await.map_err(|e| format!("Could not read the diff: {e}"))?;
    if diff.len() > 20_000_000 { return Err("The pull request diff exceeds 20 MB".into()); }
    let activities_url = pull_url(&integration, project, slug, number, Some("activities"))?;
    let builds_url = endpoint(&integration.base_url, &integration.kind, &["rest", "build-status", "1.0", "commits", head])?;
    let (activities, builds) = tokio::join!(bitbucket_pages(&client, activities_url, &token), bitbucket_pages(&client, builds_url, &token));
    let mut warnings = Vec::new();
    let activities = activities.unwrap_or_else(|e| { warnings.push(format!("Could not load review activity: {e}")); Vec::new() });
    let builds = builds.unwrap_or_else(|e| { warnings.push(format!("Could not load builds: {e}")); Vec::new() });
    let latest = request_json(&client, Method::GET, pull_url(&integration, project, slug, number, None)?, &token, None).await?;
    if latest.pointer("/fromRef/latestCommit").and_then(Value::as_str) != Some(head) || latest.pointer("/toRef/latestCommit").and_then(Value::as_str) != Some(base) { return Err("The pull request changed while loading. Refresh and try again".into()); }
    Ok(json!({ "pull": pull, "diff": diff, "activities": activities, "builds": builds, "warnings": warnings }))
}

fn valid_hash(hash: &str) -> bool { (hash.len() == 40 || hash.len() == 64) && hash.bytes().all(|c| c.is_ascii_hexdigit()) }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewAnchor {
    path: String,
    old_path: Option<String>,
    line: u64,
    side: String,
    line_type: String,
}

pub async fn bitbucket_review_action(path: &Path, id: &str, project: &str, slug: &str, number: u64, head: &str, base: &str, action: &str, body: Option<&str>, anchor: Option<ReviewAnchor>) -> Result<(), String> {
    if !valid_hash(head) || !valid_hash(base) { return Err("Reload the pull request before reviewing".into()); }
    let integration = find(path, id, "bitbucket_dc")?;
    let token = read_secret(path, id)?;
    let client = client()?;
    let pull = request_json(&client, Method::GET, pull_url(&integration, project, slug, number, None)?, &token, None).await?;
    if pull.pointer("/fromRef/latestCommit").and_then(Value::as_str) != Some(head) || pull.pointer("/toRef/latestCommit").and_then(Value::as_str) != Some(base) { return Err("The pull request changed. Refresh the review before continuing".into()); }
    let (suffix, payload) = match action {
        "approve" => ("approve", None),
        "comment" => {
            let text = body.ok_or("Enter a comment")?.trim();
            let anchor = anchor.ok_or("Choose a diff line")?;
            if text.is_empty() || text.len() > 65_000 || anchor.path.is_empty() || anchor.path.contains('\0') || anchor.line == 0 { return Err("Enter a comment and choose a diff line".into()); }
            let file_type = match anchor.side.as_str() { "LEFT" => "FROM", "RIGHT" => "TO", _ => return Err("Invalid diff side".into()) };
            let line_type = match anchor.line_type.as_str() { "add" => "ADDED", "delete" => "REMOVED", "context" => "CONTEXT", _ => return Err("Invalid diff line".into()) };
            let mut a = json!({ "path": anchor.path, "line": anchor.line, "lineType": line_type, "fileType": file_type, "diffType": "EFFECTIVE" });
            if let Some(old) = anchor.old_path { a["srcPath"] = json!(old); }
            ("comments", Some(json!({ "text": text, "anchor": a })))
        },
        _ => return Err("Unknown review action".into()),
    };
    request_json(&client, Method::POST, pull_url(&integration, project, slug, number, Some(suffix))?, &token, payload).await?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPullRequest {
    pub title: String,
    pub description: String,
    pub source: String,
    pub target: String,
}

fn pull_request_payload(project: &str, slug: &str, input: &NewPullRequest) -> Result<Value, String> {
    if project.is_empty() || slug.is_empty() || input.title.trim().is_empty() {
        return Err("A repository and pull request title are required".into());
    }
    let branch = |raw: &str| -> Result<String, String> {
        let name = raw.trim().strip_prefix("refs/heads/").unwrap_or(raw.trim());
        if name.is_empty() || name.starts_with('-') || name.starts_with("refs/") || name.chars().any(char::is_whitespace) {
            return Err("Enter a valid branch name".into());
        }
        Ok(format!("refs/heads/{name}"))
    };
    let source = branch(&input.source)?;
    let target = branch(&input.target)?;
    if source == target { return Err("Choose different source and target branches".into()); }
    let repository = json!({"slug": slug, "project": {"key": project}});
    Ok(json!({
        "title": input.title.trim(), "description": input.description,
        "fromRef": {"id": source, "repository": repository},
        "toRef": {"id": target, "repository": repository},
    }))
}

pub async fn create_bitbucket_pull_request(path: &Path, id: &str, project: &str, slug: &str, input: &NewPullRequest) -> Result<Value, String> {
    let body = pull_request_payload(project, slug, input)?;
    let integration = find(path, id, "bitbucket_dc")?;
    let token = read_secret(path, id)?;
    let url = endpoint(&integration.base_url, &integration.kind, &["rest", "api", "1.0", "projects", project, "repos", slug, "pull-requests"])?;
    let pull = request_json(&client()?, Method::POST, url, &token, Some(body)).await?;
    if pull.get("id").and_then(Value::as_u64).is_none() { return Err("The server did not return the created pull request".into()); }
    Ok(json!({
        "id": pull.get("id"),
        "title": pull.get("title").and_then(Value::as_str).unwrap_or(""),
        "state": pull.get("state").and_then(Value::as_str).unwrap_or(""),
        "author": pull.pointer("/author/user/displayName").and_then(Value::as_str).unwrap_or(""),
        "source": pull.pointer("/fromRef/displayId").and_then(Value::as_str).unwrap_or(""),
        "target": pull.pointer("/toRef/displayId").and_then(Value::as_str).unwrap_or(""),
        "url": pull.pointer("/links/self/0/href").and_then(Value::as_str),
    }))
}

pub fn config_path(app_dir: PathBuf) -> PathBuf { app_dir.join("integrations.json") }

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn mock_server(mut responses: Vec<(&'static str, &'static str)>) -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = std::thread::spawn(move || {
            while !responses.is_empty() {
                let (mut socket, _) = listener.accept().unwrap();
                socket.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
                let mut request = Vec::new();
                let mut buffer = [0; 2048];
                while !request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                    let count = socket.read(&mut buffer).unwrap();
                    if count == 0 { break; }
                    request.extend_from_slice(&buffer[..count]);
                }
                let header_end = request.windows(4).position(|bytes| bytes == b"\r\n\r\n").unwrap() + 4;
                let headers = String::from_utf8(request[..header_end].to_vec()).unwrap();
                let length = headers.lines().find_map(|line| {
                    line.to_ascii_lowercase().strip_prefix("content-length:").and_then(|value| value.trim().parse::<usize>().ok())
                }).unwrap_or(0);
                while request.len() < header_end + length {
                    let count = socket.read(&mut buffer).unwrap();
                    if count == 0 { break; }
                    request.extend_from_slice(&buffer[..count]);
                }
                let index = responses.iter().enumerate().filter(|(_, (expected, _))| {
                    let (method, path) = expected.split_once(' ').unwrap_or(("GET", expected));
                    headers.starts_with(&format!("{method} {path}"))
                }).max_by_key(|(_, (expected, _))| expected.len()).map(|(i, _)| i).unwrap_or_else(|| panic!("unexpected request: {headers}"));
                let (expected, body) = responses.remove(index);
                let (method, path) = expected.split_once(' ').unwrap_or(("GET", expected));
                assert!(headers.to_ascii_lowercase().contains("authorization: bearer fake-token"));
                if method == "POST" && path.ends_with("/comments") {
                    let posted: Value = serde_json::from_slice(&request[header_end..]).unwrap();
                    assert_eq!(posted["text"], "Please fix");
                    assert_eq!(posted["anchor"]["path"], "src/a.txt");
                    assert_eq!(posted["anchor"]["line"], 12);
                    assert_eq!(posted["anchor"]["lineType"], "REMOVED");
                    assert_eq!(posted["anchor"]["fileType"], "FROM");
                    assert_eq!(posted["anchor"]["diffType"], "EFFECTIVE");
                } else if method == "POST" && path.ends_with("/pull-requests") {
                    let posted: Value = serde_json::from_slice(&request[header_end..]).unwrap();
                    assert_eq!(posted["title"], "Ship it");
                    assert_eq!(posted["fromRef"]["id"], "refs/heads/feature/PRJ-42");
                    assert_eq!(posted["toRef"]["id"], "refs/heads/main");
                    assert_eq!(posted["toRef"]["repository"]["project"]["key"], "PRJ");
                }
                if body == "__NO_CONTENT__" {
                    write!(socket, "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
                } else {
                    write!(socket, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
                }
            }
        });
        (format!("http://{address}/bitbucket"), handle)
    }

    #[test]
    fn rejects_insecure_urls_credentials_and_cloud_for_self_hosted_connections() {
        assert!(normalize_url("http://bitbucket.example.com", "bitbucket_dc").is_err());
        assert!(normalize_url("https://user:secret@example.com", "bitbucket_dc").is_err());
        assert!(normalize_url("https://bitbucket.org", "bitbucket_dc").is_err());
        assert_eq!(endpoint("https://example.com/bitbucket", "bitbucket_dc", &["rest", "api", "1.0", "repos"]).unwrap().as_str(), "https://example.com/bitbucket/rest/api/1.0/repos");
    }

    #[test]
    fn project_and_repo_names_are_encoded_as_single_path_segments() {
        let url = endpoint("https://example.com", "bitbucket_dc", &["projects", "A/B", "repos", "repo name"]).unwrap();
        assert_eq!(url.path(), "/projects/A%2FB/repos/repo%20name");
        assert!(endpoint("https://example.com", "bitbucket_dc", &["projects", "..", "repos"]).is_err());
    }

    #[tokio::test]
    async fn bitbucket_templates_fall_back_to_project_only_when_repository_setting_is_missing() {
        let (base, server) = mock_server(vec![
            ("/bitbucket/rest/api/1.0/projects", "{\"values\":[]}"),
            ("/bitbucket/rest/ui/latest/projects/PRJ/repos/example/pull-request-templates", "__NO_CONTENT__"),
            ("/bitbucket/rest/ui/latest/projects/PRJ/pull-request-templates", "{\"enabled\":true,\"description\":\"## Summary\"}"),
        ]);
        let directory = std::env::temp_dir().join(format!("gitter-template-test-{}", Uuid::new_v4()));
        let config = directory.join("settings.json");
        let connection = connect(&config, "bitbucket_dc", &base, "Test", "fake-token").await.unwrap();
        let template = bitbucket_pull_request_template(&config, &connection.id, "PRJ", "example").await.unwrap().unwrap();
        assert_eq!(template["text"], "## Summary");
        assert_eq!(template["source"], "Bitbucket project");
        server.join().unwrap();
        std::fs::remove_dir_all(directory).unwrap();

        let (base, server) = mock_server(vec![("/bitbucket/disabled", "{\"enabled\":false}")]);
        let url = Url::parse(&format!("{base}/disabled")).unwrap();
        assert!(matches!(read_template(&client().unwrap(), url, "fake-token").await.unwrap(), TemplateSetting::Disabled));
        server.join().unwrap();

        let (base, server) = mock_server(vec![("/bitbucket/invalid", "{\"description\":\"unknown shape\"}")]);
        let url = Url::parse(&format!("{base}/invalid")).unwrap();
        assert!(read_template(&client().unwrap(), url, "fake-token").await.is_err());
        server.join().unwrap();
    }

    #[tokio::test]
    async fn connects_and_browses_bitbucket_without_persisting_the_token_in_config() {
        let (base, server) = mock_server(vec![
            ("/bitbucket/rest/api/1.0/projects", "{\"values\":[]}"),
            ("/bitbucket/rest/api/1.0/projects", "{\"values\":[]}"),
            ("/bitbucket/rest/api/1.0/repos?", "{\"values\":[{\"name\":\"Example\",\"slug\":\"example\",\"project\":{\"key\":\"PRJ\"},\"links\":{\"clone\":[{\"name\":\"ssh\",\"href\":\"git@example.com:PRJ/example.git\"}]}}],\"isLastPage\":true}"),
            ("/bitbucket/rest/api/1.0/repos?limit=50&start=50&name=Exam+ple", "{\"values\":[],\"isLastPage\":true}"),
            ("/bitbucket/rest/api/1.0/projects/PRJ/repos/example/pull-requests?", "{\"values\":[{\"id\":7,\"title\":\"Review\",\"state\":\"OPEN\",\"draft\":true,\"author\":{\"user\":{\"displayName\":\"Alex\"}},\"fromRef\":{\"displayId\":\"feature\",\"repository\":{\"slug\":\"example\",\"project\":{\"key\":\"PRJ\"}}},\"toRef\":{\"displayId\":\"main\"}}],\"isLastPage\":true}"),
            ("/bitbucket/rest/api/1.0/projects/PRJ/repos/example/pull-requests/7", "{\"id\":7,\"title\":\"Review\",\"description\":\"Details\",\"state\":\"OPEN\",\"draft\":true,\"fromRef\":{\"displayId\":\"feature\"},\"toRef\":{\"displayId\":\"main\"}}"),
            ("POST /bitbucket/rest/api/1.0/projects/PRJ/repos/example/pull-requests", "{\"id\":8,\"title\":\"Ship it\",\"state\":\"OPEN\",\"fromRef\":{\"displayId\":\"feature/PRJ-42\"},\"toRef\":{\"displayId\":\"main\"}}"),
        ]);
        let directory = std::env::temp_dir().join(format!("gitter-integration-test-{}", Uuid::new_v4()));
        let config = directory.join("settings.json");
        let connection = connect(&config, "bitbucket_dc", &base, "Test", "fake-token").await.unwrap();
        assert!(!std::fs::read_to_string(&config).unwrap().contains("fake-token"));
        assert!(list(&config).unwrap()[0].authenticated);
        assert_eq!(crate::credential_store::load(&config, &connection.id).unwrap().unwrap().as_str(), "fake-token");
        crate::credential_store::remove(&config, &connection.id).unwrap();
        assert!(!list(&config).unwrap()[0].authenticated);
        assert!(bitbucket_repositories(&config, &connection.id, 0, "").await.is_err());
        reconnect(&config, &connection.id, "fake-token").await.unwrap();
        assert!(list(&config).unwrap()[0].authenticated);
        let repos = bitbucket_repositories(&config, &connection.id, 0, "").await.unwrap();
        assert_eq!(repos["values"][0]["projectKey"], "PRJ");
        assert_eq!(repos["values"][0]["sshUrl"], "git@example.com:PRJ/example.git");
        let filtered = bitbucket_repositories(&config, &connection.id, 50, "Exam ple").await.unwrap();
        assert!(filtered["values"].as_array().unwrap().is_empty());
        let pulls = bitbucket_pull_requests(&config, &connection.id, "PRJ", "example", 0).await.unwrap();
        assert_eq!(pulls["values"][0]["id"], 7);
        assert_eq!(pulls["values"][0]["source"], "feature");
        assert_eq!(pulls["values"][0]["draft"], true);
        assert_eq!(pulls["values"][0]["sourceProjectKey"], "PRJ");
        assert_eq!(bitbucket_pull_request(&config, &connection.id, "PRJ", "example", 7).await.unwrap()["description"], "Details");
        let input = NewPullRequest { title: "Ship it".into(), description: "Ready for review".into(), source: "feature/PRJ-42".into(), target: "main".into() };
        let created = create_bitbucket_pull_request(&config, &connection.id, "PRJ", "example", &input).await.unwrap();
        assert_eq!(created["id"], 8);
        assert_eq!(created["source"], "feature/PRJ-42");
        disconnect(&config, &connection.id).unwrap();
        assert!(list(&config).unwrap().is_empty());
        assert!(crate::credential_store::load(&config, &connection.id).unwrap().is_none());
        server.join().unwrap();
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn rejects_invalid_pull_request_branches() {
        let mut input = NewPullRequest { title: "Review".into(), description: "".into(), source: "main".into(), target: "main".into() };
        assert!(pull_request_payload("PRJ", "repo", &input).is_err());
        input.source = "feature name".into();
        assert!(pull_request_payload("PRJ", "repo", &input).is_err());
        input.source = "refs/heads/feature/PRJ-1".into();
        assert_eq!(pull_request_payload("PRJ", "repo", &input).unwrap()["fromRef"]["id"], "refs/heads/feature/PRJ-1");
    }

    #[tokio::test]
    async fn reviews_comments_and_approvals_use_the_checked_pull_request_head() {
        let (base, server) = mock_server(vec![
            ("/bitbucket/rest/api/1.0/projects", "{\"values\":[]}"),
            ("/bitbucket/rest/api/1.0/projects/PRJ/repos/example/pull-requests/7", "{\"fromRef\":{\"latestCommit\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"},\"toRef\":{\"latestCommit\":\"cccccccccccccccccccccccccccccccccccccccc\"},\"reviewers\":[]}"),
            ("/bitbucket/rest/api/1.0/projects/PRJ/repos/example/pull-requests/7.diff", "diff --git a/a b/a\n"),
            ("/bitbucket/rest/api/1.0/projects/PRJ/repos/example/pull-requests/7/activities?", "{\"values\":[{\"comment\":{\"id\":1}}],\"isLastPage\":true}"),
            ("/bitbucket/rest/build-status/1.0/commits/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?", "{\"values\":[{\"key\":\"CI\",\"state\":\"SUCCESSFUL\"}],\"isLastPage\":true}"),
            ("/bitbucket/rest/api/1.0/projects/PRJ/repos/example/pull-requests/7", "{\"fromRef\":{\"latestCommit\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"},\"toRef\":{\"latestCommit\":\"cccccccccccccccccccccccccccccccccccccccc\"}}"),
            ("/bitbucket/rest/api/1.0/projects/PRJ/repos/example/pull-requests/7", "{\"fromRef\":{\"latestCommit\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"},\"toRef\":{\"latestCommit\":\"cccccccccccccccccccccccccccccccccccccccc\"}}"),
            ("POST /bitbucket/rest/api/1.0/projects/PRJ/repos/example/pull-requests/7/comments", "{\"id\":2}"),
            ("/bitbucket/rest/api/1.0/projects/PRJ/repos/example/pull-requests/7", "{\"fromRef\":{\"latestCommit\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"},\"toRef\":{\"latestCommit\":\"cccccccccccccccccccccccccccccccccccccccc\"}}"),
            ("POST /bitbucket/rest/api/1.0/projects/PRJ/repos/example/pull-requests/7/approve", "{\"approved\":true}"),
            ("/bitbucket/rest/api/1.0/projects/PRJ/repos/example/pull-requests/7", "{\"fromRef\":{\"latestCommit\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"},\"toRef\":{\"latestCommit\":\"cccccccccccccccccccccccccccccccccccccccc\"}}"),
        ]);
        let directory = std::env::temp_dir().join(format!("gitter-review-test-{}", Uuid::new_v4()));
        let config = directory.join("settings.json");
        let connection = connect(&config, "bitbucket_dc", &base, "Test", "fake-token").await.unwrap();
        let review = bitbucket_review(&config, &connection.id, "PRJ", "example", 7).await.unwrap();
        assert_eq!(review["builds"][0]["state"], "SUCCESSFUL");
        assert_eq!(review["activities"][0]["comment"]["id"], 1);
        let anchor = ReviewAnchor { path: "src/a.txt".into(), old_path: None, line: 12, side: "LEFT".into(), line_type: "delete".into() };
        bitbucket_review_action(&config, &connection.id, "PRJ", "example", 7, &"a".repeat(40), &"c".repeat(40), "comment", Some("Please fix"), Some(anchor)).await.unwrap();
        bitbucket_review_action(&config, &connection.id, "PRJ", "example", 7, &"a".repeat(40), &"c".repeat(40), "approve", None, None).await.unwrap();
        assert!(bitbucket_review_action(&config, &connection.id, "PRJ", "example", 7, &"b".repeat(40), &"c".repeat(40), "approve", None, None).await.unwrap_err().contains("changed"));
        server.join().unwrap();
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    #[ignore = "requires a reachable Bitbucket server"]
    async fn bitbucket_server_properties_live() {
        let base = std::env::var("GITTER_TEST_BITBUCKET_SERVER").expect("set GITTER_TEST_BITBUCKET_SERVER");
        let url = endpoint(&base, "bitbucket_dc", &["rest", "api", "1.0", "application-properties"]).unwrap();
        let response = client().unwrap().get(url).send().await.unwrap();
        assert!(response.status().is_success(), "Bitbucket returned {}", response.status());
        let properties: Value = response.json().await.unwrap();
        assert!(properties.get("version").and_then(Value::as_str).is_some());
        println!("Bitbucket version {} is reachable through native TLS", properties["version"].as_str().unwrap());
    }
}
