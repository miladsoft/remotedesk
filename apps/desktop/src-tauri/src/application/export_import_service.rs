use std::collections::HashMap;

use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, Key, KeyInit, Nonce};
use argon2::Argon2;
use chrono::Utc;
use rand::RngCore;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use zeroize::Zeroize;

use crate::domain::{AppError, AppResult, AuthType, Protocol, Server, ServerGroup, Tag};
use crate::infrastructure::database::{GroupRepository, ServerRepository, TagRepository};
use crate::infrastructure::keychain::KeychainService;

const MAGIC: &[u8; 4] = b"SMBK";
const FORMAT_VERSION: u8 = 1;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const DOCUMENT_VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct ExportDocument {
    version: u32,
    exported_at: String,
    groups: Vec<ServerGroup>,
    tags: Vec<Tag>,
    servers: Vec<ExportedServer>,
}

#[derive(Serialize, Deserialize)]
struct ExportedServer {
    id: String,
    name: String,
    description: Option<String>,
    hostname: String,
    port: i64,
    protocol: Protocol,
    username: Option<String>,
    authentication_type: AuthType,
    secret: Option<String>,
    private_key_path: Option<String>,
    group_id: Option<String>,
    jump_server_id: Option<String>,
    working_directory: Option<String>,
    terminal_profile_id: Option<String>,
    is_favorite: bool,
    tag_ids: Vec<String>,
    #[serde(default)]
    custom_command: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub servers_imported: usize,
    pub groups_imported: usize,
    pub tags_imported: usize,
    pub credentials_imported: usize,
}

pub struct ExportImportService;

impl ExportImportService {
    pub fn export(
        conn: &Connection,
        include_credentials: bool,
        passphrase: &str,
    ) -> AppResult<Vec<u8>> {
        if passphrase.is_empty() {
            return Err(AppError::Validation(
                "export passphrase must not be empty".into(),
            ));
        }
        let groups = GroupRepository::list(conn)?;
        let tags = TagRepository::list(conn)?;
        let servers = ServerRepository::list(conn)?;

        let mut exported_servers = Vec::with_capacity(servers.len());
        for server in servers {
            let secret = if include_credentials {
                match &server.credential_reference {
                    Some(reference) => KeychainService::account_from_reference(reference)
                        .map(KeychainService::get_secret)
                        .transpose()?
                        .map(|s| s.to_string()),
                    None => None,
                }
            } else {
                None
            };
            exported_servers.push(ExportedServer {
                id: server.id,
                name: server.name,
                description: server.description,
                hostname: server.hostname,
                port: server.port,
                protocol: server.protocol,
                username: server.username,
                authentication_type: server.authentication_type,
                secret,
                private_key_path: server.private_key_path,
                group_id: server.group_id,
                jump_server_id: server.jump_server_id,
                working_directory: server.working_directory,
                terminal_profile_id: server.terminal_profile_id,
                is_favorite: server.is_favorite,
                tag_ids: server.tag_ids,
                custom_command: server.custom_command,
            });
        }

        let document = ExportDocument {
            version: DOCUMENT_VERSION,
            exported_at: Utc::now().to_rfc3339(),
            groups,
            tags,
            servers: exported_servers,
        };
        let mut plaintext =
            serde_json::to_vec(&document).map_err(|e| AppError::Crypto(e.to_string()))?;

        let mut salt = [0u8; SALT_LEN];
        rand::rngs::OsRng.fill_bytes(&mut salt);
        let key = derive_key(passphrase, &salt)?;

        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce_bytes), plaintext.as_ref())
            .map_err(|e| AppError::Crypto(e.to_string()))?;
        plaintext.zeroize();

        let mut out = Vec::with_capacity(4 + 1 + SALT_LEN + NONCE_LEN + ciphertext.len());
        out.extend_from_slice(MAGIC);
        out.push(FORMAT_VERSION);
        out.extend_from_slice(&salt);
        out.extend_from_slice(&nonce_bytes);
        out.extend_from_slice(&ciphertext);
        Ok(out)
    }

    pub fn import(conn: &Connection, file_bytes: &[u8], passphrase: &str) -> AppResult<ImportSummary> {
        if file_bytes.len() < 4 + 1 + SALT_LEN + NONCE_LEN {
            return Err(AppError::Crypto("backup file is truncated".into()));
        }
        if &file_bytes[0..4] != MAGIC {
            return Err(AppError::Crypto("not a RemoteDesk backup file".into()));
        }
        let version = file_bytes[4];
        if version != FORMAT_VERSION {
            return Err(AppError::Crypto(format!(
                "unsupported backup format version {version}"
            )));
        }
        let salt = &file_bytes[5..5 + SALT_LEN];
        let nonce_bytes = &file_bytes[5 + SALT_LEN..5 + SALT_LEN + NONCE_LEN];
        let ciphertext = &file_bytes[5 + SALT_LEN + NONCE_LEN..];

        let key = derive_key(passphrase, salt)?;
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
        let mut plaintext = cipher
            .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
            .map_err(|_| AppError::Crypto("incorrect passphrase or corrupted file".into()))?;

        let document: ExportDocument =
            serde_json::from_slice(&plaintext).map_err(|e| AppError::Crypto(e.to_string()))?;
        plaintext.zeroize();

        // Phase 1: create groups with new ids, remapping parents afterward.
        let mut group_id_map: HashMap<String, String> = HashMap::new();
        for group in &document.groups {
            let new_id = Uuid::new_v4().to_string();
            group_id_map.insert(group.id.clone(), new_id.clone());
        }
        for group in &document.groups {
            let new_id = group_id_map[&group.id].clone();
            let parent_id = group
                .parent_id
                .as_ref()
                .and_then(|old| group_id_map.get(old).cloned());
            GroupRepository::insert(
                conn,
                &ServerGroup {
                    id: new_id,
                    parent_id,
                    name: group.name.clone(),
                    description: group.description.clone(),
                    sort_order: group.sort_order,
                },
            )?;
        }

        // Tags: reuse an existing tag with the same name, otherwise create one.
        let mut tag_id_map: HashMap<String, String> = HashMap::new();
        let mut tags_imported = 0usize;
        for tag in &document.tags {
            if let Some(existing) = TagRepository::find_by_name(conn, &tag.name)? {
                tag_id_map.insert(tag.id.clone(), existing.id);
            } else {
                let new_id = Uuid::new_v4().to_string();
                TagRepository::insert(
                    conn,
                    &Tag {
                        id: new_id.clone(),
                        name: tag.name.clone(),
                    },
                )?;
                tag_id_map.insert(tag.id.clone(), new_id);
                tags_imported += 1;
            }
        }

        // Servers: two passes so jump_server_id can reference servers created later.
        let mut server_id_map: HashMap<String, String> = HashMap::new();
        for server in &document.servers {
            server_id_map.insert(server.id.clone(), Uuid::new_v4().to_string());
        }

        let mut credentials_imported = 0usize;
        let now = Utc::now().to_rfc3339();
        for exported in &document.servers {
            let new_id = server_id_map[&exported.id].clone();
            let credential_reference = if let Some(secret) = &exported.secret {
                let account = format!("{new_id}:{}", exported.authentication_type.as_str());
                KeychainService::set_secret(&account, secret)?;
                credentials_imported += 1;
                Some(KeychainService::reference_for(&account))
            } else {
                None
            };
            let server = Server {
                id: new_id,
                name: exported.name.clone(),
                description: exported.description.clone(),
                hostname: exported.hostname.clone(),
                port: exported.port,
                protocol: exported.protocol,
                username: exported.username.clone(),
                authentication_type: exported.authentication_type,
                credential_reference,
                private_key_path: exported.private_key_path.clone(),
                group_id: exported
                    .group_id
                    .as_ref()
                    .and_then(|old| group_id_map.get(old).cloned()),
                jump_server_id: exported
                    .jump_server_id
                    .as_ref()
                    .and_then(|old| server_id_map.get(old).cloned()),
                working_directory: exported.working_directory.clone(),
                terminal_profile_id: exported.terminal_profile_id.clone(),
                is_favorite: exported.is_favorite,
                tag_ids: exported
                    .tag_ids
                    .iter()
                    .filter_map(|old| tag_id_map.get(old).cloned())
                    .collect(),
                custom_command: exported.custom_command.clone(),
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            ServerRepository::insert(conn, &server)?;
        }

        Ok(ImportSummary {
            servers_imported: document.servers.len(),
            groups_imported: document.groups.len(),
            tags_imported,
            credentials_imported,
        })
    }
}

fn derive_key(passphrase: &str, salt: &[u8]) -> AppResult<[u8; 32]> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| AppError::Crypto(e.to_string()))?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::{ConnectionService, GroupService, TagService};
    use crate::domain::{AuthType, Protocol, ServerGroupInput, ServerInput};
    use crate::infrastructure::database::test_support::open_in_memory;

    fn seed(conn: &Connection) -> String {
        let group = GroupService::create(
            conn,
            ServerGroupInput {
                parent_id: None,
                name: "Production".to_string(),
                description: None,
                sort_order: 0,
            },
        )
        .unwrap();
        let tag = TagService::create(conn, "prod".to_string()).unwrap();
        let server = ConnectionService::create(
            conn,
            ServerInput {
                name: "Web01".to_string(),
                description: None,
                hostname: "web01.example.test".to_string(),
                port: 22,
                protocol: Protocol::Ssh,
                username: Some("deploy".to_string()),
                authentication_type: AuthType::Password,
                secret: Some("hunter2".to_string()),
                private_key_path: None,
                group_id: Some(group.id.clone()),
                jump_server_id: None,
                working_directory: None,
                terminal_profile_id: None,
                is_favorite: true,
                tag_ids: vec![tag.id.clone()],
                custom_command: None,
            },
        )
        .unwrap();
        server.id
    }

    #[test]
    fn export_then_import_with_credentials_round_trips_into_a_fresh_database() {
        let source = open_in_memory();
        seed(&source);

        let bytes = ExportImportService::export(&source, true, "backup-passphrase").unwrap();

        let dest = open_in_memory();
        let summary = ExportImportService::import(&dest, &bytes, "backup-passphrase").unwrap();
        assert_eq!(summary.servers_imported, 1);
        assert_eq!(summary.groups_imported, 1);
        assert_eq!(summary.tags_imported, 1);
        assert_eq!(summary.credentials_imported, 1);

        let servers = ConnectionService::list(&dest).unwrap();
        assert_eq!(servers.len(), 1);
        let imported = &servers[0];
        assert_eq!(imported.name, "Web01");
        assert_eq!(imported.tag_ids.len(), 1);
        assert!(imported.group_id.is_some());
        assert_eq!(
            ConnectionService::reveal_credential(&dest, &imported.id).unwrap(),
            "hunter2"
        );
    }

    #[test]
    fn export_without_credentials_does_not_leak_the_secret() {
        let source = open_in_memory();
        seed(&source);

        let bytes = ExportImportService::export(&source, false, "backup-passphrase").unwrap();
        assert!(
            !bytes.windows(b"hunter2".len()).any(|w| w == b"hunter2"),
            "ciphertext should never contain the plaintext secret"
        );

        let dest = open_in_memory();
        let summary = ExportImportService::import(&dest, &bytes, "backup-passphrase").unwrap();
        assert_eq!(summary.credentials_imported, 0);

        let imported = &ConnectionService::list(&dest).unwrap()[0];
        assert!(imported.credential_reference.is_none());
    }

    #[test]
    fn wrong_passphrase_fails_to_decrypt() {
        let source = open_in_memory();
        seed(&source);
        let bytes = ExportImportService::export(&source, true, "right-passphrase").unwrap();

        let dest = open_in_memory();
        let result = ExportImportService::import(&dest, &bytes, "wrong-passphrase");
        assert!(matches!(result, Err(AppError::Crypto(_))));
    }
}
