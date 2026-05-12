# Chrome Request Monitor — Design Spec

## Overview

A Chrome extension that monitors all fetch and XHR requests from web pages. Popup page provides configuration (on/off toggle), DevTools panel displays captured requests with filtering and detail inspection. Built with pnpm monorepo, React, and Vite.

## Architecture

### Monorepo Structure

```
chrome-request-monitor/
├── pnpm-workspace.yaml
├── package.json
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   └── src/
│   │       ├── types.ts          # RequestRecord, FilterConfig, MessageTypes
│   │       ├── constants.ts      # Storage keys, message type constants
│   │       └── index.ts
│   ├── popup/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── components/
│   │       │   ├── ToggleSwitch.tsx
│   │       │   └── StatusBadge.tsx
│   │       ├── hooks/
│   │       │   └── useStorage.ts
│   │       └── style.css
│   ├── devtool/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── devtools.html          # DevTools entry page: registers the panel
│   │   ├── panel.html             # Panel page (React mount point)
│   │   └── src/
│   │       ├── devtools.ts        # chrome.devtools.panels.create('Monitor', ..., 'panel.html')
│   │       ├── panel.tsx          # Panel React entry
│   │       ├── App.tsx
│   │       ├── components/
│   │       │   ├── Toolbar.tsx
│   │       │   ├── RequestTable.tsx
│   │       │   └── RequestDetail.tsx
│   │       │       ├── GeneralTab.tsx
│   │       │       ├── HeadersTab.tsx
│   │       │       └── BodyTab.tsx
│   │       │   └── StatusBar.tsx
│   │       ├── hooks/
│   │       │   ├── useRequests.ts
│   │       │   └── useFilter.ts
│   │       ├── utils/
│   │       │   ├── formatters.ts
│   │       │   └── constants.ts
│   │       └── style.css
│   ├── content/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── src/
│   │       └── index.ts
│   └── background/
│       ├── package.json
│       ├── vite.config.ts
│       └── src/
│           └── index.ts
├── dist/                        # Build output = extension directory
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── devtool.html
│   ├── devtool.js
│   ├── content.js
│   └── background.js
```

### Data Flow

```
Page → Content Script (monkey-patch fetch/XHR)
     → chrome.runtime.sendMessage → Service Worker (relay + chrome.storage.session buffer)
     → chrome.runtime.connect (long-lived port) → DevTools Panel (display + filter)
```

- **Content Script** intercepts requests, captures request/response data, forwards to Service Worker
- **Service Worker** receives requests, writes to `chrome.storage.session` (in-memory buffer against SW termination), forwards to connected DevTools panels
- **DevTools Panel** connects via long-lived port on open, receives real-time push, pulls buffer backlog on connect
- **Popup** reads/writes `chrome.storage.sync` for config (`{ enabled: boolean }`)
- **Config propagation**: Popup writes → `chrome.storage.onChanged` fires in Content Script → dynamically patch/unpatch

## Request Interception

### fetch

Wrap `window.fetch`:
- Record start time via `performance.now()`
- Clone response to read body without consuming original stream
- Send captured data (method, URL, headers, status, body, duration) to background
- Handle both success and error paths
- Body capture limited to text types, truncated at 1MB

### XMLHttpRequest

Wrap `window.XMLHttpRequest`:
- Proxy `open()` and `send()` methods
- Attach `load`/`error` event listeners
- Read `responseText` / `responseURL` / `status` on completion
- Same data shape as fetch capture

### Toggle Control

- Content script starts in passive mode (no patching)
- Listens for `chrome.storage.onChanged` on the `enabled` key
- When enabled: apply patches, save originals
- When disabled: restore originals

## Popup Page

Simple UI with future extensibility:

| Element | Description |
|---------|-------------|
| Title | "Request Monitor" |
| Toggle | Enable/disable request interception |
| Status | Display current state (running/stopped) |
| Count | Show captured request count (via SW query) |
| (future) | Filter rules section placeholder |

States: loading (reading storage), enabled, disabled.

## DevTools Panel

### Layout

Two-panel layout: request list (left) + detail panel (right). Toolbar at top, status bar at bottom.

### Request Table Columns

| Column | Details |
|--------|---------|
| Method | GET/POST/PUT/DELETE/PATCH |
| URL | Path shown, full URL on hover |
| Status | Status code, 4xx/5xx highlighted red |
| Type | fetch / xhr |
| Duration | ms, visual indicator for slow requests |

### Detail Panel Tabs

| Tab | Content |
|-----|---------|
| General | URL, Method, Status, Duration, Start Time |
| Request Headers | Key-value pairs |
| Response Headers | Key-value pairs |
| Request Body | Formatted display, if available |
| Response Body | Auto-formatted JSON, truncated for large content |

### Filtering

- Search bar: real-time filter by URL substring
- Method filter: dropdown (All / GET / POST / PUT / DELETE)
- Status filter: dropdown (All / 2xx / 3xx / 4xx / 5xx)
- Type filter: dropdown (All / fetch / xhr)

### Technical Choices

- Virtual scrolling for request list (`@tanstack/react-virtual`)
- State management: React Context + useReducer
- Communication: `chrome.runtime.connect` long-lived port from DevTools to SW
- Filtering performed client-side on the full request list

## Shared Package (`packages/shared`)

Core types shared across all packages:

```typescript
interface RequestRecord {
  id: string;
  method: string;
  url: string;
  requestHeaders: [string, string][];
  requestBody?: string;
  responseStatus: number;
  responseHeaders: [string, string][];
  responseBody?: string;
  startTime: number;
  duration: number;
  type: 'fetch' | 'xhr';
}

interface FilterConfig {
  urlFilter: string;
  methodFilter: string;       // '' = all
  statusFilter: string;       // '' = all, '2xx', '3xx', etc.
  typeFilter: string;         // '' = all, 'fetch', 'xhr'
}

interface AppConfig {
  enabled: boolean;
}

// Message types
type Message =
  | { type: 'REQUEST_CAPTURED'; data: RequestRecord }
  | { type: 'GET_CAPTURED_REQUESTS' }
  | { type: 'CAPTURED_REQUESTS_RESPONSE'; data: RequestRecord[] }
  | { type: 'GET_REQUEST_COUNT' }
  | { type: 'REQUEST_COUNT_RESPONSE'; count: number };
```

### DevTools Entry Point

Chrome DevTools extensions require a separate entry page (not the panel) that calls `chrome.devtools.panels.create()` to register the panel. The `devtools.html` page is referenced in `manifest.json` under `devtools_page`.

Flow: User opens DevTools → Chrome loads `devtools.html` → calls `chrome.devtools.panels.create('Monitor', ..., 'panel.html')` → React renders in the panel.

## Build & Packaging

- popup: Standard Vite + React app → `popup.html` + `popup.js`
- devtool: Two entry points (devtools.html + panel.html) built as multi-page Vite app
- content, background: Vite library mode → standalone `.js` files
- A root build script runs all package builds and copies outputs + `manifest.json` to `dist/`
- Manifest v3 with permissions: `storage`, `scripting`, `activeTab`, `host_permissions`
- `manifest.json` is hand-maintained at the project root, referencing all built assets

## States & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Popup opens when disabled | Show disabled state, toggle turns it on |
| DevTools panel not open | Requests buffered in SW memory + chrome.storage.session |
| DevTools panel opens late | Pulls all buffered requests on connect |
| SW terminates (idle) | Buffer in chrome.storage.session survives, repopulated on restart |
| Large response body | Truncated at 1MB, indicator shown in UI |
| Binary response (image/blob) | Skipped for body capture, headers still captured |
| High frequency requests | Content script batches or queues to avoid message flood |
| No active tab | Content script not injected, no capture |
| xhrFields / credentials | Captured as part of request headers |
