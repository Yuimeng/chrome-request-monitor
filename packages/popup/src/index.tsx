/**
 * 模块：popup / index —— 弹窗 React 挂载点
 *
 * 组成：createRoot 挂载 <App />（StrictMode 包裹），引入 App.css。
 * 协作：manifest 将其注册为浏览器动作弹窗；点击扩展图标即渲染 App。
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
