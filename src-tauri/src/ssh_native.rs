use serde::Serialize;
use std::path::Path;
use std::io::Write;
use std::process::{Command, Stdio};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshPublicKey {
    path: String,
    public_key: String,
    fingerprint: String,
    private_key_exists: bool,
    loaded_in_agent: bool,
}

fn key_identity(line: &str) -> Option<String> {
    let mut fields = line.split_whitespace();
    Some(format!("{} {}", fields.next()?, fields.next()?))
}

fn validate_public_key(key: &str) -> Result<&str, String> {
    let key = key.trim();
    let algorithm = key.split_whitespace().next().unwrap_or("");
    if key.len() > 64 * 1024 || key.contains(['\r', '\n', '\0']) || key_identity(key).is_none()
        || !(algorithm.starts_with("ssh-") || algorithm.starts_with("ecdsa-") || algorithm.starts_with("sk-")) {
        return Err("Select a valid SSH public key".into());
    }
    Ok(key)
}

pub fn copy_public_key(key: &str) -> Result<(), String> {
    let key = validate_public_key(key)?;
    let clipboard = if cfg!(target_os = "macos") { "pbcopy" } else if cfg!(windows) { "clip.exe" } else {
        return Err("Copying SSH keys is available on macOS and Windows".into());
    };
    let mut child = Command::new(clipboard).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null())
        .spawn().map_err(|error| format!("Could not open the clipboard: {error}"))?;
    child.stdin.take().ok_or("Could not open the clipboard")?.write_all(key.as_bytes()).map_err(|error| error.to_string())?;
    if !child.wait().map_err(|error| error.to_string())?.success() { return Err("Could not copy the public key".into()); }
    Ok(())
}

pub fn list_public_keys() -> Result<Vec<SshPublicKey>, String> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .ok_or("Could not determine the home directory")?;
    let folder = Path::new(&home).join(".ssh");
    if !folder.exists() { return Ok(Vec::new()); }
    let agent_keys = Command::new("ssh-add").arg("-L").stdin(Stdio::null()).output().ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).lines().filter_map(key_identity).collect::<Vec<_>>())
        .unwrap_or_default();
    let mut result = Vec::new();
    for entry in std::fs::read_dir(folder).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry.file_type().map_err(|error| error.to_string())?.is_file() { continue; }
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("pub") { continue; }
        if entry.metadata().map_err(|error| error.to_string())?.len() > 64 * 1024 { continue; }
        let public_key = match std::fs::read_to_string(&path) {
            Ok(value) => value.lines().next().unwrap_or("").trim().to_string(),
            Err(_) => continue,
        };
        let identity = match key_identity(&public_key) { Some(value) => value, None => continue };
        let fingerprint = match Command::new("ssh-keygen").arg("-lf").arg(&path).stdin(Stdio::null()).output() {
            Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout).trim().to_string(),
            _ => continue,
        };
        let private_path = path.with_extension("");
        result.push(SshPublicKey {
            path: path.to_string_lossy().to_string(),
            public_key,
            fingerprint,
            private_key_exists: private_path.is_file(),
            loaded_in_agent: agent_keys.contains(&identity),
        });
    }
    result.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(result)
}

pub fn test_remote(remote: &str) -> Result<String, String> {
    if remote.is_empty() || remote.starts_with('-') || remote.chars().any(char::is_whitespace)
        || (!remote.starts_with("ssh://") && !(remote.contains('@') && remote.contains(':')))
        || remote.contains("::")
    {
        return Err("Enter an SSH repository URL such as git@example.com:project/repo.git".into());
    }
    if remote.starts_with("ssh://") {
        let authority = remote.trim_start_matches("ssh://").split('/').next().unwrap_or("");
        if authority.rsplit_once('@').is_some_and(|(user, _)| user.contains(':')) {
            return Err("Remove the password from the URL".into());
        }
    }
    let output = Command::new("git")
        .args(["ls-remote", "--", remote, "HEAD"])
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ConnectTimeout=10")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Could not start Git: {error}"))?;
    if output.status.success() {
        Ok("SSH authentication and repository access succeeded.".into())
    } else {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if detail.is_empty() { "SSH connection failed.".into() } else { detail })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clipboard_accepts_public_keys_but_not_private_key_blocks() {
        assert_eq!(validate_public_key("ssh-ed25519 AAAAB3 comment\n").unwrap(), "ssh-ed25519 AAAAB3 comment");
        assert!(validate_public_key("-----BEGIN OPENSSH PRIVATE KEY-----\nsecret").is_err());
        assert!(validate_public_key("ssh-ed25519 AAA\nextra").is_err());
    }
}
