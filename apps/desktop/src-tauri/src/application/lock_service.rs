use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rusqlite::Connection;

use crate::domain::{AppError, AppResult};
use crate::infrastructure::database::SettingsRepository;

const PASSPHRASE_HASH_KEY: &str = "lock_passphrase_hash";
const IDLE_TIMEOUT_KEY: &str = "idle_timeout_minutes";
const DEFAULT_IDLE_TIMEOUT_MINUTES: i64 = 15;

pub struct LockService;

impl LockService {
    pub fn has_passphrase(conn: &Connection) -> AppResult<bool> {
        Ok(SettingsRepository::get(conn, PASSPHRASE_HASH_KEY)?.is_some())
    }

    pub fn set_passphrase(conn: &Connection, passphrase: &str) -> AppResult<()> {
        if passphrase.is_empty() {
            return Err(AppError::Validation("passphrase must not be empty".into()));
        }
        let salt = SaltString::generate(&mut OsRng);
        let hash = Argon2::default()
            .hash_password(passphrase.as_bytes(), &salt)
            .map_err(|e| AppError::Crypto(e.to_string()))?
            .to_string();
        SettingsRepository::set(conn, PASSPHRASE_HASH_KEY, &hash)
    }

    pub fn clear_passphrase(conn: &Connection) -> AppResult<()> {
        SettingsRepository::delete(conn, PASSPHRASE_HASH_KEY)
    }

    pub fn verify_passphrase(conn: &Connection, passphrase: &str) -> AppResult<bool> {
        let Some(stored) = SettingsRepository::get(conn, PASSPHRASE_HASH_KEY)? else {
            return Err(AppError::NoPassphraseSet);
        };
        let parsed = PasswordHash::new(&stored).map_err(|e| AppError::Crypto(e.to_string()))?;
        Ok(Argon2::default()
            .verify_password(passphrase.as_bytes(), &parsed)
            .is_ok())
    }

    pub fn idle_timeout_minutes(conn: &Connection) -> AppResult<i64> {
        match SettingsRepository::get(conn, IDLE_TIMEOUT_KEY)? {
            Some(value) => Ok(value.parse().unwrap_or(DEFAULT_IDLE_TIMEOUT_MINUTES)),
            None => Ok(DEFAULT_IDLE_TIMEOUT_MINUTES),
        }
    }

    pub fn set_idle_timeout_minutes(conn: &Connection, minutes: i64) -> AppResult<()> {
        if minutes < 1 {
            return Err(AppError::Validation(
                "idle timeout must be at least 1 minute".into(),
            ));
        }
        SettingsRepository::set(conn, IDLE_TIMEOUT_KEY, &minutes.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::database::test_support::open_in_memory;

    #[test]
    fn passphrase_lifecycle() {
        let conn = open_in_memory();
        assert!(!LockService::has_passphrase(&conn).unwrap());

        LockService::set_passphrase(&conn, "correct horse battery staple").unwrap();
        assert!(LockService::has_passphrase(&conn).unwrap());
        assert!(LockService::verify_passphrase(&conn, "correct horse battery staple").unwrap());
        assert!(!LockService::verify_passphrase(&conn, "wrong guess").unwrap());

        LockService::clear_passphrase(&conn).unwrap();
        assert!(!LockService::has_passphrase(&conn).unwrap());
        assert!(matches!(
            LockService::verify_passphrase(&conn, "correct horse battery staple"),
            Err(AppError::NoPassphraseSet)
        ));
    }

    #[test]
    fn idle_timeout_defaults_and_updates() {
        let conn = open_in_memory();
        assert_eq!(LockService::idle_timeout_minutes(&conn).unwrap(), 15);

        LockService::set_idle_timeout_minutes(&conn, 30).unwrap();
        assert_eq!(LockService::idle_timeout_minutes(&conn).unwrap(), 30);

        assert!(LockService::set_idle_timeout_minutes(&conn, 0).is_err());
    }

    #[test]
    fn empty_passphrase_is_rejected() {
        let conn = open_in_memory();
        assert!(LockService::set_passphrase(&conn, "").is_err());
    }
}
