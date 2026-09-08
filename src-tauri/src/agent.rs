use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    time::{Duration, Instant},
};
use tauri::{ipc::Channel, State};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
    sync::{mpsc, Mutex},
};
use tokio_util::sync::CancellationToken;

const MAX_OUTPUT_BYTES: usize = 512 * 1024;
const MAX_COMMAND_SECS: u64 = 900;

pub struct AgentRuntime {
    active: Mutex<HashMap<String, CancellationToken>>,
}
impl Default for AgentRuntime {
    fn default() -> Self {
        Self {
            active: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolSpec {
    id: &'static str,
    description: &'static str,
    risk: &'static str,
    permission: &'static str,
    timeout_secs: u64,
    cancellable: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedCommand {
    id: String,
    label: String,
    program: String,
    args: Vec<String>,
    kind: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCommandRequest {
    request_id: String,
    root: String,
    cwd: String,
    program: String,
    args: Vec<String>,
    timeout_secs: u64,
    #[serde(default)]
    terminal_mode: String,
    #[serde(default)]
    shell: String,
    #[serde(default)]
    command: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "type"
)]
pub enum AgentCommandEvent {
    Started {
        command: String,
    },
    Output {
        stream: String,
        text: String,
    },
    Finished {
        exit_code: Option<i32>,
        duration_ms: u64,
        truncated: bool,
    },
    Cancelled,
    Error {
        code: String,
        title: String,
        explanation: String,
        action: String,
    },
}

#[tauri::command]
pub fn list_agent_tools() -> Vec<AgentToolSpec> {
    vec![
        AgentToolSpec {
            id: "list_directory",
            description: "Lista contenido dentro del proyecto",
            risk: "low",
            permission: "read",
            timeout_secs: 10,
            cancellable: false,
        },
        AgentToolSpec {
            id: "read_file",
            description: "Lee un archivo de texto seguro",
            risk: "low",
            permission: "read",
            timeout_secs: 10,
            cancellable: false,
        },
        AgentToolSpec {
            id: "search_text",
            description: "Busca texto en archivos del proyecto",
            risk: "low",
            permission: "read",
            timeout_secs: 30,
            cancellable: true,
        },
        AgentToolSpec {
            id: "write_file",
            description: "Crea o modifica un archivo mostrando diff",
            risk: "medium",
            permission: "write",
            timeout_secs: 10,
            cancellable: false,
        },
        AgentToolSpec {
            id: "delete_path",
            description: "Elimina un elemento tras aprobación explícita",
            risk: "high",
            permission: "destructive",
            timeout_secs: 10,
            cancellable: false,
        },
        AgentToolSpec {
            id: "run_command",
            description: "Ejecuta una herramienta permitida dentro del proyecto",
            risk: "medium",
            permission: "execute",
            timeout_secs: MAX_COMMAND_SECS,
            cancellable: true,
        },
        AgentToolSpec {
            id: "run_tests",
            description: "Ejecuta las pruebas detectadas del proyecto",
            risk: "medium",
            permission: "execute",
            timeout_secs: MAX_COMMAND_SECS,
            cancellable: true,
        },
        AgentToolSpec {
            id: "run_build",
            description: "Compila el proyecto con un comando detectado",
            risk: "medium",
            permission: "execute",
            timeout_secs: MAX_COMMAND_SECS,
            cancellable: true,
        },
    ]
}

fn canonical_root(value: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(value)
        .canonicalize()
        .map_err(|_| "La carpeta del proyecto no existe o no es accesible.".to_string())?;
    if !root.is_dir() {
        return Err("La ruta asignada no es una carpeta.".into());
    }
    Ok(root)
}

fn safe_cwd(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative);
    if relative.is_absolute()
        || relative.components().any(|part| {
            matches!(
                part,
                std::path::Component::ParentDir
                    | std::path::Component::Prefix(_)
                    | std::path::Component::RootDir
            )
        })
    {
        return Err("La carpeta de ejecución intenta salir del proyecto.".into());
    }
    let cwd = root
        .join(relative)
        .canonicalize()
        .map_err(|_| "La carpeta de ejecución no existe.".to_string())?;
    if !cwd.starts_with(root) || !cwd.is_dir() {
        return Err("La carpeta de ejecución está fuera del proyecto.".into());
    }
    Ok(cwd)
}

fn allowed_program(value: &str) -> Option<&'static str> {
    let name = value.trim().to_ascii_lowercase();
    match name.trim_end_matches(".exe").trim_end_matches(".cmd") {
        "npm" => Some(if cfg!(target_os = "windows") {
            "npm.cmd"
        } else {
            "npm"
        }),
        "npx" => Some(if cfg!(target_os = "windows") {
            "npx.cmd"
        } else {
            "npx"
        }),
        "pnpm" => Some(if cfg!(target_os = "windows") {
            "pnpm.cmd"
        } else {
            "pnpm"
        }),
        "yarn" => Some(if cfg!(target_os = "windows") {
            "yarn.cmd"
        } else {
            "yarn"
        }),
        "cargo" => Some("cargo"),
        "rustc" => Some("rustc"),
        "python" | "py" => Some(if cfg!(target_os = "windows") {
            "python"
        } else {
            "python3"
        }),
        "pytest" => Some("pytest"),
        "dotnet" => Some("dotnet"),
        "go" => Some("go"),
        "java" => Some("java"),
        "mvn" => Some(if cfg!(target_os = "windows") {
            "mvn.cmd"
        } else {
            "mvn"
        }),
        "gradle" => Some("gradle"),
        "git" => Some("git"),
        "systeminfo" if cfg!(target_os = "windows") => Some("systeminfo"),
        "wmic" if cfg!(target_os = "windows") => Some("wmic"),
        "df" if !cfg!(target_os = "windows") => Some("df"),
        "free" if !cfg!(target_os = "windows") => Some("free"),
        "uname" if !cfg!(target_os = "windows") => Some("uname"),
        "ls" if !cfg!(target_os = "windows") => Some("ls"),
        "pwd" if !cfg!(target_os = "windows") => Some("pwd"),
        "du" if !cfg!(target_os = "windows") => Some("du"),
        _ => None,
    }
}

fn validate_args(args: &[String]) -> Result<(), String> {
    if args.len() > 40
        || args.iter().any(|arg| {
            arg.len() > 500
                || arg.contains('\0')
                || ["&&", "||", ";", "`", "$(`", ">", "<"]
                    .iter()
                    .any(|token| arg.contains(token))
        })
    {
        return Err("El comando contiene operadores de shell o argumentos no seguros.".into());
    }
    let joined = args.join(" ").to_ascii_lowercase();
    let blocked = [
        "--global",
        " -g ",
        "install -g",
        "uninstall -g",
        "publish",
        "curl",
        "wget",
        "powershell",
        "cmd /c",
        "rm -rf",
        "rmdir /s",
        "format",
        "shutdown",
    ];
    if blocked.iter().any(|item| joined.contains(item)) {
        return Err("El comando intenta instalar globalmente, publicar, descargar scripts o modificar el sistema.".into());
    }
    Ok(())
}

fn shell_command(request: &AgentCommandRequest) -> Result<Option<(String, Vec<String>)>, String> {
    let Some(command) = request.command.as_deref() else {
        return Ok(None);
    };
    if !matches!(request.terminal_mode.as_str(), "shell" | "admin") {
        return Err("La terminal completa no está autorizada en Configuración > Terminal.".into());
    }
    if command.trim().is_empty() || command.len() > 8_000 || command.contains('\0') {
        return Err("El comando de terminal está vacío o es demasiado largo.".into());
    }
    let admin = request.terminal_mode == "admin";
    #[cfg(target_os = "windows")]
    {
        let selected = match request.shell.as_str() {
            "cmd" => "cmd",
            "powershell" | "automatic" | "" => "powershell",
            _ => return Err("Ese intérprete no está disponible en Windows.".into()),
        };
        if admin {
            use base64::{engine::general_purpose::STANDARD, Engine};
            let payload = if selected == "cmd" {
                format!("cmd.exe /D /S /C \"{}\"", command.replace('"', "\\\""))
            } else {
                command.to_string()
            };
            let utf16 = payload
                .encode_utf16()
                .flat_map(u16::to_le_bytes)
                .collect::<Vec<_>>();
            let encoded = STANDARD.encode(utf16);
            let elevation = format!("Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -ArgumentList '-NoProfile','-EncodedCommand','{}'", encoded);
            return Ok(Some((
                "powershell.exe".into(),
                vec![
                    "-NoLogo".into(),
                    "-NoProfile".into(),
                    "-NonInteractive".into(),
                    "-Command".into(),
                    elevation,
                ],
            )));
        }
        return Ok(Some(if selected == "cmd" {
            (
                "cmd.exe".into(),
                vec!["/D".into(), "/S".into(), "/C".into(), command.into()],
            )
        } else {
            (
                "powershell.exe".into(),
                vec![
                    "-NoLogo".into(),
                    "-NoProfile".into(),
                    "-NonInteractive".into(),
                    "-Command".into(),
                    command.into(),
                ],
            )
        }));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let shell = match request.shell.as_str() {
            "zsh" => "/bin/zsh",
            "bash" | "automatic" | "" => "/bin/bash",
            _ => return Err("Ese intérprete no está disponible en Linux.".into()),
        };
        if !Path::new(shell).is_file() {
            return Err(format!("No se encontró {shell} en este equipo."));
        }
        return Ok(Some(if admin {
            (
                "pkexec".into(),
                vec![shell.into(), "-lc".into(), command.into()],
            )
        } else {
            (shell.into(), vec!["-lc".into(), command.into()])
        }));
    }
}

#[tauri::command]
pub fn detect_project_commands(root: String) -> Result<Vec<DetectedCommand>, String> {
    let root = canonical_root(&root)?;
    let mut found = Vec::new();
    let mut add = |id: &str, label: &str, program: &str, args: &[&str], kind: &str| {
        found.push(DetectedCommand {
            id: id.into(),
            label: label.into(),
            program: program.into(),
            args: args.iter().map(|v| v.to_string()).collect(),
            kind: kind.into(),
        })
    };
    if root.join("package.json").is_file() {
        let value = std::fs::read_to_string(root.join("package.json"))
            .ok()
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
        let scripts = value
            .as_ref()
            .and_then(|v| v.get("scripts"))
            .and_then(|v| v.as_object());
        if scripts.is_some_and(|s| s.contains_key("test")) {
            add("npm-test", "Ejecutar pruebas", "npm", &["test"], "test");
        }
        if scripts.is_some_and(|s| s.contains_key("build")) {
            add(
                "npm-build",
                "Compilar proyecto",
                "npm",
                &["run", "build"],
                "build",
            );
        }
        if scripts.is_some_and(|s| s.contains_key("lint")) {
            add(
                "npm-lint",
                "Comprobar código",
                "npm",
                &["run", "lint"],
                "check",
            );
        }
    }
    if root.join("Cargo.toml").is_file() {
        add(
            "cargo-test",
            "Ejecutar pruebas Rust",
            "cargo",
            &["test"],
            "test",
        );
        add(
            "cargo-check",
            "Comprobar Rust",
            "cargo",
            &["check"],
            "check",
        );
        add("cargo-build", "Compilar Rust", "cargo", &["build"], "build");
    }
    if root.join("pyproject.toml").is_file()
        || root.join("pytest.ini").is_file()
        || root.join("tests").is_dir()
    {
        add(
            "pytest",
            "Ejecutar pruebas Python",
            "python",
            &["-m", "pytest"],
            "test",
        );
    }
    if root.join("go.mod").is_file() {
        add(
            "go-test",
            "Ejecutar pruebas Go",
            "go",
            &["test", "./..."],
            "test",
        );
        add(
            "go-build",
            "Compilar Go",
            "go",
            &["build", "./..."],
            "build",
        );
    }
    if std::fs::read_dir(&root).ok().is_some_and(|mut entries| {
        entries.any(|e| {
            e.ok()
                .is_some_and(|x| x.path().extension().is_some_and(|v| v == "sln"))
        })
    }) {
        add(
            "dotnet-test",
            "Ejecutar pruebas .NET",
            "dotnet",
            &["test"],
            "test",
        );
        add(
            "dotnet-build",
            "Compilar .NET",
            "dotnet",
            &["build"],
            "build",
        );
    }
    Ok(found)
}

#[tauri::command]
pub async fn run_agent_command(
    request: AgentCommandRequest,
    on_event: Channel<AgentCommandEvent>,
    runtime: State<'_, AgentRuntime>,
) -> Result<(), String> {
    if request.command.is_none() && request.program.eq_ignore_ascii_case("nova-system-info") {
        if request.terminal_mode == "disabled" {
            return Err("La terminal está desactivada en Configuración > Terminal.".into());
        }
        if request.request_id.trim().is_empty() {
            return Err("Falta el identificador del proceso.".into());
        }
        let started = Instant::now();
        let _ = on_event.send(AgentCommandEvent::Started {
            command: "nova-system-info".into(),
        });
        // System information is a Nova capability, not a shell process. It must
        // also work when the model supplies `/`, an absolute cwd, or no valid
        // project. Use the project only to select its disk when it is available.
        let storage_root = canonical_root(&request.root)
            .ok()
            .map(|path| path.to_string_lossy().to_string());
        let summary = crate::system::system_summary(storage_root).await?;
        let _ = on_event.send(AgentCommandEvent::Output {
            stream: "stdout".into(),
            text: format!("{summary}\n"),
        });
        let _ = on_event.send(AgentCommandEvent::Finished {
            exit_code: Some(0),
            duration_ms: started.elapsed().as_millis() as u64,
            truncated: false,
        });
        return Ok(());
    }
    let root = canonical_root(&request.root)?;
    let cwd = safe_cwd(&root, &request.cwd)?;
    let terminal = shell_command(&request)?;
    let (program, args) = if let Some(value) = terminal {
        value
    } else {
        if request.terminal_mode == "disabled" {
            return Err("La terminal está desactivada en Configuración > Terminal.".into());
        }
        validate_args(&request.args)?;
        let program = allowed_program(&request.program).ok_or_else(|| {
            "El programa solicitado no está en la lista segura de NovaAI Code.".to_string()
        })?;
        (program.to_string(), request.args.clone())
    };
    if request.request_id.trim().is_empty() {
        return Err("Falta el identificador del proceso.".into());
    }
    let timeout = request.timeout_secs.clamp(1, MAX_COMMAND_SECS);
    let token = CancellationToken::new();
    runtime
        .active
        .lock()
        .await
        .insert(request.request_id.clone(), token.clone());
    let display = request
        .command
        .clone()
        .unwrap_or_else(|| format!("{} {}", request.program, request.args.join(" ")))
        .trim()
        .to_string();
    let _ = on_event.send(AgentCommandEvent::Started { command: display });
    let started = Instant::now();
    let mut child = Command::new(program)
        .args(&args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("No se pudo iniciar el comando: {e}"))?;
    let (tx, mut rx) = mpsc::unbounded_channel::<(String, String)>();
    if let Some(pipe) = child.stdout.take() {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(pipe).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx.send(("stdout".into(), format!("{line}\n")));
            }
        });
    }
    if let Some(pipe) = child.stderr.take() {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(pipe).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx.send(("stderr".into(), format!("{line}\n")));
            }
        });
    }
    drop(tx);
    let mut output = 0usize;
    let mut truncated = false;
    let deadline = tokio::time::sleep(Duration::from_secs(timeout));
    tokio::pin!(deadline);
    let exit = loop {
        tokio::select! {
            _=token.cancelled()=>{ let _=child.kill().await; let _=on_event.send(AgentCommandEvent::Cancelled); break None; }
            _=&mut deadline=>{ let _=child.kill().await; let _=on_event.send(AgentCommandEvent::Error{code:"COMMAND_TIMEOUT".into(),title:"El comando tardó demasiado".into(),explanation:format!("Superó el límite de {timeout} segundos."),action:"Reduce la tarea o aumenta el límite permitido.".into()}); break None; }
            item=rx.recv()=>{ if let Some((stream,text))=item { if output < MAX_OUTPUT_BYTES { let remaining=MAX_OUTPUT_BYTES-output; let sent:String=text.chars().take(remaining).collect(); output+=sent.len(); let _=on_event.send(AgentCommandEvent::Output{stream,text:sent}); } else { truncated=true; } } }
            status=child.wait()=>{ break status.ok().and_then(|s|s.code()); }
        }
    };
    runtime.active.lock().await.remove(&request.request_id);
    if !token.is_cancelled() {
        let _ = on_event.send(AgentCommandEvent::Finished {
            exit_code: exit,
            duration_ms: started.elapsed().as_millis() as u64,
            truncated,
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn cancel_agent_command(
    request_id: String,
    runtime: State<'_, AgentRuntime>,
) -> Result<bool, String> {
    if let Some(token) = runtime.active.lock().await.get(&request_id) {
        token.cancel();
        Ok(true)
    } else {
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn terminal_request(mode: &str, command: Option<&str>) -> AgentCommandRequest {
        AgentCommandRequest {
            request_id: "test".into(),
            root: ".".into(),
            cwd: "".into(),
            program: "cargo".into(),
            args: vec!["check".into()],
            timeout_secs: 30,
            terminal_mode: mode.into(),
            shell: "automatic".into(),
            command: command.map(str::to_string),
        }
    }
    #[test]
    fn blocks_shell_and_system_commands() {
        assert!(allowed_program("powershell").is_none());
        assert!(validate_args(&["test".into(), "&&".into(), "format".into()]).is_err());
        assert!(validate_args(&["test".into()]).is_ok());
    }
    #[test]
    fn resolves_package_managers_for_the_current_platform() {
        let expected_npm = if cfg!(target_os = "windows") {
            "npm.cmd"
        } else {
            "npm"
        };
        let expected_python = if cfg!(target_os = "windows") {
            "python"
        } else {
            "python3"
        };
        assert_eq!(allowed_program("npm"), Some(expected_npm));
        assert_eq!(allowed_program("python"), Some(expected_python));
    }
    #[test]
    fn full_shell_requires_an_explicit_terminal_level() {
        assert!(shell_command(&terminal_request("project", Some("echo test"))).is_err());
        assert!(shell_command(&terminal_request("disabled", Some("echo test"))).is_err());
        assert!(shell_command(&terminal_request("shell", Some("echo test")))
            .unwrap()
            .is_some());
    }
    #[test]
    fn detects_project_commands_without_guessing() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(
            temp.path().join("package.json"),
            r#"{"scripts":{"test":"vitest","build":"vite build"}}"#,
        )
        .unwrap();
        let commands = detect_project_commands(temp.path().to_string_lossy().to_string()).unwrap();
        assert!(commands.iter().any(|c| c.id == "npm-test"));
        assert!(commands.iter().any(|c| c.id == "npm-build"));
    }
}
