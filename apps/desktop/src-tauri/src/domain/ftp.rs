use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FtpEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    /// RFC 3339 timestamp, when the server reports one.
    pub modified: Option<String>,
}

/// Streamed from Rust over a Tauri Channel while an upload/download runs.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum FtpTransferEvent {
    Progress { transferred: u64, total: Option<u64> },
    Completed,
    Failed { message: String },
}
