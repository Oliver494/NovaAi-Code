import { AlertTriangle, Check, FolderCode, Globe2, HardDrive, ShieldCheck, Trash2 } from "lucide-react";
import { useNovaPermissions, type NovaPermissions } from "../services/permissions";
import { usePreferences } from "../services/preferences";

type ToggleProps = {
  icon: typeof Globe2;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

function PermissionToggle({ icon: Icon, title, description, checked, disabled, onChange }: ToggleProps) {
  return <label className={`permission-toggle${disabled ? " is-disabled" : ""}`}>
    <span className="permission-toggle__icon"><Icon size={17} /></span>
    <span><strong>{title}</strong><small>{description}</small></span>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    <i aria-hidden="true" />
  </label>;
}

export function PermissionsPanel() {
  const { permissions, setPermissions } = useNovaPermissions();
  const { t } = usePreferences();
  const update = <K extends keyof NovaPermissions>(key: K, value: NovaPermissions[K]) => setPermissions({ ...permissions, [key]: value });

  function chooseFullAccess() {
    if (permissions.computerAccess === "full") return;
    const accepted = window.confirm(t(
      "El acceso completo permite a NovaAI Code trabajar en cualquier carpeta del equipo cuando se lo pidas. Los cambios fuera del proyecto siempre requerirán tu aprobación. ¿Quieres activarlo?",
      "Full access lets NovaAI Code work in any computer folder when you ask. Changes outside the project will always require your approval. Enable it?",
    ));
    if (accepted) update("computerAccess", "full");
  }

  return <section className="permissions-settings">
    <div className="permission-scope" role="radiogroup" aria-label={t("Acceso a archivos", "File access")}>
      <button type="button" role="radio" aria-checked={permissions.computerAccess === "project"} className={permissions.computerAccess === "project" ? "is-active" : ""} onClick={() => update("computerAccess", "project")}>
        <span className="permission-scope__icon"><FolderCode size={20} /></span>
        <span><strong>{t("Solo el proyecto", "Project only")}</strong><small>{t("Accede únicamente a la carpeta abierta y a las carpetas que autorices en el chat.", "Only access the open project and folders you authorize in chat.")}</small></span>
        {permissions.computerAccess === "project" && <Check size={17} />}
      </button>
      <button type="button" role="radio" aria-checked={permissions.computerAccess === "full"} className={`permission-scope__full${permissions.computerAccess === "full" ? " is-active" : ""}`} onClick={chooseFullAccess}>
        <span className="permission-scope__icon"><HardDrive size={20} /></span>
        <span><strong>{t("Acceso completo al equipo", "Full computer access")}</strong><small>{t("Puede trabajar fuera del proyecto, pero cada cambio externo se revisa antes de aplicarse.", "Can work outside the project, but every external change is reviewed before applying.")}</small></span>
        {permissions.computerAccess === "full" && <Check size={17} />}
      </button>
    </div>

    {permissions.computerAccess === "full" && <div className="permission-warning"><AlertTriangle size={17} /><span><strong>{t("Permiso sensible activado", "Sensitive permission enabled")}</strong><small>{t("Nova no examina todo el disco automáticamente. Solo usa rutas relacionadas con tu petición y nunca puede modificar una carpeta externa sin mostrarte la operación.", "Nova does not scan the whole disk automatically. It only uses paths related to your request and can never change an external folder without showing you the operation.")}</small></span></div>}

    <h3>{t("Capacidades", "Capabilities")}</h3>
    <div className="permission-toggle-list">
      <PermissionToggle icon={ShieldCheck} title={t("Crear y editar archivos", "Create and edit files")} description={t("Permite a NovaAI Code aplicar cambios en ubicaciones autorizadas.", "Allow NovaAI Code to apply changes in authorized locations.")} checked={permissions.allowFileChanges} onChange={(value) => update("allowFileChanges", value)} />
      <PermissionToggle icon={Trash2} title={t("Renombrar y eliminar", "Rename and delete")} description={t("Las operaciones destructivas siguen el modo de aprobación del chat.", "Destructive operations still follow the chat approval mode.")} checked={permissions.allowDestructiveActions} disabled={!permissions.allowFileChanges} onChange={(value) => update("allowDestructiveActions", value)} />
      <PermissionToggle icon={Globe2} title={t("Acceso a Internet", "Internet access")} description={t("Permite búsquedas web cuando la pregunta necesita información actual.", "Allow web searches when a question needs current information.")} checked={permissions.allowWebAccess} onChange={(value) => update("allowWebAccess", value)} />
    </div>
    <p className="permissions-footnote"><ShieldCheck size={14} />{t("Configuración inicial segura: Nova solo accede al proyecto abierto.", "Safe default: Nova only accesses the open project.")}</p>
  </section>;
}
