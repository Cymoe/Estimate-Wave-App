import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";

/**
 * /ads/<token>: one "make an ad for…" request (ads.makeFor), watched as it is made, on the backend's own address.
 * The app's preview address asks for a Vercel sign-in; this one needs nothing, so the owner can open it on any phone
 * and send it on. The page is one file with no outside scripts: it reads /ads/<token>.json every few seconds until
 * the ads are ready, and shows each video the moment it is drawn.
 */
export function addAdRoutes(http: HttpRouter) {
  http.route({
    pathPrefix: "/ads/",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const rest = decodeURIComponent(new URL(request.url).pathname.slice("/ads/".length));
      const wantsJson = rest.endsWith(".json");
      const token = wantsJson ? rest.slice(0, -".json".length) : rest;
      if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return notFound(wantsJson);
      const view = await ctx.runQuery(internal.ads.requestPage, { token });
      if (!view) return notFound(wantsJson);
      if (wantsJson) return new Response(JSON.stringify(view), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      return new Response(requestPageHtml(token), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }),
  });
}

function notFound(json: boolean) {
  return json
    ? new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } })
    : new Response(
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found</title></head><body style="font-family:-apple-system,system-ui,Arial,sans-serif;background:#F5F6F8;color:#333;text-align:center;padding:20vh 16px">This link isn't valid.</body></html>`,
        { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
      );
}

/** The page: the ask, the steps, one card per ad. Every value from the request goes in as text, never as markup. */
export function requestPageHtml(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>New ad · GoodFit Pros</title>
<style>
  :root { --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --brand:#336699; --ok:#059669; }
  * { box-sizing:border-box; }
  body { margin:0; background:#F5F6F8; color:var(--ink); font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; }
  main { max-width:36rem; margin:0 auto; padding:32px 16px 48px; }
  .eyebrow { font-size:12px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--brand); margin:0; }
  h1 { font-size:24px; line-height:1.2; margin:4px 0 0; }
  .about { font-size:14px; color:#4b5563; margin:8px 0 0; }
  ol.steps { list-style:none; padding:0; margin:20px 0 0; }
  ol.steps li { display:flex; align-items:center; gap:12px; font-size:14px; color:#9ca3af; margin:8px 0; }
  ol.steps li.done { color:var(--ink); }
  ol.steps li.now { color:var(--ink); font-weight:600; }
  .dot { width:20px; height:20px; border-radius:50%; border:1px solid #d1d5db; display:flex; align-items:center; justify-content:center; font-size:11px; flex:none; }
  li.done .dot { background:var(--ok); border-color:var(--ok); color:#fff; }
  li.now .dot { border:2px solid var(--brand); }
  li.now .dot::after { content:""; width:8px; height:8px; border-radius:50%; background:var(--brand); animation:pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity:.3; } }
  .fail { margin-top:20px; background:#fef2f2; color:#991b1b; padding:16px; border-radius:12px; font-size:14px; }
  .cards { margin-top:24px; display:grid; gap:16px; }
  article { background:#fff; border-radius:16px; padding:16px; box-shadow:0 1px 2px rgba(0,0,0,.05); border:1px solid var(--line); }
  .head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  h2 { font-size:16px; margin:0; }
  .sizes { display:flex; background:#f3f4f6; border-radius:999px; padding:2px; font-size:12px; }
  .sizes button { border:0; background:none; border-radius:999px; padding:4px 12px; color:var(--muted); font:inherit; }
  .sizes button[aria-pressed="true"] { background:#fff; color:var(--ink); font-weight:600; box-shadow:0 1px 2px rgba(0,0,0,.08); }
  .frame { margin:12px auto 0; background:#111827; border-radius:12px; overflow:hidden; display:flex; align-items:center; justify-content:center; color:#d1d5db; font-size:14px; text-align:center; }
  .frame.r9x16 { aspect-ratio:9/16; max-width:320px; }
  .frame.r4x5 { aspect-ratio:4/5; max-width:400px; }
  .frame video { width:100%; height:100%; object-fit:contain; display:block; background:#000; }
  .wait { padding:0 24px; }
  .wait::before { content:""; display:block; width:12px; height:12px; margin:0 auto 8px; border-radius:50%; background:#d1d5db; animation:pulse 1.2s ease-in-out infinite; }
  .built { font-size:12px; color:var(--muted); margin:12px 0 0; }
  details { margin-top:8px; font-size:14px; color:#374151; }
  summary { cursor:pointer; color:var(--muted); }
  details ol { padding-left:20px; margin:4px 0 0; }
  .copy { white-space:pre-line; color:var(--muted); }
  .foot { margin-top:24px; text-align:center; font-size:12px; color:var(--muted); }
</style>
</head>
<body>
<main>
  <p class="eyebrow">GoodFit Pros · new ad</p>
  <h1 id="ask">Loading…</h1>
  <p class="about" id="about" hidden></p>
  <div id="status"></div>
  <div class="cards" id="cards"></div>
  <p class="foot" id="foot" hidden>Nothing runs until you approve it in Ops → Ads.</p>
</main>
<script>
(function () {
  var TOKEN = ${JSON.stringify(token)};
  var STEPS = [["reading","Reading your request"],["writing","Writing the versions"],["voicing","Recording the voice"],["drawing","Drawing the videos"],["ready","Ready to watch"]];
  var ORDER = ["Story","Lesson","Quick offer"];
  var LABEL = { "Lesson": "Checklist" };
  var chosen = {};
  var shownFile = {};
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function groups(ads) {
    var by = {};
    ads.forEach(function (a) {
      // One card per ad: only the size (and a still's tag) is dropped, so a quick offer on the story's idea, named
      // with a "_2", keeps its own card.
      var key = a.name.replace(/_(916|45)(?=_|$)/, "").replace(/_still$/, "");
      (by[key] = by[key] || []).push(a);
    });
    return Object.keys(by).map(function (k) { return { key: k, ads: by[k] }; })
      .sort(function (a, b) { return ORDER.indexOf(a.ads[0].angle) - ORDER.indexOf(b.ads[0].angle); });
  }
  function steps(stage) {
    var at = STEPS.map(function (s) { return s[0]; }).indexOf(stage);
    var ol = el("ol", { "class": "steps", "aria-label": "Progress" });
    STEPS.forEach(function (s, i) {
      var done = i < at || stage === "ready";
      var now = i === at && stage !== "ready";
      var li = el("li", { "class": done ? "done" : now ? "now" : "" });
      li.appendChild(el("span", { "class": "dot", "aria-hidden": "true" }, done ? "✓" : ""));
      li.appendChild(document.createTextNode(s[1] + (now ? "…" : "")));
      ol.appendChild(li);
    });
    return ol;
  }
  function card(g) {
    var videos = g.ads.filter(function (a) { return !a.image; });
    var first = g.ads[0];
    var art = document.getElementById("card-" + g.key);
    if (!art) {
      art = el("article", { id: "card-" + g.key });
      var head = el("div", { "class": "head" });
      head.appendChild(el("h2", null, LABEL[first.angle] || first.angle));
      if (videos.length > 1) {
        var sizes = el("div", { "class": "sizes", role: "group", "aria-label": "Size" });
        [["9x16","Tall"],["4x5","Square-ish"]].forEach(function (r) {
          var b = el("button", { type: "button", "data-r": r[0] }, r[1]);
          b.onclick = function () { chosen[g.key] = r[0]; render(last); };
          sizes.appendChild(b);
        });
        head.appendChild(sizes);
      }
      art.appendChild(head);
      art.appendChild(el("div", { "class": "frame" }));
      if (first.builtOn) art.appendChild(el("p", { "class": "built" }, "Built on " + first.builtOn.company + "'s ad" + (first.builtOn.daysRunning ? ", running " + first.builtOn.daysRunning + " days" : "") + "."));
      var d = el("details");
      d.appendChild(el("summary", null, "What it says"));
      d.appendChild(el("p", null, first.headline)).style.fontWeight = "600";
      var ol = el("ol");
      first.lines.forEach(function (l) { ol.appendChild(el("li", null, l)); });
      d.appendChild(ol);
      if (first.primaryText) d.appendChild(el("p", { "class": "copy" }, first.primaryText));
      art.appendChild(d);
    }
    var want = chosen[g.key] || "9x16";
    var shown = videos.filter(function (a) { return a.ratio === want; })[0] || videos[0] || first;
    art.querySelectorAll(".sizes button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-r") === shown.ratio)); });
    var frame = art.querySelector(".frame");
    frame.className = "frame r" + shown.ratio;
    // A playing video is left alone; it is only replaced when another file is to be shown.
    if (shown.file && shownFile[g.key] !== shown.file) {
      frame.textContent = "";
      frame.appendChild(el("video", { src: shown.file, controls: "", playsinline: "", preload: "metadata" }));
      shownFile[g.key] = shown.file;
    } else if (!shown.file) {
      shownFile[g.key] = null;
      frame.textContent = "";
      frame.appendChild(el("div", { "class": "wait" }, shown.status === "failed" ? "This one couldn't be drawn." : shown.status === "draft" ? "Recording the voice…" : "Being drawn…"));
    }
    return art;
  }
  var last = null;
  function render(view) {
    last = view;
    document.getElementById("ask").textContent = "\\u201C" + view.ask + "\\u201D";
    var about = document.getElementById("about");
    if (view.idea) { about.hidden = false; about.textContent = [view.trade, view.town, view.idea].filter(Boolean).join(" · "); }
    var status = document.getElementById("status");
    status.textContent = "";
    if (view.stage === "failed") status.appendChild(el("p", { "class": "fail", role: "alert" }, "This one couldn't be made. " + (view.error || "")));
    else status.appendChild(steps(view.stage));
    var cards = document.getElementById("cards");
    groups(view.ads).forEach(function (g) { cards.appendChild(card(g)); });
    var foot = document.getElementById("foot");
    foot.hidden = view.ads.length === 0;
    var missed = view.stage === "ready" ? view.skipped.length : 0;
    foot.textContent = (missed ? missed + (missed === 1 ? " version" : " versions") + " couldn't be made from the photos on file. " : "") + "Nothing runs until you approve it in Ops \u2192 Ads.";
  }
  function load() {
    fetch(TOKEN + ".json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (view) {
        if (!view) { document.getElementById("ask").textContent = "This link isn't valid."; return; }
        render(view);
        if (view.stage !== "ready" && view.stage !== "failed") setTimeout(load, 5000);
      })
      .catch(function () { setTimeout(load, 10000); });
  }
  load();
})();
</script>
</body>
</html>`;
}
