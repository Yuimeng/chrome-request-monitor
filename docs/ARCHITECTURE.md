# Chrome Request Monitor 架构说明

> 本文档描述扩展的整体结构：每个包/模块如何组成、如何协作、每个功能的作用，
> 并附树状架构图。对应源码中已补充的模块级注释。

---

## 一、架构树状图

```
chrome-request-monitor/
├── manifest.json                     # MV3 清单：注册 background / content / devtools / popup
│
└── packages/
    ├── shared/                       ┌─────────────────────────────────────────┐
    │   └── src/                      │  共享层：类型契约 + 常量 + 配置归一化      │
    │       ├── index.ts              │  统一出口，其他包只从包名导入            │
    │       ├── types.ts              │  RequestRecord / FilterConfig / Message │
    │       │                         │  CaptureFilter / LimitConfig / Decrypt  │
    │       ├── constants.ts          │  STORAGE_KEYS / MESSAGE_TYPES / EVENTS  │
    │       │                         │  PORT_NAME_DEVTOOLS                     │
    │       └── limits.ts             │  DEFAULT_LIMITS / LIMIT_BOUNDS          │
    │                                 │  normalizeLimit(s)（上限默认值与边界）    │
    └── content/                      └─────────────────────────────────────────┘
        └── src/
            ├── main-world.ts         # 【页面主世界】请求 hook 层
            │   ├── patchFetch()      #   替换 window.fetch，记录请求/响应/耗时
            │   ├── patchXHR()        #   替换 XMLHttpRequest（open/header/send/loadend）
            │   ├── matchesFilter()   #   按 CaptureFilter 决定是否抓取
            │   ├── limitBody()       #   按 maxBodySize 截断请求体/响应体并标注
            │   ├── generateId()      #   生成 UUID v4
            │   ├── restore()         #   关闭监控时还原原始实现
            │   └── 监听 MONITOR_CONFIG 事件 → patch / restore + 更新上限
            │
            ├── isolated-world.ts     # 【隔离世界】桥梁层
            │   ├── injectMainScript()      # <script> 注入 main-world 到页面
            │   ├── loadConfig()            # 读 storage.sync 配置（含 MAX_BODY_SIZE）
            │   ├── dispatchConfig()        # CustomEvent 下发配置给 main-world
            │   ├── pendingBuffer/flushBuffer  # 上报缓冲：攒批 + SW 休眠重试
            │   └── handleStorageChange()   # 配置变更实时转发
            │
    ├── background/
    │   └── src/                      # 【Service Worker】消息中枢 + 数据缓冲
    │       ├── index.ts              #   消息路由、入列队列、解密代理、面板推送
    │       │   ├── requestBuffer         #   内存缓冲（≤maxRequests，默认 500，session 持久化）
    │       │   ├── enforceCapacity()     #   超出上限按 sentAt 淘汰最早记录，返回被淘汰 id
    │       │   ├── ingestRecords()       #   串行入列：先补 Cookie 快照再 push/broadcast/persist
    │       │   ├── mergeRecords()        #   批量并入缓冲 + 广播 + 淘汰 + 持久化
    │       │   ├── broadcastToDevTools() #   向所有 DevTools 面板实时推送
    │       │   ├── broadcastEvicted()    #   广播 REQUESTS_EVICTED，面板同步移除
    │       │   ├── persist/restoreBuffer #   chrome.storage.session 写入/恢复（配额不足折半）
    │       │   ├── loadMaxRequests()     #   读 storage.sync 的 MAX_REQUESTS（onChanged 即时收缩）
    │       │   ├── handleDecrypt()       #   代理 POST 到外部解密服务（带超时）
    │       │   ├── onMessage             #   消息路由：抓取/批量/查询/解密/导入/清空
    │       │   └── onConnect             #   DevTools Port 接入，连接时回放全量
    │       └── cookie-snapshot.ts    #   【方案 A】Cookie 快照补全
    │           ├── getCookieHeaderSnapshot()           # 按 URL 读 chrome.cookies（30s 缓存 + 超时）
    │           └── enrichRecordsWithCookieSnapshot()   # 写 requestCookie / cookieSource='snapshot'
    │
    ├── devtool/                      ┌─────────────────────────────────────────┐
    │   └── src/                      │  DevTools 面板（React）                  │
    │       ├── devtools.ts           │  注册 "Request Monitor" 面板             │
    │       ├── panel.tsx             │  React 挂载点                           │
    │       ├── App.tsx               │  根组件：布局编排 + 拖拽导入 + 分栏拖宽   │
    │       ├── hooks/                │  ─────────────────────────────────────  │
    │       │   ├── useRequests.ts    │  Port 长连接数据源（断线重连 + 淘汰同步）  │
    │       │   ├── useFilter.ts      │  展示层过滤（url/method/status/type）    │
    │       │   └── useStorage.ts     │  storage.sync 响应式读写                │
    │       ├── components/           │  ─────────────────────────────────────  │
    │       │   ├── Toolbar.tsx       │  过滤条件 + Clear + 导入 HAR             │
    │       │   ├── RequestTable.tsx  │  虚拟滚动请求列表（react-virtual）       │
    │       │   ├── RequestDetail.tsx │  五标签详情容器（分栏可拖宽）            │
    │       │   ├── GeneralTab.tsx    │  概览键值表                             │
    │       │   ├── HeadersTab.tsx    │  请求/响应头表格（复用）                 │
    │       │   ├── BodyTab.tsx       │  Body 查看 + 解密 + 复制                │
    │       │   ├── JsonEditor.tsx    │  CodeMirror 只读 JSON（key 排序）        │
    │       │   └── StatusBar.tsx     │  底部计数状态栏                         │
    │       └── utils/                │  ─────────────────────────────────────  │
    │           ├── har.ts            │  HAR 1.2 → RequestRecord 解析           │
    │           ├── formatters.ts     │  耗时/时间/URL/配色格式化               │
    │           └── constants.ts      │  下拉框选项与文案                       │
    │
    └── popup/                        ┌─────────────────────────────────────────┐
        └── src/                      │  浏览器弹窗（React）                     │
            ├── index.tsx             │  React 挂载点                           │
            ├── App.tsx               │  根组件：开关/计数/清空/解密配置         │
            ├── hooks/useStorage.ts   │  storage.sync 响应式读写                │
            └── components/           │  ─────────────────────────────────────  │
                ├── ToggleSwitch.tsx  │  监控总开关                             │
                ├── StatusBadge.tsx   │  运行状态 + 捕获计数 / 条数上限           │
                ├── FilterConfig.tsx  │  抓取过滤表单（URL/类型/方法）           │
                └── LimitsConfig.tsx  │  容量限制表单（body 上限/条数上限）      │
```

---

## 二、数据流（如何协作）

```
┌─────────────── 页面主世界 ───────────────┐
│ 页面 JS 调用 fetch / XHR                  │
│        ↓ (被 patch)                       │
│ main-world.ts 捕获 → 构造 RequestRecord   │
│        ↓ CustomEvent(REQUEST_CAPTURED)    │
├──────────── 隔离世界 content ─────────────┤
│ isolated-world.ts 接收 → pendingBuffer    │
│        ↓ runtime.sendMessage(批量)        │
├──────────── Service Worker ──────────────┤
│ background: ingestRecords（串行入列）       │
│   ├─ enrichRecords：chrome.cookies 补 Cookie│
│   ├─ requestBuffer (≤maxRequests)         │
│   ├─ enforceCapacity：按时间淘汰最早记录    │
│   ├─ persist → chrome.storage.session     │
│   ├─ broadcast → DevTools Port            │
│   └─ broadcastEvicted → REQUESTS_EVICTED  │
├──────────── UI 层 ───────────────────────┤
│ devtool: useRequests(Port) → 表格/详情    │
│ popup:   GET_REQUEST_COUNT 轮询计数       │
└──────────────────────────────────────────┘

配置流（反向，实时生效）：
popup 写 storage.sync → isolated-world onChanged
  → CustomEvent(MONITOR_CONFIG) → main-world patch/restore + 更新 maxBodySize
popup 写 MAX_REQUESTS → background onChanged → 立即淘汰超出部分
```

### 通信方式一览

| 通道 | 用途 | 参与方 |
|------|------|--------|
| `CustomEvent`（页面事件） | 跨世界传递配置与捕获结果 | main-world ↔ isolated-world |
| `chrome.runtime.sendMessage` | 一次性指令/请求（计数、清空、解密、批量上报） | content / popup / devtool → background |
| `chrome.runtime.Port`（长连接） | 实时增量推送 + 全量回放 | background ↔ devtool |
| `chrome.storage.sync` | 持久配置（开关、过滤、容量上限、解密地址） | popup 写 → content/devtool/background 读 |
| `chrome.storage.session` | 会话级请求缓冲（SW 重启可恢复） | background 读写 |

---

## 三、各包职责速览

| 包 | 运行环境 | 核心职责 |
|----|----------|----------|
| `shared` | 被所有包编译引用 | 定义消息协议、存储键、数据类型，消除跨包硬编码 |
| `content/main-world` | 页面主世界（无 chrome API） | hook fetch/XHR，产出 RequestRecord |
| `content/isolated-world` | 内容脚本隔离世界 | 注入 main 脚本、读写配置、缓冲并转发捕获结果 |
| `background` | Service Worker（可被休眠） | 消息路由、数据缓冲与持久化、解密代理、面板推送 |
| `devtool` | DevTools 面板 | 列表展示、过滤、详情查看、HAR 导入、解密展示 |
| `popup` | 浏览器弹窗 | 监控开关、抓取过滤与容量上限配置、计数与清空、解密配置 |

### 关键设计要点

1. **双世界注入**：内容脚本默认隔离世界无法改 `window.fetch`，因此 isolated-world 通过
   `<script src=...>` 把 main-world 注入页面，二者只用 `CustomEvent` 通信。
2. **SW 休眠容错**：Service Worker 随时可能被杀 —— content 侧攒批 + 重试上报；
   background 启动时从 `storage.session` 恢复缓冲；devtool Port 断开后 500ms 自动重连回放。
3. **两级过滤**：`CaptureFilter`（popup 配置，决定"抓不抓"）与 `FilterConfig`（面板配置，
   决定"显不显示"）相互独立。
4. **解密代理**：面板跨域受限，解密请求统一由 background `fetch` 转发到外部服务
   （地址由 popup 配置 `DECRYPT_URL`，15s 超时）。
5. **虚拟滚动**：请求列表用 `@tanstack/react-virtual` 只渲染可视区，支撑大列表流畅滚动。
6. **Cookie 补充（方案 A）**：页面 JS 读不到浏览器注入的 Cookie（forbidden request header），
   background 在记录入列前用 `chrome.cookies.getAll({ url })` 生成近似快照（30s 缓存 + 1s 超时），
   content 侧同时记录 `cookiesSent`（credentials 语义）用于跳过明显不带 Cookie 的请求；
   devtool 优先展示记录快照并标注来源（`cookieSource`），HAR 导入仍以抓包头为准，
   且展示与解密共用同一个 `requestCookie` 值（devtool 不再读取 cookie store）。
   设计细节见 `docs/cookie-capture.md`（Phase 2 的 webRequest 权威读取尚未实现）。
7. **容量双闸门**：两个上限分别在"产生端"和"汇聚端"生效，避免任一环节撑爆内存或配额。
   - `maxBodySize`（默认 1,000,000 字符）在 main-world 生效：请求体与响应体各自计算，
     超限保留前缀并追加 `…[truncated N chars]`，比整段丢弃更利于排错；
   - `maxRequests`（默认 500）在 background 生效：每次入列/导入/恢复后按
     `sentAt ?? startTime` 淘汰最早的记录，`storage.session` 只写入上限内的最近记录，
     配额不足时折半重试；
   - 淘汰后通过 `REQUESTS_EVICTED` 广播 id，devtool 同步移除，避免面板与后台计数漂移；
   - 两个上限都由 popup 的 `Limits` 面板配置（`LIMIT_BOUNDS` 限定合法区间），
     写入 `storage.sync` 后即时生效，无需重载扩展。
