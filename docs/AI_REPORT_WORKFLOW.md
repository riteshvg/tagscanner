# AI Property Report – Workflow & Setup

This document describes the **AI Property Report** feature and how to use it with Azure OpenAI.

## Overview

The AI Report generates a **summary**, **grade**, and **health** assessment of your connected Adobe Tags property. The output includes:

- **Summary** – Short overall description of the implementation
- **Grade** – Letter grade (A–F) with justification
- **Health** – Implementation health in a few sentences
- **Issues** – Clearly outlined issues (e.g. incorrect or risky custom code, misconfigurations, missing best practices)
- **Next Steps** – Clearly outlined recommended next steps

The report can be viewed on the **AI Report** page and downloaded as a **PDF** (via jsPDF when available, or via the browser’s Print → Save as PDF).

## Where to find it

- **Left sidebar** → **AI Report** (between Summary and Feedback).
- Opens the report page in the main content area.

## Prerequisites

1. **Property data loaded**  
   Scan a site with TagScanner and open **Rules** or **Summary** (or another page that loads container data) so that rules, data elements, and extensions are in session. Then open **AI Report**.

2. **Azure OpenAI resource**  
   You need:
   - An [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service) resource.
   - A deployed chat model (e.g. gpt-4, gpt-35-turbo).
   - The resource **Endpoint URL**, **API Key**, and **Deployment name**.

## Configuration (on the AI Report page)

1. Expand **Azure OpenAI settings**.
2. Enter:
   - **Endpoint URL** – e.g. `https://your-resource.openai.azure.com/` (no path, no trailing slash).
   - **API Key** – From Azure portal → your OpenAI resource → Keys and Endpoint.
   - **Deployment / Model name** – The deployment name you gave when deploying the model (e.g. `gpt-4`).
3. Click **Save settings** (stored locally in the extension).

## Generating a report

1. Open **AI Report** from the sidebar.
2. Ensure Azure OpenAI settings are saved.
3. Click **Generate report**.  
   The extension builds a condensed payload from your property (rules, events/conditions/actions, data elements, extensions, and snippets of custom code) and sends it to Azure OpenAI.
4. When the response is back, the report is shown on the page in sections.
5. Click **Download PDF** to get a PDF (or use the print dialog from the opened window if jsPDF is not available).

## Security and privacy

- **API key** is stored in the browser’s extension storage (e.g. `chrome.storage.local`), not on a server.
- **Property data** is sent to your own Azure OpenAI resource; it is not sent to TagScanner or any third party.
- Use Azure’s data and compliance policies for your region and organization.

## Technical notes

- The payload sent to Azure is a condensed, structured summary of rules (names, events, conditions, actions, and short custom code snippets), data elements (names and types), and extension names to stay within model token limits.
- The chat completions endpoint used is:  
  `{endpoint}/openai/deployments/{deployment}/chat/completions?api-version=2024-02-15-preview`
- The model is instructed to respond with the exact section headers: **Summary**, **Grade**, **Health**, **Issues**, **Next Steps**, so the UI and PDF can parse and display them consistently.

## Troubleshooting

- **“No property data found”** – Load a scanned property first (e.g. open Rules or Summary), then open AI Report again.
- **API errors** – Check endpoint URL (no path), API key, and deployment name. Ensure the deployment exists and the key has access.
- **PDF not downloading** – If the jsPDF library does not load in the extension context, use **Download PDF** anyway; it will open a new window with the report and trigger the print dialog. Choose **Save as PDF** there.
