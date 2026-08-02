use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("migration error: {0}")]
    Migration(#[from] rusqlite_migration::Error),
    #[error("keychain error: {0}")]
    Keychain(String),
    #[error("{0} not found")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(String),
    #[error("application is locked")]
    Locked,
    #[error("incorrect passphrase")]
    IncorrectPassphrase,
    #[error("no lock passphrase has been set")]
    NoPassphraseSet,
    #[error("cryptography error: {0}")]
    Crypto(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("session error: {0}")]
    Session(String),
    #[error("ftp error: {0}")]
    Ftp(String),
}

// Tauri requires command error types to be `Serialize`; the frontend only ever
// sees the display message, never internal error details/backtraces.
impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
