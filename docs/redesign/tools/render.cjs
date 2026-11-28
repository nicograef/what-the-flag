// Renders every prototype to PNG: clean and annotated screens of the final design, clean
// explorations, and optionally one PDF of all annotated screens.
// Usage: node docs/redesign/tools/render.cjs [--pdf <file.pdf>]
// Needs Playwright with Chromium. Google Fonts must be reachable for the right typefaces.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "screens");
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "text/html" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

(async () => {
  const pdfIndex = process.argv.indexOf("--pdf");
  const pdfPath = pdfIndex > 0 ? path.resolve(process.argv[pdfIndex + 1]) : null;
  const annotations = JSON.parse(fs.readFileSync(path.join(__dirname, "annotations.json"), "utf8"));
  fs.mkdirSync(path.join(out, "annotated"), { recursive: true });
  fs.mkdirSync(path.join(out, "explorations"), { recursive: true });

  const server = await serve();
  const base = `http://localhost:${server.address().port}/tools/preview.html`;
  const browser = await chromium.launch();

  for (const [id, meta] of Object.entries(annotations.screens)) {
    const page = await browser.newPage({ viewport: { width: meta.w + 520, height: meta.h + 48 }, deviceScaleFactor: 2 });
    await page.goto(`${base}?board=${id}&annotate=1`);
    await page.waitForSelector("body[data-ready='1']", { timeout: 15000 });
    await page.locator("#page").screenshot({ path: path.join(out, "annotated", `${id}.png`) });
    await page.evaluate(() => { document.getElementById("marks").style.display = "none"; });
    await page.locator("#stage").screenshot({ path: path.join(out, `${id}.png`) });
    await page.close();
    console.log("rendered", id);
  }

  for (const id of annotations.explorations) {
    const page = await browser.newPage({ viewport: { width: 438, height: 892 }, deviceScaleFactor: 1 });
    await page.goto(`${base}?board=explorations/${id}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    await page.locator("#stage").screenshot({ path: path.join(out, "explorations", `${id}.png`) });
    await page.close();
    console.log("rendered explorations/" + id);
  }

  if (pdfPath) {
    const page = await browser.newPage();
    const imgs = Object.keys(annotations.screens)
      .map((id) => `<section><img src="${base.replace("tools/preview.html", "")}screens/annotated/${id}.png"></section>`)
      .join("");
    await page.setContent(`<!doctype html><html><head><style>
      @page { size: A4 landscape; margin: 10mm; }
      body { margin: 0; background: #0B0C1A; }
      section { page-break-after: always; height: 188mm; display: flex; align-items: center; justify-content: center; }
      img { max-width: 100%; max-height: 100%; }
    </style></head><body>${imgs}</body></html>`, { waitUntil: "networkidle" });
    await page.pdf({ path: pdfPath, format: "A4", landscape: true, printBackground: true });
    console.log("wrote", pdfPath);
  }

  await browser.close();
  server.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
