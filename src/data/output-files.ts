export const outputFiles = [
  { name: "favicon.ico", detail: "16, 32 & 48 px · browser tabs", icon: "Image", kind: "image" },
  { name: "favicon-16x16.png", detail: "16 × 16 · compact tabs", icon: "Image", kind: "image" },
  { name: "favicon-32x32.png", detail: "32 × 32 · standard tabs", icon: "Image", kind: "image" },
  { name: "apple-touch-icon.png", detail: "180 × 180 · iPhone & iPad", icon: "Smartphone", kind: "image" },
  { name: "icon-192.png", detail: "192 × 192 · Android", icon: "Smartphone", kind: "image" },
  { name: "icon-512.png", detail: "512 × 512 · PWA install", icon: "Image", kind: "image" },
  { name: "icon-512-maskable.png", detail: "512 × 512 · adaptive safe area", icon: "Image", kind: "image" },
  { name: "site.webmanifest", detail: "App name, colours & install settings", icon: "FileJson", kind: "code" },
  { name: "head-snippet.html", detail: "Link tags for your page", icon: "FileCode2", kind: "code" },
  { name: "framework-setup.txt", detail: "Selected React, Next.js or Astro setup", icon: "Code2", kind: "code" },
  { name: "README.txt", detail: "Quick setup instructions", icon: "FileText", kind: "code" },
] as const;

export type OutputFileName = (typeof outputFiles)[number]["name"];
