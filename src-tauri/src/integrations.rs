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

// Tokens stay in memory for the lifetime of this process. Existing Keychain
// entries from older versions are neither read nor changed.
fn session_secrets() -> &'static Mutex<std::collections::HashMap<String, zeroize::Zeroizing<String>>> {
    static SECRETS: OnceLock<Mutex<std::collections::HashMap<String, zeroize::Zeroizing<String>>>> = OnceLock::new();
    SECRETS.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

fn store_secret(id: &str, token: &str) -> Result<(), String> {
    session_secrets().lock().map_err(|_| "Session credentials are busy")?
        .insert(id.into(), zeroize::Zeroizing::new(token.into()));
    Ok(())
}

fn read_secret(id: &str) -> Result<zeroize::Zeroizing<String>, String> {
    session_secrets().lock().map_err(|_| "Session credentials are busy")?
        .get(id).cloned().ok_or_else(|| "Enter your Bitbucket token in Integrations to connect for this session".into())
}

fn delete_secret(id: &str) -> Result<(), String> {
    session_secrets().lock().map_err(|_| "Session credentials are busy")?.remove(id);
    Ok(())
}

pub fn list(path: &Path) -> Result<Vec<Integration>, String> {
    let _guard = config_lock().lock().map_err(|_| "Integration settings are busy")?;
    let secrets = session_secrets().lock().map_err(|_| "Session credentials are busy")?;
    Ok(read_config(path)?.into_iter().filter(|entry| entry.kind == "bitbucket_dc").map(|mut entry| {
        entry.authenticated = secrets.contains_key(&entry.id);
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
    write_config(path, &integrations)?;
    store_secret(&entry.id, token)?;
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
    store_secret(id, token)
}

pub fn disconnect(path: &Path, id: &str) -> Result<(), String> {
    let _guard = config_lock().lock().map_err(|_| "Integration settings are busy")?;
    let mut entries = read_config(path)?;
    if !entries.iter().any(|entry| entry.id == id) { return Err("Integration not found".into()); }
    entries.retain(|entry| entry.id != id);
    write_config(path, &entries)?;
    delete_secret(id)
}

pub async fn bitbucket_repositories(path: &Path, id: &str, start: u64, search: &str) -> Result<Value, String> {
    let integration = find(path, id, "bitbucket_dc")?;
    let token = read_secret(id)?;
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
    let token = read_secret(id)?;
    let mut url = endpoint(&integration.base_url, &integration.kind, &["rest", "api", "1.0", "projects", project, "repos", slug, "pull-requests"])?;
    url.query_pairs_mut().append_pair("state", "OPEN").append_pair("limit", "50").append_pair("start", &start.to_string());
    let value = request_json(&client()?, Method::GET, url, &token, None).await?;
    let pulls = value.get("values").and_then(Value::as_array).ok_or("The server did not return pull requests")?;
    let pulls: Vec<Value> = pulls.iter().map(map_bitbucket_pull_request).collect();
    Ok(json!({ "values": pulls, "nextPageStart": value.get("nextPageStart"), "isLastPage": value.get("isLastPage").and_then(Value::as_bool).unwrap_or(true) }))
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
    let token = read_secret(id)?;
    let url = endpoint(&integration.base_url, &integration.kind, &["rest", "api", "1.0", "projects", project, "repos", slug, "pull-requests", &number.to_string()])?;
    let pull = request_json(&client()?, Method::GET, url, &token, None).await?;
    Ok(map_bitbucket_pull_request(&pull))
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
    let token = read_secret(id)?;
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

    fn mock_server(responses: Vec<(&'static str, &'static str)>) -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = std::thread::spawn(move || {
            for (expected, body) in responses {
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
                let (method, path) = expected.split_once(' ').unwrap_or(("GET", expected));
                assert!(headers.starts_with(&format!("{method} {path}")), "unexpected request: {headers}");
                assert!(headers.to_ascii_lowercase().contains("authorization: bearer fake-token"));
                if method == "POST" {
                    let posted: Value = serde_json::from_slice(&request[header_end..]).unwrap();
                    assert_eq!(posted["title"], "Ship it");
                    assert_eq!(posted["fromRef"]["id"], "refs/heads/feature/PRJ-42");
                    assert_eq!(posted["toRef"]["id"], "refs/heads/main");
                    assert_eq!(posted["toRef"]["repository"]["project"]["key"], "PRJ");
                }
                write!(socket, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
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
        delete_secret(&connection.id).unwrap();
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
