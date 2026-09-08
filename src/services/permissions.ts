import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";

export type ComputerAccessScope = "project" | "full";
export type TerminalAccess = "disabled" | "project" | "shell" | "admin";
export type TerminalShell = "automatic" | "cmd" | "powershell" | "bash" | "zsh";

export type NovaPermissions = {
  computerAccess: ComputerAccessScope;
  allowFileChanges: boolean;
  terminalAccess: TerminalAccess;
  terminalShell: TerminalShell;
  allowDestructiveActions: boolean;
  allowWebAccess: boolean;
};

export type ComputerRoot = { id: string; name: string; path: string };

const STORAGE_KEY = "novaai-code:permissions:v1";
const CHANGE_EVENT = "novaai-code:permissions-changed";

export const defaultNovaPermissions: NovaPermissions = {
  computerAccess: "project",
  allowFileChanges: true,
  terminalAccess: "project",
  terminalShell: "automatic",
  allowDestructiveActions: true,
  allowWebAccess: true,
};

let cachedRaw: string | null | undefined;
let cachedPermissions = defaultNovaPermissions;

export function getNovaPermissions(): NovaPermissions {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedPermissions;
  cachedRaw = raw;
  try {
    const saved = JSON.parse(raw ?? "{}") as Partial<NovaPermissions> & { allowCommands?: boolean };
    cachedPermissions = {
      computerAccess: saved.computerAccess === "full" ? "full" : "project",
      allowFileChanges: typeof saved.allowFileChanges === "boolean" ? saved.allowFileChanges : true,
      terminalAccess: ["disabled", "project", "shell", "admin"].includes(saved.terminalAccess ?? "") ? saved.terminalAccess! : saved.allowCommands === false ? "disabled" : "project",
      terminalShell: ["automatic", "cmd", "powershell", "bash", "zsh"].includes(saved.terminalShell ?? "") ? saved.terminalShell! : "automatic",
      allowDestructiveActions: typeof saved.allowDestructiveActions === "boolean" ? saved.allowDestructiveActions : true,
      allowWebAccess: typeof saved.allowWebAccess === "boolean" ? saved.allowWebAccess : true,
    };
  } catch {
    cachedPermissions = defaultNovaPermissions;
  }
  return cachedPermissions;
}

export function saveNovaPermissions(value: NovaPermissions) {
  const raw = JSON.stringify(value);
  localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedPermissions = value;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useNovaPermissions() {
  const permissions = useSyncExternalStore(
    (listener) => {
      window.addEventListener(CHANGE_EVENT, listener);
      window.addEventListener("storage", listener);
      return () => {
        window.removeEventListener(CHANGE_EVENT, listener);
        window.removeEventListener("storage", listener);
      };
    },
    getNovaPermissions,
    () => defaultNovaPermissions,
  );
  return { permissions, setPermissions: saveNovaPermissions };
}

export const computerAccess = {
  roots: () => invoke<ComputerRoot[]>("list_computer_roots"),
};
