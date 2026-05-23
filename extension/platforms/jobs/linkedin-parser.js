/**
 * Engram — LinkedIn Job Parser
 * Sets window.__engramJobs.extractJob().
 * Works on both /jobs/view/ and /jobs/search-results/ layouts.
 * Extraction is best-effort; all fields may be null.
 */

window.__engramJobs = window.__engramJobs || {};

window.__engramJobs.extractJob = function () {

  function firstText(selectors, root) {
    const ctx = root || document;
    for (const sel of selectors) {
      try {
        const el = ctx.querySelector(sel);
        const t = el && (el.innerText || el.textContent);
        if (t && t.trim()) return t.trim().split('\n')[0].trim();
      } catch (_) {}
    }
    return null;
  }

  // ── JSON-LD structured data ────────────────────────────────────────────────
  let ldTitle = null, ldCompany = null, ldLocation = null;
  try {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      const d = JSON.parse(s.textContent || '');
      if (d && d['@type'] === 'JobPosting') {
        ldTitle   = d.title || null;
        ldCompany = (d.hiringOrganization && d.hiringOrganization.name) || null;
        const loc = Array.isArray(d.jobLocation) ? d.jobLocation[0] : d.jobLocation;
        if (loc && loc.address) {
          const addr  = loc.address;
          const parts = [addr.addressLocality, addr.addressRegion].filter(Boolean);
          if (parts.length) ldLocation = parts.join(', ');
        }
        break;
      }
    }
  } catch (_) {}

  // ── Detail panel scope ─────────────────────────────────────────────────────
  const panel =
    document.querySelector('[class*="jobs-search-two-pane__details"]') ||
    document.querySelector('[class*="jobs-search__job-details"]')       ||
    document.querySelector('[class*="scaffold-layout__detail"]')        ||
    document.querySelector('[class*="job-view-layout"]')                ||
    null;

  // ── Primary description "·" parsing ───────────────────────────────────────
  let pdCompany = null, pdLocation = null, pdWorkplace = null;
  try {
    const PD_SEL = [
      '[class*="primary-description-container"]',
      '[class*="primary-description"]',
      '[class*="jobs-unified-top-card__subtitle"]',
      '[class*="top-card-layout__first-subline"]',
    ].join(', ');
    const pdEl =
      (panel && panel.querySelector(PD_SEL)) ||
      document.querySelector(PD_SEL);
    if (pdEl) {
      const parts = (pdEl.innerText || pdEl.textContent || '')
        .split(/\s*[·|•]\s*/)
        .map(s => s.trim().split('\n')[0].trim())
        .filter(Boolean);
      pdCompany   = parts[0] || null;
      pdLocation  = parts[1] || null;
      pdWorkplace = parts[2] || null;
    }
  } catch (_) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Matches "City [City …], Province" on a single segment — never across lines.
  const LOC_RE = /\b([A-Z][a-zA-Z'-]+(?:[\s-]+[A-Z][a-zA-Z'-]+)*,\s*(?:Ontario|British Columbia|Alberta|Manitoba|Saskatchewan|Qu[eé]bec|Nova Scotia|New Brunswick|Newfoundland(?:\s+and\s+Labrador)?|Prince Edward Island|Northwest Territories|Nunavut|Yukon|[A-Z]{2})(?:,\s*Canada)?)\b/;

  // True if any "·"-split segment of any line matches LOC_RE.
  function lineSegmentHasLocation(text) {
    for (const line of text.split('\n')) {
      for (const seg of line.split(/\s*[·•]\s*/)) {
        const s = seg.trim();
        if (s && LOC_RE.test(s)) return true;
      }
    }
    return false;
  }

  // True if any "·"-split segment of any line exactly matches a workplace badge.
  // Exact-match prevents "Remote Support Engineer" (a title word) from firing.
  function lineSegmentHasBadge(text) {
    for (const line of text.split('\n')) {
      for (const seg of line.split(/\s*[·•]\s*/)) {
        if (/^(?:on.?site|onsite|hybrid|remote)$/i.test(seg.trim())) return true;
      }
    }
    return false;
  }

  // Extracts the first LOC_RE match from "·"-split line segments.
  // Lines equal to title or company are skipped, so they can never be returned
  // as the location. LOC_RE is never applied across newlines.
  function extractLocationFromLines(text, skipTitle, skipCompany) {
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed)                               continue;
      if (skipTitle   && trimmed === skipTitle)   continue;
      if (skipCompany && trimmed === skipCompany) continue;
      for (const seg of trimmed.split(/\s*[·•]\s*/)) {
        const s = seg.trim();
        if (!s) continue;
        const m = LOC_RE.exec(s);
        if (m) return m[1].trim();
      }
    }
    return null;
  }

  // ── Title ──────────────────────────────────────────────────────────────────

  let title = ldTitle, titleLink = null;

  const idMatch = (window.location.search || window.location.href)
    .match(/currentJobId=([\w-]+)/);

  if (!title && idMatch) {
    const jobId = idMatch[1];
    titleLink =
      document.querySelector(`a[href*="/jobs/view/${jobId}"]`) ||
      document.querySelector(`a[data-job-id="${jobId}"]`);
    if (titleLink) {
      title = (titleLink.innerText || titleLink.textContent || '').trim().split('\n')[0].trim() || null;
    }
  }

  if (!title) title = firstText([
    '[class*="job-details-jobs-unified-top-card__job-title"] a',
    '[class*="job-details-jobs-unified-top-card__job-title"]',
    '[class*="jobs-unified-top-card__job-title-link"]',
    '[class*="jobs-unified-top-card__job-title"] a',
    '[class*="jobs-unified-top-card__job-title"]',
    '[class*="top-card__job-title"] a',
    '[class*="top-card__job-title"]',
    '[class*="topcard__title"]',
  ], panel);

  if (!title) {
    const allLinks = Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'));
    for (const a of allLinks) {
      const t = (a.innerText || a.textContent || '').trim().split('\n')[0].trim();
      if (t && t.length > 3 && t.length < 120) { title = t; break; }
    }
  }

  if (!title) title = firstText([
    '.jobs-details h1', '.job-view-layout h1', 'h1', 'h2',
  ], panel);

  // ── Company ────────────────────────────────────────────────────────────────

  let company = ldCompany, companyLink = null;

  if (!company) {
    const ctx = panel || document;
    for (const a of Array.from(ctx.querySelectorAll('a[href*="/company/"]'))) {
      const t = (a.innerText || a.textContent || '').trim().split('\n')[0].trim();
      if (t && t.length > 1 && t.length < 120 && !/^\s*(follow|see all|jobs at)\s*$/i.test(t)) {
        company = t; companyLink = a; break;
      }
    }
  }

  if (!company) company = pdCompany;

  if (!company) company = firstText([
    '[class*="job-details-jobs-unified-top-card__company-name"] a',
    '[class*="job-details-jobs-unified-top-card__company-name"]',
    '[class*="jobs-unified-top-card__company-name"] a',
    '[class*="jobs-unified-top-card__company-name"]',
    '[class*="top-card__company-name"] a',
    '[class*="top-card__company-name"]',
    '[class*="topcard__org-name"] a',
    '[class*="topcard__org-name"]',
    '.artdeco-entity-lockup__subtitle a',
    '.artdeco-entity-lockup__subtitle',
  ], panel);

  if (!company) company = firstText([
    '[class*="job-details-jobs-unified-top-card__company-name"] a',
    '[class*="job-details-jobs-unified-top-card__company-name"]',
    '[class*="jobs-unified-top-card__company-name"] a',
    '[class*="jobs-unified-top-card__company-name"]',
    '.artdeco-entity-lockup__subtitle a',
    '.artdeco-entity-lockup__subtitle',
  ]);

  // ── Top-card candidate selection ───────────────────────────────────────────
  // Walk up from companyLink (or titleLink) and collect candidates at each
  // level (up to 8). Score each on four signals: company name present, title
  // present, location segment present, workplace badge present.
  //
  // Selection order:
  //   1. Smallest (lowest level) with company + title + location + badge
  //   2. Smallest with company + title + location   (badge not yet visible)
  //   3. Hard fallback: 4 levels up from anchor
  //
  // This two-pass approach fixes the Siemens case where level 3 had
  // company+title+location but "Hybrid" only appeared at level 4.

  let topCard = null, topCardSource = null;
  let topCardLevel = null, topCardHasBadge = false;

  const anchor = companyLink || titleLink;
  if (anchor) {
    const stopAt   = panel || document.body;
    const candidates = [];
    let el = anchor.parentElement;

    for (let level = 1; level <= 8 && el && el !== stopAt; level++) {
      const text = (el.innerText || '');
      const len  = text.length;

      // Discard candidates that are too small to be useful, too large to be
      // the top card, or that contain sections from below the top card.
      const isNoisy =
        len > 2000 ||
        /about the company|about the job|your profile|people also viewed|job insights/i.test(text);

      if (!isNoisy && len > 20) {
        candidates.push({
          el,
          level,
          hasCompany:  !company || text.includes(company.slice(0, 15)),
          hasTitle:    !title   || text.includes(title.slice(0,  20)),
          hasLocation: lineSegmentHasLocation(text),
          hasBadge:    lineSegmentHasBadge(text),
        });
      }
      el = el.parentElement;
    }

    // Pass 1 — smallest with all four signals
    for (const c of candidates) {
      if (c.hasCompany && c.hasTitle && c.hasLocation && c.hasBadge) {
        topCard = c.el; topCardSource = 'company-ancestor';
        topCardLevel = c.level; topCardHasBadge = true;
        break;
      }
    }

    // Pass 2 — smallest with company + title + location (badge not found yet)
    if (!topCard) {
      for (const c of candidates) {
        if (c.hasCompany && c.hasTitle && c.hasLocation) {
          topCard = c.el; topCardSource = 'company-ancestor-no-badge';
          topCardLevel = c.level; topCardHasBadge = false;
          break;
        }
      }
    }

    // Hard fallback
    if (!topCard) {
      topCard = anchor;
      for (let i = 0; i < 4 && topCard.parentElement && topCard.parentElement !== stopAt; i++) {
        topCard = topCard.parentElement;
      }
      topCardSource   = 'company-ancestor-fallback';
      topCardLevel    = null;
      topCardHasBadge = lineSegmentHasBadge(topCard.innerText || '');
    }
  }

  const topCardText = topCard
    ? (topCard.innerText || topCard.textContent || '').trim()
    : '';

  // ── Description ────────────────────────────────────────────────────────────
  // Extracted early so the "Located in …" phrase can serve as a location fallback.

  let description = null;

  const descEl =
    (panel || document).querySelector(
      '[class*="jobs-description__content"], '   +
      '[class*="job-details__description"], '    +
      '[class*="jobs-description-content__text"], ' +
      '[class*="description-content__text"]'
    ) ||
    document.querySelector(
      '[class*="jobs-description__content"], '   +
      '[class*="job-details__description"], '    +
      '[class*="jobs-description-content__text"], ' +
      '[class*="description-content__text"]'
    );
  if (descEl) {
    description = (descEl.innerText || descEl.textContent || '').trim().slice(0, 3000) || null;
  }

  if (!description) {
    const bodyText = document.body ? (document.body.innerText || '') : '';
    const idx = bodyText.indexOf('About the job');
    if (idx !== -1) {
      description = bodyText.slice(idx + 13, idx + 3000).trim() || null;
    }
  }

  // ── Location ───────────────────────────────────────────────────────────────

  let location       = ldLocation;
  let locationSource = ldLocation ? 'json-ld' : null;

  if (!location && pdLocation) {
    location = pdLocation; locationSource = 'primary-description';
  }

  if (!location) {
    const loc = firstText([
      '[class*="job-details-jobs-unified-top-card__bullet"]',
      '[class*="job-details-jobs-unified-top-card__primary-description"] span',
      '[class*="jobs-unified-top-card__bullet"]',
      '[class*="topcard__flavor--bullet"]',
      '[class*="tvm__text"]:not([class*="neutral"])',
    ], topCard || panel);
    if (loc) { location = loc; locationSource = 'class-topcard'; }
  }

  // Line-by-line extraction from the selected top-card text.
  // LOC_RE is applied to each "·"-split segment individually — it can never
  // bridge across a newline, preventing "Software Developer\n\nMarkham, ON"
  // from being returned as the location.
  if (!location && topCardText) {
    const found = extractLocationFromLines(topCardText, title, company);
    if (found) { location = found; locationSource = 'regex-topcard-lines'; }
  }

  // Description "Located in / based in" phrase — explicit, authoritative
  if (!location && description) {
    const m = description.match(
      /(?:locate[ds]?\s+in|base[ds]?\s+in|location[:\s]+)\s*([A-Z][a-zA-Z'-]+(?:[\s-]+[A-Z][a-zA-Z'-]+)*,\s*(?:Ontario|British Columbia|Alberta|Manitoba|Saskatchewan|Qu[eé]bec|Nova Scotia|New Brunswick|Newfoundland|Prince Edward Island|Northwest Territories|Nunavut|Yukon|[A-Z]{2})(?:,\s*Canada)?)/i
    );
    if (m) { location = m[1].trim(); locationSource = 'regex-description'; }
  }

  // ── Salary ─────────────────────────────────────────────────────────────────

  const salary =
    firstText([
      '[class*="job-details-jobs-unified-top-card__salary-info"]',
      '[class*="jobs-unified-top-card__salary-info"]',
      '[class*="salary-main-rail"]',
      '[class*="salary-info"]',
    ], topCard || panel) ||
    firstText([
      '[class*="job-details-jobs-unified-top-card__salary-info"]',
      '[class*="jobs-unified-top-card__salary-info"]',
      '[class*="salary-main-rail"]',
      '[class*="salary-info"]',
    ]);

  // ── Remote status ──────────────────────────────────────────────────────────

  const workplaceBadge =
    pdWorkplace ||
    firstText([
      '[class*="job-details-jobs-unified-top-card__workplace-type"]',
      '[class*="jobs-unified-top-card__workplace-type"]',
      '[class*="workplace-type"]',
    ], topCard || panel) ||
    firstText([
      '[class*="job-details-jobs-unified-top-card__workplace-type"]',
      '[class*="jobs-unified-top-card__workplace-type"]',
      '[class*="workplace-type"]',
    ]);

  let remoteStatus       = null;
  let remoteStatusSource = null;

  // Combined from job-scoped sources only — not search query text
  const combined = (location || '') + ' ' + (workplaceBadge || '');
  if      (/\bremote\b/i.test(combined))   { remoteStatus = 'remote'; remoteStatusSource = 'combined-badge'; }
  else if (/\bhybrid\b/i.test(combined))   { remoteStatus = 'hybrid'; remoteStatusSource = 'combined-badge'; }
  else if (/\bon.?site\b/i.test(combined)) { remoteStatus = 'onsite'; remoteStatusSource = 'combined-badge'; }

  // Exact badge scan: each "·"-split segment of each line.
  // Title line is skipped to prevent "Remote Developer" as a title from
  // triggering a false remoteStatus.
  if (!remoteStatus && topCardText) {
    outer: for (const line of topCardText.split('\n')) {
      if (title && line.trim() === title) continue;
      for (const seg of line.split(/\s*[·•]\s*/)) {
        const s = seg.trim();
        if (!s) continue;
        if (/^on.?site$|^onsite$/i.test(s)) { remoteStatus = 'onsite'; remoteStatusSource = 'badge-topcard'; break outer; }
        if (/^hybrid$/i.test(s))            { remoteStatus = 'hybrid'; remoteStatusSource = 'badge-topcard'; break outer; }
        if (/^remote$/i.test(s))            { remoteStatus = 'remote'; remoteStatusSource = 'badge-topcard'; break outer; }
      }
    }
  }

  // Word-boundary fallback on top-card text (catches mid-segment occurrences)
  if (!remoteStatus && topCardText) {
    if      (/\bremote\b/i.test(topCardText))   { remoteStatus = 'remote'; remoteStatusSource = 'regex-topcard'; }
    else if (/\bhybrid\b/i.test(topCardText))   { remoteStatus = 'hybrid'; remoteStatusSource = 'regex-topcard'; }
    else if (/\bon.?site\b/i.test(topCardText)) { remoteStatus = 'onsite'; remoteStatusSource = 'regex-topcard'; }
  }

  // Description: only strong workplace-specific patterns to avoid false
  // positives from phrases like "experience managing remote teams".
  if (!remoteStatus && description) {
    if      (/\bfully?\s+remote\b|\bremote\s+(?:work|position|role)\b/i.test(description)) {
      remoteStatus = 'remote'; remoteStatusSource = 'regex-description';
    } else if (/\bhybrid\s+(?:work|schedule|position|role)\b/i.test(description)) {
      remoteStatus = 'hybrid'; remoteStatusSource = 'regex-description';
    } else if (/\bfully?\s+on.?site\b/i.test(description)) {
      remoteStatus = 'onsite'; remoteStatusSource = 'regex-description';
    }
  }

  const job = {
    source:       'linkedin',
    title,
    company,
    location,
    remoteStatus,
    salary,
    description,
    url:          window.location.href,
    capturedAt:   Date.now(),
  };

  console.log('[Engram] LinkedIn extraction result', {
    title:              job.title,
    company:            job.company,
    location:           job.location,
    locationSource,
    remoteStatus:       job.remoteStatus,
    remoteStatusSource,
    topCardSource,
    topCardLevel,
    topCardHasBadge,
    topCardSnippet:     topCardText
      ? topCardText.slice(0, 160).replace(/\n+/g, ' | ')
      : '(none)',
    hasSalary:          !!job.salary,
    hasDescription:     !!job.description,
  });

  return job;
};

console.log('[Engram] LinkedIn parser loaded');
