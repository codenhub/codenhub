const cap = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : (s ?? null));

/** Parse the RESULT block a worker ends with. Tolerant of formatting drift. */
export function parseResult(text) {
  const out = { status: null, summary: null, notes: [], verdict: null, report: null };
  if (!text) {
    return out;
  }
  const heads = [...text.matchAll(/^[\s*#_`]*RESULT[\s*_`:]*$/gm)];
  const last = heads.at(-1);
  const block = last ? text.slice(last.index + last[0].length) : "";
  if (!block) {
    out.summary = cap(text.trim().split(/\r?\n/).slice(-3).join(" "), 600);
    return out;
  }
  let key = null;
  const acc = {};
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.replace(/^\s*[*_`]+|[*_`]+\s*$/g, "");
    const m = line.match(/^\s*(status|summary|notes|verdict|report)\s*:\s*(.*)$/i);
    if (m && key !== "report") {
      key = m[1].toLowerCase();
      acc[key] = m[2] ? [m[2]] : [];
      continue;
    }
    if (key) {
      acc[key].push(raw);
    }
  }
  const join = (k) => (acc[k] ?? []).join("\n").trim() || null;
  out.status = join("status")?.split(/[\s|]/)[0].toLowerCase() ?? null;
  out.summary = cap(join("summary")?.replace(/^\s*[-*]\s+/gm, ""), 600);
  out.notes = (acc.notes ?? [])
    .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
    .filter((l) => l && !/^(none|n\/a|nothing)\.?$/i.test(l));
  out.verdict = join("verdict")?.split(/\s/)[0].toLowerCase() ?? null;
  const report = join("report");
  out.report = report;
  return out;
}

export function envelope(meta, extra = {}) {
  return {
    v: 1,
    id: meta.id,
    role: meta.role,
    status: meta.status,
    worker: meta.worker ?? null,
    isolation: meta.isolation,
    lineage: { rebriefOf: meta.rebriefOf ?? null, reviewOf: meta.reviewOf ?? null },
    summary: meta.summary ?? null,
    report: cap(meta.report, 4000),
    files: meta.files ?? { changed: [], outOfScope: [] },
    checks: meta.checks ?? [],
    denied: meta.denied ?? [],
    notes: meta.notes ?? [],
    hint: meta.hint ?? null,
    durationMs: meta.durationMs ?? null,
    applied: !!meta.applied,
    retryAvailable: !meta.retryUsed,
    logPath: meta.logPath ?? null,
    ...extra,
  };
}
