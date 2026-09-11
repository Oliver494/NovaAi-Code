import { Download, ImagePlus, LoaderCircle, Sparkles, Upload, Video, WandSparkles } from "lucide-react";
import { useRef, useState } from "react";
import { ai, asDiagnostic } from "../services/ai";
import { usePreferences } from "../services/preferences";
import type { AiSettings, Diagnostic, MediaGenerationResult, MediaMode } from "../types";

type Props = { settings: AiSettings | null; onConfigure: () => void };

const imageModels = [
  { id: "black-forest-labs/flux.1-schnell", name: "FLUX.1 Schnell", description: "Rápido · imagen desde texto" },
  { id: "black-forest-labs/flux.1-dev", name: "FLUX.1 Dev", description: "Más detalle · imagen desde texto" },
  { id: "black-forest-labs/flux.2-klein-4b", name: "FLUX.2 Klein", description: "Ligero · imagen desde texto" },
  { id: "stabilityai/stable-diffusion-3-medium", name: "Stable Diffusion 3 Medium", description: "Ilustración · imagen desde texto" },
  { id: "stabilityai/stable-diffusion-xl", name: "Stable Diffusion XL", description: "Clásico · imagen desde texto" },
];
const videoModels = [
  { id: "stabilityai/stable-video-diffusion", name: "Stable Video Diffusion", description: "Anima una imagen · vídeo corto" },
];

export function MediaStudio({ settings, onConfigure }: Props) {
  const { t } = usePreferences();
  const [mode, setMode] = useState<MediaMode>("image");
  const [model, setModel] = useState(imageModels[0].id);
  const [prompt, setPrompt] = useState("");
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [result, setResult] = useState<MediaGenerationResult | null>(null);
  const [error, setError] = useState<Diagnostic | null>(null);
  const [generating, setGenerating] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const generationId = useRef<string | null>(null);
  const nvidia = settings?.providers.find((item) => item.provider === "nvidia") ?? null;
  const ready = Boolean(nvidia?.apiKeyConfigured);
  const choices = mode === "image" ? imageModels : videoModels;

  function chooseMode(next: MediaMode) {
    setMode(next);
    setModel((next === "image" ? imageModels : videoModels)[0].id);
    setResult(null);
    setError(null);
  }

  function chooseImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
      setError({ code: "INVALID_IMAGE", title: t("Imagen no compatible", "Unsupported image"), explanation: t("Usa una imagen PNG, JPG o WebP.", "Use a PNG, JPG, or WebP image."), cause: t("El formato no es compatible con el modelo de vídeo.", "The format is not compatible with the video model."), action: t("Elige otra imagen.", "Choose another image."), technicalDetails: null, retryable: false });
      return;
    }
    if (file.size > 200 * 1024) {
      setError({ code: "IMAGE_TOO_LARGE", title: t("Imagen demasiado grande", "Image too large"), explanation: t("Para este modelo la imagen debe pesar 200 KB o menos.", "For this model, the image must be 200 KB or smaller."), cause: t("NVIDIA limita el tamaño de la imagen inicial.", "NVIDIA limits the initial image size."), action: t("Reduce la imagen y vuelve a intentarlo.", "Resize the image and try again."), technicalDetails: null, retryable: false });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setImageData(typeof reader.result === "string" ? reader.result : null); setImageName(file.name); setError(null); };
    reader.readAsDataURL(file);
  }

  async function generate() {
    if (!nvidia) { onConfigure(); return; }
    if (!ready) { setError({ code: "INVALID_API_KEY", title: t("Configura NVIDIA API", "Configure NVIDIA API"), explanation: t("Necesitas guardar tu clave de NVIDIA antes de crear contenido.", "Save your NVIDIA key before creating content."), cause: t("No hay una clave configurada.", "No API key is configured."), action: t("Abre Proveedores y configura NVIDIA API.", "Open Providers and configure NVIDIA API."), technicalDetails: null, retryable: false }); return; }
    if (mode === "image" && !prompt.trim()) { setError({ code: "EMPTY_PROMPT", title: t("Escribe una descripción", "Write a description"), explanation: t("Describe la imagen que quieres crear.", "Describe the image you want to create."), cause: t("El modelo necesita un prompt.", "The model needs a prompt."), action: t("Añade una descripción y vuelve a intentarlo.", "Add a description and try again."), technicalDetails: null, retryable: false }); return; }
    if (mode === "video" && !imageData) { setError({ code: "IMAGE_REQUIRED", title: t("Añade una imagen", "Add an image"), explanation: t("Este modelo convierte una imagen inicial en un vídeo corto.", "This model turns a starting image into a short video."), cause: t("Falta la imagen inicial.", "The starting image is missing."), action: t("Pulsa Elegir imagen y vuelve a intentarlo.", "Choose an image and try again."), technicalDetails: null, retryable: false }); return; }
    const requestId = crypto.randomUUID();
    generationId.current = requestId;
    setGenerating(true); setError(null); setResult(null);
    try { setResult(await ai.generateNvidiaMedia({ requestId, config: nvidia, mode, model, prompt, imageData })); }
    catch (cause) { const diagnostic = asDiagnostic(cause); if (diagnostic.code !== "CANCELLED") setError(diagnostic); }
    finally { if (generationId.current === requestId) generationId.current = null; setGenerating(false); }
  }

  async function cancelGeneration() {
    const requestId = generationId.current;
    if (!requestId) return;
    await ai.cancel(requestId).catch(() => undefined);
  }

  function download() {
    if (!result) return;
    const link = document.createElement("a");
    link.href = result.dataUrl;
    link.download = `nova-${result.mediaType}-${Date.now()}.${result.mediaType === "video" ? "mp4" : "png"}`;
    link.click();
  }

  return <section className="media-studio">
    <header className="media-studio__header"><div><span className="media-studio__eyebrow"><WandSparkles size={15} />{t("Estudio creativo", "Creative studio")}</span><h1>{t("Crea imágenes y animaciones", "Create images and animations")}</h1><p>{t("Generación real con NVIDIA API. Tus archivos no se modifican.", "Real generation with NVIDIA API. Your files are not changed.")}</p></div><div className={`media-studio__provider ${ready ? "is-ready" : ""}`}><i />NVIDIA API {ready ? t("lista", "ready") : t("sin configurar", "not configured")}</div></header>
    <div className="media-studio__layout"><section className="media-studio__controls"><div className="media-mode-tabs"><button className={mode === "image" ? "is-active" : ""} onClick={() => chooseMode("image")}><ImagePlus size={16} />{t("Imagen", "Image")}</button><button className={mode === "video" ? "is-active" : ""} onClick={() => chooseMode("video")}><Video size={16} />{t("Animar / vídeo", "Animate / video")}</button></div><label>{t("Modelo", "Model")}<select value={model} onChange={(event) => setModel(event.target.value)}>{choices.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.description}</option>)}</select></label>{mode === "image" ? <label>{t("Descripción", "Description")}<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={10_000} placeholder={t("Una nave espacial minimalista atravesando una nebulosa azul…", "A minimalist spaceship crossing a blue nebula…")} /><small>{prompt.length}/10.000</small></label> : <div className="media-upload"><div><strong>{t("Imagen inicial", "Starting image")}</strong><span>{imageName || t("PNG, JPG o WebP · máximo 200 KB", "PNG, JPG, or WebP · maximum 200 KB")}</span></div>{imageData && <img src={imageData} alt="" />}<button className="secondary-button" onClick={() => fileInput.current?.click()}><Upload size={14} />{imageData ? t("Cambiar imagen", "Change image") : t("Elegir imagen", "Choose image")}</button><input ref={fileInput} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(event) => { chooseImage(event.target.files?.[0]); event.currentTarget.value = ""; }} /></div>}<button className="primary-button media-generate-button" onClick={() => void generate()} disabled={generating}>{generating ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{generating ? t("Creando…", "Creating…") : mode === "image" ? t("Crear imagen", "Create image") : t("Crear animación", "Create animation")}</button>{generating && <button className="secondary-button media-cancel-button" onClick={() => void cancelGeneration()}>Cancelar creación</button>}{!ready && <button className="secondary-button media-configure" onClick={onConfigure}>{t("Configurar NVIDIA API", "Configure NVIDIA API")}</button>}</section><section className="media-studio__result">{generating ? <div className="media-result-status"><LoaderCircle className="spin" size={22} /><strong>{mode === "image" ? t("NVIDIA está creando tu imagen…", "NVIDIA is creating your image…") : t("NVIDIA está animando tu imagen…", "NVIDIA is animating your image…")}</strong><span>{t("Puede tardar unos segundos; Vareliox mantiene el estado visible.", "It can take a few seconds; Vareliox keeps the status visible.")}</span></div> : result ? <div className="media-result"><div className="media-result__top"><strong>{result.mediaType === "image" ? t("Imagen creada", "Image created") : t("Vídeo creado", "Video created")}</strong><button className="secondary-button" onClick={download}><Download size={14} />{t("Descargar", "Download")}</button></div>{result.mediaType === "image" ? <img src={result.dataUrl} alt={t("Imagen creada", "Created image")} /> : <video src={result.dataUrl} controls autoPlay loop />}</div> : <div className="media-result-empty"><Sparkles size={27} /><strong>{t("Tu creación aparecerá aquí", "Your creation will appear here")}</strong><span>{mode === "image" ? t("Elige un modelo y describe tu idea.", "Choose a model and describe your idea.") : t("Sube una imagen para convertirla en una animación corta.", "Upload an image to turn it into a short animation.")}</span></div>}{error && <div className="media-error"><strong>{error.title}</strong><span>{error.explanation}</span><small>{error.action}</small></div>}</section></div>
  </section>;
}
