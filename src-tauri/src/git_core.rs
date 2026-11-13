//! Native Git operations whose desktop contracts match the typed backend.
//! Git still supplies hooks, signing, credentials and SSH configuration.
use serde_json::{json, Value};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};

fn required<'a>(input: &'a Value, key: &str) -> Result<&'a str, String> {
    input.get(key).and_then(Value::as_str).filter(|s| !s.is_empty()).ok_or_else(|| format!("Missing {key}"))
}

fn absolute_path(raw: &str) -> Result<PathBuf, String> {
    if raw.is_empty() || raw.contains('\0') { return Err("A path is required".into()); }
    let home = || std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from).ok_or_else(|| "Could not determine the home directory".to_string());
    if raw == "~" { return home(); }
    if let Some(rest) = raw.strip_prefix("~/").or_else(|| raw.strip_prefix("~\\")) { return Ok(home()?.join(rest)); }
    let path = PathBuf::from(raw);
    if path.is_absolute() { Ok(path) } else { Ok(std::env::current_dir().map_err(|e| e.to_string())?.join(path)) }
}

fn relative_file(raw: &str) -> Result<&str, String> {
    if raw.is_empty() || raw.contains('\0') || Path::new(raw).components().any(|part| !matches!(part, Component::Normal(_))) {
        return Err("A repository-relative file path is required".into());
    }
    Ok(raw)
}

fn git(cwd: &Path, args: &[&str], input: Option<&str>) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(cwd).args(args).env("GIT_LITERAL_PATHSPECS", "1")
        .env("GIT_OPTIONAL_LOCKS", "0").env("GIT_TERMINAL_PROMPT", "0")
        .stdin(if input.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(target_os = "macos")]
    {
        let inherited = std::env::var_os("PATH").unwrap_or_default();
        let paths = [PathBuf::from("/opt/homebrew/bin"), PathBuf::from("/usr/local/bin")]
            .into_iter().chain(std::env::split_paths(&inherited));
        cmd.env("PATH", std::env::join_paths(paths).map_err(|e| e.to_string())?);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Could not start Git: {e}"))?;
    if let Some(text) = input {
        // Git can exit before it reads all of stdin; its exit status reports the failure.
        if let Some(mut stdin) = child.stdin.take() { let _ = stdin.write_all(text.as_bytes()); }
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() { format!("Git exited with {}", output.status) } else { message });
    }
    String::from_utf8(output.stdout).map_err(|_| "Git returned invalid UTF-8".into())
}

fn clone_remote(remote: &str, destination: &Path) -> Result<(), String> {
    if remote.is_empty() || remote.starts_with('-') || remote.contains('\0') { return Err("Invalid repository URL".into()); }
    if remote.split_once("::").is_some_and(|(prefix, _)| !prefix.is_empty() && prefix.chars().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '+' | '.'))) {
        return Err("Git remote helpers are not supported in the clone dialog".into());
    }
    if let Some((scheme, rest)) = remote.split_once("://") {
        if !matches!(scheme, "https" | "http" | "ssh" | "file") { return Err("Use an HTTPS, SSH, or local repository URL".into()); }
        if rest.split('/').next().unwrap_or("").rsplit_once('@').is_some_and(|(userinfo, _)| userinfo.contains(':')) {
            return Err("Remove the password or token from the repository URL and use a credential helper".into());
        }
    }
    let parent = destination.parent().ok_or("Invalid clone destination")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let target = destination.to_str().ok_or("Invalid clone destination")?;
    git(parent, &["clone", "--", remote, target], None)?;
    Ok(())
}

pub fn dispatch(operation: &str, input: &Value) -> Result<Value, String> {
    if operation == "cloneRepo" {
        let target = absolute_path(required(input, "folder")?)?;
        clone_remote(required(input, "url")?, &target)?;
        return Ok(json!(target.to_string_lossy().replace('\\', "/")));
    }
    let repo = absolute_path(required(input, "repo")?)?;
    let has_head = || git(&repo, &["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], None).is_ok();
    match operation {
        "stageFile" => { git(&repo, &["add", "--", relative_file(required(input, "file")?)?], None)?; },
        "unstageFile" => {
            let file = relative_file(required(input, "file")?)?;
            if has_head() { git(&repo, &["restore", "--staged", "--", file], None)?; }
            else { git(&repo, &["rm", "--cached", "--force", "-r", "--", file], None)?; }
        },
        "stageAll" => { git(&repo, &["add", "-A"], None)?; },
        "unstageAll" => {
            if has_head() { git(&repo, &["reset", "-q"], None)?; }
            else if !git(&repo, &["ls-files", "-z"], None)?.is_empty() {
                git(&repo, &["rm", "--cached", "--force", "-r", "--", "."], None)?;
            }
        },
        "commit" => {
            let summary = required(input, "summary")?;
            if summary.trim().is_empty() { return Err("A commit needs a summary.".into()); }
            let description = input.get("description").and_then(Value::as_str).unwrap_or("");
            let message = if description.trim().is_empty() { summary.to_string() } else { format!("{summary}\n\n{description}") };
            let args = if input.get("amend").and_then(Value::as_bool).unwrap_or(false) {
                vec!["commit", "-F", "-", "--amend"]
            } else { vec!["commit", "-F", "-"] };
            return Ok(json!(git(&repo, &args, Some(&message))?));
        },
        _ => return Err("Unsupported native Git operation".into()),
    }
    Ok(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn stages_literal_paths_and_unstages_without_losing_work() {
        let repo = std::env::temp_dir().join(format!("gitter-native-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&repo).unwrap();
        git(&repo, &["init", "-q"], None).unwrap();
        std::fs::write(repo.join("[one].txt"), "staged").unwrap();
        std::fs::write(repo.join("o.txt"), "other").unwrap();
        let input = json!({"repo":repo.to_str().unwrap(),"file":"[one].txt"});
        dispatch("stageFile", &input).unwrap();
        assert_eq!(git(&repo, &["diff", "--cached", "--name-only"], None).unwrap().trim(), "[one].txt");
        std::fs::write(repo.join("[one].txt"), "later").unwrap();
        dispatch("unstageFile", &input).unwrap();
        assert_eq!(std::fs::read_to_string(repo.join("[one].txt")).unwrap(), "later");
        assert!(git(&repo, &["ls-files"], None).unwrap().is_empty());
        assert!(dispatch("stageFile", &json!({"repo":repo.to_str().unwrap(),"file":"../outside"})).is_err());
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn clones_local_repository_and_rejects_embedded_credentials() {
        let root = std::env::temp_dir().join(format!("gitter-native-clone-{}", Uuid::new_v4()));
        let source = root.join("source");
        let target = root.join("destination");
        std::fs::create_dir_all(&source).unwrap();
        git(&source, &["init", "-q"], None).unwrap();
        let result = dispatch("cloneRepo", &json!({"url":source.to_str().unwrap(),"folder":target.to_str().unwrap()})).unwrap();
        assert_eq!(result.as_str().unwrap(), target.to_string_lossy().replace('\\', "/"));
        assert!(target.join(".git").is_dir());
        assert!(clone_remote("https://user:secret@example.com/repo.git", &root.join("unsafe")).is_err());
        assert!(clone_remote("ext::unsafe", &root.join("unsafe")).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn commits_literal_messages_and_unstages_an_unborn_branch() {
        let repo = std::env::temp_dir().join(format!("gitter-native-commit-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&repo).unwrap();
        git(&repo, &["init", "-q"], None).unwrap();
        git(&repo, &["config", "user.name", "Gitter Test"], None).unwrap();
        git(&repo, &["config", "user.email", "test@example.invalid"], None).unwrap();
        std::fs::write(repo.join("file.txt"), "content").unwrap();
        let input = json!({"repo":repo.to_str().unwrap()});
        dispatch("stageAll", &input).unwrap();
        dispatch("unstageAll", &input).unwrap();
        assert!(git(&repo, &["ls-files"], None).unwrap().is_empty());
        dispatch("stageAll", &input).unwrap();
        let message = "fix: $(echo literal) `backticks`";
        dispatch("commit", &json!({"repo":repo.to_str().unwrap(),"summary":message,"description":"body"})).unwrap();
        assert_eq!(git(&repo, &["log", "-1", "--format=%B"], None).unwrap().trim(), format!("{message}\n\nbody"));
        std::fs::remove_dir_all(repo).unwrap();
    }
}
