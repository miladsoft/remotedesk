mod group_repo;
mod server_repo;
mod settings_repo;
mod tag_repo;

pub use group_repo::GroupRepository;
pub use server_repo::ServerRepository;
pub use settings_repo::SettingsRepository;
pub use tag_repo::TagRepository;

use std::path::Path;

use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

use crate::domain::AppResult;

fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(include_str!("../../../migrations/0001_init.sql")),
        M::up(include_str!("../../../migrations/0002_custom_command.sql")),
    ])
}

/// Opens (creating if needed) the SQLite database at `path` and brings it up
/// to the latest schema version.
pub fn open(path: &Path) -> AppResult<Connection> {
    let mut conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", true)?;
    migrations().to_latest(&mut conn)?;
    Ok(conn)
}

#[cfg(test)]
pub mod test_support {
    use rusqlite::Connection;

    pub fn open_in_memory() -> Connection {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", true)
            .expect("enable foreign keys");
        super::migrations()
            .to_latest(&mut conn)
            .expect("run migrations");
        conn
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_creates_schema_on_a_real_file() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("servers.db");

        let conn = open(&path).expect("open db");
        let table_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'servers'",
                [],
                |row| row.get(0),
            )
            .expect("query sqlite_master");
        assert_eq!(table_count, 1);
    }
}
