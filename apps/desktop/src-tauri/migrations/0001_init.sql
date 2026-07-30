PRAGMA foreign_keys = ON;

CREATE TABLE server_groups (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES server_groups(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    hostname TEXT NOT NULL,
    port INTEGER NOT NULL,
    protocol TEXT NOT NULL,
    username TEXT,
    authentication_type TEXT NOT NULL,
    credential_reference TEXT,
    private_key_path TEXT,
    group_id TEXT REFERENCES server_groups(id) ON DELETE SET NULL,
    jump_server_id TEXT REFERENCES servers(id) ON DELETE SET NULL,
    working_directory TEXT,
    terminal_profile_id TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE server_tags (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (server_id, tag_id)
);

CREATE TABLE connection_history (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    protocol TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL,
    error_summary TEXT
);

-- Key/value settings store (lock passphrase hash, idle timeout, etc).
-- Not in the original AGENTS.md table listing, but implied by the "Settings"
-- box in the architecture diagram's SQLCipher database.
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX idx_servers_group_id ON servers(group_id);
CREATE INDEX idx_servers_name ON servers(name);
CREATE INDEX idx_server_groups_parent_id ON server_groups(parent_id);
CREATE INDEX idx_connection_history_server_id ON connection_history(server_id);
