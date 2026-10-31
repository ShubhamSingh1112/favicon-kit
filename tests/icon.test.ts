import assert from "node:assert/strict";
import test from "node:test";
import handler, {
  isPublicIpAddress,
  normalizeDomain,
  parseIconCandidates,
} from "../netlify/functions/icon.ts";

test("rejects private and special-use IP addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.20.1.5",
    "192.168.1.1",
    "192.0.2.10",
    "169.254.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "3fff::1",
  ]) {
    assert.equal(isPublicIpAddress(address), false, `${address} must not be public`);
  }
});

test("accepts public IP addresses", () => {
  assert.equal(isPublicIpAddress("1.1.1.1"), true);
  assert.equal(isPublicIpAddress("2606:4700:4700::1111"), true);
});

test("normalizes domains and rejects unsafe URL inputs", () => {
  assert.equal(normalizeDomain("https://GitHub.com/docs?tab=readme"), "github.com");
  assert.equal(normalizeDomain("example.com"), "example.com");

  for (const value of [
    "http://127.0.0.1",
    "http://10.0.0.1",
    "https://user:pass@example.com",
    "ftp://example.com",
    "https://example.com:8443",
    "example.com/path with spaces",
  ]) {
    assert.equal(normalizeDomain(value), null, `${value} must be rejected`);
  }
});

test("orders icon candidates by declared size and resolves relative URLs", () => {
  const { icons, openGraph } = parseIconCandidates(
    `<link rel="icon" href="/small.png" sizes="32x32">
     <link href="/large.svg" sizes="any" rel="icon">
     <link rel="apple-touch-icon" href="/apple.png" sizes="180x180">
     <meta property="og:image" content="/share.png?from=site&amp;size=large">
     <link rel="icon" href="javascript:alert(1)">`,
    "https://example.com/page"
  );

  assert.deepEqual(
    icons.map(({ url, size }) => [url, size]),
    [
      ["https://example.com/apple.png", 180],
      ["https://example.com/small.png", 32],
      ["https://example.com/large.svg", 0],
    ]
  );
  assert.deepEqual(openGraph, ["https://example.com/share.png?from=site&size=large"]);
});

test("returns clear errors for malformed API requests", async () => {
  const missingDomain = await handler(new Request("https://faviconkit.test/icon"));
  assert.equal(missingDomain.status, 400);
  assert.deepEqual(await missingDomain.json(), {
    error: "A domain query parameter is required.",
  });

  const privateDomain = await handler(
    new Request("https://faviconkit.test/icon?domain=127.0.0.1")
  );
  assert.equal(privateDomain.status, 400);

  const invalidSize = await handler(
    new Request("https://faviconkit.test/icon?domain=example.com&size=900")
  );
  assert.equal(invalidSize.status, 400);
});

test("returns a generated avatar without connecting to a private host", async () => {
  const response = await handler(
    new Request("https://faviconkit.test/icon?domain=localhost&size=64")
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/svg+xml; charset=utf-8");
  assert.equal(response.headers.get("x-favicon-source"), "fallback");
  assert.match(await response.text(), /width="64" height="64"/);
  assert.match(response.headers.get("netlify-cdn-cache-control") ?? "", /durable|86400/);
});

test("allows only GET requests", async () => {
  const response = await handler(
    new Request("https://faviconkit.test/icon?domain=example.com", { method: "POST" })
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
});
