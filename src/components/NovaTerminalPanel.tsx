import { Copy, ChevronDown, Play, Square, Terminal, Trash2, X } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { usePreferences } from "../services/preferences";
import { agent } from "../services/agent";
import { useNovaPermissions } from "../services/permissions";
import type { AgentCommandEvent } from "../types";

type Props = { root: string; projectName: string; onClose: () => void };

export function NovaTerminalPanel({ root, projectName, onClose }: Props) {
  const { permissions } = useNovaPermissions();
  const { t } = usePreferences();
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("Listo");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [height, setHeight] = useState(330);
  const activeRequest = useRef<string | null>(null);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(0);
  useEffect(() => () => { const id = activeRequest.current; activeRequest.current = null; if (id) void agent.cancel(id).catch(() => undefined); }, []);
  const outputRef = useRef<HTMLPreElement>(null);
  const followOutput = useRef(true);
  const shellEnabled = permissions.terminalAccess === "shell" || permissions.terminalAccess === "admin";

  useEffect(() => {
    const pane = outputRef.current;
    if (pane && followOutput.current) pane.scrollTop = pane.scrollHeight;
  }, [output]);

  function resize(event: ReactPointerEvent<HTMLDivElement>) {
    const startY = event.clientY;
    const startHeight = height;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => setHeight(Math.max(210, Math.min(620, startHeight + startY - moveEvent.clientY)));
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
  }

  async function run() {
    const value = command.trim();
    if (!value || activeRequest.current || !shellEnabled) return;
    const id = crypto.randomUUID();
    activeRequest.current = id;
    history.current.push(value); historyIndex.current = history.current.length;
    setCommand("");
    setRequestId(id); setBusy(true); setOutput((current) => `${current}${current && !current.endsWith("\n") ? "\n" : ""}$ ${value}\n`); setStatus(t("Ejecutando…", "Running…")); followOutput.current = true;
    try {
      await agent.runCommand({ requestId: id, root, cwd: "", program: "", args: [], command: value, terminalMode: permissions.terminalAccess, shell: permissions.terminalShell, timeoutSecs: 900 }, (event: AgentCommandEvent) => {
        if (activeRequest.current !== id) return;
        if (event.type === "output") setOutput((current) => `${current}${event.stream === "stderr" ? "[stderr] " : ""}${event.text}`.slice(-524288));
        if (event.type === "finished") setStatus(`Código de salida: ${event.exitCode ?? "?"} · ${(event.durationMs / 1000).toFixed(1)} s${event.truncated ? " · Salida truncada" : ""}`);
        if (event.type === "cancelled") setStatus(t("Proceso detenido", "Process stopped"));
        if (event.type === "error") { setStatus(event.explanation); setOutput((current) => `${current}\n[Error] ${event.explanation}\n`); }
      });
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { if (activeRequest.current === id) { activeRequest.current = null; setBusy(false); setRequestId(null); } }
  }

  async function stop() { if (requestId) await agent.cancel(requestId); }

  return <section className="nova-terminal-dock" role="region" aria-label="Terminal Nova" style={{ height }}>
    <div className="nova-terminal-resize" onPointerDown={resize} title="Arrastra para cambiar la altura" />
    <header><div><Terminal size={16} /><span><strong>{permissions.terminalShell === "automatic" ? (/Windows/i.test(navigator.userAgent) ? "PowerShell" : "Bash") : permissions.terminalShell}</strong><small>{projectName} · {root}</small></span></div><div className="nova-terminal-tools"><button className="icon-button" disabled={!output} onClick={() => void navigator.clipboard.writeText(output).then(() => setStatus("Copiado")).catch(() => setStatus("No se pudo copiar"))} aria-label={t("Copiar salida", "Copy output")} title={t("Copiar salida", "Copy output")}><Copy size={14} /></button><button className="icon-button" onClick={() => setOutput("")} aria-label={t("Limpiar terminal", "Clear terminal")} title={t("Limpiar salida", "Clear output")}><Trash2 size={14} /></button><button className="icon-button" onClick={() => { const pane = outputRef.current; if (pane) { followOutput.current = true; pane.scrollTop = pane.scrollHeight; } }} aria-label={t("Ir al final", "Scroll to bottom")} title={t("Ir al final", "Scroll to bottom")}><ChevronDown size={16} /></button><button className="icon-button" onClick={onClose} aria-label={t("Cerrar terminal", "Close terminal")} title={t("Cerrar terminal", "Close terminal")}><X size={16} /></button></div></header>
    {!shellEnabled ? <div className="nova-terminal-warning">Para ejecutar comandos aquí, ve a Configuración → Terminal y selecciona <strong>Terminal del usuario</strong>.</div> : <><pre ref={outputRef} className="nova-terminal-output" aria-live="polite" onScroll={(event) => { const pane = event.currentTarget; followOutput.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 24; }}>{output ? output.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").split(/(?<=\n)/).map((line, index) => <span key={index} className={line.startsWith("[stderr]") || line.startsWith("[Error]") ? "terminal-error" : line.startsWith("$ ") ? "terminal-command" : undefined}>{line}</span>) : t("Cada comando empieza en la carpeta indicada. No admite programas interactivos.", "Each command starts in the shown folder. Interactive programs are not supported.")}</pre><div className="nova-terminal-input"><span>{">"}</span><textarea value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void run(); } if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); historyIndex.current = Math.max(0, Math.min(history.current.length, historyIndex.current + (event.key === "ArrowUp" ? -1 : 1))); setCommand(history.current[historyIndex.current] ?? ""); } }} aria-label={t("Comando", "Command")} placeholder={t("Escribe un comando…", "Type a command…")} disabled={busy} rows={1} /><button className="secondary-button" onClick={() => void run()} disabled={!command.trim() || busy}><Play size={13} />{t("Ejecutar", "Run")}</button></div><footer><span>{status}</span>{busy && <button className="secondary-button" onClick={() => void stop()}><Square size={12} fill="currentColor" />{t("Detener", "Stop")}</button>}<small>Enter · Shift+Enter · ↑ ↓</small></footer></>}
    </section>
  ;
}
