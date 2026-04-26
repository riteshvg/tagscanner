# Chrome Web Store Compliance Scan Report

**Date:** 2025-03-12  
**Extension:** TagScanner  
**Manifest version:** 3  

## Summary

This document records the full scan performed to ensure no external script references or other Chrome Web Store policy violations. Per [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/) and [MV3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements/), extensions must **bundle all executable code** and **must not load remotely hosted code** (no `<script src="https://...">`, no `eval()` of remote strings, etc.).

---

## 1. Script and stylesheet references

### 1.1 HTML files – script/link tags

- **Result:** All active `<script src="...">` and `<link href="...">` use **relative paths** or extension-relative paths (e.g. `vendor/...`, `css/...`, `jquery.js`). No `http://` or `https://` URLs are used for scripts or styles.
- **Content script:** `content_scripts.js` injects only `chrome.runtime.getURL('pass_satellite.js')` (extension bundle). No remote script injection.

### 1.2 Removed or fixed

| Item | Location | Action |
|------|----------|--------|
| External CSS (Google Fonts) | `popup.html` | Already commented out; comment removed for clarity. |
| External CSS (Google Fonts) | `vendor/feedback.html`, `property.html`, `search.html` | Commented-out links removed. |
| External CSS (cdnjs Font Awesome) | `vendor/appmeasvariables.html` | Commented-out link removed. |
| External images (Unsplash) | `css/sb-admin-2.css`, `css/sb-admin-2.min.css` | Replaced with local `linear-gradient(...)` so no external requests. |
| Remote script injection | `vendor/generalPage.js` | **Fixed:** No longer sets `script.src` to any `http://` or `https://` URL. `_satellite` is populated from `sessionStorage` (data already captured by the extension). |

---

## 2. External links (allowed)

- **Feedback link:** `popup.html` contains `<a href="https://forms.gle/..." target="_blank">`. This is **user-initiated navigation** to an external form. Allowed by policy. `rel="noopener noreferrer"` added for security.

---

## 3. Third-party / vendor code

- **Bootstrap, jQuery, D3, Font Awesome, jsPDF, intro.js, etc.:** All are **bundled** under `vendor/` or project paths. No CDN or remote script/style references.
- **Comments in vendor files:** Some vendor files (e.g. Bootstrap, jsPDF, Font Awesome) contain comments with `https://` URLs (licenses, docs). These are **non-executable** and do not load remote code. No change required.
- **d3.js / jspdf:** Use of `xmlns="http://www.w3.org/..."` in SVG/XML is **namespace strings**, not script loading. No change required.

---

## 4. Manifest and CSP

- **manifest.json**
  - `content_security_policy.extension_pages`: `script-src 'self'; object-src 'self'` — no remote scripts.
  - `sandbox`: Only `satellite_sandbox.html`; sandbox CSP uses `script-src 'self'`.
- **web_accessible_resources:** Only `pass_satellite.js` (bundled). No remote URLs.

---

## 5. Dynamic script / import

- **generalPage.js:** Previously set `launch_script.src = sessionStorage.getItem('unique_launch_code')`, which could be a remote DTM URL. **Now:** Script injection is skipped when the value starts with `http://` or `https://`. `_satellite` is built from `sessionStorage` so the page works without loading remote code.
- **jspdf (vendor):** Contains `import('html2canvas')` / `import('canvg')` in optional code paths. The extension bundles `html2canvas.min.js` and loads it via `<script src="...">` where needed. Any dynamic import in jspdf runs in extension context and resolves to same origin; no remote URLs are introduced by the extension.

---

## 6. Checklist (Chrome Web Store–oriented)

| Requirement | Status |
|-------------|--------|
| No `<script src="http(s)://...">` in any HTML | Met |
| No remote stylesheet loading (active) | Met |
| No external images loaded from CSS (after unsplash fix) | Met |
| No remote script injection (generalPage.js fixed) | Met |
| Content script only injects extension bundle URL | Met |
| CSP does not allow remote script | Met |
| External links (e.g. feedback) are user-initiated only | Met |
| Commented-out external refs removed where appropriate | Met |

---

## 7. Recommendations

1. **Ongoing:** Before each release, run a quick grep for `https?://` and `src=.*http` in `.html`, `.js`, and `.json` to catch any new external script or style references.
2. **Feedback link:** Keep `rel="noopener noreferrer"` on all `target="_blank"` links to external sites.
3. **Vendor updates:** When upgrading Bootstrap, jQuery, etc., ensure no new CDN or remote script/style tags are introduced; keep everything bundled.

---

*This report reflects the state of the codebase after the compliance fixes applied on the scan date.*
