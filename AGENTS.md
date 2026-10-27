# AGENTS.md

## 项目概述

Chrome 扩展（Manifest V3），用于监控网页的 fetch 和 XHR 请求。

## 技术栈

- pnpm monorepo + Vite + TypeScript
- React（devtool、popup）
- Chrome Extension API

## 包结构

- `packages/shared` - 核心类型、常量、hooks（被其他包依赖）
- `packages/background` - Service Worker，消息处理和存储
- `packages/content` - Content Scripts（两个独立构建：isolated-world 和 main-world）
- `packages/devtool` - DevTools 面板（React）
- `packages/popup` - 弹出窗口（React）

## 关键命令

```bash
# 完整构建扩展
pnpm build:ext

# 单独构建各包
pnpm build:content
pnpm build:background
pnpm build:popup
pnpm build:devtool

# 组装扩展到 dist/
pnpm assemble
```

## 构建注意事项

1. **content 包有两个 vite 配置**：
   - `vite.config.isolated.ts` → `dist/content/isolated.js`
   - `vite.config.main.ts` → `dist/content/main.js`

2. **输出格式为 IIFE**（非 ES modules），因为 Chrome 扩展 content scripts 不支持 ES modules

3. **所有包输出到 `dist/` 目录**，组装脚本会复制 manifest.json 和 icons

## 开发流程

1. 修改 `packages/shared` 后，其他包会自动使用最新代码（workspace 协议）
2. 没有测试、lint、typecheck 命令
3. 构建后加载 `dist/` 目录到 Chrome 进行测试

## 核心架构

- **消息流**：content script → background service worker → devtools panel
- **存储**：使用 `chrome.storage.session` 保存请求记录（条数上限由 `max_requests` 配置，默认 500 条，超出按时间淘汰最早记录）
- **容量限制**：`max_body_size`（单条请求体/响应体上限，默认 1MB，超出截断）与 `max_requests`（保留条数）在 popup 的 Limits 面板配置，默认值与合法区间定义在 `packages/shared/src/limits.ts`
- **注入机制**：isolated-world 注入 main-world 脚本，通过 CustomEvent 通信

## 常见陷阱

1. 不要在 content script 中直接修改 `window.fetch`，必须在 main-world 中操作
2. 使用 `chrome.runtime.sendMessage` 时注意 Service Worker 可能已休眠
3. IIFE 格式的入口文件不能使用 `import`/`export`
