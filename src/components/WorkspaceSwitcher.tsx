import { Bot, Code2, WandSparkles } from "lucide-react";
import type { AssistantWorkspace } from "../types";
import { usePreferences } from "../services/preferences";

type Props = { value: AssistantWorkspace; onChange: (value: AssistantWorkspace) => void };

export function WorkspaceSwitcher({ value, onChange }: Props) {
  const { t } = usePreferences();
  return <div className="workspace-switcher" aria-label={t("Cambiar espacio", "Switch workspace")}>
    <button type="button" className={value === "chat" ? "is-active" : ""} onClick={() => onChange("chat")} aria-pressed={value === "chat"}><Bot size={15} /><span><strong>NovaAI</strong><small>{t("Chat general", "General chat")}</small></span></button>
    <button type="button" className={value === "code" ? "is-active" : ""} onClick={() => onChange("code")} aria-pressed={value === "code"}><Code2 size={15} /><span><strong>NovaAI Code</strong><small>{t("Agente", "Agent")}</small></span></button>
    <button type="button" className={value === "media" ? "is-active" : ""} onClick={() => onChange("media")} aria-pressed={value === "media"}><WandSparkles size={15} /><span><strong>Nova Create</strong><small>{t("Imágenes y vídeo", "Images and video")}</small></span></button>
  </div>;
}
