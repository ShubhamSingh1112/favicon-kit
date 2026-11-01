const finderForm = document.getElementById("finderForm") as HTMLFormElement;
const finderDomain = document.getElementById("finderDomain") as HTMLInputElement;
const finderSize = document.getElementById("finderSize") as HTMLSelectElement;
const finderResult = document.getElementById("finderResult") as HTMLElement;
const finderPreview = document.getElementById("finderPreview") as HTMLImageElement;
const finderResultTitle = document.getElementById("finderResultTitle") as HTMLElement;
const finderStatus = document.getElementById("finderStatus") as HTMLElement;
const finderSnippet = document.getElementById("finderSnippet") as HTMLElement;
const copyFinderSnippet = document.getElementById("copyFinderSnippet") as HTMLButtonElement;

let requestId = 0;
let requestController: AbortController | undefined;
let previewObjectUrl: string | undefined;
let loadedStatus = "";

function setFinderStatus(message: string, kind: "" | "success" | "warning" | "error" = "") {
  finderStatus.textContent = message;
  finderStatus.className = kind ? `finder-status ${kind}` : "finder-status";
}

function describeFailure(status: number, message: string): string {
  if (status === 400) return message || "Enter a valid website domain and try again.";
  if (status === 502) {
    return "Our favicon service couldn't complete the lookup. Please try again shortly.";
  }
  return "We couldn't fetch a favicon right now. Please try again shortly.";
}

async function updateFinder(domain: string) {
  const id = ++requestId;
  requestController?.abort();
  requestController = new AbortController();

  const size = finderSize.value;
  const apiUrl = new URL("/icon", window.location.origin);
  apiUrl.searchParams.set("domain", domain);
  apiUrl.searchParams.set("size", size);

  finderResult.hidden = false;
  finderPreview.alt = `Favicon preview for ${domain}`;
  finderPreview.dataset.domain = domain;
  finderResultTitle.textContent = domain;
  setFinderStatus("Looking for this site's favicon…");

  const escapedDomain = domain.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  finderSnippet.textContent =
    `<img src="${apiUrl.toString()}" alt="${escapedDomain} icon" width="${size}" height="${size}">`;
  copyFinderSnippet.disabled = false;

  try {
    const response = await fetch(apiUrl, { signal: requestController.signal });
    if (id !== requestId) return;

    if (!response.ok) {
      let message = "";
      try {
        const body = (await response.json()) as { error?: string };
        message = body.error ?? "";
      } catch {
        // The endpoint may have returned a non-JSON error page.
      }
      throw new Error(describeFailure(response.status, message));
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) {
      throw new Error("The favicon service returned an unexpected response. Please try again later.");
    }

    const source = response.headers.get("x-favicon-source") ?? "";
    const isFallback = source === "fallback";
    loadedStatus = isFallback
      ? `We couldn't fetch a favicon from ${domain}. The site may restrict automated requests, or no supported icon may be available. Showing a generated placeholder instead.`
      : `Favicon found for ${domain}.`;

    const blob = await response.blob();
    if (id !== requestId) return;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(blob);
    finderPreview.src = previewObjectUrl;
    setFinderStatus(loadedStatus, isFallback ? "warning" : "success");
  } catch (error) {
    if (id !== requestId || (error instanceof DOMException && error.name === "AbortError")) return;
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = undefined;
    }
    finderPreview.removeAttribute("src");
    const message = error instanceof Error
      ? error.message
      : "We couldn't fetch a favicon. Check your connection and try again.";
    setFinderStatus(message, "error");
  }
}

finderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const domain = finderDomain.value.trim();
  if (!domain) {
    finderDomain.focus();
    return;
  }
  void updateFinder(domain);
});

finderPreview.addEventListener("load", () => {
  if (loadedStatus) {
    setFinderStatus(
      loadedStatus,
      loadedStatus.startsWith("We couldn't fetch") ? "warning" : "success"
    );
  }
});

finderPreview.addEventListener("error", () => {
  setFinderStatus("The preview image couldn't be displayed. Please try the lookup again.", "error");
});

finderSize.addEventListener("change", () => {
  const domain = finderPreview.dataset.domain;
  if (domain) void updateFinder(domain);
});

document.querySelectorAll<HTMLAnchorElement>(".finder-example").forEach((example) => {
  example.addEventListener("click", (event) => {
    event.preventDefault();
    const domain = example.dataset.domain;
    if (!domain) return;
    finderDomain.value = domain;
    void updateFinder(domain);
    finderDomain.focus();
  });
});

copyFinderSnippet.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(finderSnippet.textContent ?? "");
    copyFinderSnippet.textContent = "Copied";
    setTimeout(() => {
      copyFinderSnippet.textContent = "Copy";
    }, 1600);
  } catch (error) {
    console.error("Could not copy the favicon embed snippet.", error);
    setFinderStatus("Copy failed. Select and copy the snippet instead.", "error");
  }
});

window.addEventListener("beforeunload", () => {
  requestController?.abort();
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
});
