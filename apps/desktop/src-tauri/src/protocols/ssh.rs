use rusqlite::Connection;

use crate::domain::{AppError, AppResult, AuthType, Server};
use crate::infrastructure::database::ServerRepository;

const MAX_JUMP_DEPTH: usize = 8;

/// Builds the argv (everything after the program name) for the `ssh`
/// process. Never includes a secret — passwords/passphrases are injected
/// directly into the pty once a prompt is observed, never via argv or env
/// (see `infrastructure::pty`).
pub fn build_args(server: &Server, jump_chain: &[String]) -> Vec<String> {
    let mut args = vec!["-p".to_string(), server.port.to_string()];

    if server.authentication_type == AuthType::PrivateKey {
        if let Some(path) = &server.private_key_path {
            if !path.trim().is_empty() {
                args.push("-i".to_string());
                args.push(path.clone());
            }
        }
    }

    if !jump_chain.is_empty() {
        args.push("-J".to_string());
        args.push(jump_chain.join(","));
    }

    // Sensible fixed defaults for the "keepalive" / "connection timeout"
    // checklist items. Never StrictHostKeyChecking=no: host-key prompts and
    // fingerprint-change warnings must reach the user via the terminal.
    args.push("-o".to_string());
    args.push("ServerAliveInterval=30".to_string());
    args.push("-o".to_string());
    args.push("ServerAliveCountMax=3".to_string());
    args.push("-o".to_string());
    args.push("ConnectTimeout=10".to_string());

    args.push(target_spec(server));
    args
}

fn target_spec(server: &Server) -> String {
    match server.username.as_deref() {
        Some(user) if !user.trim().is_empty() => format!("{user}@{}", server.hostname),
        _ => server.hostname.clone(),
    }
}

/// Walks `jump_server_id` links from `server` outward, returning hops
/// ordered for OpenSSH's `-J host1,host2,...` (closest to the client first,
/// closest to the destination last). Guards against cycles/excessive depth.
pub fn resolve_jump_chain(conn: &Connection, server: &Server) -> AppResult<Vec<String>> {
    let mut chain = Vec::new();
    let mut current = server.jump_server_id.clone();
    let mut depth = 0;

    while let Some(id) = current {
        if depth >= MAX_JUMP_DEPTH {
            return Err(AppError::Validation(
                "jump server chain is too deep (possible cycle)".into(),
            ));
        }
        let hop = ServerRepository::get(conn, &id)?;
        chain.push(target_spec_with_port(&hop));
        current = hop.jump_server_id.clone();
        depth += 1;
    }

    chain.reverse();
    Ok(chain)
}

fn target_spec_with_port(server: &Server) -> String {
    format!("{}:{}", target_spec(server), server.port)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Protocol;
    use crate::infrastructure::database::test_support::open_in_memory;
    use crate::infrastructure::database::ServerRepository;

    fn base_server(id: &str) -> Server {
        Server {
            id: id.to_string(),
            name: id.to_string(),
            description: None,
            hostname: format!("{id}.example.test"),
            port: 22,
            protocol: Protocol::Ssh,
            username: Some("root".to_string()),
            authentication_type: AuthType::Agent,
            credential_reference: None,
            private_key_path: None,
            group_id: None,
            jump_server_id: None,
            working_directory: None,
            terminal_profile_id: None,
            is_favorite: false,
            tag_ids: Vec::new(),
            custom_command: None,
            created_at: "now".into(),
            updated_at: "now".into(),
        }
    }

    #[test]
    fn builds_basic_args_without_a_jump_chain() {
        let server = base_server("target");
        let args = build_args(&server, &[]);
        assert_eq!(args[0], "-p");
        assert_eq!(args[1], "22");
        assert!(!args.iter().any(|a| a == "-J"));
        assert!(!args.iter().any(|a| a.contains("StrictHostKeyChecking")));
        assert_eq!(args.last().unwrap(), "root@target.example.test");
    }

    #[test]
    fn includes_private_key_path_only_for_private_key_auth() {
        let mut server = base_server("target");
        server.authentication_type = AuthType::PrivateKey;
        server.private_key_path = Some("/home/user/.ssh/id_ed25519".to_string());
        let args = build_args(&server, &[]);
        let idx = args.iter().position(|a| a == "-i").unwrap();
        assert_eq!(args[idx + 1], "/home/user/.ssh/id_ed25519");

        let agent_server = base_server("other");
        let agent_args = build_args(&agent_server, &[]);
        assert!(!agent_args.iter().any(|a| a == "-i"));
    }

    #[test]
    fn joins_a_jump_chain_into_a_single_dash_j_argument() {
        let server = base_server("target");
        let chain = vec!["jump1@a.test:22".to_string(), "jump2@b.test:22".to_string()];
        let args = build_args(&server, &chain);
        let idx = args.iter().position(|a| a == "-J").unwrap();
        assert_eq!(args[idx + 1], "jump1@a.test:22,jump2@b.test:22");
    }

    #[test]
    fn resolves_a_chain_of_jump_servers_outermost_first() {
        let conn = open_in_memory();
        let mut client_side = base_server("client-side-jump");
        client_side.jump_server_id = None;
        ServerRepository::insert(&conn, &client_side).unwrap();

        let mut dest_side = base_server("dest-side-jump");
        dest_side.jump_server_id = Some("client-side-jump".to_string());
        ServerRepository::insert(&conn, &dest_side).unwrap();

        let mut target = base_server("final-target");
        target.jump_server_id = Some("dest-side-jump".to_string());
        ServerRepository::insert(&conn, &target).unwrap();

        let chain = resolve_jump_chain(&conn, &target).unwrap();
        assert_eq!(
            chain,
            vec![
                "root@client-side-jump.example.test:22".to_string(),
                "root@dest-side-jump.example.test:22".to_string(),
            ]
        );
    }

    #[test]
    fn detects_cycles_instead_of_looping_forever() {
        let conn = open_in_memory();
        // Insert without jump references first (both must already exist to
        // satisfy the servers.jump_server_id foreign key), then update them
        // to point at each other, forming a cycle.
        ServerRepository::insert(&conn, &base_server("a")).unwrap();
        ServerRepository::insert(&conn, &base_server("b")).unwrap();

        let mut a = ServerRepository::get(&conn, "a").unwrap();
        a.jump_server_id = Some("b".to_string());
        ServerRepository::update(&conn, &a).unwrap();

        let mut b = ServerRepository::get(&conn, "b").unwrap();
        b.jump_server_id = Some("a".to_string());
        ServerRepository::update(&conn, &b).unwrap();

        let a = ServerRepository::get(&conn, "a").unwrap();
        assert!(resolve_jump_chain(&conn, &a).is_err());
    }
}
