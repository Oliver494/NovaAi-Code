import { FolderOpen, Search, X } from "lucide-react";
import { FormEvent, useEffect, useRef } from "react";
import { usePreferences } from "../services/preferences";

type Props = {
  path: string;
  busy: boolean;
  error: string | null;
  onPathChange: (value: string) => void;
  onBrowse: () => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ProjectFolderDialog({ path, busy, error, onPathChange, onBrowse, onConfirm, onCancel }: Props) {
  const { t } = usePreferences();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (path.trim()) onConfirm();
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
    <form className="dialog-card project-folder-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="project-folder-dialog-title">
      <div className="dialog-card__heading">
        <span className="dialog-card__icon"><FolderOpen size={18} /></span>
        <div><h2 id="project-folder-dialog-title">{t("Elegir proyecto", "Choose project")}</h2><p>{t("Una carpeta existente se abrirá como proyecto", "An existing folder will open as a project")}</p></div>
        <button className="icon-button" type="button" onClick={onCancel} disabled={busy} title={t("Cerrar", "Close")} aria-label={t("Cerrar", "Close")}><X size={16} strokeWidth={1.8} /></button>
      </div>
      <p className="project-folder-dialog__help">{t("Usa el selector del sistema o pega la ruta de una carpeta. Vareliox no crea ni modifica nada hasta que abras el proyecto.", "Use the system picker or paste a folder path. Vareliox does not create or modify anything until you open the project.")}</p>
      <label className="dialog-field">{t("Ruta de la carpeta", "Folder path")}<input ref={inputRef} value={path} onChange={(event) => onPathChange(event.target.value)} placeholder={t("Ejemplo: /home/kali/Proyectos/mi-app", "Example: /home/kali/Projects/my-app")} disabled={busy} spellCheck={false} /></label>
      <button className="project-folder-dialog__browse" type="button" onClick={onBrowse} disabled={busy}><Search size={15} />{t("Examinar carpetas", "Browse folders")}</button>
      <small className="project-folder-dialog__hint">{t("En Linux, selecciona la carpeta y pulsa “Abrir” en el selector. Si ese botón no aparece, copia la ruta y pégala arriba.", "On Linux, select the folder and press “Open” in the picker. If that button does not appear, copy the path and paste it above.")}</small>
      {error && <p className="dialog-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>{t("Cancelar", "Cancel")}</button>
        <button className="primary-button" type="submit" disabled={busy || !path.trim()}>{busy ? t("Abriendo…", "Opening…") : t("Abrir este proyecto", "Open this project")}</button>
      </div>
    </form>
  </div>;
}
