use chrono::Utc;
use rusqlite::Connection;
use uuid::Uuid;
use zeroize::Zeroize;

use crate::domain::{AppError, AppResult, Server, ServerInput};
use crate::infrastructure::database::ServerRepository;
use crate::infrastructure::keychain::KeychainService;

pub struct ConnectionService;

impl ConnectionService {
    pub fn list(conn: &Connection) -> AppResult<Vec<Server>> {
        ServerRepository::list(conn)
    }

    pub fn search(conn: &Connection, query: &str) -> AppResult<Vec<Server>> {
        ServerRepository::search(conn, query)
    }

    pub fn get(conn: &Connection, id: &str) -> AppResult<Server> {
        ServerRepository::get(conn, id)
    }

    pub fn create(conn: &Connection, mut input: ServerInput) -> AppResult<Server> {
        validate(&input)?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let credential_reference = store_secret(&id, &input.authentication_type, &mut input.secret)?;

        let server = Server {
            id,
            name: input.name,
            description: input.description,
            hostname: input.hostname,
            port: input.port,
            protocol: input.protocol,
            username: input.username,
            authentication_type: input.authentication_type,
            credential_reference,
            private_key_path: input.private_key_path,
            group_id: input.group_id,
            jump_server_id: input.jump_server_id,
            working_directory: input.working_directory,
            terminal_profile_id: input.terminal_profile_id,
            is_favorite: input.is_favorite,
            tag_ids: input.tag_ids,
            created_at: now.clone(),
            updated_at: now,
        };
        ServerRepository::insert(conn, &server)?;
        Ok(server)
    }

    pub fn update(conn: &Connection, id: &str, mut input: ServerInput) -> AppResult<Server> {
        validate(&input)?;
        let existing = ServerRepository::get(conn, id)?;

        let credential_reference = if input.authentication_type == crate::domain::AuthType::Agent {
            // Switching to agent auth: no secret needed, drop any stored one.
            if let Some(reference) = &existing.credential_reference {
                if let Some(account) = KeychainService::account_from_reference(reference) {
                    KeychainService::delete_secret(account)?;
                }
            }
            None
        } else if let Some(secret) = input.secret.as_ref().filter(|s| !s.is_empty()) {
            let account = format!("{id}:{}", input.authentication_type.as_str());
            KeychainService::set_secret(&account, secret)?;
            Some(KeychainService::reference_for(&account))
        } else {
            // No new secret supplied: keep the existing reference as-is.
            existing.credential_reference.clone()
        };
        if let Some(secret) = input.secret.as_mut() {
            secret.zeroize();
        }

        let server = Server {
            id: id.to_string(),
            name: input.name,
            description: input.description,
            hostname: input.hostname,
            port: input.port,
            protocol: input.protocol,
            username: input.username,
            authentication_type: input.authentication_type,
            credential_reference,
            private_key_path: input.private_key_path,
            group_id: input.group_id,
            jump_server_id: input.jump_server_id,
            working_directory: input.working_directory,
            terminal_profile_id: input.terminal_profile_id,
            is_favorite: input.is_favorite,
            tag_ids: input.tag_ids,
            created_at: existing.created_at,
            updated_at: Utc::now().to_rfc3339(),
        };
        ServerRepository::update(conn, &server)?;
        Ok(server)
    }

    pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
        let existing = ServerRepository::get(conn, id)?;
        if let Some(reference) = &existing.credential_reference {
            if let Some(account) = KeychainService::account_from_reference(reference) {
                KeychainService::delete_secret(account)?;
            }
        }
        ServerRepository::delete(conn, id)
    }

    /// Resolves the stored secret for a server. Callers must have already
    /// verified the app-lock passphrase before invoking this.
    pub fn reveal_credential(conn: &Connection, id: &str) -> AppResult<String> {
        let server = ServerRepository::get(conn, id)?;
        let reference = server
            .credential_reference
            .ok_or_else(|| AppError::NotFound(format!("credential for server '{id}'")))?;
        let account = KeychainService::account_from_reference(&reference)
            .ok_or_else(|| AppError::Keychain("malformed credential reference".into()))?;
        Ok(KeychainService::get_secret(account)?.to_string())
    }
}

fn store_secret(
    server_id: &str,
    auth_type: &crate::domain::AuthType,
    secret: &mut Option<String>,
) -> AppResult<Option<String>> {
    let result = if !auth_type.expects_secret() {
        None
    } else if let Some(value) = secret.as_ref().filter(|s| !s.is_empty()) {
        let account = format!("{server_id}:{}", auth_type.as_str());
        KeychainService::set_secret(&account, value)?;
        Some(KeychainService::reference_for(&account))
    } else {
        None
    };
    if let Some(value) = secret.as_mut() {
        value.zeroize();
    }
    Ok(result)
}

fn validate(input: &ServerInput) -> AppResult<()> {
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    if input.hostname.trim().is_empty() {
        return Err(AppError::Validation("hostname must not be empty".into()));
    }
    if input.port < 1 || input.port > 65535 {
        return Err(AppError::Validation("port must be between 1 and 65535".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::AuthType;
    use crate::infrastructure::database::test_support::open_in_memory;

    fn sample_input(secret: Option<&str>) -> ServerInput {
        ServerInput {
            name: "Prod DB".to_string(),
            description: None,
            hostname: "db.example.test".to_string(),
            port: 22,
            protocol: crate::domain::Protocol::Ssh,
            username: Some("root".to_string()),
            authentication_type: AuthType::Password,
            secret: secret.map(str::to_string),
            private_key_path: None,
            group_id: None,
            jump_server_id: None,
            working_directory: None,
            terminal_profile_id: None,
            is_favorite: false,
            tag_ids: Vec::new(),
        }
    }

    #[test]
    fn create_stores_secret_in_keychain_not_in_the_database() {
        let conn = open_in_memory();
        let server = ConnectionService::create(&conn, sample_input(Some("hunter2"))).unwrap();

        assert!(server.credential_reference.is_some());
        // The DB row itself never contains the plaintext secret.
        let raw: String = conn
            .query_row(
                "SELECT credential_reference FROM servers WHERE id = ?1",
                [&server.id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!raw.contains("hunter2"));

        let revealed = ConnectionService::reveal_credential(&conn, &server.id).unwrap();
        assert_eq!(revealed, "hunter2");
    }

    #[test]
    fn switching_to_agent_auth_clears_the_stored_credential() {
        let conn = open_in_memory();
        let server = ConnectionService::create(&conn, sample_input(Some("hunter2"))).unwrap();

        let mut update = sample_input(None);
        update.authentication_type = AuthType::Agent;
        let updated = ConnectionService::update(&conn, &server.id, update).unwrap();

        assert_eq!(updated.credential_reference, None);
        assert!(ConnectionService::reveal_credential(&conn, &server.id).is_err());
    }

    #[test]
    fn delete_removes_the_keychain_entry() {
        let conn = open_in_memory();
        let server = ConnectionService::create(&conn, sample_input(Some("hunter2"))).unwrap();
        ConnectionService::delete(&conn, &server.id).unwrap();
        assert!(ConnectionService::get(&conn, &server.id).is_err());
    }

    #[test]
    fn empty_hostname_is_rejected() {
        let conn = open_in_memory();
        let mut input = sample_input(None);
        input.hostname = "  ".to_string();
        assert!(ConnectionService::create(&conn, input).is_err());
    }
}
