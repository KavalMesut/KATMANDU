<!-- Generated together from docs/readme.content.json. Edit both languages there and run npm run docs:sync. -->

# KATMANDU

[Türkçe README](README.tr.md)

## Scientific problem solving and derivation

KATMANDU is an AI-assisted workspace for university-level physics and mathematics. It presents solutions as readable academic documents with equations, diagrams and interactive derivations. You can explore a step, ask a contextual question, compare alternative methods and save the complete study locally.

Built with React, TypeScript, Vite, Tailwind CSS and KaTeX.

## Preview

Black workspace with a rainbow accent palette, inline mathematical derivations and a branching solution tree. The preview uses English offline demo examples, including the problem statement, solution and derivation labels.

![KATMANDU dark theme with rainbow accents, an English pendulum demo and its derivation tree](docs/screenshots/dark-spectrum.jpg)

## Features

- Enter text or LaTeX, upload images, or load PDF documents.
- Detect independent questions and solve them in separate tabs; preserve dependent parts such as a), b), c).
- Explore inline derivation layers, diagrams, assumptions, foundational laws and alternative methods.
- Choose the provider and model yourself; questions are detected automatically without an automatic model router.
- Browse live model catalogs for OpenAI, Google Gemini, DeepSeek and OpenRouter. OpenRouter groups models by company.
- Save studies as readable JSON files with their sources, attachments, derivation trees and execution reports.
- Export individual or combined studies as A4 print/PDF documents or standalone LaTeX source.
- Use English (default) or Turkish without changing the layout.

## Getting started

Requirements: **Node.js 22.13 or newer** and npm.

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:5173` (or the address printed by Vite if that port is occupied).

```bash
npm run build
npm run preview
```

`build` checks TypeScript, including the local archive server, and creates the production bundle. `preview` serves that bundle with the local JSON archive API. A purely static hosting service keeps archives in browser storage because it cannot write to your local filesystem.

## Launch from the project folder

- **Linux:** Run `./KATMANDU_BASLAT.sh` from the project folder (or use your file manager’s “Run in terminal” option). It installs missing dependencies and opens the browser when ready.
- **Windows:** Double-click `KATMANDU_BASLAT.bat`.
- **macOS:** Double-click `KATMANDU_BASLAT.command` in Finder, or run `bash KATMANDU_BASLAT.command` in Terminal. If the executable permission was lost when downloading a ZIP, run `chmod +x KATMANDU_BASLAT.command` first.

The Linux launcher prints the current Git branch without changing it, uses `127.0.0.1:5173`, and refuses to silently switch ports. Launching it again while it is running opens the existing address. Stop it with `Ctrl+C` in its terminal. An existing local `KATMANDU.desktop` shortcut can still be used; it contains a machine-specific path and is excluded from Git.

All launchers require Node.js 22.13 or newer and keep the server on `127.0.0.1:5173`. The macOS launcher uses Vite to open the browser and does not require Linux-specific tools.

## Platform and mobile browser support

Designed for Windows, Linux and macOS; Linux is the platform currently tested. Windows and macOS launchers are provided, but native testing on those systems is still pending.

Below 1200 pixels, **Solution**, **My Library** and **Derivation Tree** open as separate workspace views. Touch-friendly controls, scrollable dialogs and equation derivation buttons support phone and tablet use. Print/PDF keeps the A4 layout. Browser viewport checks do not replace testing on physical iOS/Android devices.

There is no native Android/iOS installer. A phone needs access to an already running web instance; Node.js does not need to be installed on the phone. `127.0.0.1` on the phone refers to the phone itself. Network sharing remains opt-in and has no user authentication; see the privacy section before exposing the local server.

## Language

English is the default on first launch. Choose **Settings → Language → Türkçe** for Turkish; the choice is saved immediately in this browser.

Interface labels, messages, mathematical tooltips, prepared demo content and export headings follow the selected language. Live providers automatically interpret the input language and are instructed to write new solutions, question descriptions and derivations in the selected application language, regardless of the language of the question. Each request captures its language at the start, and new solution metadata records it. Saved solutions retain their original text and provenance; switching the interface language does not translate archived studies or user input.

## Providers and model selection

Configure your provider, API key and model in **Settings**. Missing or whitespace-only keys block live operations with a visible message; they never enable demo mode automatically. Select **Offline Demo** explicitly to try prepared examples without API calls.

Model lists refresh on application startup for providers with configured keys. They are cached locally for 24 hours and can be refreshed manually; you can also enter a model ID directly. Account availability, prices and supported input formats come from the provider catalog and may change. Use **Test Connection** to check your selection. OpenAI supports Chat Completions and Responses, with fallback to Responses when required by the endpoint.

**Model selection is currently manual.** Choose the provider and model in Settings. Independent questions are still detected automatically and solved with your selected model. Automatic model recommendations are temporarily disabled because of routing problems; there is no recommendation-model call or approval dialog. The experimental routing code is retained for a later, corrected version.

## Local archive and execution reports

With `npm run dev` or `npm run preview`, completed studies are saved as individual JSON files under **`solutions/`**. Existing browser records migrate on the first successful local-server connection. Browser storage remains an offline backup.

On the first archive operation after upgrading, JSON files in the old `cozumler/` folder move to `solutions/` without changing their contents or identifiers. Conflicting older files are preserved under `solutions/legacy-cozumler/`; the existing file in `solutions/` remains active. Backup files are not listed as duplicate studies.

Writes, deletions and clearing are queued persistently when disk access fails and retried when connectivity returns, on reopening, or every 30 seconds. The archive panel shows pending work and errors. The queue belongs to the current browser profile. Records include `schemaVersion` and `updatedAt`; historical model/date information is preserved. The list loads summaries in pages of 50, then loads the full document when opened.

A small **Execution report** below each derivation tree lists detection/solution models (and recommendation models in older reports), reasoning levels, elapsed processing time (excluding the user’s approval wait), tokens reported by the API and cost when available. Unknown token/cost data remains unknown. Shared calls are marked as shared, so reports for multiple questions must not be added together. This report is stored in `document.executionReport` in the question’s JSON file. Old studies do not receive estimated historical reports. The solution itself displays only the solution model and date.

## Verification, request limits and privacy

Verification explanations come from the solution model. KATMANDU does not currently run an independent symbolic algebra/CAS check; the interface and exports label these explanations **Not independently checked**. Missing explanations are not converted into claims of successful verification.

Closing a tab, starting a replacement request or pressing **Stop** cancels the current operation and prevents a late response from replacing current work. Cancellation does not reverse charges for requests already processed by a provider.

Settings include concurrency (default 2), timeout (default 300 seconds, including queue time) and an estimated per-question USD limit (0 disables it). When enabled, unknown catalog prices block requests and estimated input/output allowances are checked before calls. Shared detection costs are included when known. This is an application-side estimate, not a provider-enforced billing cap.

OpenRouter renders and sends all pages of PDFs up to 20 pages; longer or unreadable documents fail explicitly. OpenAI sends actual PDF file bytes. A model or endpoint must support the supplied format.

API calls go directly from the browser to the selected provider; API keys are kept in browser settings. Input and attachments are sent to that provider when used. `VITE_*` environment values are included in browser bundles. Production builds refuse populated `VITE_*_API_KEY`, token, password or secret variables; remove these values before building and enter keys in Settings. Gemini credentials are sent in the `x-goog-api-key` header rather than the URL. Browser storage is not an encrypted secret vault: scripts running on this application’s origin can read saved keys. A shared service using an owner’s key requires a separate authenticated backend. Local archives, environment files and private experiment/design folders are excluded from Git and blocked from direct development-server file access.

Development and preview servers listen on `127.0.0.1` by default. `KATMANDU_SHARE_NETWORK=1 npm run dev` explicitly enables network sharing, including archive access, without user authentication. The archive API rejects cross-site requests and requires the application header for mutations.

Provider requests, catalog refreshes and connection tests require HTTPS; HTTP is allowed only for loopback proxies (`localhost`, `127.0.0.1`, `[::1]`). URLs containing a username/password and HTTP redirects are rejected. Custom endpoints receive your input and credentials: configure only endpoints you trust. The archive API also validates the Host header to block DNS rebinding; custom domain names must be explicitly listed in Vite’s `server.allowedHosts` or `preview.allowedHosts`. Errors do not return archive contents or server paths.

## Development and bilingual documentation

```bash
npm test
npm run build
npm run docs:sync
npm run docs:check
```

Tests cover provider requests with simulated HTTP responses, mounted application flows, browser/disk storage, cancellation, exports and both languages. They do not require paid API calls or a LaTeX compiler.

**Keep both READMEs together:** edit both the `en` and `tr` versions of each affected section in [`docs/readme.content.json`](docs/readme.content.json), then run `npm run docs:sync`. The generator writes this main English README and `README.tr.md` together. `npm test` runs `docs:check` first and fails if either generated README is out of date. New interface text must be registered in `src/i18n/en.json` with its Turkish source; language and placeholder regression tests guard the catalog.

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 Mesut Kaval.
