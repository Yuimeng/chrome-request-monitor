/**
 * 模块：devtool / devtools —— DevTools 面板注册入口
 *
 * 组成：仅调用 chrome.devtools.panels.create 注册 "Request Monitor" 面板。
 * 协作：manifest 引入本脚本 → 点击面板时加载 devtool/panel.html（panel.tsx 渲染 App）。
 */
chrome.devtools.panels.create(
  'Request Monitor',
  '',
  'devtool/panel.html',
  () => console.log('Request Monitor panel created'),
);
