//! Bitbucket tokens live in Gitter's app data, never in the OS credential store.
//! On macOS the files are unencrypted and restricted to the current user. On
//! Windows the file contents are additionally encrypted for the current user.
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;
use zeroize::Zeroizing;

fn directory(config: &Path) -> Result<PathBuf, String> {
    Ok(config.parent().ok_or("Invalid integration settings path")?.join("bitbucket-tokens"))
}

fn token_path(config: &Path, id: &str) -> Result<PathBuf, String> {
    let uuid = Uuid::parse_str(id).map_err(|_| "Invalid integration ID")?;
    if uuid.to_string() != id { return Err("Invalid integration ID".into()); }
    Ok(directory(config)?.join(id))
}

fn ensure_directory(path: &Path) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|error| format!("Could not create token folder: {error}"))?;
    let metadata = std::fs::symlink_metadata(path).map_err(|error| format!("Could not inspect token folder: {error}"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() { return Err("The token folder must be a directory, not a link".into()); }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("Could not secure token folder: {error}"))?;
    }
    Ok(())
}

#[cfg(not(windows))]
fn transform(bytes: &[u8], _encrypt: bool) -> Result<Zeroizing<Vec<u8>>, String> {
    Ok(Zeroizing::new(bytes.to_vec()))
}

#[cfg(windows)]
fn transform(bytes: &[u8], encrypt: bool) -> Result<Zeroizing<Vec<u8>>, String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB};
    use zeroize::Zeroize;

    let input = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(bytes.len()).map_err(|_| "Token is too large")?,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB { cbData: 0, pbData: null_mut() };
    // DPAPI returns a LocalAlloc buffer. Its scope is the current Windows user;
    // UI is forbidden, and no credential is written to Credential Manager.
    let success = unsafe {
        if encrypt {
            CryptProtectData(&input, null(), null(), null(), null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        } else {
            CryptUnprotectData(&input, null_mut(), null(), null(), null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        }
    };
    if success == 0 { return Err(format!("Could not protect or read the saved Bitbucket token: {}", std::io::Error::last_os_error())); }
    if output.pbData.is_null() { return Err("Windows returned an empty saved token".into()); }
    let result = unsafe {
        let buffer = std::slice::from_raw_parts_mut(output.pbData, output.cbData as usize);
        let result = Zeroizing::new(buffer.to_vec());
        buffer.zeroize();
        LocalFree(output.pbData.cast());
        result
    };
    Ok(result)
}

pub fn save(config: &Path, id: &str, token: &str) -> Result<(), String> {
    let path = token_path(config, id)?;
    let parent = path.parent().ok_or("Invalid token path")?;
    ensure_directory(parent)?;
    let data = transform(token.as_bytes(), true)?;
    let temp = parent.join(format!(".{id}-{}.tmp", Uuid::new_v4()));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temp).map_err(|error| format!("Could not save Bitbucket token: {error}"))?;
    let result = file.write_all(&data).and_then(|_| file.sync_all());
    drop(file);
    if let Err(error) = result.and_then(|_| std::fs::rename(&temp, &path)) {
        let _ = std::fs::remove_file(&temp);
        return Err(format!("Could not save Bitbucket token: {error}"));
    }
    Ok(())
}

pub fn load(config: &Path, id: &str) -> Result<Option<Zeroizing<String>>, String> {
    let path = token_path(config, id)?;
    let mut file = match std::fs::File::open(&path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Could not read the saved Bitbucket token: {error}")),
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(std::fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("Could not secure the saved Bitbucket token: {error}"))?;
    }
    let mut encoded = Zeroizing::new(Vec::new());
    Read::by_ref(&mut file).take(65_537).read_to_end(&mut encoded).map_err(|error| format!("Could not read the saved Bitbucket token: {error}"))?;
    if encoded.len() > 65_536 { return Err("The saved Bitbucket token is too large".into()); }
    let decoded = transform(&encoded, false)?;
    let token = String::from_utf8(decoded.to_vec()).map_err(|_| "The saved Bitbucket token is invalid")?;
    if token.trim().is_empty() || token.contains(['\r', '\n']) { return Err("The saved Bitbucket token is invalid".into()); }
    Ok(Some(Zeroizing::new(token)))
}

pub fn remove(config: &Path, id: &str) -> Result<(), String> {
    let path = token_path(config, id)?;
    match std::fs::remove_file(&path) {
        Ok(()) => (),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
        Err(error) => return Err(format!("Could not remove the saved Bitbucket token: {error}")),
    }
    // A crash during an atomic save can leave a private temporary file behind.
    let parent = path.parent().ok_or("Invalid token path")?;
    let entries = match std::fs::read_dir(parent) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Could not inspect token folder: {error}")),
    };
    let prefix = format!(".{id}-");
    for entry in entries {
        let entry = entry.map_err(|error| format!("Could not inspect token folder: {error}"))?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with(&prefix) && name.ends_with(".tmp") {
            std::fs::remove_file(entry.path()).map_err(|error| format!("Could not remove a temporary token: {error}"))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_survives_reload_can_be_replaced_and_is_removed() {
        let parent = std::env::temp_dir().join(format!("gitter-tokens-test-{}", Uuid::new_v4()));
        let config = parent.join("integrations.json");
        let id = Uuid::new_v4().to_string();
        let other = Uuid::new_v4().to_string();
        assert!(load(&config, &id).unwrap().is_none());
        save(&config, &id, "first-test-token").unwrap();
        save(&config, &other, "other-test-token").unwrap();
        assert_eq!(load(&config, &id).unwrap().unwrap().as_str(), "first-test-token");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(directory(&config).unwrap()).unwrap().permissions().mode() & 0o777, 0o700);
            assert_eq!(std::fs::metadata(token_path(&config, &id).unwrap()).unwrap().permissions().mode() & 0o777, 0o600);
        }
        #[cfg(windows)]
        assert!(!std::fs::read(token_path(&config, &id).unwrap()).unwrap().windows("first-test-token".len()).any(|part| part == b"first-test-token"));
        save(&config, &id, "replacement-test-token").unwrap();
        assert_eq!(load(&config, &id).unwrap().unwrap().as_str(), "replacement-test-token");
        let stale = directory(&config).unwrap().join(format!(".{id}-stale.tmp"));
        std::fs::write(&stale, "stale").unwrap();
        remove(&config, &id).unwrap();
        assert!(load(&config, &id).unwrap().is_none());
        assert!(!stale.exists());
        assert_eq!(load(&config, &other).unwrap().unwrap().as_str(), "other-test-token");
        assert!(save(&config, "../other", "invalid").is_err());
        std::fs::remove_dir_all(parent).unwrap();
    }
}
