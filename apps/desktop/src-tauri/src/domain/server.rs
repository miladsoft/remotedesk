use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use serde::{Deserialize, Serialize};

use super::error::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Protocol {
    Ssh,
    Sftp,
    Ftp,
    Rdp,
    Vnc,
    LocalShell,
    CustomCommand,
}

impl Protocol {
    pub fn as_str(&self) -> &'static str {
        match self {
            Protocol::Ssh => "ssh",
            Protocol::Sftp => "sftp",
            Protocol::Ftp => "ftp",
            Protocol::Rdp => "rdp",
            Protocol::Vnc => "vnc",
            Protocol::LocalShell => "local_shell",
            Protocol::CustomCommand => "custom_command",
        }
    }

    pub fn parse(value: &str) -> Result<Self, AppError> {
        match value {
            "ssh" => Ok(Protocol::Ssh),
            "sftp" => Ok(Protocol::Sftp),
            "ftp" => Ok(Protocol::Ftp),
            "rdp" => Ok(Protocol::Rdp),
            "vnc" => Ok(Protocol::Vnc),
            "local_shell" => Ok(Protocol::LocalShell),
            "custom_command" => Ok(Protocol::CustomCommand),
            other => Err(AppError::Validation(format!("unknown protocol '{other}'"))),
        }
    }
}

impl ToSql for Protocol {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

impl FromSql for Protocol {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let text = value.as_str()?;
        Protocol::parse(text).map_err(|e| FromSqlError::Other(Box::new(e)))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthType {
    Password,
    PrivateKey,
    Agent,
}

impl AuthType {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuthType::Password => "password",
            AuthType::PrivateKey => "private_key",
            AuthType::Agent => "agent",
        }
    }

    pub fn parse(value: &str) -> Result<Self, AppError> {
        match value {
            "password" => Ok(AuthType::Password),
            "private_key" => Ok(AuthType::PrivateKey),
            "agent" => Ok(AuthType::Agent),
            other => Err(AppError::Validation(format!(
                "unknown authentication type '{other}'"
            ))),
        }
    }

    /// Whether this auth type expects a secret (password/passphrase) to be
    /// stored in the OS keychain.
    pub fn expects_secret(&self) -> bool {
        matches!(self, AuthType::Password | AuthType::PrivateKey)
    }
}

impl ToSql for AuthType {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

impl FromSql for AuthType {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let text = value.as_str()?;
        AuthType::parse(text).map_err(|e| FromSqlError::Other(Box::new(e)))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub hostname: String,
    pub port: i64,
    pub protocol: Protocol,
    pub username: Option<String>,
    pub authentication_type: AuthType,
    pub credential_reference: Option<String>,
    pub private_key_path: Option<String>,
    pub group_id: Option<String>,
    pub jump_server_id: Option<String>,
    pub working_directory: Option<String>,
    pub terminal_profile_id: Option<String>,
    pub is_favorite: bool,
    pub tag_ids: Vec<String>,
    /// Shell command line to run for `Protocol::CustomCommand` servers.
    pub custom_command: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Payload received from the frontend when creating/updating a server.
/// `secret` is transient: it is written straight to the OS keychain and
/// zeroized, never persisted in the database.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInput {
    pub name: String,
    pub description: Option<String>,
    pub hostname: String,
    pub port: i64,
    pub protocol: Protocol,
    pub username: Option<String>,
    pub authentication_type: AuthType,
    pub secret: Option<String>,
    pub private_key_path: Option<String>,
    pub group_id: Option<String>,
    pub jump_server_id: Option<String>,
    pub working_directory: Option<String>,
    pub terminal_profile_id: Option<String>,
    pub is_favorite: bool,
    pub tag_ids: Vec<String>,
    pub custom_command: Option<String>,
}
