# Nilkamal 3D Product Configurator

A working, browser-based 3D furniture configurator built for Nilkamal — benchmarked against IKEA's modular sofa planner. Real GLB models, live material/color swatches, real-time pricing, and full 360° manual control, running as a static site with zero build step and no CDN dependency.

**Live demo:** https://nilkamal-3d-productconfigurator.vercel.app

## Features

- **5 product categories** — Modular Sofas, Beds, Wardrobes, Dining Sets, and Accent/Side Tables, each with its own variant, size/layout, and color options.
- **Real 3D models** — Draco-compressed, WebP-textured glTF assets (compressed from ~361 MB of source files down to a few MB) rendered with Three.js and physically-based materials under studio lighting.
- **Manual 360° control only** — drag to rotate, scroll to zoom. Nothing spins or moves on its own.
- **Live pricing** — updates instantly as the shopper changes variant, size, color, texture, and add-on modules, including strike-through MRP, savings badge, and EMI estimate.
- **Fabric & wood swatches** — with an optional woven-fabric / wood-grain texture toggle, generated procedurally so any swatch color works without needing a photographed texture per color.
- **Live dimension callouts** — width/height measurement lines that track the model at any camera angle, toggled on/off via a floating ruler button (off by default, matching a cleaner default viewport).
- **Soft contact shadow** — a blurred ground shadow under the model for a grounded, premium product-shot look, without the cost or artifacts of real-time shadow mapping.
- **Nilkamal-branded UI** — matches the real nilkamalfurniture.com blue palette and logo.
- **Dummy "Add to Cart"** — UI and pricing are fully wired; real Shopify checkout would be the next step for production.

## Tech stack

- [Three.js](https://threejs.org/) (vendored locally, no CDN) — rendering, GLTFLoader, DRACOLoader, OrbitControls, PMREM studio environment.
- Draco-compressed glTF 2.0 assets with WebP textures.
- Vanilla JS (ES modules via import maps), HTML, CSS — no framework, no bundler, no build step.

## Project structure

```
index.html             Page shell, header/nav, viewer + config panel markup
css/style.css          All styling (brand tokens, layout, viewer chrome)
js/data.js             Product catalog: variants, sizes, swatches, pricing
js/main.js             Scene setup, model loading, material logic, UI wiring
vendor/                Local Three.js build + Draco decoder (no CDN needed)
assets/                Compressed GLB models, grouped by category
```

## Run it locally

Browsers block local 3D model loading over `file://`, so serve the folder over HTTP:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. On Mac, double-clicking `Run Demo.command` does this automatically.

## Deploy

This is a static site — any static host works with zero configuration:

1. Upload the folder contents (`index.html`, `css/`, `js/`, `vendor/`, `assets/`), preserving structure.
2. Works as-is on **Vercel**, Netlify, GitHub Pages, Cloudflare Pages, or an S3 + CloudFront bucket.
3. No environment variables, no CDN dependency, no API keys.
4. Works under a sub-path too (e.g. `yoursite.com/configurator/`) — everything uses relative paths.

**Deploying on Vercel:** import this repo, set Framework Preset to **Other**, leave Build/Output/Install commands blank, and deploy.

## Known prototype simplifications

- The Accent/Side Table category has no source GLB yet, so it's built procedurally as a placeholder — swap in a real asset before a client-facing pitch if one becomes available.
- Bed/Wardrobe "size" options resize the existing model rather than swapping to unique geometry per size. The Sofa category's 2-Seater/3-Seater layouts work the same way — the "3-Seater" is the 2-Seater model scaled up, not a separately modeled asset, since only one base sofa geometry was provided per line.
- Sofa fabric color changes tint the whole body material; legs/frame are a separate geometric region split by mesh position, not a name-based material (the source files ship with a single fused material).
- All prices are indicative placeholders, not live Nilkamal SKU data.
- Everything runs fully offline/locally — no CDN or internet dependency at runtime.

## Credits

Built as a client pitch prototype for Nilkamal. Original source models were provided by the client; this repo contains the compressed, production-ready versions used by the demo.
