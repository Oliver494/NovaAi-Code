// Development-only visual fixture. Real command execution is tested in Rust.
import React from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { PreferencesProvider, usePreferences } from "../src/services/preferences";
import { NovaTerminalPanel } from "../src/components/NovaTerminalPanel";
import "../src/App.css";
import "../src/workspace-polish.css";

mockIPC(() => { throw new Error("Visual fixture: commands are disabled"); });
// This browser-only fixture has no connection to the desktop permission store.
localStorage.setItem("novaai-code:permissions:v1", JSON.stringify({ terminalAccess: "shell", terminalShell: "automatic" }));
function Preview() {
  const { setTheme } = usePreferences();
  return <main style={{ width: "100%", maxWidth: 1100, margin: "20px auto", padding: 16 }}>
    <h2>Nova · Terminal</h2><p>Visual fixture — no commands execute.</p>
    <div style={{ display: "flex", gap: 10, marginBottom: 20 }}><button onClick={() => setTheme("light")}>Claro</button><button onClick={() => setTheme("dark")}>Oscuro</button></div>
    <NovaTerminalPanel root="C:\\Projects\\Project with spaces" projectName="Project with spaces" onClose={() => undefined} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<PreferencesProvider><Preview /></PreferencesProvider>);
