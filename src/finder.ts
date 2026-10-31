const finderForm = document.getElementById("finderForm") as HTMLFormElement;
const finderDomain = document.getElementById("finderDomain") as HTMLInputElement;
const finderSize = document.getElementById("finderSize") as HTMLSelectElement;
const finderResult = document.getElementById("finderResult") as HTMLElement;
const finderPreview = document.getElementById("finderPreview") as HTMLImageElement;
const finderResultTitle = document.getElementById("finderResultTitle") as HTMLElement;
const finderStatus = document.getElementById("finderStatus") as HTMLElement;
const finderSnippet = document.getElementById("finderSnippet") as HTMLElement;
const copyFinderSnippet = document.getElementById("copyFinderSnippet") as HTMLButtonElement;

function updateFinder(domain: string) {
  const size = finderSize.value;
  const apiUrl = new URL("/icon", window.location.origin);
  apiUrl.searchParams.set("domain", domain);
  apiUrl.searchParams.set("size", size);

  finderResult.hidden = false;
  finderPreview.alt = `Favicon for ${domain}`;
  finderPreview.dataset.domain = domain;
  finderStatus.textContent = "Loading icon…";
  finderResultTitle.textContent = domain;
  finderPreview.src = apiUrl.toString();

  const escapedDomain = domain.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  finderSnippet.textContent =
    `<img src="${apiUrl.toString()}" alt="${escapedDomain} icon" width="${size}" height="${size}">`;
  copyFinderSnippet.disabled = false;
}

finderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const domain = finderDomain.value.trim();
  if (!domain) {
    finderDomain.focus();
    return;
  }
  updateFinder(domain);
});

finderPreview.addEventListener("load", () => {
  finderStatus.textContent = "Ready to embed";
});

finderPreview.addEventListener("error", () => {
  finderStatus.textContent = "The API is unavailable on this preview. Deploy to Netlify to try it.";
});

finderSize.addEventListener("change", () => {
  const domain = finderPreview.dataset.domain;
  if (domain) updateFinder(domain);
});

document.querySelectorAll<HTMLAnchorElement>(".finder-example").forEach((example) => {
  example.addEventListener("click", (event) => {
    event.preventDefault();
    const domain = example.dataset.domain;
    if (!domain) return;
    finderDomain.value = domain;
    updateFinder(domain);
    finderDomain.focus();
  });
});

copyFinderSnippet.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(finderSnippet.textContent ?? "");
    copyFinderSnippet.textContent = "Copied";
    finderStatus.textContent = "Embed snippet copied.";
    setTimeout(() => {
      copyFinderSnippet.textContent = "Copy";
    }, 1600);
  } catch (error) {
    console.error("Could not copy the favicon embed snippet.", error);
    finderStatus.textContent = "Copy failed. Select and copy the snippet instead.";
  }
});
