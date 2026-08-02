use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};

use crate::domain::{AppError, AppResult, LocalEntry, LocalListing};

pub struct LocalFsService;

impl LocalFsService {
    /// Lists `path`, falling back to `home` when no path is given (initial
    /// load of the local pane).
    pub fn list_dir(path: Option<String>, home: &Path) -> AppResult<LocalListing> {
        let dir = match path {
            Some(p) if !p.trim().is_empty() => PathBuf::from(p),
            _ => home.to_path_buf(),
        };

        let mut entries = Vec::new();
        for entry in fs::read_dir(&dir).map_err(AppError::Io)? {
            let entry = entry.map_err(AppError::Io)?;
            let metadata = entry.metadata().map_err(AppError::Io)?;
            entries.push(LocalEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                is_dir: metadata.is_dir(),
                size: metadata.len(),
                modified: metadata
                    .modified()
                    .ok()
                    .map(|t| DateTime::<Utc>::from(t).to_rfc3339()),
            });
        }
        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        let parent = dir.parent().map(|p| p.to_string_lossy().into_owned());
        Ok(LocalListing {
            path: dir.to_string_lossy().into_owned(),
            parent,
            entries,
        })
    }

    pub fn mkdir(path: &str) -> AppResult<()> {
        fs::create_dir(path).map_err(AppError::Io)
    }

    pub fn delete(path: &str, is_dir: bool) -> AppResult<()> {
        if is_dir {
            fs::remove_dir_all(path).map_err(AppError::Io)
        } else {
            fs::remove_file(path).map_err(AppError::Io)
        }
    }

    pub fn rename(from: &str, to: &str) -> AppResult<()> {
        fs::rename(from, to).map_err(AppError::Io)
    }
}
