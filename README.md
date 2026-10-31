# Favicon Kit

A browser-based favicon generator with a Netlify-hosted Favicon Finder API.

## Favicon Finder API

After deploying the project to Netlify, request an icon with:

```html
<img src="https://YOUR-SITE.netlify.app/icon?domain=github.com&size=128" alt="GitHub" width="128" height="128">
```

`domain` accepts a hostname or an HTTP(S) URL. `size` is optional and accepts an integer from 16 to 512; it controls the generated avatar dimensions, not the size of icons fetched from other sites.

The function checks declared favicon and Apple touch icon links, then `/favicon.ico`, then Open Graph images. If no usable image is found, it returns an SVG avatar with a domain-derived color. It checks DNS addresses and every redirect, only connects to public IP addresses on ports 80 or 443, and bounds response sizes, redirects, and request time.

Successful image responses are cached by Netlify's CDN for 24 hours, with stale responses allowed for up to seven days. Browser caches use a one-hour freshness period. The API returns discovered images in their original format and dimensions; it does not yet resize or convert them.

### Deploy and run locally

The included `netlify.toml` configures the Astro build and the `/icon` function route. Deploy the repository to Netlify to publish the static site and API together. `npm run dev` starts Astro only; to run the function locally, install the Netlify CLI and use `npx netlify-cli dev`.

Run API unit tests with Node.js 22.6 or newer:

```sh
npm run test:api
```

This initial version relies on Netlify CDN caching and does not include per-IP rate limiting. Review function usage and add a shared rate limiter before promoting the public endpoint for high-volume use.
