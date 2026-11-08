// The ad review page, as plain HTML: drafts to approve or reject, retire
// suggestions, and how every approved ad is doing. Served by http.ts at
// /review?key=REVIEW_KEY; its buttons post back to /review.

type Perf = { sourceAdId: string; kind?: string; angle?: string; status?: string; applicants: number; A: number; aRate: number | null; booked: number; showRate: number | null; spendCents?: number; aPer100: number | null };
type Draft = { id: string; kind: string; angle: string; title?: string; body: string; variationOf?: string; warnings: string[] };
export type ReviewData = Array<{
  client: { id: string; name: string; adsEnabled: boolean };
  writing: boolean;
  failed?: string;
  latest: { createdAt: string; learningNotes?: string; problems: string[]; variations: number; fresh: number } | null;
  drafts: Draft[];
  retire: Array<{ sourceAdId: string; reason: string }>;
  performance: Perf[];
}>;

const KIND: Record<string, string> = { hook: "Hooks", meta_primary: "Meta primary texts", video_script: "Video scripts", indeed: "Indeed postings" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

function button(key: string, fields: Record<string, string>, label: string, style = "") {
  const hidden = Object.entries({ key, ...fields })
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");
  return `<form method="post" action="/review" style="display:inline">${hidden}<button ${style ? `class="${style}"` : ""}>${esc(label)}</button></form>`;
}

export function reviewPage(data: ReviewData, key: string, notice?: string): string {
  const clients = data
    .map((c) => {
      const byKind = Object.keys(KIND)
        .map((kind) => {
          const drafts = c.drafts.filter((d) => d.kind === kind);
          if (!drafts.length) return "";
          return `<h4>${KIND[kind]} <span class="muted">${drafts.length}</span></h4>${drafts
            .map(
              (d) => `<div class="card${d.warnings.length ? " warn" : ""}">
  <div class="meta"><span class="tag">${esc(d.angle)}</span> ${d.variationOf ? `riff on <b>${esc(d.variationOf)}</b>` : "new angle"}</div>
  ${d.title ? `<div class="title">${esc(d.title)}</div>` : ""}
  <div class="body">${esc(d.body)}</div>
  ${d.warnings.length ? `<ul class="warnings">${d.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
  <div class="actions">${button(key, { action: "approve", adId: d.id }, "Approve", "primary")} ${button(key, { action: "reject", adId: d.id }, "Reject")}</div>
</div>`,
            )
            .join("")}`;
        })
        .join("");
      const clean = c.drafts.filter((d) => d.warnings.length === 0).length;
      const perf = c.performance.length
        ? `<table><tr><th>Source ad id</th><th>Kind</th><th>Angle</th><th>Applicants</th><th>A</th><th>A rate</th><th>Booked</th><th>Show rate</th><th>Spend</th><th>A's per $100</th></tr>${c.performance
            .map(
              (r) =>
                `<tr${r.status === "retired" ? ' class="muted"' : ""}><td>${esc(r.sourceAdId)}${r.status === "retired" ? " (retired)" : ""}</td><td>${esc(r.kind ? KIND[r.kind]?.replace(/s$/, "") ?? r.kind : "–")}</td><td>${esc(r.angle ?? "–")}</td><td>${r.applicants}</td><td>${r.A}</td><td>${pct(r.aRate)}</td><td>${r.booked}</td><td>${pct(r.showRate)}</td><td>${r.spendCents ? `$${Math.round(r.spendCents / 100).toLocaleString("en-US")}` : "–"}</td><td>${r.aPer100 === null ? "–" : r.aPer100.toFixed(2)}</td></tr>`,
            )
            .join("")}</table>`
        : `<p class="muted">No ads approved or running yet.</p>`;
      return `<section id="c-${esc(c.client.id)}">
  <h2>${esc(c.client.name)}</h2>
  <p>${c.writing ? "<b>Writing a batch now…</b> Refresh in a minute." : button(key, { action: "write", clientId: c.client.id }, "Write a new batch now")} <span class="muted">${c.client.adsEnabled ? "A new batch is written every Monday." : "Weekly batches are off for this client."}</span></p>
  ${c.failed ? `<p class="error">The last batch failed: ${esc(c.failed)}</p>` : ""}
  ${
    c.latest
      ? `<div class="notes"><b>Latest batch</b> (${esc(c.latest.createdAt.slice(0, 10))}): ${c.latest.variations} riffs on winners, ${c.latest.fresh} new angles.${c.latest.problems.length ? `<br><span class="error">${c.latest.problems.map(esc).join("; ")}</span>` : ""}${c.latest.learningNotes ? `<div class="body">${esc(c.latest.learningNotes)}</div>` : ""}</div>`
      : ""
  }
  ${c.drafts.length ? `<h3>To review (${c.drafts.length}) ${clean ? button(key, { action: "approve_clean", clientId: c.client.id }, `Approve the ${clean} without warnings`) : ""}</h3>${byKind}` : `<p class="muted">Nothing waiting for review.</p>`}
  ${
    c.retire.length
      ? `<h3>Suggested to retire</h3>${c.retire.map((r) => `<div class="card"><b>${esc(r.sourceAdId)}</b>: ${esc(r.reason)} ${button(key, { action: "retire", sourceAdId: r.sourceAdId }, "Retire it")}</div>`).join("")}`
      : ""
  }
  <h3>How the ads are doing</h3>${perf}
</section>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ad review</title>
<style>
body{font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;max-width:920px;margin:0 auto;padding:16px;color:#111;background:#fafafa}
h1{font-size:22px}h2{font-size:20px;margin-top:40px;border-top:2px solid #ddd;padding-top:16px}h3{font-size:16px;margin-top:24px}h4{font-size:14px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#555}
.card{background:#fff;border:1px solid #ddd;padding:12px;margin:8px 0}.card.warn{border-color:#d97706}
.meta{font-size:13px;color:#555}.tag{background:#eef2ff;color:#3730a3;padding:1px 6px;font-size:12px}
.title{font-weight:600;margin-top:6px}.body{white-space:pre-wrap;margin-top:6px}
.warnings{color:#b45309;margin:8px 0 0;padding-left:18px;font-size:13px}.error{color:#b91c1c}.muted{color:#777}
.notes{background:#fff;border-left:3px solid #3730a3;padding:8px 12px;margin:8px 0}
.actions{margin-top:10px}button{font:inherit;padding:6px 12px;border:1px solid #999;background:#fff;cursor:pointer}button.primary{background:#336699;border-color:#336699;color:#fff}
table{border-collapse:collapse;width:100%;font-size:13px;background:#fff}td,th{border-bottom:1px solid #e5e5e5;padding:5px 6px;text-align:left}
.notice{background:#ecfdf5;border:1px solid #10b981;padding:8px 12px}
</style></head><body>
<h1>Ad review: National Sales Registry</h1>
<p class="muted">Nothing runs until it's approved here. Approving gives the ad its source ad id: put that id on the live ad so applicants trace back to it. <a href="/ads/approved.csv?key=${encodeURIComponent(key)}">Approved ads (CSV)</a> for the video team and the media buyer.</p>
${notice ? `<p class="notice">${esc(notice)}</p>` : ""}
${clients || "<p>No active clients yet.</p>"}
</body></html>`;
}
