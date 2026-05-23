/**
 * Engram — LinkedIn Job Detector
 * Sets window.__engramJobs.detectJobPage().
 * Returns true for any LinkedIn page that represents a job context.
 */

window.__engramJobs = window.__engramJobs || {};

window.__engramJobs.detectJobPage = function () {
  const url = window.location.href;
  const search = window.location.search;

  // Any URL with currentJobId param — covers search-results, collections, etc.
  if (/[?&]currentJobId=[\w-]+/.test(search || url)) return true;

  // Direct job view: /jobs/view/{id}/
  if (/\/jobs\/view\/[\w-]+/.test(url)) return true;

  // Any other /jobs/ path — broad fallback, DOM check will confirm
  if (/linkedin\.com\/jobs\//.test(url)) {
    // DOM check: look for a job detail panel being rendered
    const panelEl =
      document.querySelector('[class*="job-details"]') ||
      document.querySelector('[class*="jobs-unified-top-card"]') ||
      document.querySelector('[class*="top-card__job-title"]') ||
      document.querySelector('[data-job-id]') ||
      document.querySelector('[class*="job-view-layout"]');
    if (panelEl) return true;
  }

  return false;
};

console.log('[Engram] LinkedIn job detector loaded');
