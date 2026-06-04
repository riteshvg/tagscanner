# TagScanner 2.5.6

TagScanner is a Chrome extension that gives Adobe Tags (Launch / Data Collection) implementers a deep, instant view into their deployed property — without leaving the browser.

## What it does

TagScanner reads your active Adobe Tags container directly from the page and surfaces the information in a structured, searchable interface. No external logins, no API keys, no property access required beyond what is already deployed on the page.

---

## Features

### Property Overview
- **Component Summary** — quick count of rules, data elements, and extensions at a glance
- **Usage Analysis** — identifies unused data elements and rules that are adding payload without contributing to any active logic
- **Size Analysis** — breaks down the size contribution of each component to help reduce library weight

### Detailed Views
- **Data Elements** — complete list with type, extension, custom code preview, filtering, and sorting
- **Rules** — full overview of every rule with its events, conditions, and actions
- **Extensions** — installed extensions with version info and usage details
- **Flow View** — visual map of how rules, data elements, and extensions interconnect

### AI Features *(requires sign-in)*
- **AI Health Scan** — analyses your entire property and returns a health score, grade, critical issues, warnings, and prioritised recommendations
- **Code Explain** — paste or open any custom code block and get a plain-English explanation of what it does, what data it reads, what it returns, and any risks
- **Ask AI** — conversational interface to ask questions about your specific property (e.g. "which rules fire on every page?", "are there any unused data elements?")
- **AI Query History** — review past AI responses and re-open them at any time

### Export & Documentation
- **PDF Export** — download a complete implementation summary as a PDF
- **CSV Export** — export component details for use in spreadsheets or reports
- **Clipboard Copy** — copy any table directly for use in presentations or documentation

### Developer Tools
- **Search** — global search across all rules, data elements, and extensions
- **Custom Code Viewer** — view and copy the raw custom code for any component with syntax highlighting
- **Data Element References** — see exactly which rules reference each data element

### User Experience
- **Interactive Tours** — built-in guided tour for first-time users
- **Table Sorting** — click any column header to sort

---

## Installation

Install directly from the [Chrome Web Store](https://chrome.google.com/webstore/detail/tagscanner/mhejdbndckkddicchjjbaehfbmjjlmjn).

Once installed:
1. Navigate to any page where an Adobe Tags property is active
2. Click the TagScanner icon in your Chrome toolbar
3. The extension will load your property data automatically

---

## AI Features — Sign In

AI features require a free Google sign-in to prevent abuse. Your property data is analysed securely and never stored beyond what is needed to serve your request. Results are cached briefly to improve response times for shared properties.

---

## Libraries Used

- jQuery 3.2.1
- TableSorter
- Intro.js
- HTML2Canvas
- D3.js
- Font Awesome
- Prettier (code formatting)

---

## Feedback

Found a bug or have a suggestion? Use the feedback form inside the extension or open an issue on [GitHub](https://github.com/riteshvg/tagscanner).
