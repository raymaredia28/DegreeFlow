// Copied from `App.jsx` (export HTML builder) so it can be unit-tested in isolation.
export const buildExportHtmlFromDegreeResult = (
  degreeResult,
  transcriptTerms = [],
  sourceLabel = '',
  meta = {}
) => {
  const esc = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const groups = Array.isArray(degreeResult?.groups) ? degreeResult.groups : [];

  const courseIndex = new Map();
  (transcriptTerms || []).forEach((term) => {
    (term.courses || []).forEach((c) => {
      const key = (c.code || '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (key && !courseIndex.has(key)) {
        courseIndex.set(key, { ...c, termLabel: term.label, termStatus: term.status });
      }
    });
  });

  const overallSatisfied = groups.filter((g) => g.satisfied).length;
  const overallTotal = groups.length;
  const pctDone = overallTotal > 0 ? Math.round((overallSatisfied / overallTotal) * 100) : 0;

  const summaryRow = `<tr>
    <td><strong>Overall</strong></td>
    <td>${overallSatisfied === overallTotal ? 'Met' : 'Not Met'}</td>
    <td>${overallSatisfied}/${overallTotal} groups</td>
    <td>${pctDone}%</td>
  </tr>`;

  const areasSections = groups
    .map((group) => {
      const name = esc(group.name || '');
      const satisfied = group.satisfied;
      const metLabel = satisfied ? 'Met' : 'Not Met';
      const earned = Number(group.earnedCredits ?? 0);
      const required = Number(group.requiredCredits ?? 0);
      const pct = required > 0
        ? Math.min(Math.round((earned / required) * 100), 100)
        : (satisfied ? 100 : 0);

      const creditLine =
        required > 0
          ? `Earned: ${earned} / ${required} credits (${pct}%)`
          : satisfied
            ? 'Satisfied'
            : 'Not satisfied';

      const usedCourses = group.usedCourses || [];
      let courseRows = '';
      if (usedCourses.length > 0) {
        courseRows = usedCourses
          .map((code) => {
            const c = courseIndex.get(code) || {};
            const credits = c.credits != null ? Number(c.credits).toFixed(2) : '';
            const grade = esc(c.grade || '');
            const title = esc(c.title || '');
            const term = esc(c.termLabel || '');
            const transfer = c.transfer ? 'T' : 'H';
            return `<tr>
          <td>${esc(code)}</td><td>${title}</td><td>${credits}</td><td>${grade}</td><td>${term}</td><td>${transfer}</td>
        </tr>`;
          })
          .join('');
      }

      const missingHtml =
        (group.missing || []).length > 0
          ? `<p class="missing">Still needed: ${group.missing.map(esc).join('; ')}</p>`
          : '';

      return `<div class="area">
      <div class="area-hdr ${satisfied ? 'met' : 'notmet'}">
        <strong>${name}</strong> <span class="badge">${metLabel}</span>
      </div>
      <p class="area-summary">${creditLine}</p>
      ${
        courseRows
          ? `<table class="rows"><thead><tr>
        <th>Course</th><th>Title</th><th>Credits</th><th>Grade</th><th>Term</th><th>Source</th>
      </tr></thead><tbody>${courseRows}</tbody></table>`
          : ''
      }
      ${missingHtml}
    </div>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>DegreeFlow — Degree Evaluation Export</title>
<style>
  @page { margin: 16mm 12mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; padding: 24px 28px; color: #111827; font-size: 11px; }
  h1 { margin: 0; color: #500000; font-size: 18px; }
  .subtitle { margin: 2px 0 14px 0; color: #4b5563; font-size: 11px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 16px; font-size: 11px; }
  .info-grid span.label { font-weight: 600; }
  .progress-bar { height: 10px; border-radius: 5px; background: #e5e7eb; margin: 8px 0 16px 0; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 5px; }
  table.summary { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  table.summary th, table.summary td { border: 1px solid #d1d5db; padding: 6px 10px; font-size: 11px; text-align: left; }
  table.summary th { background: #500000; color: white; }
  .area { margin-bottom: 14px; page-break-inside: avoid; }
  .area-hdr { padding: 5px 10px; border-radius: 4px; font-size: 12px; }
  .area-hdr.met { background: #dcfce7; color: #166534; }
  .area-hdr.notmet { background: #fee2e2; color: #991b1b; }
  .badge { float: right; font-weight: 600; }
  .area-summary { margin: 4px 0 6px 0; color: #4b5563; font-size: 10px; }
  .missing { margin: 2px 0 6px 0; color: #991b1b; font-size: 10px; font-style: italic; }
  table.rows { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.rows th, table.rows td { border: 1px solid #d1d5db; padding: 3px 6px; font-size: 10px; text-align: left; }
  table.rows th { background: #f3f4f6; font-weight: 600; }
</style>
</head>
<body>
  <h1>Degree Evaluation Export</h1>
  <p class="subtitle">${esc(degreeResult?.requirementSet?.name || 'Degree Evaluation')}${degreeResult?.requirementSet?.catalog_year ? ' &mdash; Catalog ' + esc(degreeResult.requirementSet.catalog_year) : ''}</p>
  <div class="info-grid">
    <div><span class="label">Source:</span> ${esc(sourceLabel || 'Computed in DegreeFlow')}</div>
    <div><span class="label">Generated:</span> ${new Date().toLocaleString()}</div>
    ${meta?.minor ? `<div><span class="label">Minor:</span> ${esc(meta.minor)}</div>` : ''}
  </div>
  <div class="progress-bar"><div class="progress-fill" style="width:${pctDone}%;background:${pctDone === 100 ? '#16a34a' : '#500000'}"></div></div>
  <table class="summary"><thead><tr><th>Requirement</th><th>Status</th><th>Progress</th><th>%</th></tr></thead><tbody>${summaryRow}${groups
    .map((g) => {
      const e = Number(g.earnedCredits ?? 0);
      const r = Number(g.requiredCredits ?? 0);
      const p = r > 0 ? Math.min(Math.round((e / r) * 100), 100) : (g.satisfied ? 100 : 0);
      return `<tr><td>${esc(g.name)}</td><td>${g.satisfied ? 'Met' : 'Not Met'}</td><td>${e}/${r} credits</td><td>${p}%</td></tr>`;
    })
    .join('')}</tbody></table>
  ${areasSections}
  ${(() => {
    const wna = Array.isArray(degreeResult?.workNotApplied) ? degreeResult.workNotApplied : [];
    if (wna.length === 0) return '';
    const wnaRows = wna.map((entry) => {
      const c = courseIndex.get(entry.code) || {};
      const credits = entry.credits != null ? Number(entry.credits).toFixed(2) : (c.credits != null ? Number(c.credits).toFixed(2) : '');
      const grade = esc(c.grade || '');
      const title = esc(c.title || '');
      const term = esc(c.termLabel || '');
      const transfer = c.transfer ? 'T' : 'H';
      const potential = (entry.potentialGroups || []).length > 0
        ? entry.potentialGroups.map(esc).join(', ')
        : '';
      return `<tr><td>${esc(entry.code)}</td><td>${title}</td><td>${credits}</td><td>${grade}</td><td>${term}</td><td>${transfer}</td><td>${potential}</td></tr>`;
    }).join('');
    const totalCredits = wna.reduce((sum, e) => sum + (Number(e.credits) || 0), 0);
    return `<h2 style="color:#500000;font-size:14px;margin:24px 0 8px 0;">Work Not Applied</h2>
    <p class="area-summary">${wna.length} course${wna.length !== 1 ? 's' : ''} (${totalCredits} credits) completed but not matched to any requirement group</p>
    <table class="rows"><thead><tr>
      <th>Course</th><th>Title</th><th>Credits</th><th>Grade</th><th>Term</th><th>Source</th><th>Could Apply To</th>
    </tr></thead><tbody>${wnaRows}</tbody></table>`;
  })()}
  ${(() => {
    const mr = meta?.minorResult;
    if (!mr || !Array.isArray(mr.groups) || mr.groups.length === 0) return '';
    const minorName = esc(mr.requirementSet?.name || 'Minor');
    const minorGroups = mr.groups;
    const minorSummaryRows = minorGroups.map((g) => {
      const e = Number(g.earnedCredits ?? 0), r = Number(g.requiredCredits ?? 0);
      const p = r > 0 ? Math.min(Math.round((e / r) * 100), 100) : (g.satisfied ? 100 : 0);
      return '<tr><td>' + esc(g.name) + '</td><td>' + (g.satisfied ? 'Met' : 'Not Met') + '</td><td>' + e + '/' + r + ' credits</td><td>' + p + '%</td></tr>';
    }).join('');
    const minorAreaSections = minorGroups.map((group) => {
      const gName = esc(group.name || '');
      const satisfied = group.satisfied;
      const metLabel = satisfied ? 'Met' : 'Not Met';
      const earned = Number(group.earnedCredits ?? 0);
      const required = Number(group.requiredCredits ?? 0);
      const pct = required > 0 ? Math.min(Math.round((earned / required) * 100), 100) : (satisfied ? 100 : 0);
      const creditLine = required > 0
        ? 'Earned: ' + earned + ' / ' + required + ' credits (' + pct + '%)'
        : (satisfied ? 'Satisfied' : 'Not satisfied');
      const usedCourses = group.usedCourses || [];
      let courseRows = '';
      if (usedCourses.length > 0) {
        courseRows = usedCourses.map((code) => {
          const c = courseIndex.get(code) || {};
          const credits = c.credits != null ? Number(c.credits).toFixed(2) : '';
          const grade = esc(c.grade || '');
          const title = esc(c.title || '');
          const term = esc(c.termLabel || '');
          const transfer = c.transfer ? 'T' : 'H';
          return '<tr><td>' + esc(code) + '</td><td>' + title + '</td><td>' + credits + '</td><td>' + grade + '</td><td>' + term + '</td><td>' + transfer + '</td></tr>';
        }).join('');
      }
      const missingHtml = (group.missing || []).length > 0
        ? '<p class="missing">Still needed: ' + group.missing.map(esc).join('; ') + '</p>'
        : '';
      return '<div class="area"><div class="area-hdr ' + (satisfied ? 'met' : 'notmet') + '"><strong>' + gName + '</strong> <span class="badge">' + metLabel + '</span></div><p class="area-summary">' + creditLine + '</p>' +
        (courseRows ? '<table class="rows"><thead><tr><th>Course</th><th>Title</th><th>Credits</th><th>Grade</th><th>Term</th><th>Source</th></tr></thead><tbody>' + courseRows + '</tbody></table>' : '') +
        missingHtml + '</div>';
    }).join('');
    return '<h2 style="color:#500000;font-size:14px;margin:24px 0 8px 0;">' + minorName + '</h2>' +
      '<table class="summary"><thead><tr><th>Requirement</th><th>Status</th><th>Progress</th><th>%</th></tr></thead><tbody>' + minorSummaryRows + '</tbody></table>' +
      minorAreaSections;
  })()}
</body>
</html>`;
};

