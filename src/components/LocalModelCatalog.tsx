import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Code2, Download, Eye, HardDrive, Image as ImageIcon, LoaderCircle, MessageCircle, Search, Sparkles, Video, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ai, asDiagnostic, providerMeta } from "../services/ai";
import { usePreferences } from "../services/preferences";
import type { Diagnostic, LocalModelCatalogItem, LocalModelDownloadEvent, ProviderConfig, ProviderId } from "../types";

type Props = { provider: Extract<ProviderId, "ollama" | "lm_studio">; config: ProviderConfig; onClose: () => void; onInstalled: () => void };
type Category = "all" | LocalModelCatalogItem["category"];
const COMFYUI_DOWNLOAD_PAGE = "https://www.comfy.org/download";

const categoryIcons = { all: Sparkles, chat: MessageCircle, code: Code2, vision: Eye, image: ImageIcon, video: Video } satisfies Record<Category, typeof Sparkles>;

export function LocalModelCatalog({ provider, config, onClose, onInstalled }: Props) {
  const { t } = usePreferences();
  const [items, setItems] = useState<LocalModelCatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("Cargando catálogo local…");
  const [error, setError] = useState<Diagnostic | null>(null);

  useEffect(() => { ai.localCatalog().then(setItems).catch((cause) => setError(asDiagnostic(cause))); }, []);
  const categories = useMemo(() => ([
    ["all", t("Todos", "All")], ["chat", t("Chat", "Chat")], ["code", t("Programación", "Coding")],
    ["vision", t("Visión", "Vision")], ["image", t("Crear imágenes", "Create images")], ["video", t("Crear vídeos", "Create videos")],
  ] as const).map(([id, label]) => ({ id, label, count: id === "all" ? items.length : items.filter((item) => item.category === id).length })), [items, t]);
  const filtered = useMemo(() => items.filter((item) => {
    const search = `${item.name} ${item.family} ${item.description} ${item.capabilities.join(" ")}`.toLocaleLowerCase();
    return (category === "all" || item.category === category) && search.includes(query.toLocaleLowerCase());
  }), [items, category, query]);

  async function download(item: LocalModelCatalogItem) {
    setDownloading(item.id); setProgress(0); setError(null); setStatus(`Preparando ${item.name}…`);
    try {
      const onEvent = (event: LocalModelDownloadEvent) => {
        if (event.type === "status") { setStatus(event.message); setProgress(event.progress); }
        else if (event.type === "error") setError(event.diagnostic);
      };
      if (item.runtimes.includes(provider)) {
        await ai.downloadLocalModel(config, item.id, onEvent);
        setStatus(`${item.name} está listo para usar.`); onInstalled();
      } else {
        await ai.downloadComfyUiModel(item.id, onEvent);
        setStatus(`${item.name} se está descargando en ComfyUI.`);
      }
      setProgress(100);
    } catch (cause) { setError(asDiagnostic(cause)); } finally { setDownloading(null); }
  }

  async function resolveComfyUiProblem() {
    if (error?.code === "PROVIDER_NOT_INSTALLED") {
      await openUrl(COMFYUI_DOWNLOAD_PAGE);
      return;
    }
    try {
      await ai.openComfyUi();
      setStatus(t("ComfyUI se está abriendo. Crea o inicia una instalación Local y vuelve a descargar.", "ComfyUI is opening. Create or start a Local installation, then download again."));
      setError(null);
    } catch (cause) {
      setError(asDiagnostic(cause));
    }
  }

  const source = providerMeta[provider].name;
  return <div className="local-model-overlay" role="dialog" aria-modal="true" aria-label={t("Biblioteca de IA local", "Local AI library")}>
    <section className="local-model-catalog">
      <header className="local-model-catalog__header"><div className="local-model-catalog__title"><span className="local-model-catalog__glyph"><HardDrive size={18} /></span><div><strong>{t("Biblioteca de IA local", "Local AI library")}</strong><span>{t("Modelos para conversar, programar, comprender imágenes y crear contenido.", "Models for chat, coding, image understanding and content creation.")}</span></div></div><button className="icon-button" onClick={onClose} aria-label={t("Cerrar biblioteca", "Close library")}><X size={18} /></button></header>
      <div className="local-model-catalog__tools"><label className="local-model-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Buscar modelo o capacidad…", "Search model or capability…")} autoFocus /></label><div className="local-model-filters" aria-label={t("Tipos de IA", "AI types")}>{categories.map(({ id, label, count }) => { const Icon = categoryIcons[id]; return <button key={id} className={category === id ? "is-active" : ""} onClick={() => setCategory(id)}><Icon size={14} /><span>{label}</span><small>{count}</small></button>; })}</div></div>
      {downloading && <div className="local-download-status"><div><LoaderCircle className="spin" size={16} /><span>{status}</span></div>{progress !== null && <><div className="local-download-status__track"><i style={{ width: `${progress}%` }} /></div><strong>{progress}%</strong></>}</div>}
      {error && <div className="local-model-error"><strong>{error.title}</strong><span>{error.explanation}</span><small>{error.action}</small>{["SERVER_OFFLINE", "PROVIDER_NOT_INSTALLED", "COMFYUI_LOCAL_SETUP_REQUIRED", "COMFYUI_MANAGER_MISSING"].includes(error.code) && <button className="secondary-button" onClick={() => void resolveComfyUiProblem()}><Download size={14} />{error.code === "PROVIDER_NOT_INSTALLED" ? t("Instalar ComfyUI", "Install ComfyUI") : t("Abrir ComfyUI", "Open ComfyUI")}</button>}</div>}
      <div className="local-model-grid">{filtered.map((item) => {
        const compatible = item.runtimes.includes(provider);
        return <article className={`local-model-card local-model-card--${item.category}`} key={item.id}><div className="local-model-card__top"><span>{item.family}</span>{item.recommended && <em><Sparkles size={12} />{t("Recomendado", "Recommended")}</em>}</div><h3>{item.name}</h3><p>{item.description}</p><div className="local-model-card__capabilities">{item.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div><div className="local-model-card__facts"><span>{item.parameters}</span><span>{item.size}</span><span>{compatible ? source : "ComfyUI"}</span></div><button className="secondary-button" disabled={Boolean(downloading)} onClick={() => void download(item)}>{downloading === item.id ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}{downloading === item.id ? t("Descargando", "Downloading") : compatible ? `${t("Descargar con", "Download with")} ${source}` : t("Descargar", "Download")}</button></article>;
      })}{!filtered.length && <div className="local-model-empty">{t("No hay resultados para esta búsqueda.", "No results for this search.")}</div>}</div>
      <footer className="local-model-catalog__footer"><span><Check size={14} />{t("Ollama y LM Studio gestionan chat y visión. La creación de imágenes y vídeos necesita ComfyUI.", "Ollama and LM Studio manage chat and vision. Image and video creation requires ComfyUI.")}</span><button className="secondary-button" onClick={onClose}>{t("Listo", "Done")}</button></footer>
    </section>
  </div>;
}
