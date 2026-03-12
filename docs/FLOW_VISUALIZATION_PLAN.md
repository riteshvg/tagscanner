# Plan: Component Flow Tab (Sankey-Style Visualization)

## 1. Goal

Add a new **Flow** tab (alongside Rules, Extensions, Data Elements, Summary) that shows a **visual flow** of how Data Elements, Rules, and Extensions are interconnected—similar to the Flow chart reference: multi-column layout with **flow bands** whose width represents the strength (e.g. count of connections) between components.

---

## 2. Visual Design (aligned with reference)

- **Header bar**
  - Title: **Flow** (with flow/connection icon).
  - Same blue header style as Rules/Data Elements (`#4e73df`).
- **Configuration / filter bar** (below title)
  - **Contains** (optional): e.g. filter by name (e.g. “Contains: home”).
  - **Flow direction** (optional): e.g. “Data Elements → Rules → Extensions” or “Extensions → Rules → Data Elements”.
  - **Repeats / First-last** (optional, can be Phase 2): limit to first or last occurrence (if we add sequence later).
- **Main visualization**
  - **Three columns** (left → middle → right), e.g.:
    - **Column 1 – Data Elements** (or Extensions, configurable).
    - **Column 2 – Rules** (hub).
    - **Column 3 – Extensions** (or Data Elements).
  - Each column shows **nodes** (component names) with a **bar** whose length can reflect “volume” (e.g. number of connections or usage count).
  - **Curved flow bands** (Sankey links) between columns:
    - **Left → Middle**: e.g. “this Data Element is used in these Rules” or “this Extension is used in these Rules”.
    - **Middle → Right**: e.g. “this Rule uses these Extensions” or “this Rule uses these Data Elements”.
  - Band **width** = proportional to connection count or weight (e.g. number of rules using a DE, or number of DEs used by a rule).
  - **Colors**: Teal/blue palette to match app; distinct shades for Data Elements vs Rules vs Extensions (e.g. reuse `#27c5c1`, `#4e73df`, extension color).
- **Collapsed / “+N more”**
  - Show top N nodes per column (e.g. top 5–10 by connection count); group the rest as “+N more” with a total, like the reference.
- **Interactivity**
  - Hover on band: highlight band and show tooltip (e.g. “DE X → Rule Y (used in 3 events)”).
  - Click on node: optional drill-down (e.g. scroll to or highlight all links for that node).
  - Optional: “+” control to add/remove columns or change what each column represents (Phase 2).

---

## 3. Data Model (what we already have)

- **Rules**  
  - From `_satellite._container.rules` (array or object).  
  - Each rule has: `name`, `events`, `conditions`, `actions` (each item has `modulePath`, `settings`).
- **Data Elements**  
  - From `_satellite._container.dataElements` (object keyed by DE name).  
  - References in rules/DEs: `%DataElementName%` or `_satellite.getVar("DataElementName")`.
- **Extensions**  
  - From `_satellite._container.extension` (object keyed by extension id).  
  - Rule events/conditions/actions reference extensions via `modulePath` (e.g. `core/...`, `adobe-alloy/...`).

**Relationship maps (already in codebase):**

- **ruleToDataElement** (rule → set of DE names used).
- **dataElementToRule** (DE → set of rule names/ids that use it).
- **dataElementToDataElement** (DE → set of other DE names it references).

**To add for Flow:**

- **ruleToExtension**: for each rule, set of extension ids (from `modulePath` of events/conditions/actions).
- **extensionToRule**: for each extension, set of rules that use it.

These can be computed in the same way as in `relationship-diagram.js` (walk rules and read `modulePath`).

---

## 4. Flow Variants (what the diagram can show)

**Option A – Rules as hub (recommended for first version)**  
- Column 1: **Data Elements**  
- Column 2: **Rules**  
- Column 3: **Extensions**  
- Links:
  - **DE → Rule**: “this data element is used in this rule” (from `dataElementToRule` / `ruleToDataElement`).
  - **Rule → Extension**: “this rule uses this extension” (from new `ruleToExtension`).
- Band width: e.g. number of “uses” (e.g. one link per rule–DE pair; for rule–extension, one per rule–extension pair).

**Option B – Same three columns, add DE→DE**  
- Same as A, but add a second “stage” or a separate view: **Data Elements → Data Elements** (from `dataElementToDataElement`), e.g. as an extra set of links or a toggle.

**Option C – Extensions → Rules → Data Elements**  
- Column 1: Extensions  
- Column 2: Rules  
- Column 3: Data Elements  
- Links: Extension → Rule (rule uses extension), Rule → Data Element (rule uses DE).  
- Good for “which extension drives which rules and which data elements.”

We can implement **Option A** first, then add B/C as toggles or separate views.

---

## 5. Technical Approach

- **New tab**
  - Add a new sidebar item: **Flow** (e.g. `href="vendor/flow.html"` target `iframe2`), with an icon (e.g. `fa-project-diagram` or `fa-stream`).
- **New files**
  - `vendor/flow.html` – Page shell: same layout as Rules/Data Elements (header, filter bar, div for chart, optional legend).
  - `vendor/flow.js` – Load rules, data elements, extensions from `sessionStorage`; compute relationship maps (reuse + extend relationship-diagram logic); build Sankey/flow data structure; render with D3.
  - Optional: `vendor/flow.css` – If styles grow large.
- **D3**
  - Project already has `vendor/d3.js`. Use it for:
    - **Sankey diagram**: `d3.sankey()` (if available in that build) for layout + path generation, **or**
    - **Custom flow**: Three vertical columns; position nodes (rects or bars); draw curved paths (e.g. `d3.linkHorizontal()` or Bézier) with thickness = weight.
  - If the bundled D3 doesn’t include Sankey, we can implement a simple “three-column flow” without full Sankey (fixed columns, manual link routing).
- **Data pipeline**
  1. Read from `sessionStorage`: rules, dataElements, extension.
  2. Normalize rules to array (same as rule.js / dataelement.js).
  3. Build: `ruleToDataElement`, `dataElementToRule`, `dataElementToDataElement` (reuse relationship-diagram logic), plus `ruleToExtension`, `extensionToRule` from `modulePath`.
  4. Convert to **nodes** (e.g. `{ id, name, type: 'rule'|'dataElement'|'extension', totalConnections }`) and **links** (e.g. `{ source, target, value }`).
  5. Optionally aggregate “+N more” nodes and links for display.
- **Styling**
  - Reuse existing color scheme: header `#4e73df`, Data Elements `#27c5c1`, Rules orange/blue as in rule card, Extensions distinct.
  - Match table/card styling (e.g. same font, border-radius) for filter bar and any legend.

---

## 6. Implementation Phases

**Phase 1 – MVP**  
- Add **Flow** to sidebar (new tab).  
- Create `flow.html` + `flow.js`.  
- Compute rule ↔ data element and rule ↔ extension relationships.  
- Render a **three-column flow**: Data Elements | Rules | Extensions, with bands from DE→Rule and Rule→Extension.  
- Band width = count of connections (e.g. one link per DE–rule pair; for rule–extension, one per rule–extension).  
- Top N nodes per column (e.g. 5–8), “+N more” for the rest.  
- Simple filter: “Contains” by name (filter nodes before layout).  
- Tooltip on hover (e.g. “Data Element X → Rule Y”).

**Phase 2**  
- Add **Data Elements → Data Elements** links (e.g. toggle or second view).  
- Optional: “Flow direction” switch (e.g. DE→Rule→Ext vs Ext→Rule→DE).  
- Optional: “Repeats” / “First or last” (if we add sequence data later).  
- Refine layout (reduce overlap, better curvature).

**Phase 3**  
- Export flow as image or SVG.  
- “Add/remove columns” or more filter options.  
- Performance: limit nodes/links for very large properties (e.g. collapse low-weight links).

---

## 7. File and UI Checklist

- [ ] **Sidebar** (e.g. `popup.html`): Add “Flow” link and icon, same pattern as Rules/Extensions/Data Elements.  
- [ ] **flow.html**: Header “Flow”, filter bar (Contains, optional Flow container/direction), div for chart, load `flow.js` and D3.  
- [ ] **flow.js**:  
  - [ ] Load and normalize rules, dataElements, extension from sessionStorage.  
  - [ ] Build ruleToDataElement, dataElementToRule, dataElementToDataElement (reuse logic).  
  - [ ] Build ruleToExtension, extensionToRule from modulePath.  
  - [ ] Build nodes array (id, name, type, column index).  
  - [ ] Build links array (source id, target id, value).  
  - [ ] Implement “Contains” filter.  
  - [ ] Layout: three columns; compute node positions and link paths (D3 Sankey or custom).  
  - [ ] Render: rects for nodes, paths for links; “+N more” nodes.  
  - [ ] Tooltips and optional click highlight.  
- [ ] **Styling**: Reuse `#4e73df`, `#27c5c1`, and card/table styles; ensure flow fits in iframe (responsive width/height).

---

## 8. Summary

- **New tab:** Flow (same level as Rules, Extensions, Data Elements).  
- **Visual:** Three-column Sankey-style diagram (e.g. Data Elements | Rules | Extensions) with curved bands; width = connection count.  
- **Data:** Reuse and extend relationship-diagram logic; add rule–extension from `modulePath`.  
- **Tech:** Existing D3 + new `flow.html` / `flow.js`; optional `flow.css`.  
- **Phases:** (1) MVP three-column DE–Rule–Extension flow + “Contains” filter; (2) DE→DE and direction toggle; (3) export and performance.

This plan keeps the same interaction and visual language as the reference Flow chart while fitting TagScanner’s data (data elements, rules, extensions) and existing codebase.
