/**
 * 模块：devtool / panel —— DevTools 面板 React 挂载点
 *
 * 组成：createRoot 挂载 <App />（StrictMode 包裹），引入 App.css 全局样式。
 * 协作：由 devtools.ts 注册的面板页加载；App 内通过 useRequests 与 background 建立 Port 长连接。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './App.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
