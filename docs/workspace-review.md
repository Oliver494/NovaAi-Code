# Workspace, terminal and web review

## Changes

- Shared neutral controls and consistent sizing across chat, settings, providers and update panels. Terminal surfaces follow the selected theme. The duplicated header permission selector is hidden; the composer retains it. Compact settings navigation has accessible names and tooltips.
- Docked command runner with copy, clear, stop, history, visible working directory and exit status. Hiding it preserves the session; switching its chat/project cancels the old session. This is a command runner, not an interactive PTY: shell state does not persist between commands.
- Commands now drain output before finishing, preserve UTF-8 across chunks, release failed starts, terminate process trees on cancellation, and emit a timeout error without a subsequent success event. Empty optional shell fields fall back to the supplied executable. Explicit full-shell permission allows direct executables; project mode keeps its allowlist.
- PowerShell uses UTF-8 and propagates native exit codes. Command failures and interpretation errors no longer mark an agent task successful. Diagnostics are stored by conversation. Completed command output remains inspectable.
- Public links can be read directly. Web search enriches its first two sources with page text, retains search snippets when reading fails, and passes explicit untrusted-source instructions to the model. Direct read failures are visible. Cancelling during web preparation prevents a late search result from starting generation.
- Release URL validation accepts GitHub repository casing. Linux no longer offers Windows-only integrated installation. The button says “Download and install”; restarting is not promised.

## Verification

Windows: frontend suites, TypeScript/Vite build, Rust tests, formatting and secret scan. Rust integration cases execute actual commands with spaced working directories, stderr/nonzero exit, failed spawn, timeout, cancellation followed by another command, and a detected npm project check. Existing tests exercise real system storage inspection and project/conversation isolation.

Explicit internet checks passed for public-page reading and a weather search for Torre de la Sal. These test retrieval, not the accuracy of every model's final answer. Run separately with `cargo test --manifest-path src-tauri/Cargo.toml live_ -- --ignored --nocapture`.

Visual inspection: settings and the real terminal component in a narrow browser viewport; terminal checked in light and dark themes. `tests/visual-terminal.html` is a development-only fixture with IPC mocked to reject execution. It is not a desktop execution test.

## Limits

- Linux desktop and Kali VM visual behavior require testing on those systems; a Windows browser preview is not that test. GitHub CI also runs the Rust suite on Ubuntu.
- Interactive input, persistent shell sessions, and automatic UAC/sudo elevation are not implemented by this runner. The existing administrator permission option does not itself elevate a process.
- Websites requiring login, JavaScript, or presenting access restrictions may not yield readable content. Search access can be rate-limited. No guarantee is made for every provider/model's interpretation.
- This source update does not replace an already-installed release.
