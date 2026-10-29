(() => {
  const root = document.documentElement;
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem("favicon-kit-theme");
  } catch {
    // Theme follows the system setting when browser storage is unavailable.
  }
  const theme =
    savedTheme === "light" || savedTheme === "dark"
      ? savedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";

  root.dataset.theme = theme;
})();
