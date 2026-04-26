# Advanced Mode – Plan

## Overview
Advanced Mode uses the **Adobe Reactor API** (with user-supplied credentials) to show data that is not available from the compiled library (`_satellite._container`), such as total vs enabled/disabled rule counts, libraries, builds, and other property-level metadata.

## Entry point
- **Header**: Option in the main app (e.g. topbar or sidebar) labeled **Advanced Mode**.
- **Behavior**: Opens a **separate UI** (same look and feel as the rest of TagScanner) so there is a clear distinction between:
  - **Simple mode**: No credentials; data from the current page’s `_satellite._container` only.
  - **Advanced mode**: Optional credentials; data from Reactor API + optional reconciliation with container.

## UI flow

### 1. First screen – Credentials + Get access token & Validate
- **Three required fields** (OAuth Server-to-Server from Adobe Developer Console):
  - **Client ID** (API Key)
  - **Client Secret**
  - **IMS Org ID** (x-gw-ims-org-id)
- **Optional**: **Scope** (leave blank to use default Reactor scope: `https://ims-na1.adobelogin.com/s/ent_dataservices`).
- **Get access token & Validate** button:
  1. Requests an access token from Adobe IMS: `POST https://ims-na1.adobelogin.com/ims/token/v3` with `grant_type=client_credentials`, `client_id`, `client_secret`, and `scope`.
  2. Uses the returned access token to call the Reactor API (e.g. `GET /companies`) to verify the token works. Shows success or error message.
- Credentials are **not** stored in the extension by default (optional “Remember for this session” could be added later; no persistence to disk without user consent).

### 2. Second screen – Pick what to fetch (after successful Validate)
- User can **pick and choose** which details to load.
- **Defaults** (pre-selected):
  - **Libraries**: Count of libraries in the property (and optionally list with state: Development, Submitted, etc.).
  - **Rules**: Total count, **enabled** count, **disabled** count (via `GET /properties/{id}/rules` and filters or `meta.pagination.total_count` + `filter[enabled]=true|false`).
  - Optionally: **Data elements** (total / enabled / disabled), **Extensions** (installed count).
- **Optional** (user can enable):
  - Builds per library, environments, hosts, rule components, recent revisions, etc.
- Control types: checkboxes or toggles per section (e.g. “Include rule counts”, “Include library list”, “Include builds”).
- **Fetch** or **Refresh** button: Calls the selected API endpoints and displays results in the same UI (cards/tables consistent with existing TagScanner style).

## Look and feel
- Reuse existing TagScanner styles: `sb-admin-2`, `fonts`, Font Awesome, same header/card pattern as Summary and other vendor pages.
- **Advanced Mode** title at top; short line of copy: “Data from Adobe Reactor API. Requires your API credentials.”
- **Back to Simple mode** link/button: navigates back to the main/Simple view (e.g. Home or previous iframe content).

## Technical notes
- All Reactor requests from the extension must be **CORS-friendly**: Reactor API allows browser requests with proper headers (Authorization, x-api-key, x-gw-ims-org-id). Extension can use `fetch()` from the advanced page; no service-worker proxy required for first version.
- **Property scope**: User must either select a property (e.g. from a dropdown populated by `GET /properties`) or we use the property implied by the current container (if any) to limit API calls.
- **Rate limits**: Document in UI that Reactor API may rate-limit; keep requests minimal and cache results for the session where possible.

## Future options
- Optional “Remember credentials for this session” (in-memory only).
- JWT-based auth (Client ID + Client Secret + private key) for serverless or automated use.
- Export of Advanced-mode data (e.g. CSV of rule counts, library list) consistent with existing export patterns.
