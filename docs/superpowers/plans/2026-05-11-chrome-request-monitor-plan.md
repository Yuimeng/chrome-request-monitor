# Chrome Request Monitor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension (MV3) that monitors all page fetch/XHR requests, with a popup toggle and a DevTools panel for inspection.

**Architecture:** pnpm monorepo with 5 packages (shared, popup, devtool, content, background). Content script patches `fetch`/`XMLHttpRequest` in MAIN world, sends captured data via CustomEvent to an ISOLATED world script, which forwards to the Service Worker. SW buffers requests in memory + `chrome.storage.session` and relays to DevTools via long-lived port.

**Tech Stack:** pnpm workspaces, Vite 6, React 19, TypeScript 5, @tanstack/react-virtual, Chrome Extension Manifest V3

---

## File Structure

```
chrome-request-monitor/
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── manifest.json
├── scripts/
│   └── assemble.cjs
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types.ts
│   │       ├── constants.ts
│   │       └── index.ts
│   ├── content/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── isolated-world.ts
│   │       └── main-world.ts
│   ├── background/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── src/
│   │       └── index.ts
│   ├── popup/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       ├── index.tsx
│   │       ├── App.tsx
│   │       ├── App.css
│   │       ├── components/
│   │       │   ├── ToggleSwitch.tsx
│   │       │   └── StatusBadge.tsx
│   │       └── hooks/
│   │           └── useStorage.ts
│   └── devtool/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── devtools.html
│       ├── panel.html
│       └── src/
│           ├── devtools.ts
│           ├── panel.tsx
│           ├── App.tsx
│           ├── App.css
│           ├── components/
│           │   ├── Toolbar.tsx
│           │   ├── RequestTable.tsx
│           │   ├── RequestDetail.tsx
│           │   ├── GeneralTab.tsx
│           │   ├── HeadersTab.tsx
│           │   ├── BodyTab.tsx
│           │   └── StatusBar.tsx
│           ├── hooks/
│           │   ├── useRequests.ts
│           │   └── useFilter.ts
│           └── utils/
│               ├── formatters.ts
│               └── constants.ts
├── dist/
│   ├── manifest.json
│   ├── popup/index.html
│   ├── devtool/devtools.html
│   ├── devtool/panel.html
│   ├── content/isolated.js
│   ├── content/main.js
│   └── background/background.js
```

---

### Task 1: Initialize Monorepo & Root Config

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Create pnpm-workspace.yaml**

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

- [ ] **Step 2: Create root package.json**

```json
{
  "name": "chrome-request-monitor",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build:shared": "pnpm --filter @request-monitor/shared exec echo 'no build needed'",
    "build:content": "pnpm --filter @request-monitor/content build",
    "build:background": "pnpm --filter @request-monitor/background build",
    "build:popup": "pnpm --filter @request-monitor/popup build",
    "build:devtool": "pnpm --filter @request-monitor/devtool build",
    "build": "pnpm build:content && pnpm build:background && pnpm build:popup && pnpm build:devtool",
    "assemble": "node scripts/assemble.cjs",
    "build:ext": "pnpm build && pnpm assemble"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  },
  "engines": {
    "pnpm": ">=9.0.0"
  }
}
```

- [ ] **Step 3: Create root tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create assemble script**

```javascript
// scripts/assemble.cjs
const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');

// Create dist directory
fs.mkdirSync(distDir, { recursive: true });

// Copy manifest.json to dist/
fs.copyFileSync(
  path.resolve(__dirname, '..', 'manifest.json'),
  path.join(distDir, 'manifest.json')
);

console.log('Extension assembled in dist/');
```

- [ ] **Step 5: Initialize and install**

```bash
cd chrome-request-monitor
pnpm init
pnpm install
```
---

### Task 2: Create Shared Types Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@request-monitor/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create types.ts**

```typescript
// packages/shared/src/types.ts
export interface RequestRecord {
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

export interface FilterConfig {
  urlFilter: string;
  methodFilter: string;
  statusFilter: string;
  typeFilter: string;
}

export interface AppConfig {
  enabled: boolean;
}

export type Message =
  | { type: 'REQUEST_CAPTURED'; data: RequestRecord }
  | { type: 'GET_CAPTURED_REQUESTS' }
  | { type: 'CAPTURED_REQUESTS_RESPONSE'; data: RequestRecord[] }
  | { type: 'GET_REQUEST_COUNT' }
  | { type: 'REQUEST_COUNT_RESPONSE'; count: number };
```

- [ ] **Step 4: Create constants.ts**

```typescript
// packages/shared/src/constants.ts
export const STORAGE_KEYS = {
  ENABLED: 'monitor_enabled',
  REQUEST_BUFFER: 'request_buffer',
} as const;

export const MESSAGE_TYPES = {
  REQUEST_CAPTURED: 'REQUEST_CAPTURED',
  GET_CAPTURED_REQUESTS: 'GET_CAPTURED_REQUESTS',
  CAPTURED_REQUESTS_RESPONSE: 'CAPTURED_REQUESTS_RESPONSE',
  GET_REQUEST_COUNT: 'GET_REQUEST_COUNT',
  REQUEST_COUNT_RESPONSE: 'REQUEST_COUNT_RESPONSE',
} as const;

export const EVENTS = {
  REQUEST_CAPTURED: '__request_captured__',
  MONITOR_CONFIG: '__monitor_config__',
} as const;

export const MAX_BODY_SIZE = 1_000_000; // 1MB

export const PORT_NAME_DEVTOOLS = 'devtools';
```

- [ ] **Step 5: Create index.ts**

```typescript
// packages/shared/src/index.ts
export type { RequestRecord, FilterConfig, AppConfig, Message } from './types';
export { STORAGE_KEYS, MESSAGE_TYPES, EVENTS, MAX_BODY_SIZE, PORT_NAME_DEVTOOLS } from './constants';
```

---

### Task 3: Create Extension Manifest

**Files:**
- Create: `manifest.json`

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Request Monitor",
  "version": "0.1.0",
  "description": "Monitor all fetch and XHR requests from pages",
  "permissions": [
    "storage",
    "scripting",
    "activeTab"
  ],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "popup/index.html",
    "default_title": "Request Monitor"
  },
  "devtools_page": "devtool/devtools.html",
  "background": {
    "service_worker": "background/background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/isolated.js"],
      "run_at": "document_start",
      "world": "ISOLATED"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["content/main.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

---

### Task 4: Build Content Script

**Files:**
- Create: `packages/content/package.json`
- Create: `packages/content/tsconfig.json`
- Create: `packages/content/vite.config.ts`
- Create: `packages/content/src/isolated-world.ts`
- Create: `packages/content/src/main-world.ts`

- [ ] **Step 1: Create package.json with dependencies**

```json
{
  "name": "@request-monitor/content",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build"
  },
  "dependencies": {
    "@request-monitor/shared": "workspace:*"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: '../../dist/content',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        isolated: resolve(__dirname, 'src/isolated-world.ts'),
        main: resolve(__dirname, 'src/main-world.ts'),
      },
      output: {
        format: 'iife',
        entryFileNames: '[name].js',
      },
    },
  },
});
```

- [ ] **Step 4: Create main-world.ts (MAIN world — patches fetch/XHR)**

```typescript
// packages/content/src/main-world.ts
// Runs in MAIN world via script injection. Has access to page's window.fetch/XHR.
import { EVENTS, MAX_BODY_SIZE } from '@request-monitor/shared';

let active = false;
let originalFetch: typeof window.fetch;
let originalXHR: typeof window.XMLHttpRequest;

function generateId(): string {
  return crypto.randomUUID();
}

function patchFetch() {
  if (active) return;
  active = true;
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const startTime = performance.now();
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const requestMethod = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : undefined) ?? 'GET').toUpperCase();
    const requestHeaders: [string, string][] = [];

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => requestHeaders.push([k, v]));
      } else if (Array.isArray(init.headers)) {
        requestHeaders.push(...init.headers as [string, string][]);
      } else {
        Object.entries(init.headers).forEach(([k, v]) => requestHeaders.push([k, v]));
      }
    }

    let requestBody: string | undefined;
    if (init?.body) {
      requestBody = typeof init.body === 'string' ? init.body : '[non-text body]';
    }

    try {
      const response = await originalFetch(input, init);
      const duration = performance.now() - startTime;

      let responseBody: string | undefined;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text') || contentType.includes('json')) {
        const cloned = response.clone();
        const text = await cloned.text();
        if (text.length <= MAX_BODY_SIZE) {
          responseBody = text;
        }
      }

      window.dispatchEvent(new CustomEvent(EVENTS.REQUEST_CAPTURED, {
        detail: {
          id: generateId(),
          method: requestMethod,
          url: requestUrl,
          requestHeaders,
          requestBody,
          responseStatus: response.status,
          responseHeaders: Array.from(response.headers.entries()),
          responseBody,
          startTime,
          duration,
          type: 'fetch',
        },
      }));

      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      window.dispatchEvent(new CustomEvent(EVENTS.REQUEST_CAPTURED, {
        detail: {
          id: generateId(),
          method: requestMethod,
          url: requestUrl,
          requestHeaders,
          requestBody,
          responseStatus: 0,
          responseHeaders: [],
          responseBody: undefined,
          startTime,
          duration,
          type: 'fetch',
        },
      }));
      throw error;
    }
  };
}

function patchXHR() {
  if (active) return;
  active = true;
  originalXHR = window.XMLHttpRequest;

  const OriginalXHR = originalXHR;
  window.XMLHttpRequest = function () {
    const xhr = new OriginalXHR();
    const startTime = performance.now();
    let method = 'GET';
    let requestUrl = '';
    let requestBody: string | undefined;
    const requestHeaders: [string, string][] = [];

    const originalOpen = xhr.open.bind(xhr);
    xhr.open = function (m: string, url: string | URL) {
      method = m.toUpperCase();
      requestUrl = typeof url === 'string' ? url : url.href;
      originalOpen(m, url);
    };

    const originalSetRequestHeader = xhr.setRequestHeader.bind(xhr);
    xhr.setRequestHeader = function (name: string, value: string) {
      requestHeaders.push([name, value]);
      originalSetRequestHeader(name, value);
    };

    const originalSend = xhr.send.bind(xhr);
    xhr.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      requestBody = typeof body === 'string' ? body : undefined;

      xhr.addEventListener('loadend', () => {
        const duration = performance.now() - startTime;
        let responseBody: string | undefined;
        const contentType = xhr.getResponseHeader('content-type') || '';
        if ((contentType.includes('text') || contentType.includes('json')) && xhr.responseText) {
          if (xhr.responseText.length <= MAX_BODY_SIZE) {
            responseBody = xhr.responseText;
          }
        }

        const responseHeaders: [string, string][] = [];
        const headerText = xhr.getAllResponseHeaders();
        headerText.split('\r\n').filter(Boolean).forEach(line => {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0) {
            responseHeaders.push([line.slice(0, colonIdx), line.slice(colonIdx + 2)]);
          }
        });

        window.dispatchEvent(new CustomEvent(EVENTS.REQUEST_CAPTURED, {
          detail: {
            id: generateId(),
            method,
            url: requestUrl,
            requestHeaders,
            requestBody,
            responseStatus: xhr.status,
            responseHeaders,
            responseBody,
            startTime,
            duration,
            type: 'xhr',
          },
        }));
      });

      originalSend(body);
    };

    return xhr;
  } as unknown as typeof window.XMLHttpRequest;

  // Copy static methods
  Object.keys(OriginalXHR).forEach(key => {
    (window.XMLHttpRequest as any)[key] = (OriginalXHR as any)[key];
  });
}

function restore() {
  if (!active) return;
  if (originalFetch) window.fetch = originalFetch;
  if (originalXHR) window.XMLHttpRequest = originalXHR;
  active = false;
}

// Listen for config from isolated-world script
window.addEventListener(EVENTS.MONITOR_CONFIG, ((event: CustomEvent) => {
  if (event.detail.enabled) {
    patchFetch();
    patchXHR();
  } else {
    restore();
  }
}) as EventListener);
```

- [ ] **Step 5: Create isolated-world.ts (ISOLATED world — bridges to chrome APIs)**

```typescript
// packages/content/src/isolated-world.ts
// Runs in ISOLATED world. Has access to chrome.runtime API.
// Injects main-world.ts into the page and bridges CustomEvent ↔ chrome.runtime.
import { EVENTS, STORAGE_KEYS } from '@request-monitor/shared';

// Inject main-world.ts script into page (MAIN world)
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content/main.js');
script.onload = () => script.remove();
document.documentElement.appendChild(script);

// Bridge: page CustomEvent → chrome.runtime.sendMessage
window.addEventListener(EVENTS.REQUEST_CAPTURED, ((event: CustomEvent) => {
  chrome.runtime.sendMessage({
    type: 'REQUEST_CAPTURED',
    data: event.detail,
  });
}) as EventListener);

// Bridge: chrome.storage changes → page CustomEvent
chrome.storage.onChanged.addListener((changes) => {
  if (STORAGE_KEYS.ENABLED in changes) {
    const enabled = changes[STORAGE_KEYS.ENABLED].newValue ?? false;
    window.dispatchEvent(new CustomEvent(EVENTS.MONITOR_CONFIG, {
      detail: { enabled },
    }));
  }
});

// Read initial config and apply
chrome.storage.sync.get(STORAGE_KEYS.ENABLED, (result) => {
  const enabled = result[STORAGE_KEYS.ENABLED] ?? false;
  window.dispatchEvent(new CustomEvent(EVENTS.MONITOR_CONFIG, {
    detail: { enabled },
  }));
});
```

---

### Task 5: Build Background Service Worker

**Files:**
- Create: `packages/background/package.json`
- Create: `packages/background/tsconfig.json`
- Create: `packages/background/vite.config.ts`
- Create: `packages/background/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@request-monitor/background",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build"
  },
  "dependencies": {
    "@request-monitor/shared": "workspace:*"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022", "WebWorker"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: '../../dist/background',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/index.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'background.js',
      },
    },
  },
});
```

- [ ] **Step 4: Create src/index.ts**

```typescript
// packages/background/src/index.ts
import { MESSAGE_TYPES, PORT_NAME_DEVTOOLS, STORAGE_KEYS } from '@request-monitor/shared';
import type { RequestRecord } from '@request-monitor/shared';

const requestBuffer: RequestRecord[] = [];
const devtoolsPorts: Set<chrome.runtime.Port> = new Set();

// Forward captured requests to all connected DevTools panels
function broadcastToDevTools(record: RequestRecord) {
  for (const port of devtoolsPorts) {
    try {
      port.postMessage({ type: MESSAGE_TYPES.REQUEST_CAPTURED, data: record });
    } catch {
      devtoolsPorts.delete(port);
    }
  }
}

// Persist buffer to chrome.storage.session (survives SW termination)
async function persistBuffer() {
  try {
    await chrome.storage.session.set({ [STORAGE_KEYS.REQUEST_BUFFER]: requestBuffer.slice(-500) });
  } catch {
    // storage.session may not be available in all contexts
  }
}

// Restore buffer from chrome.storage.session on SW startup
async function restoreBuffer() {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEYS.REQUEST_BUFFER);
    if (result[STORAGE_KEYS.REQUEST_BUFFER]) {
      requestBuffer.push(...result[STORAGE_KEYS.REQUEST_BUFFER]);
    }
  } catch {
    // storage.session may not be available
  }
}

// Handle messages from content script and DevTools panel
chrome.runtime.onMessage.addListener((
  message: any,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => {
  switch (message.type) {
    case MESSAGE_TYPES.REQUEST_CAPTURED: {
      const record = message.data as RequestRecord;
      requestBuffer.push(record);
      broadcastToDevTools(record);
      persistBuffer();
      break;
    }
    case MESSAGE_TYPES.GET_CAPTURED_REQUESTS: {
      sendResponse({ type: MESSAGE_TYPES.CAPTURED_REQUESTS_RESPONSE, data: requestBuffer });
      break;
    }
    case MESSAGE_TYPES.GET_REQUEST_COUNT: {
      sendResponse({ type: MESSAGE_TYPES.REQUEST_COUNT_RESPONSE, count: requestBuffer.length });
      break;
    }
  }
  // Keep sendResponse channel open for async responses
  return true;
});

// Handle long-lived port connections from DevTools panel
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME_DEVTOOLS) return;

  devtoolsPorts.add(port);

  // Send current buffer to newly connected DevTools panel
  port.postMessage({ type: MESSAGE_TYPES.CAPTURED_REQUESTS_RESPONSE, data: requestBuffer });

  port.onDisconnect.addListener(() => {
    devtoolsPorts.delete(port);
  });
});

// Initialize: restore buffer on load
restoreBuffer();
```

---

### Task 6: Build Popup UI

**Files:**
- Create: `packages/popup/package.json`
- Create: `packages/popup/tsconfig.json`
- Create: `packages/popup/vite.config.ts`
- Create: `packages/popup/index.html`
- Create: `packages/popup/src/index.tsx`
- Create: `packages/popup/src/App.tsx`
- Create: `packages/popup/src/App.css`
- Create: `packages/popup/src/components/ToggleSwitch.tsx`
- Create: `packages/popup/src/components/StatusBadge.tsx`
- Create: `packages/popup/src/hooks/useStorage.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@request-monitor/popup",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build"
  },
  "dependencies": {
    "@request-monitor/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.4.0",
    "vite": "^6.0.0",
    "typescript": "^5.7.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/chrome": "^0.0.300"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../dist/popup',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
});
```

- [ ] **Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Request Monitor</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/index.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: Create src/index.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './App.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 6: Create src/hooks/useStorage.ts**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '@request-monitor/shared';

export function useStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.storage.sync.get(key, (result) => {
      if (result[key] !== undefined) {
        setValue(result[key] as T);
      }
      setLoading(false);
    });

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (key in changes) {
        setValue(changes[key].newValue as T);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key]);

  const update = useCallback((newValue: T) => {
    chrome.storage.sync.set({ [key]: newValue });
  }, [key]);

  return [value, update, loading] as const;
}
```

- [ ] **Step 7: Create src/components/ToggleSwitch.tsx**

```tsx
interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export default function ToggleSwitch({ enabled, onChange }: ToggleSwitchProps) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      cursor: 'pointer',
      userSelect: 'none',
    }}>
      <span style={{ fontSize: '14px', color: '#555' }}>Enable Monitoring</span>
      <div
        onClick={() => onChange(!enabled)}
        style={{
          width: '44px',
          height: '24px',
          borderRadius: '12px',
          background: enabled ? '#4CAF50' : '#ccc',
          position: 'relative',
          transition: 'background 0.2s',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: '#fff',
            position: 'absolute',
            top: '2px',
            left: enabled ? '22px' : '2px',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </div>
    </label>
  );
}
```

- [ ] **Step 8: Create src/components/StatusBadge.tsx**

```tsx
interface StatusBadgeProps {
  enabled: boolean;
  count: number;
}

export default function StatusBadge({ enabled, count }: StatusBadgeProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      padding: '8px 12px',
      background: enabled ? '#E8F5E9' : '#F5F5F5',
      borderRadius: '8px',
      fontSize: '13px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: enabled ? '#4CAF50' : '#999',
        }} />
        <span style={{ color: enabled ? '#2E7D32' : '#666' }}>
          {enabled ? 'Running' : 'Stopped'}
        </span>
      </div>
      <div style={{ color: '#666' }}>
        Captured: <strong>{count}</strong> requests
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create src/App.tsx**

```tsx
import { useEffect, useState } from 'react';
import { STORAGE_KEYS, MESSAGE_TYPES } from '@request-monitor/shared';
import { useStorage } from './hooks/useStorage';
import ToggleSwitch from './components/ToggleSwitch';
import StatusBadge from './components/StatusBadge';

export default function App() {
  const [enabled, setEnabled, loading] = useStorage<boolean>(STORAGE_KEYS.ENABLED, false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_REQUEST_COUNT }, (response) => {
        if (response?.count !== undefined) setCount(response.count);
      });
    };

    updateCount();
    const interval = setInterval(updateCount, 2000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ width: '260px', padding: '16px', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ width: '260px', padding: '16px', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: '0 0 16px', fontSize: '16px', color: '#333' }}>
        Request Monitor
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <ToggleSwitch enabled={enabled} onChange={setEnabled} />
        <StatusBadge enabled={enabled} count={count} />
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Create src/App.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

---

### Task 7: Build DevTools Panel

**Files:**
- Create: `packages/devtool/package.json`
- Create: `packages/devtool/tsconfig.json`
- Create: `packages/devtool/vite.config.ts`
- Create: `packages/devtool/devtools.html`
- Create: `packages/devtool/panel.html`
- Create: `packages/devtool/src/devtools.ts`
- Create: `packages/devtool/src/panel.tsx`
- Create: `packages/devtool/src/App.tsx`
- Create: `packages/devtool/src/App.css`
- Create: `packages/devtool/src/components/Toolbar.tsx`
- Create: `packages/devtool/src/components/RequestTable.tsx`
- Create: `packages/devtool/src/components/RequestDetail.tsx`
- Create: `packages/devtool/src/components/GeneralTab.tsx`
- Create: `packages/devtool/src/components/HeadersTab.tsx`
- Create: `packages/devtool/src/components/BodyTab.tsx`
- Create: `packages/devtool/src/components/StatusBar.tsx`
- Create: `packages/devtool/src/hooks/useRequests.ts`
- Create: `packages/devtool/src/hooks/useFilter.ts`
- Create: `packages/devtool/src/utils/formatters.ts`
- Create: `packages/devtool/src/utils/constants.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@request-monitor/devtool",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build"
  },
  "dependencies": {
    "@request-monitor/shared": "workspace:*",
    "@tanstack/react-virtual": "^3.11.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.4.0",
    "vite": "^6.0.0",
    "typescript": "^5.7.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/chrome": "^0.0.300"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vite.config.ts (multi-page)**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../dist/devtool',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        devtools: resolve(__dirname, 'devtools.html'),
        panel: resolve(__dirname, 'panel.html'),
      },
    },
  },
});
```

- [ ] **Step 4: Create devtools.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Request Monitor DevTools</title>
</head>
<body>
  <script type="module" src="/src/devtools.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Create src/devtools.ts**

```typescript
chrome.devtools.panels.create(
  'Request Monitor',
  '',
  'panel.html',
  () => console.log('Request Monitor panel created'),
);
```

- [ ] **Step 6: Create panel.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Request Monitor Panel</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/panel.tsx"></script>
</body>
</html>
```

- [ ] **Step 7: Create src/panel.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './App.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 8: Create src/utils/formatters.ts**

```typescript
export function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
}

export function formatUrl(url: string): { pathname: string; full: string } {
  try {
    const parsed = new URL(url);
    return { pathname: parsed.pathname + parsed.search, full: url };
  } catch {
    return { pathname: url, full: url };
  }
}

export function getDurationColor(ms: number): string {
  if (ms < 200) return '#4CAF50';
  if (ms < 500) return '#FF9800';
  return '#F44336';
}

export function getStatusColor(status: number): string {
  if (status === 0) return '#999';
  if (status < 300) return '#4CAF50';
  if (status < 400) return '#FF9800';
  return '#F44336';
}
```

- [ ] **Step 9: Create src/utils/constants.ts**

```typescript
export const FILTER_OPTIONS = {
  method: ['', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
  status: ['', '2xx', '3xx', '4xx', '5xx'],
  type: ['', 'fetch', 'xhr'],
} as const;

export const LABELS: Record<string, string> = {
  '': 'All',
  'GET': 'GET',
  'POST': 'POST',
  'PUT': 'PUT',
  'DELETE': 'DELETE',
  'PATCH': 'PATCH',
  'HEAD': 'HEAD',
  '2xx': '2xx',
  '3xx': '3xx',
  '4xx': '4xx',
  '5xx': '5xx',
  'fetch': 'fetch',
  'xhr': 'xhr',
};
```

- [ ] **Step 10: Create src/hooks/useRequests.ts**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import { MESSAGE_TYPES, PORT_NAME_DEVTOOLS } from '@request-monitor/shared';
import type { RequestRecord } from '@request-monitor/shared';

export function useRequests() {
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    // Connect to background SW
    const port = chrome.runtime.connect({ name: PORT_NAME_DEVTOOLS });
    portRef.current = port;

    port.onMessage.addListener((message: any) => {
      switch (message.type) {
        case MESSAGE_TYPES.CAPTURED_REQUESTS_RESPONSE:
          setRequests(message.data as RequestRecord[]);
          break;
        case MESSAGE_TYPES.REQUEST_CAPTURED:
          setRequests(prev => [...prev, message.data as RequestRecord]);
          break;
      }
    });

    return () => {
      port.disconnect();
      portRef.current = null;
    };
  }, []);

  const clearRequests = useCallback(() => {
    setRequests([]);
  }, []);

  return { requests, clearRequests };
}
```

- [ ] **Step 11: Create src/hooks/useFilter.ts**

```typescript
import { useMemo, useState } from 'react';
import type { RequestRecord } from '@request-monitor/shared';
import type { FilterConfig } from '@request-monitor/shared';

export function useFilter(requests: RequestRecord[]) {
  const [filters, setFilters] = useState<FilterConfig>({
    urlFilter: '',
    methodFilter: '',
    statusFilter: '',
    typeFilter: '',
  });

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      if (filters.urlFilter && !req.url.toLowerCase().includes(filters.urlFilter.toLowerCase())) {
        return false;
      }
      if (filters.methodFilter && req.method !== filters.methodFilter) {
        return false;
      }
      if (filters.statusFilter) {
        const statusGroup = filters.statusFilter; // e.g. '2xx'
        const prefix = statusGroup[0];
        if (String(req.responseStatus)[0] !== prefix) {
          return false;
        }
      }
      if (filters.typeFilter && req.type !== filters.typeFilter) {
        return false;
      }
      return true;
    });
  }, [requests, filters]);

  return { filteredRequests, filters, setFilters };
}
```

- [ ] **Step 12: Create src/components/Toolbar.tsx**

```tsx
import { FILTER_OPTIONS, LABELS } from '../utils/constants';
import type { FilterConfig } from '@request-monitor/shared';

interface ToolbarProps {
  filters: FilterConfig;
  onFilterChange: (filters: FilterConfig) => void;
  onClear: () => void;
}

export default function Toolbar({ filters, onFilterChange, onClear }: ToolbarProps) {
  const update = (partial: Partial<FilterConfig>) => {
    onFilterChange({ ...filters, ...partial });
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      borderBottom: '1px solid #ddd',
      background: '#fafafa',
      flexWrap: 'wrap',
    }}>
      <input
        type="text"
        placeholder="Filter URL..."
        value={filters.urlFilter}
        onChange={(e) => update({ urlFilter: e.target.value })}
        style={{
          flex: '1 1 200px',
          padding: '4px 8px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace',
        }}
      />
      <select
        value={filters.methodFilter}
        onChange={(e) => update({ methodFilter: e.target.value })}
        style={selectStyle}
      >
        {FILTER_OPTIONS.method.map((m) => (
          <option key={m} value={m}>{LABELS[m] || m}</option>
        ))}
      </select>
      <select
        value={filters.statusFilter}
        onChange={(e) => update({ statusFilter: e.target.value })}
        style={selectStyle}
      >
        {FILTER_OPTIONS.status.map((s) => (
          <option key={s} value={s}>{LABELS[s] || s}</option>
        ))}
      </select>
      <select
        value={filters.typeFilter}
        onChange={(e) => update({ typeFilter: e.target.value })}
        style={selectStyle}
      >
        {FILTER_OPTIONS.type.map((t) => (
          <option key={t} value={t}>{LABELS[t] || t}</option>
        ))}
      </select>
      <button onClick={onClear} style={buttonStyle}>
        Clear
      </button>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '4px 6px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  fontSize: '12px',
  background: '#fff',
};

const buttonStyle: React.CSSProperties = {
  padding: '4px 12px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  fontSize: '12px',
  background: '#fff',
  cursor: 'pointer',
};
```

- [ ] **Step 13: Create src/components/RequestTable.tsx**

```tsx
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { RequestRecord } from '@request-monitor/shared';
import { formatDuration, formatUrl, getDurationColor, getStatusColor } from '../utils/formatters';

interface RequestTableProps {
  requests: RequestRecord[];
  selectedId: string | null;
  onSelect: (record: RequestRecord) => void;
}

export default function RequestTable({ requests, selectedId, onSelect }: RequestTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: requests.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
  });

  return (
    <div ref={parentRef} style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const req = requests[virtualItem.index];
          const { pathname, full } = formatUrl(req.url);
          const isSelected = req.id === selectedId;

          return (
            <div
              key={req.id}
              onClick={() => onSelect(req)}
              title={full}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0 8px',
                fontSize: '12px',
                fontFamily: 'monospace',
                cursor: 'pointer',
                background: isSelected ? '#e3f2fd' : virtualItem.index % 2 === 0 ? '#fff' : '#f8f9fa',
                borderBottom: '1px solid #eee',
                whiteSpace: 'nowrap',
                boxSizing: 'border-box',
              }}
            >
              <span style={{
                width: '60px',
                color: '#1976D2',
                fontWeight: 600,
                flexShrink: 0,
              }}>
                {req.method}
              </span>
              <span style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: '#333',
              }}>
                {pathname}
              </span>
              <span style={{
                width: '36px',
                textAlign: 'right',
                color: getStatusColor(req.responseStatus),
                fontWeight: 600,
                flexShrink: 0,
              }}>
                {req.responseStatus || 'ERR'}
              </span>
              <span style={{
                width: '36px',
                textAlign: 'right',
                color: '#666',
                flexShrink: 0,
              }}>
                {req.type === 'fetch' ? 'FETCH' : 'XHR'}
              </span>
              <span style={{
                width: '60px',
                textAlign: 'right',
                color: getDurationColor(req.duration),
                flexShrink: 0,
              }}>
                {formatDuration(req.duration)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 14: Create src/components/GeneralTab.tsx**

```tsx
import type { RequestRecord } from '@request-monitor/shared';
import { formatDuration, formatTime } from '../utils/formatters';

interface GeneralTabProps {
  record: RequestRecord;
}

export default function GeneralTab({ record }: GeneralTabProps) {
  const items: [string, string][] = [
    ['URL', record.url],
    ['Method', record.method],
    ['Status', String(record.responseStatus)],
    ['Duration', formatDuration(record.duration)],
    ['Start Time', formatTime(record.startTime)],
    ['Type', record.type === 'fetch' ? 'fetch()' : 'XMLHttpRequest'],
  ];

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <tbody>
        {items.map(([key, value]) => (
          <tr key={key} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{
              width: '140px',
              padding: '6px 12px',
              color: '#666',
              fontWeight: 600,
              verticalAlign: 'top',
              whiteSpace: 'nowrap',
            }}>
              {key}
            </td>
            <td style={{
              padding: '6px 12px',
              color: '#333',
              wordBreak: 'break-all',
              fontFamily: key === 'URL' ? 'monospace' : 'inherit',
            }}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 15: Create src/components/HeadersTab.tsx**

```tsx
interface HeadersTabProps {
  headers: [string, string][];
  title: string;
}

export default function HeadersTab({ headers, title }: HeadersTabProps) {
  if (headers.length === 0) {
    return (
      <p style={{ padding: '12px', color: '#999', fontSize: '12px' }}>
        No {title.toLowerCase()} available
      </p>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <thead>
        <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
          <th style={{ padding: '6px 12px', textAlign: 'left', color: '#666', width: '250px' }}>Name</th>
          <th style={{ padding: '6px 12px', textAlign: 'left', color: '#666' }}>Value</th>
        </tr>
      </thead>
      <tbody>
        {headers.map(([name, value], i) => (
          <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{
              padding: '4px 12px',
              color: '#8B4513',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}>
              {name}
            </td>
            <td style={{
              padding: '4px 12px',
              color: '#333',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 16: Create src/components/BodyTab.tsx**

```tsx
interface BodyTabProps {
  body: string | undefined;
  label: string;
}

export default function BodyTab({ body, label }: BodyTabProps) {
  if (!body) {
    return (
      <p style={{ padding: '12px', color: '#999', fontSize: '12px' }}>
        No {label.toLowerCase()} available
      </p>
    );
  }

  let formatted = body;
  let isJson = false;
  try {
    formatted = JSON.stringify(JSON.parse(body), null, 2);
    isJson = true;
  } catch {
    // not JSON, show raw
  }

  return (
    <pre style={{
      margin: 0,
      padding: '12px',
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#333',
      overflow: 'auto',
      maxHeight: '300px',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      background: '#fafafa',
    }}>
      {formatted}
    </pre>
  );
}
```

- [ ] **Step 17: Create src/components/RequestDetail.tsx**

```tsx
import { useState } from 'react';
import type { RequestRecord } from '@request-monitor/shared';
import GeneralTab from './GeneralTab';
import HeadersTab from './HeadersTab';
import BodyTab from './BodyTab';

interface RequestDetailProps {
  record: RequestRecord;
}

const TABS = ['General', 'Request Headers', 'Response Headers', 'Request Body', 'Response Body'] as const;

export default function RequestDetail({ record }: RequestDetailProps) {
  const [activeTab, setActiveTab] = useState<string>('General');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', background: '#fafafa' }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 12px',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #1976D2' : '2px solid transparent',
              background: activeTab === tab ? '#fff' : 'transparent',
              cursor: 'pointer',
              fontSize: '12px',
              color: activeTab === tab ? '#1976D2' : '#666',
              fontWeight: activeTab === tab ? 600 : 400,
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'General' && <GeneralTab record={record} />}
        {activeTab === 'Request Headers' && (
          <HeadersTab headers={record.requestHeaders} title="Request Headers" />
        )}
        {activeTab === 'Response Headers' && (
          <HeadersTab headers={record.responseHeaders} title="Response Headers" />
        )}
        {activeTab === 'Request Body' && (
          <BodyTab body={record.requestBody} label="Request Body" />
        )}
        {activeTab === 'Response Body' && (
          <BodyTab body={record.responseBody} label="Response Body" />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 18: Create src/components/StatusBar.tsx**

```tsx
interface StatusBarProps {
  total: number;
  filtered: number;
}

export default function StatusBar({ total, filtered }: StatusBarProps) {
  return (
    <div style={{
      padding: '4px 12px',
      borderTop: '1px solid #ddd',
      background: '#fafafa',
      fontSize: '11px',
      color: '#666',
      fontFamily: 'monospace',
    }}>
      {total === filtered
        ? `${total} requests`
        : `${filtered} / ${total} requests`
      }
    </div>
  );
}
```

- [ ] **Step 19: Create src/App.tsx**

```tsx
import { useState } from 'react';
import type { RequestRecord } from '@request-monitor/shared';
import { useRequests } from './hooks/useRequests';
import { useFilter } from './hooks/useFilter';
import Toolbar from './components/Toolbar';
import RequestTable from './components/RequestTable';
import RequestDetail from './components/RequestDetail';
import StatusBar from './components/StatusBar';

export default function App() {
  const { requests, clearRequests } = useRequests();
  const { filteredRequests, filters, setFilters } = useFilter(requests);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedRecord = selectedId
    ? requests.find((r) => r.id === selectedId)
    : null;

  const handleSelect = (record: RequestRecord) => {
    setSelectedId(record.id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <Toolbar
        filters={filters}
        onFilterChange={setFilters}
        onClear={clearRequests}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <RequestTable
          requests={filteredRequests}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
        {selectedRecord && (
          <div style={{ width: '400px', borderLeft: '1px solid #ddd', overflow: 'auto' }}>
            <RequestDetail record={selectedRecord} />
          </div>
        )}
      </div>
      <StatusBar total={requests.length} filtered={filteredRequests.length} />
    </div>
  );
}
```

- [ ] **Step 20: Create src/App.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}
```

---

### Task 8: Build and Assemble

**Files:**
- Verify: `dist/` structure

- [ ] **Step 1: Build all packages**

```bash
cd chrome-request-monitor
pnpm build
```

Expected: Each package builds without errors:
- `dist/content/isolated.js` and `dist/content/main.js` exist
- `dist/background/background.js` exists
- `dist/popup/index.html` exists
- `dist/devtool/devtools.html` and `dist/devtool/panel.html` exist

- [ ] **Step 2: Assemble extension**

```bash
pnpm assemble
```

Expected: `dist/manifest.json` exists (copied from root).

- [ ] **Step 3: Verify final dist structure**

```bash
ls -la dist/
# Should show:
#   manifest.json
#   popup/
#   devtool/
#   content/
#   background/
```

Expected: All files present. Extension can be loaded in Chrome via chrome://extensions → "Load unpacked" → select `dist/`.

---

### Task 9: Spec Self-Review

Double-check all tasks cover every requirement from the spec before execution.

**Checklist:**
- [ ] Monorepo structure matches spec diagram
- [ ] Shared types match spec: `RequestRecord`, `FilterConfig`, `AppConfig`, `Message`
- [ ] Content script patches both fetch and XHR (per spec)
- [ ] Content script handles MAIN world via script injection (MV3 requirement)
- [ ] Toggle control via `chrome.storage.onChanged` (per spec)
- [ ] Popup shows on/off toggle + status + count (per spec)
- [ ] DevTools panel shows request list + detail on click (per spec)
- [ ] Filters: URL search, method, status, type dropdowns (per spec)
- [ ] Virtual scrolling with @tanstack/react-virtual (per spec)
- [ ] DevTools entry: `chrome.devtools.panels.create` (per spec)
- [ ] Service Worker relays messages and buffers in `chrome.storage.session` (per spec)
- [ ] Large body truncated at 1MB (per spec)
- [ ] Binary response bodies skipped but headers captured (per spec)
- [ ] DevTools panel opens late → pulls buffered requests on connect (per spec)
