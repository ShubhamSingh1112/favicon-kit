import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";

const MAX_HTML_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const LOOKUP_TIMEOUT_MS = 1_500;
const REQUEST_TIMEOUT_MS = 3_000;
const LOOKUP_BUDGET_MS = 10_000;

type PublicAddress = {
  address: string;
  family: number;
};

type RemoteResponse = {
  body: Buffer;
  headers: import("node:http").IncomingHttpHeaders;
  statusCode: number;
  url: URL;
};

type IconCandidate = {
  url: string;
  size: number;
  priority: number;
};

type ImageResult = {
  body: Buffer;
  contentType: string;
  source: string;
};

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

export function isPublicIpAddress(address: string): boolean {
  const ip = stripIpv6Brackets(address);
  const family = isIP(ip);

  if (family === 4) {
    const octets = ip.split(".").map(Number);
    const [first, second, third] = octets;

    if (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 192 && second === 88 && third === 99) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113)
    ) {
      return false;
    }

    return true;
  }

  if (family !== 6) return false;
  const words = parseIpv6Words(ip);
  if (!words) return false;
  const firstWord = words[0];
  const secondWord = words[1];

  return (
    firstWord >= 0x2000 &&
    firstWord <= 0x3fff &&
    !(firstWord === 0x2001 && secondWord <= 0x01ff) &&
    !(firstWord === 0x2001 && secondWord === 0x0db8) &&
    !(firstWord === 0x3fff && secondWord <= 0x0fff) &&
    firstWord !== 0x2002
  );
}

function parseIpv6Words(address: string): number[] | null {
  let value = address.toLowerCase();
  const ipv4Tail = value.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4Tail) {
    const octets = ipv4Tail[1].split(".").map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    value = value.slice(0, -ipv4Tail[1].length) + `${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;

  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }
  return groups.map((group) => Number.parseInt(group, 16));
}

export function normalizeDomain(input: string): string | null {
  const value = input.trim();
  if (!value || value.length > 2_048 || /[\u0000-\u0020\\]/.test(value)) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))
  ) {
    return null;
  }

  const hostname = stripIpv6Brackets(url.hostname).toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname.length > 253) return null;
  if (isIP(hostname)) return isPublicIpAddress(hostname) ? hostname : null;

  const labels = hostname.split(".");
  if (
    labels.some(
      (label) =>
        label.length > 63 ||
        !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label)
    )
  ) {
    return null;
  }
  return hostname;
}

function parseHtmlAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

  for (const match of tag.matchAll(attributePattern)) {
    const name = match[1].toLowerCase();
    const rawValue = match[2] ?? match[3] ?? match[4] ?? "";
    attributes.set(
      name,
      rawValue.replace(/&(?:amp|quot|apos|lt|gt);/gi, (entity) => {
        const entities: Record<string, string> = {
          "&amp;": "&",
          "&quot;": '"',
          "&apos;": "'",
          "&lt;": "<",
          "&gt;": ">",
        };
        return entities[entity.toLowerCase()] ?? entity;
      })
    );
  }
  return attributes;
}

function getIconSize(sizes: string | undefined): number {
  if (!sizes) return 0;
  return Math.max(
    0,
    ...sizes
      .toLowerCase()
      .split(/\s+/)
      .map((size) => {
        const match = size.match(/^(\d{1,4})x(\d{1,4})$/);
        return match ? Math.min(Number(match[1]), Number(match[2])) : 0;
      })
  );
}

export function parseIconCandidates(html: string, pageUrl: string): {
  icons: IconCandidate[];
  openGraph: string[];
} {
  const icons: IconCandidate[] = [];
  const openGraph: string[] = [];

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseHtmlAttributes(match[0]);
    const rel = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
    const isIcon = rel.includes("icon") || rel.includes("apple-touch-icon");
    const href = attributes.get("href");
    if (!isIcon || !href) continue;

    try {
      const url = new URL(href, pageUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      icons.push({
        url: url.toString(),
        size: getIconSize(attributes.get("sizes")),
        priority: rel.includes("apple-touch-icon") ? 1 : 0,
      });
    } catch {
      continue;
    }
  }

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseHtmlAttributes(match[0]);
    const property = (attributes.get("property") ?? attributes.get("name") ?? "")
      .toLowerCase();
    const content = attributes.get("content");
    if (!content || !["og:image", "og:image:url"].includes(property)) continue;

    try {
      const url = new URL(content, pageUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        openGraph.push(url.toString());
      }
    } catch {
      continue;
    }
  }

  icons.sort((left, right) => right.size - left.size || left.priority - right.priority);
  return { icons, openGraph };
}

async function resolvePublicAddress(hostname: string, deadline: number): Promise<PublicAddress> {
  const host = stripIpv6Brackets(hostname);
  const family = isIP(host);
  if (family) {
    if (!isPublicIpAddress(host)) throw new Error("The requested host is not public.");
    return { address: host, family };
  }

  const timeout = Math.min(LOOKUP_TIMEOUT_MS, deadline - Date.now());
  if (timeout <= 0) throw new Error("The lookup timed out.");

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("The DNS lookup timed out.")), timeout);
      }),
    ]);

    if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) {
      throw new Error("The requested host does not resolve exclusively to public IP addresses.");
    }
    return { address: addresses[0].address, family: addresses[0].family };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function requestOnce(
  url: URL,
  address: PublicAddress,
  timeout: number,
  maxBytes: number
): Promise<RemoteResponse> {
  return new Promise((resolve, reject) => {
    const requester = url.protocol === "https:" ? httpsRequest : httpRequest;
    const hostname = stripIpv6Brackets(url.hostname);
    const request = requester(
      {
        hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        agent: false,
        servername: isIP(hostname) ? undefined : hostname,
        lookup: (_host, options, callback) => {
          if (options.all) {
            callback(null, [address]);
          } else {
            callback(null, address.address, address.family);
          }
        },
        headers: {
          "accept": "text/html,image/avif,image/webp,image/svg+xml,image/png,image/*;q=0.8,*/*;q=0.5",
          "accept-encoding": "identity",
          "user-agent": "FaviconKit-Finder/1.0",
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
          let redirectUrl: URL;
          try {
            redirectUrl = new URL(location, url);
          } catch (error) {
            response.resume();
            reject(error);
            return;
          }
          response.resume();
          response.once("end", () => {
            resolve({
              body: Buffer.alloc(0),
              headers: response.headers,
              statusCode,
              url: redirectUrl,
            });
          });
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.length;
          if (totalBytes > maxBytes) {
            response.destroy(new Error("The remote response exceeded the size limit."));
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks),
            headers: response.headers,
            statusCode,
            url,
          });
        });
        response.on("error", reject);
      }
    );

    request.setTimeout(timeout, () => request.destroy(new Error("The remote request timed out.")));
    request.once("error", reject);
    request.end();
  });
}

async function requestPublicUrl(
  input: string | URL,
  deadline: number,
  maxBytes: number
): Promise<RemoteResponse> {
  let url = new URL(input);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))
    ) {
      throw new Error("The remote URL is not allowed.");
    }

    const address = await resolvePublicAddress(url.hostname, deadline);
    const timeout = Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now());
    if (timeout <= 0) throw new Error("The favicon lookup timed out.");

    const response = await requestOnce(url, address, timeout, maxBytes);
    if (![301, 302, 303, 307, 308].includes(response.statusCode)) return response;
    if (redirect === MAX_REDIRECTS) throw new Error("The remote site redirected too many times.");
    url = response.url;
  }
  throw new Error("The remote site redirected too many times.");
}

function detectImageType(body: Buffer): string | null {
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return "image/jpeg";
  }
  if (body.length >= 6 && /^GIF8[79]a$/.test(body.toString("ascii", 0, 6))) {
    return "image/gif";
  }
  if (
    body.length >= 12 &&
    body.toString("ascii", 0, 4) === "RIFF" &&
    body.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (body.length >= 4 && body[0] === 0 && body[1] === 0 && body[2] === 1 && body[3] === 0) {
    return "image/x-icon";
  }

  const text = body.toString("utf8").replace(/^\uFEFF/, "").trimStart();
  const withoutProlog = text
    .replace(/^<\?xml[^>]*>\s*/i, "")
    .replace(/^(?:<!--[\s\S]*?-->\s*)+/, "");
  if (
    !/<!DOCTYPE|<!ENTITY/i.test(withoutProlog) &&
    /^<svg(?:\s|>)/i.test(withoutProlog)
  ) {
    return "image/svg+xml";
  }
  return null;
}

function imageResponse(body: Buffer, contentType: string, source: string): Response {
  const responseBody = new ArrayBuffer(body.byteLength);
  new Uint8Array(responseBody).set(body);
  return new Response(responseBody, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Content-Type": contentType,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Netlify-CDN-Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, durable",
      "Netlify-Vary": "query=domain|size",
      "X-Content-Type-Options": "nosniff",
      "X-Favicon-Source": source,
    },
  });
}

function jsonResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function createAvatarSvg(domain: string, size: number): string {
  let hash = 2166136261;
  for (const character of domain) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  const hue = (hash >>> 0) % 360;
  const label = Array.from(domain.replace(/^www\./i, ""))[0] ?? "?";
  const escapedLabel = label
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="hsl(${hue} 68% 48%)"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="${Math.round(size * 0.58)}" font-weight="700">${escapedLabel}</text></svg>`;
}

function parseRequestedSize(value: string | null): number | null {
  if (value === null) return 128;
  if (!/^\d{1,3}$/.test(value)) return null;
  const size = Number(value);
  return Number.isInteger(size) && size >= 16 && size <= 512 ? size : null;
}

async function fetchImage(url: string, source: string, deadline: number): Promise<ImageResult | null> {
  try {
    const response = await requestPublicUrl(url, deadline, MAX_IMAGE_BYTES);
    if (response.statusCode < 200 || response.statusCode >= 300) return null;
    const contentType = detectImageType(response.body);
    if (!contentType) return null;
    return { body: response.body, contentType, source };
  } catch {
    return null;
  }
}

async function findBestIcon(domain: string, deadline: number): Promise<ImageResult | null> {
  let page: RemoteResponse | null = null;
  const pageUrls = [`https://${domain}/`, `http://${domain}/`];

  for (const pageUrl of pageUrls) {
    try {
      const response = await requestPublicUrl(pageUrl, deadline, MAX_HTML_BYTES);
      const contentType = response.headers["content-type"]?.toLowerCase() ?? "";
      if (
        response.statusCode >= 200 &&
        response.statusCode < 300 &&
        (!contentType || contentType.includes("text/html") || contentType.includes("application/xhtml+xml"))
      ) {
        page = response;
        break;
      }
    } catch {
      continue;
    }
  }

  const iconCandidates: IconCandidate[] = [];
  let openGraph: string[] = [];
  if (page) {
    const parsed = parseIconCandidates(page.body.toString("utf8"), page.url.toString());
    iconCandidates.push(...parsed.icons.slice(0, 4));
    openGraph = parsed.openGraph.slice(0, 2);

    for (const candidate of iconCandidates) {
      const image = await fetchImage(candidate.url, "metadata", deadline);
      if (image) return image;
    }
  }

  const faviconUrls = [
    page ? new URL("/favicon.ico", page.url).toString() : null,
    `https://${domain}/favicon.ico`,
    `http://${domain}/favicon.ico`,
  ].filter((url): url is string => url !== null);
  for (const url of new Set(faviconUrls)) {
    const image = await fetchImage(url, "favicon", deadline);
    if (image) return image;
  }

  for (const url of openGraph) {
    const image = await fetchImage(url, "open-graph", deadline);
    if (image) return image;
  }
  return null;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "Allow": "GET", "Cache-Control": "no-store" },
    });
  }

  const url = new URL(request.url);
  const rawDomain = url.searchParams.get("domain");
  if (!rawDomain) return jsonResponse("A domain query parameter is required.", 400);

  const domain = normalizeDomain(rawDomain);
  if (!domain) return jsonResponse("Enter a valid public HTTP(S) domain.", 400);

  const size = parseRequestedSize(url.searchParams.get("size"));
  if (size === null) return jsonResponse("Size must be a whole number between 16 and 512.", 400);

  try {
    const icon = await findBestIcon(domain, Date.now() + LOOKUP_BUDGET_MS);
    if (icon) return imageResponse(icon.body, icon.contentType, icon.source);
    return imageResponse(
      Buffer.from(createAvatarSvg(domain, size)),
      "image/svg+xml; charset=utf-8",
      "fallback"
    );
  } catch (error) {
    console.error("Favicon lookup failed.", error);
    return jsonResponse("The favicon lookup could not be completed.", 502);
  }
}

export const config = {
  path: "/icon",
  method: ["GET"],
};
