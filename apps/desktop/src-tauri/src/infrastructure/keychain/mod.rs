use zeroize::Zeroizing;

use crate::domain::{AppError, AppResult};

const CREDENTIAL_PREFIX: &str = "keychain:";

#[cfg(not(test))]
const SERVICE: &str = "com.miladsoft.remotedesk";

pub struct KeychainService;

impl KeychainService {
    /// Builds the `credential_reference` string stored in the database for a
    /// given keychain account. Never contains the secret itself.
    pub fn reference_for(account: &str) -> String {
        format!("{CREDENTIAL_PREFIX}{account}")
    }

    pub fn account_from_reference(reference: &str) -> Option<&str> {
        reference.strip_prefix(CREDENTIAL_PREFIX)
    }

    #[cfg(not(test))]
    pub fn set_secret(account: &str, secret: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(SERVICE, account)
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        entry
            .set_password(secret)
            .map_err(|e| AppError::Keychain(e.to_string()))
    }

    #[cfg(not(test))]
    pub fn get_secret(account: &str) -> AppResult<Zeroizing<String>> {
        let entry = keyring::Entry::new(SERVICE, account)
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        let secret = entry
            .get_password()
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        Ok(Zeroizing::new(secret))
    }

    #[cfg(not(test))]
    pub fn delete_secret(account: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(SERVICE, account)
            .map_err(|e| AppError::Keychain(e.to_string()))?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::Keychain(e.to_string())),
        }
    }

    // The `keyring` crate's own mock backend hands out a brand new, blank
    // in-memory credential on every `Entry::new(..)` call with no sharing
    // keyed by service/account (unlike every real OS keychain), so it can't
    // stand in for a store that's set and read via separate calls the way
    // this service is used. Tests get a tiny process-wide stand-in instead,
    // keyed by account, so the full create/reveal/delete flow is exercised
    // without ever touching the real OS keychain.
    #[cfg(test)]
    pub fn set_secret(account: &str, secret: &str) -> AppResult<()> {
        test_store::set(account, secret);
        Ok(())
    }

    #[cfg(test)]
    pub fn get_secret(account: &str) -> AppResult<Zeroizing<String>> {
        test_store::get(account)
            .map(Zeroizing::new)
            .ok_or_else(|| AppError::Keychain("No matching entry found in secure storage".into()))
    }

    #[cfg(test)]
    pub fn delete_secret(account: &str) -> AppResult<()> {
        test_store::delete(account);
        Ok(())
    }
}

#[cfg(test)]
mod test_store {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};

    fn store() -> &'static Mutex<HashMap<String, String>> {
        static STORE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
        STORE.get_or_init(|| Mutex::new(HashMap::new()))
    }

    pub fn set(account: &str, secret: &str) {
        store()
            .lock()
            .expect("test keychain store poisoned")
            .insert(account.to_string(), secret.to_string());
    }

    pub fn get(account: &str) -> Option<String> {
        store()
            .lock()
            .expect("test keychain store poisoned")
            .get(account)
            .cloned()
    }

    pub fn delete(account: &str) {
        store()
            .lock()
            .expect("test keychain store poisoned")
            .remove(account);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_a_secret_through_the_test_store() {
        let account = "test-account:round-trip";
        KeychainService::set_secret(account, "hunter2").unwrap();
        let secret = KeychainService::get_secret(account).unwrap();
        assert_eq!(secret.as_str(), "hunter2");
        KeychainService::delete_secret(account).unwrap();
        assert!(KeychainService::get_secret(account).is_err());
    }

    #[test]
    fn reference_round_trips_the_account_name() {
        let reference = KeychainService::reference_for("abc:password");
        assert_eq!(reference, "keychain:abc:password");
        assert_eq!(
            KeychainService::account_from_reference(&reference),
            Some("abc:password")
        );
    }
}
