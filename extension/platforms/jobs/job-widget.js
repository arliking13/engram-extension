/**
 * Engram — LinkedIn Job Widget
 * Collapsible floating widget for LinkedIn job pages.
 *
 * Collapsed pill: Engram · [job title] ▸  (or  Engram · N saved ▸)
 * Expanded card:  dark-glass card matching AI widget style
 *
 * Toggle: click anywhere on collapsed pill to expand; click header to collapse.
 * Buttons (Save Job, Copy AI Prompt) never accidentally toggle the widget.
 *
 * Global visibility: controlled by engramSettings.linkedInWidgetEnabled
 * Collapse state:    stored in engramLinkedInWidgetCollapsed
 * Position:         stored in engramLinkedInWidgetPosition
 */

console.log('[Engram] LinkedIn widget script loaded');

(function () {
  'use strict';

  // ── Browser API ─────────────────────────────────────────────────────────────

  const isFirefox = typeof browser !== 'undefined';

  function sendToBackground(message) {
    if (isFirefox) {
      return browser.runtime.sendMessage(message).catch(() => null);
    }
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    });
  }

  // ── Storage helpers ──────────────────────────────────────────────────────────

  const POSITION_KEY  = 'engramLinkedInWidgetPosition';
  const SETTINGS_KEY  = 'engramSettings';
  const COLLAPSED_KEY = 'engramLinkedInWidgetCollapsed';

  function storageGet(keys) {
    const api = isFirefox ? browser.storage.local : chrome.storage.local;
    if (isFirefox) return api.get(keys);
    return new Promise((resolve) => { api.get(keys, resolve); });
  }

  function storageSet(obj) {
    const api = isFirefox ? browser.storage.local : chrome.storage.local;
    if (isFirefox) return api.set(obj).catch(() => {});
    return new Promise((resolve) => { api.set(obj, resolve); });
  }

  // ── Module state ─────────────────────────────────────────────────────────────

  const WIDGET_ID        = 'engram-job-widget-root';
  let lastRenderedUrl    = null;
  let currentJob         = null;
  let isCollapsed        = false;
  let pollCount          = 0;
  const MAX_POLLS        = 20;
  let _resolvedLogoJobId = null;
  let _pillShowsJobTitle = false; // true when pill label shows job title, not count

  // ── Message listener ─────────────────────────────────────────────────────────

  (isFirefox ? browser.runtime : chrome.runtime).onMessage.addListener(
    function engramJobWidgetListener(msg, _sender, sendResponse) {
      if (msg.type !== 'ENGRAM_GET_CURRENT_JOB') return false;
      if (isFirefox) return Promise.resolve({ job: currentJob || null });
      sendResponse({ job: currentJob || null });
      return false;
    }
  );

  // ── Avatar fill ───────────────────────────────────────────────────────────────

  function fillAvatar(avEl, j) {
    avEl.innerHTML = '';
    const initials = (j && (j.companyInitials || (j.company ? j.company.slice(0, 1).toUpperCase() : '?'))) || '?';
    if (j && j.companyLogoUrl) {
      const img = document.createElement('img');
      img.src = j.companyLogoUrl;
      Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover', borderRadius: '5px' });
      img.onerror = function () { this.remove(); avEl.textContent = initials; };
      avEl.appendChild(img);
    } else {
      avEl.textContent = initials;
    }
  }

  // ── Pill text helper ─────────────────────────────────────────────────────────

  function _pillText(job, savedCount) {
    if (job && job.title) {
      const t = job.title.length > 26 ? job.title.slice(0, 24) + '…' : job.title;
      return 'Engram \xb7 ' + t + ' ▸';
    }
    return 'Engram \xb7 ' + savedCount + ' saved ▸';
  }

  // ── Count labels ─────────────────────────────────────────────────────────────

  function updateCountLabels(root, saved, queued) {
    const pillLabel = root && root.querySelector('[data-engram-pill-label]');
    const footer    = root && root.querySelector('[data-engram-footer]');
    if (pillLabel && !_pillShowsJobTitle) {
      pillLabel.textContent = 'Engram \xb7 ' + saved + ' saved ▸';
    }
    if (footer) footer.textContent = saved + ' saved \xb7 ' + queued + ' queued';
  }

  async function refreshSavedCount(root) {
    try {
      const stored = await storageGet('engramSavedJobs');
      const jobs   = (stored && stored.engramSavedJobs) || [];
      const saved  = jobs.length;
      const queued = jobs.filter(j => j.queued !== false).length;
      updateCountLabels(root, saved, queued);
    } catch (_) {}
  }

  // ── Collapse / expand ─────────────────────────────────────────────────────────

  function applyCollapsed(root, collapsed) {
    isCollapsed = collapsed;
    const pillView = root.querySelector('[data-engram-pill]');
    const cardView = root.querySelector('[data-engram-card]');

    if (collapsed) {
      if (pillView) pillView.style.display = 'flex';
      if (cardView) cardView.style.display = 'none';
      Object.assign(root.style, {
        width:        'auto',
        minWidth:     '0',
        borderRadius: '16px',
      });
    } else {
      if (pillView) pillView.style.display = 'none';
      if (cardView) cardView.style.display = 'flex';
      Object.assign(root.style, {
        width:        '252px',
        minWidth:     '252px',
        borderRadius: '16px',
      });
    }
    storageSet({ [COLLAPSED_KEY]: collapsed });
  }

  // ── Widget info update (title change without full re-inject) ──────────────────

  function updateWidgetInfo(widget, job) {
    const avatarEl  = widget.querySelector('[data-engram-avatar]');
    const titleEl   = widget.querySelector('[data-engram-title]');
    const metaEl    = widget.querySelector('[data-engram-meta]');
    const pillLabel = widget.querySelector('[data-engram-pill-label]');
    if (!titleEl) return;
    const newTitle = (job && job.title) || 'LinkedIn job page detected';
    if (titleEl.textContent === newTitle) return;
    titleEl.textContent = newTitle;
    titleEl.title       = newTitle;
    if (metaEl && job) {
      const meta = [
        job.company,
        job.location,
        (job.remoteStatus && job.remoteStatus !== 'Not specified') ? job.remoteStatus : '',
      ].filter(Boolean).join(' \xb7 ');
      metaEl.textContent   = meta;
      metaEl.style.display = meta ? '' : 'none';
    }
    if (avatarEl && job) fillAvatar(avatarEl, job);
    if (pillLabel && job && job.title) {
      _pillShowsJobTitle    = true;
      pillLabel.textContent = _pillText(job, 0);
    }
  }

  // ── Widget drag — pointer events, mirrors AI widget pattern ──────────────────
  //
  // Tracks dragMoved to distinguish click from drag.
  // On pointerup without movement: toggle collapsed state.
  //   collapsed  → expand (any area)
  //   expanded   → collapse only if click was on header (not card body or buttons)
  // Buttons return early from pointerdown so their clicks always fire normally.

  function makeDraggable(root) {
    let dragging  = false;
    let dragMoved = false;
    let startX    = 0, startY = 0, startLeft = 0, startTop = 0;
    let clickTgt  = null;

    root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      clickTgt  = e.target;
      root.setPointerCapture(e.pointerId);
      dragging  = true;
      dragMoved = false;
      const rect = root.getBoundingClientRect();
      startLeft  = rect.left;
      startTop   = rect.top;
      startX     = e.clientX;
      startY     = e.clientY;
      root.style.right  = 'auto';
      root.style.bottom = 'auto';
      root.style.left   = rect.left + 'px';
      root.style.top    = rect.top  + 'px';
      root.style.cursor = 'grabbing';
      e.preventDefault();
    });

    root.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) dragMoved = true;
      const nx = Math.max(0, Math.min(window.innerWidth  - root.offsetWidth,  startLeft + dx));
      const ny = Math.max(0, Math.min(window.innerHeight - root.offsetHeight, startTop  + dy));
      root.style.left = nx + 'px';
      root.style.top  = ny + 'px';
    });

    root.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      root.style.cursor = 'grab';

      if (dragMoved) {
        storageSet({ [POSITION_KEY]: {
          left: parseFloat(root.style.left) || 0,
          top:  parseFloat(root.style.top)  || 0,
        }});
      } else {
        // Simple click (no movement): toggle based on state
        if (isCollapsed) {
          applyCollapsed(root, false);
        } else {
          // Only collapse if the click was on the header, not the card body
          const inBody = clickTgt && clickTgt.closest('[data-engram-card-body]');
          if (!inBody) applyCollapsed(root, true);
        }
      }
    });

    root.addEventListener('pointercancel', () => {
      dragging = false;
      root.style.cursor = 'grab';
    });

    window.addEventListener('resize', () => {
      if (!root.style.left) return;
      const nx = Math.max(0, Math.min(window.innerWidth  - root.offsetWidth,  parseFloat(root.style.left) || 0));
      const ny = Math.max(0, Math.min(window.innerHeight - root.offsetHeight, parseFloat(root.style.top)  || 0));
      root.style.left = nx + 'px';
      root.style.top  = ny + 'px';
    });
  }

  // ── Widget DOM ─────────────────────────────────────────────────────────────────

  function injectWidget(job, savedPos, startCollapsed) {
    const old = document.getElementById(WIDGET_ID);
    if (old) old.remove();

    const logoImgUrl = (isFirefox ? browser : chrome).runtime.getURL('assets/engram-icon.png');
    _pillShowsJobTitle = !!(job && job.title);

    const root = document.createElement('div');
    root.id = WIDGET_ID;

    const basePos = savedPos
      ? { left: savedPos.left + 'px', top: savedPos.top + 'px', right: 'auto', bottom: 'auto' }
      : { bottom: '20px', right: '20px' };

    Object.assign(root.style, {
      position:             'fixed',
      zIndex:               '2147483647',
      background:           'rgba(11,11,11,0.92)',
      border:               '1px solid rgba(245,245,245,0.12)',
      boxShadow:            'rgba(3,3,3,0.12) 0 12px 30px -4px',
      backdropFilter:       'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      fontFamily:           '"Satoshi-Variable",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      fontSize:             '12px',
      color:                '#f5f5f5',
      display:              'flex',
      flexDirection:        'column',
      userSelect:           'none',
      lineHeight:           '1.4',
      cursor:               'grab',
      opacity:              '0.85',
      overflow:             'hidden',
      transition:           'opacity 0.2s',
      ...basePos,
    });

    function makeLogoImg(size) {
      const img = document.createElement('img');
      img.src = logoImgUrl;
      Object.assign(img.style, {
        width: size + 'px', height: size + 'px',
        objectFit: 'contain', flexShrink: '0', display: 'block',
      });
      img.onerror = function () { this.style.display = 'none'; };
      return img;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PILL VIEW (collapsed) — entire row is clickable via pointerup handler
    // ══════════════════════════════════════════════════════════════════════════
    const pillView = document.createElement('div');
    pillView.setAttribute('data-engram-pill', '');
    Object.assign(pillView.style, {
      display:    'none',   // overridden by applyCollapsed
      alignItems: 'center',
      gap:        '5px',
      padding:    '7px 11px',
      whiteSpace: 'nowrap',
    });

    pillView.appendChild(makeLogoImg(13));

    const pillLabel = document.createElement('span');
    pillLabel.setAttribute('data-engram-pill-label', '');
    Object.assign(pillLabel.style, {
      fontSize:      '11px',
      fontWeight:    '750',
      color:         '#a881fe',
      whiteSpace:    'nowrap',
      letterSpacing: '0.1px',
    });
    pillLabel.textContent = _pillText(job, 0);
    pillView.appendChild(pillLabel);

    // ══════════════════════════════════════════════════════════════════════════
    // CARD VIEW (expanded)
    // ══════════════════════════════════════════════════════════════════════════
    const cardView = document.createElement('div');
    cardView.setAttribute('data-engram-card', '');
    Object.assign(cardView.style, {
      display:       'none',   // overridden by applyCollapsed
      flexDirection: 'column',
    });

    // ── Card header — clicking anywhere on header collapses (via pointerup) ───
    const headerRow = document.createElement('div');
    Object.assign(headerRow.style, {
      display:        'flex',
      justifyContent: 'space-between',
      alignItems:     'center',
      padding:        '8px 10px 6px',
      borderBottom:   '1px solid rgba(245,245,245,0.10)',
    });

    const headerBrand = document.createElement('div');
    Object.assign(headerBrand.style, {
      display: 'flex', alignItems: 'center', gap: '4px',
      fontWeight: '750', fontSize: '11px', color: '#a881fe',
    });
    headerBrand.appendChild(makeLogoImg(13));
    const headerLabel = document.createElement('span');
    headerLabel.textContent = 'Engram';
    headerBrand.appendChild(headerLabel);

    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = '−';  // − same as AI widget
    collapseBtn.title = 'Collapse';
    Object.assign(collapseBtn.style, {
      background: 'none', border: 'none',
      color: '#aeaeae', cursor: 'pointer',
      fontSize: '16px', padding: '0 2px',
      lineHeight: '1', fontFamily: 'inherit',
      transition: 'color 0.15s',
    });
    collapseBtn.addEventListener('mouseenter', () => { collapseBtn.style.color = '#a881fe'; });
    collapseBtn.addEventListener('mouseleave', () => { collapseBtn.style.color = '#aeaeae'; });
    collapseBtn.addEventListener('click', () => applyCollapsed(root, true));

    headerRow.appendChild(headerBrand);
    headerRow.appendChild(collapseBtn);

    // ── Card body — marked so pointerup skips toggle when clicking body ───────
    const cardBody = document.createElement('div');
    cardBody.setAttribute('data-engram-card-body', '');
    Object.assign(cardBody.style, {
      display:       'flex',
      flexDirection: 'column',
      gap:           '7px',
      padding:       '8px 10px 10px',
    });

    // ── Info block ───────────────────────────────────────────────────────────
    const infoBlock = document.createElement('div');
    Object.assign(infoBlock.style, {
      display: 'flex', alignItems: 'center', gap: '9px',
      paddingBottom: '7px', borderBottom: '1px solid rgba(245,245,245,0.08)',
      overflow: 'hidden',
    });

    const avatarEl = document.createElement('div');
    avatarEl.setAttribute('data-engram-avatar', '');
    Object.assign(avatarEl.style, {
      width: '34px', height: '34px', borderRadius: '7px',
      background: 'rgba(168,129,254,0.10)', border: '1px solid rgba(168,129,254,0.16)',
      flexShrink: '0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      fontSize: '12px', fontWeight: '700', color: '#a78bfa', textTransform: 'uppercase',
    });
    fillAvatar(avatarEl, job);

    const infoText = document.createElement('div');
    Object.assign(infoText.style, { flex: '1', overflow: 'hidden' });

    const titleEl = document.createElement('div');
    titleEl.setAttribute('data-engram-title', '');
    Object.assign(titleEl.style, {
      fontSize: '11.5px', fontWeight: '600', color: '#f0f0f0',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      lineHeight: '1.35',
    });

    const metaEl = document.createElement('div');
    metaEl.setAttribute('data-engram-meta', '');
    Object.assign(metaEl.style, {
      fontSize: '10px', color: '#aeaeae',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      lineHeight: '1.4', marginTop: '3px',
    });

    if (job && job.title) {
      titleEl.textContent = job.title;
      titleEl.title = job.title;
      const meta = [
        job.company,
        job.location,
        (job.remoteStatus && job.remoteStatus !== 'Not specified') ? job.remoteStatus : '',
      ].filter(Boolean).join(' \xb7 ');
      metaEl.textContent   = meta;
      metaEl.style.display = meta ? '' : 'none';
    } else {
      titleEl.textContent  = 'LinkedIn job page detected';
      metaEl.style.display = 'none';
    }

    infoText.appendChild(titleEl);
    infoText.appendChild(metaEl);
    infoBlock.appendChild(avatarEl);
    infoBlock.appendChild(infoText);

    // ── Action buttons ────────────────────────────────────────────────────────
    const saveBtn   = makeBtn('\u{1F4BE} Save Job',    '#6d28d9', '#fff');
    const promptBtn = makeBtn('⬡ Copy AI Prompt', 'rgba(255,255,255,0.05)', '#a78bfa', '1px solid rgba(245,245,245,0.12)');

    // ── Status line ──────────────────────────────────────────────────────────
    const statusLine = document.createElement('div');
    Object.assign(statusLine.style, {
      fontSize: '10px', color: '#6f6f78', minHeight: '13px',
      textAlign: 'center', transition: 'color 0.2s',
    });

    // ── Footer count ─────────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.setAttribute('data-engram-footer', '');
    Object.assign(footer.style, {
      fontSize: '9.5px', color: '#6f6f78', textAlign: 'center',
      paddingTop: '4px', borderTop: '1px solid rgba(245,245,245,0.08)',
      letterSpacing: '0.2px',
    });
    footer.textContent = '— saved';

    // ── Wire up button actions ────────────────────────────────────────────────
    saveBtn.addEventListener('click',   () => doSaveJob(currentJob, statusLine, saveBtn, root));
    promptBtn.addEventListener('click', () => doCopyPrompt(currentJob, statusLine));

    cardBody.appendChild(infoBlock);
    cardBody.appendChild(saveBtn);
    cardBody.appendChild(promptBtn);
    cardBody.appendChild(statusLine);
    cardBody.appendChild(footer);

    cardView.appendChild(headerRow);
    cardView.appendChild(cardBody);

    root.appendChild(pillView);
    root.appendChild(cardView);

    applyCollapsed(root, startCollapsed);
    makeDraggable(root);

    root.addEventListener('mouseenter', () => { root.style.opacity = '1'; });
    root.addEventListener('mouseleave', () => { root.style.opacity = '0.85'; });

    document.body.appendChild(root);
    refreshSavedCount(root);
  }

  function makeBtn(label, bg, color, border) {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      background: bg, color, border: border || 'none',
      borderRadius: '7px', padding: '7px 10px',
      fontSize: '11px', fontWeight: '500',
      cursor: 'pointer', fontFamily: 'inherit',
      width: '100%', textAlign: 'center',
      lineHeight: '1', transition: 'opacity 0.15s',
    });
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.85'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
    return btn;
  }

  // ── Actions ────────────────────────────────────────────────────────────────────

  function doSaveJob(job, statusEl, btn, root) {
    if (!job) { showStatus(statusEl, 'No job data to save', '#ef4444'); return; }
    sendToBackground({ type: 'ENGRAM_SAVE_JOB', job }).then((res) => {
      if (!res) {
        showStatus(statusEl, 'Save failed — reload extension', '#ef4444');
        return;
      }
      if (res.error) {
        showStatus(statusEl, 'Save error', '#ef4444');
        return;
      }
      if (res.ok) {
        markSaved(btn);
        const msg = res.isNew === false ? '✓ Updated' : '✓ Saved';
        const col = res.isNew === false ? '#f59e0b' : '#22c55e';
        showStatus(statusEl, msg, col);
        const widgetEl = root || document.getElementById(WIDGET_ID);
        if (widgetEl) refreshSavedCount(widgetEl);
      } else {
        showStatus(statusEl, 'Save failed', '#ef4444');
      }
    }).catch(() => {
      showStatus(statusEl, 'Save failed', '#ef4444');
    });
  }

  function doCopyPrompt(job, statusEl) {
    const prompt = buildJobPrompt(job);
    navigator.clipboard.writeText(prompt).then(() => {
      showStatus(statusEl, '✓ Prompt copied!', '#22c55e');
    }).catch(() => {
      showStatus(statusEl, 'Clipboard blocked', '#ef4444');
    });
  }

  function showStatus(el, msg, color) {
    el.textContent = msg;
    el.style.color = color || '#888';
    setTimeout(() => { el.textContent = ''; el.style.color = '#6f6f78'; }, 3000);
  }

  function markSaved(btn) {
    if (!btn) return;
    btn.textContent      = '✓ Saved';
    btn.style.background = '#2d1a6b';
    btn.style.color      = '#c4b5fd';
    btn.style.opacity    = '0.8';
  }

  // ── AI Prompt Builder ──────────────────────────────────────────────────────────

  function buildJobPrompt(job) {
    const j      = job || {};
    const jobUrl = j.canonicalUrl || j.url || 'Unknown';
    const ts     = new Date(j.capturedAt || Date.now()).toLocaleString();

    return '# Job Legitimacy & Fit Analysis\n\n' +
      'Please analyze the following job posting and evaluate:\n\n' +
      '1. **Legitimacy signals** — Does this look like a real, legitimate job posting?\n' +
      '2. **Red flags** — Any signs of scam, misleading requirements, or unrealistic expectations?\n' +
      '3. **Remote-work quality** — Is this a genuine remote role?\n' +
      '4. **Company / recruiter credibility** — What can you infer?\n' +
      '5. **Salary & transparency** — Is compensation disclosed? Is it competitive?\n' +
      '6. **Fit for newcomers or early-career applicants in Canada** — How accessible?\n' +
      '7. **Missing skills / gaps** — What qualifications might a typical applicant lack?\n' +
      '8. **Resume / project positioning** — How should the applicant position experience?\n' +
      '9. **Questions to verify before applying** — What should be clarified with the recruiter?\n' +
      '10. **Recommendation** — Apply / Verify first / Avoid\n\n' +
      '## Job Details\n\n' +
      '- **Title:** '         + (j.title        || 'Unknown')       + '\n' +
      '- **Company:** '       + (j.company       || 'Unknown')       + '\n' +
      '- **Location:** '      + (j.location      || 'Unknown')       + '\n' +
      '- **Remote Status:** ' + (j.remoteStatus  || 'Not specified') + '\n' +
      '- **Salary:** '        + (j.salary        || 'Not disclosed') + '\n' +
      (j.sourceJobId ? '- **Job ID:** ' + j.sourceJobId + '\n' : '') +
      '- **URL:** ' + jobUrl + '\n\n' +
      '## Job Description\n\n' +
      (j.description || 'No description captured. Please paste the job description here.') +
      '\n\n---\n_Captured by Engram \xb7 ' + ts + '_\n';
  }

  // ── Logo data-URL resolution ──────────────────────────────────────────────────

  async function resolveLogoDataUrl(cdnUrl) {
    if (!cdnUrl || cdnUrl.startsWith('data:')) return cdnUrl;
    try {
      const res = await fetch(cdnUrl, { credentials: 'omit' });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (_) { return null; }
  }

  async function persistLogoToCache(job, dataUrl) {
    if (!job || !job.company || !dataUrl) return;
    try {
      const stored    = await storageGet('engramCompanyLogoCache');
      const cache     = (stored && stored.engramCompanyLogoCache) || {};
      const key       = job.company.toLowerCase().trim();
      cache[key]      = {
        company:          job.company,
        companyLogoUrl:   dataUrl,
        companyInitials:  job.companyInitials || job.company.slice(0, 1).toUpperCase(),
        updatedAt:        Date.now(),
      };
      await storageSet({ engramCompanyLogoCache: cache });
    } catch (_) {}
  }

  async function backfillStoredLogos(company, dataUrl) {
    if (!company || !dataUrl) return;
    try {
      const stored = await storageGet('engramSavedJobs');
      const jobs   = (stored && stored.engramSavedJobs) || [];
      const key    = company.toLowerCase().trim();
      let changed  = false;
      jobs.forEach((j) => {
        if (j.company && j.company.toLowerCase().trim() === key && !j.companyLogoUrl) {
          j.companyLogoUrl = dataUrl;
          changed = true;
        }
      });
      if (changed) await storageSet({ engramSavedJobs: jobs });
    } catch (_) {}
  }

  // ── Detection + render ────────────────────────────────────────────────────────

  async function checkAndRender() {
    try {
      let enabled = true;
      try {
        const s = await storageGet(SETTINGS_KEY);
        const settings = (s && s[SETTINGS_KEY]) || {};
        if (settings.linkedInWidgetEnabled === false) enabled = false;
      } catch (_) {}

      if (!enabled) {
        const el = document.getElementById(WIDGET_ID);
        if (el) el.remove();
        return;
      }

      if (!window.__engramJobs || typeof window.__engramJobs.detectJobPage !== 'function') return;

      const url      = window.location.href;
      const existing = document.getElementById(WIDGET_ID);

      if (existing && url !== lastRenderedUrl) existing.remove();

      if (!window.__engramJobs.detectJobPage()) {
        lastRenderedUrl = url;
        return;
      }

      const job = typeof window.__engramJobs.extractJob === 'function'
        ? window.__engramJobs.extractJob()
        : null;
      currentJob = job;

      if (job && job.companyLogoUrl && !job.companyLogoUrl.startsWith('data:') &&
          job.sourceJobId && job.sourceJobId !== _resolvedLogoJobId) {
        _resolvedLogoJobId = job.sourceJobId;
        const cdnUrl = job.companyLogoUrl;
        resolveLogoDataUrl(cdnUrl).then(async (dataUrl) => {
          if (!dataUrl) return;
          job.companyLogoUrl = dataUrl;
          currentJob = job;
          const w = document.getElementById(WIDGET_ID);
          if (w) { const av = w.querySelector('[data-engram-avatar]'); if (av) fillAvatar(av, job); }
          await persistLogoToCache(job, dataUrl);
          await backfillStoredLogos(job.company, dataUrl);
        });
      }

      const widget = document.getElementById(WIDGET_ID);
      if (widget && url === lastRenderedUrl) {
        if (job && job.title) updateWidgetInfo(widget, job);
        return;
      }

      let savedPos = null;
      let startCollapsed = isCollapsed;
      try {
        const stored = await storageGet([POSITION_KEY, COLLAPSED_KEY]);
        savedPos       = (stored && stored[POSITION_KEY])  || null;
        startCollapsed = !!(stored && stored[COLLAPSED_KEY]);
      } catch (_) {}

      injectWidget(job, savedPos, startCollapsed);
      lastRenderedUrl = url;
      console.log('[Engram] LinkedIn widget injected');

    } catch (err) {
      console.warn('[Engram] LinkedIn widget check failed', String(err));
    }
  }

  // ── Polling ───────────────────────────────────────────────────────────────────

  function startPolling() {
    const id = setInterval(() => {
      checkAndRender();
      pollCount++;
      if (pollCount >= MAX_POLLS && document.getElementById(WIDGET_ID)) {
        clearInterval(id);
        startUrlOnlyPoll();
      }
    }, 2000);
  }

  function startUrlOnlyPoll() {
    let lastUrl = window.location.href;
    setInterval(() => {
      const url = window.location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(checkAndRender, 1200);
      }
    }, 2000);
  }

  // ── MutationObserver ──────────────────────────────────────────────────────────

  function startMutationWatch() {
    let debounce = null;
    const obs = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!document.getElementById(WIDGET_ID)) checkAndRender();
      }, 500);
    });
    obs.observe(document.body, { childList: true, subtree: false });
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────────

  function bootstrap() {
    checkAndRender();
    setTimeout(checkAndRender, 500);
    setTimeout(checkAndRender, 1500);
    setTimeout(checkAndRender, 3000);
    startPolling();
    startMutationWatch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
