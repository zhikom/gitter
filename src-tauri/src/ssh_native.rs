use serde::Serialize;
use std::path::Path;
use std::io::Write;
use std::process::{Command, Stdio};
use ssh_key::{Algorithm, LineEnding, PrivateKey, rand_core::OsRng};

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

#[cfg(any(windows, test))]
fn windows_sid_from_whoami(output: &str) -> Option<&str> {
    let start = output.rfind("S-1-")?;
    let candidate = &output[start..];
    let numeric_len = candidate[2..].bytes().take_while(|ch| ch.is_ascii_digit() || *ch == b'-').count();
    let sid = &candidate[..2 + numeric_len];
    if sid.ends_with('-') || sid.split('-').count() < 4 { return None; }
    Some(sid)
}

#[cfg(windows)]
fn restrict_private_key(path: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const NO_WINDOW: u32 = 0x08000000;
    let user = Command::new("whoami.exe").args(["/user", "/fo", "csv", "/nh"]).creation_flags(NO_WINDOW).output()
        .map_err(|error| format!("Could not determine the Windows account: {error}"))?;
    if !user.status.success() { return Err("Could not determine the Windows account".into()); }
    let user = String::from_utf8_lossy(&user.stdout);
    let sid = windows_sid_from_whoami(&user).ok_or("Could not determine the Windows account SID")?;
    let grant = format!("*{sid}:(F)");
    // Grant the owner access before removing inherited permissions so that a
    // second security update cannot lock the current account out of the file.
    for args in [vec!["/grant:r", grant.as_str()], vec!["/inheritance:r"]] {
        let output = Command::new("icacls.exe").arg(path).args(args)
            .creation_flags(NO_WINDOW).stdin(Stdio::null()).output()
            .map_err(|error| format!("Could not protect the private key: {error}"))?;
        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Could not restrict access to the private key: {}", detail.trim()));
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn restrict_private_key(_path: &Path) -> Result<(), String> { Ok(()) }

/** Create a standard OpenSSH key pair without replacing either existing file. */
fn generate_key_in(folder: &Path, name: &str, comment: &str, passphrase: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 100 || name.starts_with('.') || name.ends_with(".pub")
        || !name.chars().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.')) {
        return Err("Use a key name made of letters, numbers, dots, hyphens, or underscores".into());
    }
    let comment = comment.trim();
    if comment.len() > 256 || comment.contains(['\r', '\n', '\0']) || passphrase.len() > 4096 {
        return Err("The key comment or passphrase is invalid".into());
    }
    let private_path = folder.join(name);
    let public_path = folder.join(format!("{name}.pub"));
    if private_path.exists() || public_path.exists() { return Err("A key with that name already exists. Choose another name.".into()); }

    let mut key = PrivateKey::random(&mut OsRng, Algorithm::Ed25519).map_err(|error| format!("Could not create the SSH key: {error}"))?;
    key.set_comment(comment);
    let public = key.public_key().to_openssh().map_err(|error| error.to_string())?;
    let key = if passphrase.is_empty() { key } else { key.encrypt(&mut OsRng, passphrase).map_err(|error| format!("Could not encrypt the SSH key: {error}"))? };
    let private = key.to_openssh(LineEnding::LF).map_err(|error| error.to_string())?;

    if !folder.is_dir() {
        let mut builder = std::fs::DirBuilder::new();
        #[cfg(unix)] { use std::os::unix::fs::DirBuilderExt; builder.mode(0o700); }
        if let Err(error) = builder.create(folder) {
            if !folder.is_dir() { return Err(format!("Could not create the SSH folder: {error}")); }
        }
    }
    let mut private_options = std::fs::OpenOptions::new();
    private_options.write(true).create_new(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; private_options.mode(0o600); }
    let mut private_file = private_options.open(&private_path).map_err(|error| format!("Could not create the private key: {error}"))?;
    let mut public_created = false;
    let result = (|| -> Result<(), String> {
        restrict_private_key(&private_path)?;
        let mut public_options = std::fs::OpenOptions::new();
        public_options.write(true).create_new(true);
        #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; public_options.mode(0o644); }
        let mut public_file = public_options.open(&public_path).map_err(|error| format!("Could not create the public key: {error}"))?;
        public_created = true;
        private_file.write_all(private.as_bytes()).and_then(|_| private_file.sync_all()).map_err(|error| format!("Could not save the private key: {error}"))?;
        public_file.write_all(public.as_bytes()).and_then(|_| public_file.write_all(b"\n")).and_then(|_| public_file.sync_all()).map_err(|error| format!("Could not save the public key: {error}"))?;
        Ok(())
    })();
    if let Err(error) = result {
        drop(private_file);
        let _ = std::fs::remove_file(&private_path);
        if public_created { let _ = std::fs::remove_file(&public_path); }
        return Err(error);
    }
    Ok(private_path.to_string_lossy().to_string())
}

pub fn generate_key(name: &str, comment: &str, passphrase: &str) -> Result<String, String> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .ok_or("Could not determine the home directory")?;
    generate_key_in(&Path::new(&home).join(".ssh"), name, comment, passphrase)
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
            _ => match ssh_key::PublicKey::from_openssh(&public_key) {
                Ok(key) => format!("{} {}", key.algorithm(), key.fingerprint(Default::default())),
                Err(_) => continue,
            },
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
    fn parses_windows_account_sid_from_whoami_csv() {
        assert_eq!(windows_sid_from_whoami("\"runner\\runneradmin\",\"S-1-5-21-123-456-789-1001\"\r\n"), Some("S-1-5-21-123-456-789-1001"));
        assert_eq!(windows_sid_from_whoami("invalid output"), None);
        assert_eq!(windows_sid_from_whoami("\"S-1-5-\""), None);
    }

    #[test]
    fn clipboard_accepts_public_keys_but_not_private_key_blocks() {
        assert_eq!(validate_public_key("ssh-ed25519 AAAAB3 comment\n").unwrap(), "ssh-ed25519 AAAAB3 comment");
        assert!(validate_public_key("-----BEGIN OPENSSH PRIVATE KEY-----\nsecret").is_err());
        assert!(validate_public_key("ssh-ed25519 AAA\nextra").is_err());
    }

    #[test]
    fn generates_an_openssh_key_without_overwriting_existing_files() {
        let folder = std::env::temp_dir().join(format!("gitter-ssh-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&folder).unwrap();
        let path = generate_key_in(&folder, "id_ed25519", "test@example.invalid", "test passphrase").unwrap();
        let public = std::fs::read_to_string(folder.join("id_ed25519.pub")).unwrap();
        let private = std::fs::read_to_string(&path).unwrap();
        assert!(PrivateKey::from_openssh(&private).unwrap().is_encrypted());
        assert!(public.starts_with("ssh-ed25519 "));
        let output = Command::new("ssh-keygen").args(["-y", "-P", "test passphrase", "-f", &path]).output().unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        assert_eq!(key_identity(&String::from_utf8_lossy(&output.stdout)), key_identity(&public));
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600); }
        assert!(generate_key_in(&folder, "id_ed25519", "", "").is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), private);
        assert!(generate_key_in(&folder, "../outside", "", "").is_err());
        std::fs::write(folder.join("reserved.pub"), "existing public key").unwrap();
        assert!(generate_key_in(&folder, "reserved", "", "").is_err());
        assert!(!folder.join("reserved").exists());
        assert_eq!(std::fs::read_to_string(folder.join("reserved.pub")).unwrap(), "existing public key");
        let plain = generate_key_in(&folder, "id_other", "", "").unwrap();
        assert!(!PrivateKey::from_openssh(std::fs::read_to_string(plain).unwrap()).unwrap().is_encrypted());
        std::fs::remove_dir_all(folder).unwrap();
    }
}
