import Pica from "pica";
import { downloadZip } from "client-zip";
import { encodeIco } from "icojs";
import { outputFiles, type OutputFileName } from "./data/output-files";

/* ------------------------------------------------------------------ */
/*  DOM references                                                     */
/* ------------------------------------------------------------------ */
const dropZone = document.getElementById("dropZone") as HTMLElement;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const pickBtn = document.getElementById("pickBtn") as HTMLButtonElement;
const settings = document.getElementById("settings") as HTMLElement;
const actions = document.getElementById("actions") as HTMLElement;
const generateBtn = document.getElementById("generateBtn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLElement;
const appNameInput = document.getElementById("appName") as HTMLInputElement;
const shortNameInput = document.getElementById("shortName") as HTMLInputElement;
const appNameError = document.getElementById("appNameError") as HTMLElement;
const shortNameError = document.getElementById("shortNameError") as HTMLElement;
const themeColorInput = document.getElementById("themeColor") as HTMLInputElement;
const bgColorInput = document.getElementById("bgColor") as HTMLInputElement;
const sourceMeta = document.getElementById("sourceMeta") as HTMLElement;
const sourceName = document.getElementById("sourceName") as HTMLElement;
const sourceDimensions = document.getElementById("sourceDimensions") as HTMLElement;
const siteIcon = document.getElementById("siteIcon") as HTMLElement;
const siteTitle = document.getElementById("siteTitle") as HTMLElement;
const snippetCode = document.getElementById("snippetCode") as HTMLElement;
const copySnippet = document.getElementById("copySnippet") as HTMLButtonElement;
const themeToggle = document.getElementById("themeToggle") as HTMLButtonElement;
const themeIcon = themeToggle.querySelector(".theme-icon") as HTMLElement;
const themeLabel = themeToggle.querySelector(".theme-label") as HTMLElement;
const brandLogo = document.querySelector<HTMLImageElement>(".brand-logo")!;
const steps = [...document.querySelectorAll<HTMLElement>(".steps [data-step]")];
const mobileMenu = document.getElementById("mobileMenu") as HTMLButtonElement;
const mainNav = document.querySelector<HTMLElement>(".main-nav")!;
const previewIcons = [...document.querySelectorAll<HTMLElement>("[data-icon-size]")];
const generatedAssetButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-download]")];
const startUrlInput = document.getElementById("startUrl") as HTMLInputElement;
const displayModeInput = document.getElementById("displayMode") as HTMLSelectElement;
const orientationInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="orientation"]')];
const safeAreaInput = document.getElementById("safeArea") as HTMLInputElement;
const snippetFrameworkInput = document.getElementById("snippetFramework") as HTMLSelectElement;
const cropZoomInput = document.getElementById("cropZoom") as HTMLInputElement;
const cropXInput = document.getElementById("cropX") as HTMLInputElement;
const cropYInput = document.getElementById("cropY") as HTMLInputElement;
const manifestCode = document.getElementById("manifestCode") as HTMLElement;
const phoneAppName = document.getElementById("phoneAppName") as HTMLElement;
const maskableIcon = document.getElementById("maskableIcon") as HTMLElement;
const copyManifest = document.getElementById("copyManifest") as HTMLButtonElement;
const outputFileCount = `${outputFiles.length} files`;
document.querySelector<HTMLElement>(".contents-count")!.textContent = outputFileCount;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const PNG_SIZES = [16, 32, 48, 180, 192, 512] as const;
const ICO_SIZES = [16, 32, 48] as const;
const APPLE_SIZE = 180;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;

/* ------------------------------------------------------------------ */
/*  Pica instance — use JS as a fallback if WASM is unavailable         */
/* ------------------------------------------------------------------ */
const pica = Pica({ features: ["js", "wasm", "ww"] });

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */
let currentSquareCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
let sourceDimensionsText = "";
let validationAttempted = false;
let sourceBitmap: ImageBitmap | null = null;
let previewUrls: string[] = [];
let generatedFiles: { name: OutputFileName; input: Blob | string }[] = [];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function setStatus(message: string, type: "" | "success" | "error" = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type} ${/loading|generating/i.test(message) ? "loading" : ""}`;
}

function updateThemeControl() {
  const isDark = document.documentElement.dataset.theme === "dark";
  const nextThemeLabel = isDark ? "light" : "dark";
  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeToggle.setAttribute("aria-label", `Switch to ${nextThemeLabel} mode`);
  themeToggle.title = `Switch to ${nextThemeLabel} mode`;
  themeIcon.textContent = isDark ? "☀" : "☾";
  themeLabel.textContent = `${isDark ? "Light" : "Dark"} mode`;
  brandLogo.src = isDark ? "/FaviconKit-logo.svg" : "/FaviconKit-logo-black.svg";
  themeColorMeta?.setAttribute("content", isDark ? "#0b1020" : "#f3f6ff");
}

function setCurrentStep(currentStep: number) {
  for (const step of steps) {
    const stepNumber = Number(step.dataset.step);
    const isCurrent = stepNumber === currentStep;
    step.classList.toggle("is-current", isCurrent);
    step.classList.toggle("is-complete", stepNumber < currentStep);
    if (isCurrent) {
      step.setAttribute("aria-current", "step");
    } else {
      step.removeAttribute("aria-current");
    }
  }
}

themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  try {
    localStorage.setItem("favicon-kit-theme", nextTheme);
  } catch {
    console.warn("Theme preference could not be saved in this browser.");
  }
  updateThemeControl();
});
try {
  const savedTheme = localStorage.getItem("favicon-kit-theme");
  if (savedTheme === "dark" || savedTheme === "light") {
    document.documentElement.dataset.theme = savedTheme;
  }
} catch {
  console.warn("Theme preference could not be read; using the system preference.");
}
updateThemeControl();

function validateInputs(): string | null {
  const errors: string[] = [];

  const validateText = (
    input: HTMLInputElement,
    errorElement: HTMLElement,
    label: string
  ) => {
    const value = input.value;
    let message = "";

    if (input === appNameInput && value.trim().length === 0) {
      message = "App name is required.";
    } else if (value.length > input.maxLength) {
      message = `${label} must be ${input.maxLength} characters or fewer.`;
    } else if (value.length > 0 && value.trim().length === 0) {
      message = `${label} cannot contain only spaces.`;
    }

    input.setAttribute("aria-invalid", String(Boolean(message)));
    errorElement.textContent = message;
    errorElement.hidden = !message;
    if (message) errors.push(message);
  };

  validateText(appNameInput, appNameError, "App name");
  validateText(shortNameInput, shortNameError, "Short name");

  for (const [input, label] of [
    [themeColorInput, "Theme colour"],
    [bgColorInput, "Background colour"],
  ] as const) {
    const validColor = /^#[\da-f]{6}$/i.test(input.value);
    input.setAttribute("aria-invalid", String(!validColor));
    if (!validColor) errors.push(`${label} must be a valid hex colour.`);
  }

  const startUrl = startUrlInput.value.trim();
  let validStartUrl = startUrl.length <= startUrlInput.maxLength;
  if (startUrl && validStartUrl) {
    try {
      const parsed = new URL(startUrl, window.location.origin);
      validStartUrl = (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        !startUrl.startsWith("//") && parsed.origin === window.location.origin;
    } catch {
      validStartUrl = false;
    }
  }
  startUrlInput.setAttribute("aria-invalid", String(!validStartUrl));
  if (!validStartUrl) errors.push("Start URL must be a same-origin path or URL.");

  const allowedDisplayModes = ["standalone", "minimal-ui", "fullscreen", "browser"];
  const validDisplayMode = allowedDisplayModes.includes(displayModeInput.value);
  displayModeInput.setAttribute("aria-invalid", String(!validDisplayMode));
  if (!validDisplayMode) errors.push("Choose a valid display mode.");

  const allowedFrameworks = ["html", "react", "next", "astro"];
  const validFramework = allowedFrameworks.includes(snippetFrameworkInput.value);
  snippetFrameworkInput.setAttribute("aria-invalid", String(!validFramework));
  if (!validFramework) errors.push("Choose a valid setup snippet format.");

  const validRange = (input: HTMLInputElement) => {
    const value = Number(input.value);
    return Number.isFinite(value) && value >= Number(input.min) && value <= Number(input.max);
  };
  for (const [input, label] of [
    [cropZoomInput, "Crop zoom"],
    [cropXInput, "Horizontal position"],
    [cropYInput, "Vertical position"],
    [safeAreaInput, "Maskable safe area"],
  ] as const) {
    const valid = validRange(input);
    input.setAttribute("aria-invalid", String(!valid));
    if (!valid) errors.push(`${label} is outside its allowed range.`);
  }

  const validOrientation = orientationInputs.some((input) => input.checked && ["any", "portrait", "landscape"].includes(input.value));
  if (!validOrientation) errors.push("Choose a valid icon orientation.");

  return errors[0] ?? null;
}

/**
 * Create an OffscreenCanvas if supported, otherwise a hidden canvas.
 */
function createCanvas(
  width: number,
  height: number
): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Centre-crop an ImageBitmap to a square canvas.
 * This prevents distortion when Pica resizes non-square logos.
 */
function cropToSquare(bitmap: ImageBitmap): HTMLCanvasElement | OffscreenCanvas {
  const baseSize = Math.min(bitmap.width, bitmap.height);
  const zoom = Number(cropZoomInput?.value || 1);
  const size = baseSize / zoom;
  const horizontal = Number(cropXInput?.value || 0) / 100;
  const vertical = Number(cropYInput?.value || 0) / 100;
  const x = (bitmap.width - size) / 2 + horizontal * (bitmap.width - size) / 2;
  const y = (bitmap.height - size) / 2 + vertical * (bitmap.height - size) / 2;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    x,
    y,
    size,
    size,
    0,
    0,
    size,
    size
  );
  return canvas;
}

/**
 * Resize the square source to `size` and return a PNG Blob.
 * Handles opaque backgrounds (iOS) and optional padding (maskable icons).
 */
async function renderPng(
  source: HTMLCanvasElement | OffscreenCanvas,
  size: number,
  options: { opaque?: boolean; padding?: number } = {}
): Promise<Blob> {
  const { opaque = false, padding = 0 } = options;

  // 1. Resize with Pica (Lanczos, WASM/Worker accelerated)
  const resized = createCanvas(size, size);
  await pica.resize(source, resized, { filter: "lanczos3" });

  // 2. Composite background if opaque, or add padding
  let finalCanvas: HTMLCanvasElement | OffscreenCanvas = resized;

  if (opaque || padding > 0) {
    const output = createCanvas(size, size);
    const ctx = output.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    if (opaque) {
      ctx.fillStyle = bgColorInput.value;
      ctx.fillRect(0, 0, size, size);
    }

    const drawSize = size - padding * 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(resized as CanvasImageSource, padding, padding, drawSize, drawSize);
    finalCanvas = output;
  }

  // 3. Export as PNG
  if ("convertToBlob" in finalCanvas) {
    return finalCanvas.convertToBlob({ type: "image/png" });
  }

  return new Promise<Blob>((resolve, reject) => {
    (finalCanvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))),
      "image/png"
    );
  });
}

/**
 * Escape user-controlled strings before embedding in the HTML snippet.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ */
/*  File loading                                                       */
/* ------------------------------------------------------------------ */

async function loadBitmap(file: File): Promise<ImageBitmap> {
  const buffer = await file.arrayBuffer();
  return createImageBitmap(new Blob([buffer], { type: file.type }));
}

async function handleFile(file: File | undefined) {
  if (!file) return;

  const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
  if (file.size === 0) {
    setStatus("That file is empty. Choose a valid image.", "error");
    fileInput.value = "";
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    setStatus("That image is over 10 MB. Choose a smaller file.", "error");
    fileInput.value = "";
    return;
  }
  if (!allowed.includes(file.type)) {
    setStatus("Unsupported file type. Use PNG, JPEG, SVG, or WebP.", "error");
    fileInput.value = "";
    return;
  }

  setStatus("Loading image…");

  try {
    const bitmap = await loadBitmap(file);
    if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
      bitmap.close();
      throw new Error("Image dimensions are invalid or too large.");
    }
    sourceBitmap?.close();
    sourceBitmap = bitmap;
    sourceDimensionsText = `${bitmap.width} × ${bitmap.height} px`;
    currentSquareCanvas = cropToSquare(bitmap);
    sourceName.textContent = file.name;
    sourceDimensions.textContent = sourceDimensionsText;
    sourceMeta.hidden = false;
    settings.hidden = false;
    actions.hidden = false;
    copySnippet.disabled = false;
    setCurrentStep(2);
    await refreshPreview();

    setStatus("Image ready. Adjust details and generate.", "success");
  } catch (error) {
    console.error("Image processing failed:", error);
    setStatus("Could not process this image. Try another file.", "error");
  } finally {
    fileInput.value = "";
  }
}

/* ------------------------------------------------------------------ */
/*  Preview                                                            */
/* ------------------------------------------------------------------ */

function updateDetailsPreview() {
  generatedFiles = [];
  generatedAssetButtons.forEach((button) => button.disabled = true);
  const name = appNameInput.value.trim() || "Your app";
  siteTitle.textContent = name;
  phoneAppName.textContent = name;
  siteIcon.style.backgroundColor = themeColorInput.value;
  document.documentElement.style.setProperty("--blue", themeColorInput.value);
  document.getElementById("themeHex")!.textContent = themeColorInput.value;
  document.getElementById("bgHex")!.textContent = bgColorInput.value;
  snippetCode.textContent = generateSetupSnippet();
  manifestCode.textContent = generateManifest();
  document.getElementById("fileCount")!.textContent = outputFileCount;
  document.querySelector<HTMLElement>(".contents-count")!.textContent = outputFileCount;
}

async function refreshPreview() {
  if (!sourceBitmap) return;
  currentSquareCanvas = cropToSquare(sourceBitmap);
  const [blobs, maskableBlob] = await Promise.all([
    Promise.all(PNG_SIZES.map((size) => renderPng(currentSquareCanvas!, size, {
      opaque: size === APPLE_SIZE,
    }))),
    renderPng(currentSquareCanvas, 512, { padding: Math.round(512 * (1 - Number(safeAreaInput.value) / 100) / 2) }),
  ]);
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls = [...blobs.map((blob) => URL.createObjectURL(blob)), URL.createObjectURL(maskableBlob)];
  const urlsBySize = new Map<number, string>(PNG_SIZES.map((size, index) => [size as number, previewUrls[index]]));
  for (const icon of previewIcons) {
    const url = urlsBySize.get(Number(icon.dataset.iconSize));
    if (url) {
      icon.style.backgroundImage = `url("${url}")`;
      icon.textContent = "";
    }
  }
  const appIcon = previewIcons.find((icon) => icon.dataset.iconSize === "192");
  if (appIcon) siteIcon.style.backgroundImage = appIcon.style.backgroundImage;
  maskableIcon.style.backgroundImage = `url("${previewUrls[previewUrls.length - 1]}")`;
  updateDetailsPreview();
}

/* ------------------------------------------------------------------ */
/*  Manifest & Snippet Generators                                      */
/* ------------------------------------------------------------------ */

function generateManifest(): string {
  const name = appNameInput.value.trim() || "My App";
  const shortName = shortNameInput.value.trim() || name.slice(0, 12);

  return JSON.stringify(
    {
      name,
      short_name: shortName,
      theme_color: themeColorInput.value,
      background_color: bgColorInput.value,
      display: displayModeInput.value,
      orientation: orientationInputs.find((input) => input.checked)?.value || "any",
      start_url: startUrlInput.value.trim() || "/",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: "/icon-512-maskable.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    null,
    2
  );
}

function generateHtmlSnippet(): string {
  const theme = escapeHtml(themeColorInput.value);

  return [
    "<!-- Add these links inside your page's <head> -->",
    '<link rel="icon" type="image/x-icon" href="/favicon.ico">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    `<meta name="theme-color" content="${theme}">`,
  ].join("\n");
}

function generateSetupSnippet(): string {
  const html = generateHtmlSnippet();
  const framework = snippetFrameworkInput.value;
  if (framework === "react") {
    return `// Add inside your document <head>\n${html.split("\n").map((line) => `// ${line}`).join("\n")}\n\n// Or in public/index.html, use the HTML snippet above.`;
  }
  if (framework === "next") {
    return `// app/layout.tsx\nexport const metadata = {\n  title: ${JSON.stringify(appNameInput.value.trim() || "My App")},\n  manifest: "/site.webmanifest",\n  icons: {\n    icon: [\n      { url: "/favicon.ico" },\n      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },\n      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },\n    ],\n    apple: "/apple-touch-icon.png",\n  },\n};\n\n// Place generated icon files in the public/ directory.`;
  }
  if (framework === "astro") {
    return `---\n// src/layouts/Base.astro\nconst themeColor = ${JSON.stringify(themeColorInput.value)};\n---\n<head>\n  <link rel="icon" href="/favicon.ico" sizes="any" />\n  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />\n  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />\n  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />\n  <link rel="manifest" href="/site.webmanifest" />\n  <meta name="theme-color" content={themeColor} />\n</head>`;
  }
  return html;
}

function generateReadme(): string {
  return [
    "Favicon Kit – generated entirely in your browser.",
    "",
    "Files:",
    "  favicon.ico             – multi-size (16/32/48) legacy fallback",
    "  favicon-16x16.png       – Google search results",
    "  favicon-32x32.png       – modern PNG fallback",
    "  apple-touch-icon.png    – iOS home screen (180×180, opaque)",
    "  icon-192.png            – Android launcher",
    "  icon-512.png            – PWA install / splash",
    "  icon-512-maskable.png   – Android adaptive icon (safe zone)",
    "  site.webmanifest        – Web App Manifest",
    "  head-snippet.html       – copy-paste into your <head>",
    "  framework-setup.txt    – setup snippet for your selected framework",
    "",
    "Place the generated files in your site's public root.",
    "Then paste head-snippet.html inside the <head> of your page.",
    "If the old icon remains, open a private window or clear the browser's favicon cache.",
    "",
    "— Generated with the Asset-to-Favicon & Manifest Generator",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  Generate & Download                                                */
/* ------------------------------------------------------------------ */

async function generateAndDownload() {
  if (!currentSquareCanvas) {
    setStatus("Choose an image first.", "error");
    return;
  }

  const validationError = validateInputs();
  if (validationError) {
    validationAttempted = true;
    setStatus(validationError, "error");
    const invalidInput = document.querySelector<HTMLInputElement>('[aria-invalid="true"]');
    invalidInput?.focus();
    return;
  }
  validationAttempted = false;

  generateBtn.disabled = true;
  generateBtn.classList.add("is-loading");
  generateBtn.querySelector("span")!.textContent = "Building your kit";
  setStatus("Generating assets…");

  try {
    const source = currentSquareCanvas;

    // 1. Render all PNG sizes in parallel (Pica uses WASM/Worker)
    const [pngBlobs, maskableBlob] = await Promise.all([
      Promise.all(
      PNG_SIZES.map((size) =>
        renderPng(source, size, {
          opaque: size === APPLE_SIZE,
        })
      )
      ),
      renderPng(source, 512, { padding: Math.round(512 * (1 - Number(safeAreaInput.value) / 100) / 2) }),
    ]);

    const blobBySize = Object.fromEntries(
      PNG_SIZES.map((size, i) => [size, pngBlobs[i]])
    ) as Record<number, Blob>;

    // 2. Build favicon.ico with icojs
    const icoBuffers = await Promise.all(
      ICO_SIZES.map(async (size) => ({
        buffer: await blobBySize[size].arrayBuffer(),
      }))
    );
    const icoArray = await encodeIco(icoBuffers);
    const icoArrayBuffer = new ArrayBuffer(icoArray.byteLength);
    new Uint8Array(icoArrayBuffer).set(icoArray);
    const icoBlob = new Blob([icoArrayBuffer], { type: "image/x-icon" });

    // 3. Text assets
    const manifest = generateManifest();
    const htmlSnippet = generateHtmlSnippet();
    const frameworkSnippet = generateSetupSnippet();
    const readme = generateReadme();

    // 4. Bundle with client-zip (streaming, no JSZip)
    const fileContents = new Map<string, Blob | string>([
      ["favicon.ico", icoBlob],
      ["favicon-16x16.png", blobBySize[16]],
      ["favicon-32x32.png", blobBySize[32]],
      ["apple-touch-icon.png", blobBySize[180]],
      ["icon-192.png", blobBySize[192]],
      ["icon-512.png", blobBySize[512]],
      ["icon-512-maskable.png", maskableBlob],
      ["site.webmanifest", manifest],
      ["head-snippet.html", htmlSnippet],
      ["framework-setup.txt", frameworkSnippet],
      ["README.txt", readme],
    ]);
    if (fileContents.size !== outputFiles.length) {
      throw new Error("Generated file contents do not match the output file list.");
    }

    const files = outputFiles.map(({ name }) => {
      const input = fileContents.get(name);
      if (input === undefined) {
        throw new Error(`No generated content found for ${name}.`);
      }
      return { name, input };
    });
    generatedFiles = files;
    for (const button of generatedAssetButtons) button.disabled = false;

    const zipBlob = await downloadZip(files).blob();

    // 5. Trigger download
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "favicons-kit.zip";
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setStatus("ZIP downloaded. Drop the files at your site root.", "success");
    setCurrentStep(3);
  } catch (error) {
    console.error(error);
    setStatus(
      `Generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error"
    );
  } finally {
    generateBtn.disabled = false;
    generateBtn.classList.remove("is-loading");
    generateBtn.querySelector("span")!.textContent = "Generate ZIP";
  }
}

/* ------------------------------------------------------------------ */
/*  Event wiring                                                       */
/* ------------------------------------------------------------------ */

pickBtn.addEventListener("click", () => fileInput.click());
mobileMenu.addEventListener("click", () => {
  const expanded = mobileMenu.getAttribute("aria-expanded") === "true";
  mobileMenu.setAttribute("aria-expanded", String(!expanded));
  mainNav.classList.toggle("mobile-open", !expanded);
});
mainNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
  mainNav.classList.remove("mobile-open");
  mobileMenu.setAttribute("aria-expanded", "false");
}));
document.querySelector(".contents-panel")?.setAttribute("open", "");
document.getElementById("changeImage")!.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  void handleFile(fileInput.files?.[0]);
});

["dragenter", "dragover"].forEach((event) =>
  dropZone.addEventListener(event, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  })
);

["dragleave", "drop"].forEach((event) =>
  dropZone.addEventListener(event, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  })
);

dropZone.addEventListener("drop", (e) => {
  const file = (e as DragEvent).dataTransfer?.files?.[0];
  void handleFile(file);
});

generateBtn.addEventListener("click", () => void generateAndDownload());

document.querySelectorAll<HTMLButtonElement>("[data-preview]").forEach((tab) => {
  tab.addEventListener("click", () => {
    const panel = tab.dataset.preview;
    document.querySelectorAll("[data-preview]").forEach((item) => item.classList.toggle("active", item === tab));
    document.querySelectorAll("[data-pane]").forEach((item) => item.classList.toggle("active", item.getAttribute("data-pane") === panel));
  });
});

generatedAssetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const file = generatedFiles.find((entry) => entry.name === button.dataset.download);
    if (!file) return;
    const blob = file.input instanceof Blob ? file.input : new Blob([file.input], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
});

copyManifest.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(generateManifest());
    copyManifest.textContent = "Copied";
    setTimeout(() => { copyManifest.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg> Copy'; }, 1600);
  } catch {
    setStatus("Clipboard access is unavailable in this browser.", "error");
  }
});

[appNameInput, shortNameInput, themeColorInput, bgColorInput, startUrlInput, displayModeInput, snippetFrameworkInput, ...orientationInputs].forEach((input) =>
  input.addEventListener("input", () => {
    const validationError = validateInputs();
    if (validationAttempted) {
      if (validationError) {
        setStatus(validationError, "error");
      } else {
        validationAttempted = false;
        setStatus("Image ready. Adjust details and generate.", "success");
      }
    }
    updateDetailsPreview();
  })
);

let cropRefreshTimer = 0;
[cropZoomInput, cropXInput, cropYInput].forEach((input) => input.addEventListener("input", () => {
  document.getElementById("zoomValue")!.textContent = `${Number(cropZoomInput.value).toFixed(2).replace(/0$/, "").replace(/\.0$/, "")}×`;
  document.getElementById("cropXValue")!.textContent = cropXInput.value === "0" ? "Center" : `${cropXInput.value}%`;
  document.getElementById("cropYValue")!.textContent = cropYInput.value === "0" ? "Center" : `${cropYInput.value}%`;
  window.clearTimeout(cropRefreshTimer);
  cropRefreshTimer = window.setTimeout(() => void refreshPreview(), 100);
}));

safeAreaInput.addEventListener("input", () => {
  document.getElementById("safeAreaValue")!.textContent = `${safeAreaInput.value}%`;
  window.clearTimeout(cropRefreshTimer);
  cropRefreshTimer = window.setTimeout(() => void refreshPreview(), 100);
});

copySnippet.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(generateSetupSnippet());
    copySnippet.textContent = "Copied";
    setTimeout(() => (copySnippet.textContent = "Copy"), 1600);
  } catch {
    setStatus("Clipboard access is unavailable in this browser.", "error");
  }
});

window.addEventListener("beforeunload", () => {
  if (sourceBitmap) sourceBitmap.close();
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
});
