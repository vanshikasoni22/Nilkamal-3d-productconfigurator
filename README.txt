NILKAMAL 3D CONFIGURATOR — WORKING PROTOTYPE
==============================================

RUN IT LOCALLY (do not double-click index.html directly — browsers
block local 3D model loading over the file:// protocol, it needs to
be served over http://)

Mac:
  1. Double-click "Run Demo.command" in this folder.
  2. Your browser opens automatically to the demo. Leave the black
     terminal window open while you use it — closing it stops the demo.

Manual method (Mac/Windows/Linux, if the script above doesn't run):
  1. Open Terminal / Command Prompt in this folder.
  2. Run:  python3 -m http.server 8000
  3. Open a browser to:  http://localhost:8000

DEPLOY IT (for sharing a live link)
  This is a static site — no build step, no server-side code, no
  database. Any static host works out of the box:
  1. Upload the entire contents of this folder (index.html, css/,
     js/, vendor/, assets/) preserving the folder structure.
  2. Works as-is on Netlify, Vercel, GitHub Pages, Cloudflare Pages,
     an S3 + CloudFront bucket, or a Shopify app-embed/page asset.
  3. No environment variables, no CDN dependency (Three.js and the
     Draco decoder are bundled locally), no API keys — just serve
     the files over HTTPS.
  4. If deployed under a sub-path (e.g. yoursite.com/configurator/),
     no path changes are needed — everything uses relative paths.

WHAT'S IN THIS DEMO
  - 5 categories: Modular Sofa, Bed, Wardrobe, Dining Set, Accent/Side Table
  - Real 3D models (compressed from the source .glb files you provided)
  - Live material/color swatches, layout & size options, add/remove modules
  - Real-time price updates, live width/height dimension callouts
  - Fully manual 360° control — drag to rotate, scroll to zoom, nothing
    spins or moves on its own
  - Clean flat studio lighting with no drop shadow under the model
  - Nilkamal-styled UI matching the real site (blue brand palette, logo)
  - Dummy "Add to Cart" — Shopify wiring comes in the production build

NOTES / KNOWN PROTOTYPE SIMPLIFICATIONS (flagging for transparency)
  - Side Table / Accent category has no source .glb yet, so it's built
    procedurally (simple geometry) as a placeholder — swap in a real
    asset before the client-facing pitch if you have one.
  - Bed/Wardrobe "size" options resize the existing model rather than
    swapping to unique geometry per size — fine for a demo, but a real
    build should use dedicated size variants for accuracy.
  - Sofa fabric color changes tint the entire baked material (the source
    sofa .glb files ship with one fused material), so legs/frame tint
    along with the fabric. Swappable per-part materials need re-exported
    assets with separated fabric/frame materials.
  - All prices are indicative placeholders, not live Nilkamal SKU data.
  - Everything runs 100% locally/offline — no CDN or internet dependency.

TECH: Three.js (bundled locally), Draco-compressed glTF, vanilla JS/HTML/CSS.
Original source files were 361MB combined; compressed to ~4MB for fast,
smooth in-browser loading.
