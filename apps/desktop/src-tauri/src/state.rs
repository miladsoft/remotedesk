use std::sync::Mutex;

use rusqlite::Connection;

use crate::domain::{AppError, AppResult};

pub struct DbState(pub Mutex<Connection>);

/// In-memory lock flag. Locking is enforced here, server-side, rather than
/// only hidden in the UI, so a compromised/rebuilt frontend can't bypass it.
pub struct LockState(pub Mutex<bool>);

pub fn ensure_unlocked(lock: &LockState) -> AppResult<()> {
    let locked = *lock.0.lock().expect("lock state mutex poisoned");
    if locked {
        Err(AppError::Locked)
    } else {
        Ok(())
    }
}
