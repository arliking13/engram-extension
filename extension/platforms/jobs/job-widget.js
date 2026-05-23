/**
 * Engram — LinkedIn Job Widget
 * Injects a floating action widget when a LinkedIn job posting is detected.
 *
 * Detection runs:
 *   - immediately on load
 *   - at 500 ms, 1500 ms, 3000 ms (covers LinkedIn's async React rendering)
 *   - every 2 s for ≥ 30 s (SPA navigation and late renders)
 *   - on significant DOM mutations (job detail panel appearing)
 *
 * Buttons reference the module-level `currentJob` so they always use
 * the latest extracted data, even after a late-extraction update.
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

  // ── Module state ─────────────────────────────────────────────────────────────

  const WIDGET_ID    = 'engram-job-widget-root';
  let lastRenderedUrl = null;
  let currentJob      = null;   // always up-to-date; buttons read from here
  let pollCount       = 0;
  const MAX_POLLS     = 20;     // 20 × 2 000 ms = 40 s (covers ≥ 30 s)

  // ── Detection + render ────────────────────────────────────────────────────────

  function checkAndRender() {
    console.log('[Engram] LinkedIn detection tick');

    try {
      if (!window.__engramJobs || typeof window.__engramJobs.detectJobPage !== 'function') {
        return; // scripts not yet loaded — retry will fire
      }

      const url = window.location.href;

      // On URL change: remove stale widget so we re-evaluate
      const existing = document.getElementById(WIDGET_ID);
      if (existing && url !== lastRenderedUrl) {
        existing.remove();
      }

      if (!window.__engramJobs.detectJobPage()) {
        lastRenderedUrl = url;
        return;
      }

      console.log('[Engram] LinkedIn job context detected');

      // Extract (best-effort; may have null fields)
      const job = typeof window.__engramJobs.extractJob === 'function'
        ? window.__engramJobs.extractJob()
        : null;
      currentJob = job;

      const widget = document.getElementById(WIDGET_ID);

      if (widget && url === lastRenderedUrl) {
        // Widget already visible — update info line if we now have richer data
        if (job && job.title) updateWidgetInfo(widget, job);
        return;
      }

      // Inject
      injectWidget(job);
      lastRenderedUrl = url;
      console.log('[Engram] LinkedIn widget injected');

    } catch (err) {
      console.log('[Engram] LinkedIn widget injection failed', String(err));
    }
  }

  // ── Widget info update (without full re-injection) ────────────────────────────

  function updateWidgetInfo(widget, job) {
    const infoEl = widget.querySelector('[data-engram-info]');
    if (!infoEl) return;
    const text = job.company ? job.title + ' · ' + job.company : job.title;
    if (infoEl.textContent !== text) {
      infoEl.textContent = text;
      infoEl.title = text;
      console.log('[Engram] LinkedIn widget updated');
    }
  }

  // ── Widget DOM ─────────────────────────────────────────────────────────────────

  function injectWidget(job) {
    // Remove any leftover instance
    const old = document.getElementById(WIDGET_ID);
    if (old) old.remove();

    const root = document.createElement('div');
    root.id = WIDGET_ID;

    Object.assign(root.style, {
      position:      'fixed',
      bottom:        '20px',
      right:         '20px',
      zIndex:        '2147483647',
      background:    '#1a1a1a',
      border:        '1px solid #333',
      borderRadius:  '10px',
      padding:       '12px 14px',
      width:         '232px',
      fontFamily:    '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize:      '12px',
      color:         '#e5e5e5',
      boxShadow:     '0 4px 28px rgba(0,0,0,0.6)',
      display:       'flex',
      flexDirection: 'column',
      gap:           '8px',
      userSelect:    'none',
      lineHeight:    '1.4',
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display:        'flex',
      justifyContent: 'space-between',
      alignItems:     'center',
    });

    const logo = document.createElement('span');
    logo.textContent = '⬡ Engram';
    Object.assign(logo.style, {
      fontWeight:    '700',
      fontSize:      '12px',
      color:         '#a78bfa',
      letterSpacing: '0.3px',
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      background: 'none',
      border:     'none',
      color:      '#555',
      cursor:     'pointer',
      fontSize:   '11px',
      padding:    '0 2px',
      lineHeight: '1',
      fontFamily: 'inherit',
    });
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#aaa'; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#555'; });
    closeBtn.addEventListener('click', () => root.remove());

    header.appendChild(logo);
    header.appendChild(closeBtn);

    // Info line — data attribute used by updateWidgetInfo()
    const info = document.createElement('div');
    info.setAttribute('data-engram-info', '');
    Object.assign(info.style, {
      fontSize:     '11px',
      color:        '#888',
      lineHeight:   '1.4',
      paddingBottom:'6px',
      borderBottom: '1px solid #2a2a2a',
      overflow:     'hidden',
      textOverflow: 'ellipsis',
      whiteSpace:   'nowrap',
    });

    if (job && job.title) {
      info.textContent = job.company ? job.title + ' · ' + job.company : job.title;
      info.title = info.textContent;
    } else {
      info.textContent = 'LinkedIn job page detected';
    }

    // Buttons read from module-level `currentJob` — always up to date
    const saveBtn   = makeBtn('💾 Save Job',      '#7c3aed', '#fff');
    const promptBtn = makeBtn('⬡ Copy AI Prompt', '#1a1a1a', '#a78bfa', '1px solid #333');

    const statusLine = document.createElement('div');
    Object.assign(statusLine.style, {
      fontSize:  '10px',
      color:     '#4a4a4a',
      minHeight: '13px',
      textAlign: 'center',
      transition:'color 0.2s',
    });

    saveBtn.addEventListener('click',   () => doSaveJob(currentJob, statusLine));
    promptBtn.addEventListener('click', () => doCopyPrompt(currentJob, statusLine));

    root.appendChild(header);
    root.appendChild(info);
    root.appendChild(saveBtn);
    root.appendChild(promptBtn);
    root.appendChild(statusLine);

    document.body.appendChild(root);
  }

  function makeBtn(label, bg, color, border) {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      background:   bg,
      color:        color,
      border:       border || 'none',
      borderRadius: '6px',
      padding:      '7px 10px',
      fontSize:     '11px',
      fontWeight:   '500',
      cursor:       'pointer',
      fontFamily:   'inherit',
      width:        '100%',
      textAlign:    'center',
      lineHeight:   '1',
      transition:   'opacity 0.15s',
    });
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.87'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
    return btn;
  }

  // ── Actions ────────────────────────────────────────────────────────────────────

  function doSaveJob(job, statusEl) {
    if (!job) { showStatus(statusEl, 'No job data to save', '#ef4444'); return; }
    sendToBackground({ type: 'ENGRAM_SAVE_JOB', job }).then((res) => {
      if (res && res.ok) {
        console.log('[Engram] job saved');
        showStatus(statusEl, '✓ Job saved', '#22c55e');
      } else {
        showStatus(statusEl, 'Save failed', '#ef4444');
      }
    });
  }

  function doCopyPrompt(job, statusEl) {
    const prompt = buildJobPrompt(job);
    navigator.clipboard.writeText(prompt).then(() => {
      console.log('[Engram] AI job prompt copied');
      showStatus(statusEl, '✓ Prompt copied!', '#22c55e');
    }).catch(() => {
      showStatus(statusEl, 'Clipboard blocked', '#ef4444');
    });
  }

  function showStatus(el, msg, color) {
    el.textContent = msg;
    el.style.color = color || '#888';
    setTimeout(() => { el.textContent = ''; el.style.color = '#4a4a4a'; }, 3000);
  }

  // ── AI Prompt Builder ──────────────────────────────────────────────────────────

  function buildJobPrompt(job) {
    const j        = job || {};
    const captured = new Date(j.capturedAt || Date.now()).toLocaleString();

    return `# Job Legitimacy & Fit Analysis

Please analyze the following job posting and evaluate each section:

1. **Legitimacy signals** — Does this look like a real, legitimate job posting?
2. **Red flags** — Any signs of scam, misleading requirements, or unrealistic expectations?
3. **Remote-work quality** — Is this a genuine remote role, or does "remote" come with caveats?
4. **Company / recruiter credibility** — What can you infer about the hiring organization?
5. **Salary & transparency** — Is compensation disclosed? Is it competitive for this role and location?
6. **Fit for newcomers or early-career applicants in Canada** — How accessible is this role?
7. **Questions to verify before applying** — What should the applicant clarify with the recruiter?
8. **Recommendation** — Apply / Verify first / Avoid

## Job Details

- **Title:** ${j.title || 'Unknown'}
- **Company:** ${j.company || 'Unknown'}
- **Location:** ${j.location || 'Unknown'}
- **Remote Status:** ${j.remoteStatus || 'Not specified'}
- **Salary:** ${j.salary || 'Not disclosed'}
- **Source URL:** ${j.url || 'Unknown'}

## Job Description

${j.description || 'No description captured. Please paste the job description here.'}

---
_Captured by Engram · ${captured}_
`;
  }

  // ── Polling — every 2 s for ≥ 30 s ───────────────────────────────────────────

  function startPolling() {
    const id = setInterval(() => {
      checkAndRender();
      pollCount++;
      // After 40 s, stop the aggressive poll if the widget is stable
      if (pollCount >= MAX_POLLS && document.getElementById(WIDGET_ID)) {
        clearInterval(id);
        startUrlOnlyPoll();
      }
    }, 2000);
  }

  // After initial window, only check on URL changes
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

  // ── MutationObserver — fires when LinkedIn renders the job detail panel ───────

  function startMutationWatch() {
    let debounce = null;
    const obs = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        // Only trigger if we don't already have a visible widget
        if (!document.getElementById(WIDGET_ID)) {
          checkAndRender();
        }
      }, 500);
    });
    // Watch body's direct children only (low noise, catches panel insertion)
    obs.observe(document.body, { childList: true, subtree: false });
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────────

  function bootstrap() {
    // Immediate check
    checkAndRender();
    // Early retries for LinkedIn's async React rendering
    setTimeout(checkAndRender, 500);
    setTimeout(checkAndRender, 1500);
    setTimeout(checkAndRender, 3000);
    // Sustained polling + mutation watch
    startPolling();
    startMutationWatch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
