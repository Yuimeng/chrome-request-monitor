/**
 * 模块：devtool / components / JsonEditor —— 只读 JSON 查看器（CodeMirror 6）
 *
 * 组成：
 *   - sortObjectKeys  递归按字母序排序对象 key，让解密前后字段对比更稳定
 *   - formatJson       解析 + 排序 + 两空格缩进；非 JSON 内容原样返回
 *   - readOnlyTheme    通过 CSS 变量 --json-bg 跟随外层配色；行号槽用同一不透明底色，
 *                      横向滚动时内容从下方穿过也不会与行号文字重叠
 *   - EditorView       basicSetup + readOnly + editable(false) + json() 语法高亮
 *   - Ctrl/Cmd+F       面板内拦截浏览器查找，改为打开 CodeMirror 搜索面板
 *
 * 协作：由 BodyTab 全权渲染请求体/响应体；content 变化时 dispatch 替换文档，
 *   不重建 EditorView（保留滚动位置），卸载时 destroy 避免 DOM 叠加泄漏。
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { openSearchPanel } from "@codemirror/search";

function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (typeof obj === "object") {
    return Object.keys(obj as Record<string, unknown>)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
          return acc;
        },
        {} as Record<string, unknown>,
      );
  }
  return obj;
}

function formatJson(content: string): string {
  try {
    return JSON.stringify(sortObjectKeys(JSON.parse(content)), null, 2);
  } catch {
    // 非 JSON（纯文本、XML、表单串等）：原样展示，交给 CodeMirror 只读呈现
    return content;
  }
}

const readOnlyTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--json-bg, #fbfcfe)",
    fontSize: "11.5px",
    color: "#1f2937",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily:
      '"code-font", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    lineHeight: "1.65",
    // 不换行：超长单行靠横向滚动条查看
    overflow: "auto",
  },
  ".cm-content": {
    padding: "10px 0",
    whiteSpace: "pre",
    wordBreak: "normal",
    overflowWrap: "normal",
  },
  ".cm-gutters": {
    // 必须是不透明底色：横向滚动时代码行会从行号下方经过，透明底会露字
    backgroundColor: "var(--json-bg, #fbfcfe)",
    border: "none",
    color: "#b6c0cf",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 6px" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  // 搜索命中：默认样式（半透明淡黄）在浅色底上几乎看不出来，这里改成实色 + 描边
  ".cm-searchMatch": {
    backgroundColor: "#ffe066",
    outline: "1px solid #f0a500",
    borderRadius: "2px",
  },
  // 当前命中的那一个：更深底色 + 更粗描边，与其余命中一眼可分
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "#ff6b1a",
    color: "#fff",
    outline: "2px solid #c2410c",
    borderRadius: "2px",
  },
  ".cm-selectionBackground, ::selection": { backgroundColor: "#dbeafe" },
});

interface JsonEditorProps {
  content: string;
  /** 代码区与行号槽的背景色（解密态为淡黄），默认浅灰 */
  background?: string;
}

export const JsonEditor = ({ content, background = "#fbfcfe" }: JsonEditorProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // 只在挂载时创建 EditorView，避免每次内容变化都重建 DOM
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      doc: formatJson(content),
      extensions: [
        basicSetup,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        json(),
        readOnlyTheme,
      ],
      parent: host,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/Cmd+F：拦截浏览器查找，改为聚焦编辑器并打开 CodeMirror 搜索面板。
  // 用 window capture 阶段监听，保证焦点不在编辑器（如刚切到 Body 页）时也能命中。
  useEffect(() => {
    const handleFindKey = (e: KeyboardEvent) => {
      const isFind =
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "f";
      const view = viewRef.current;
      if (!isFind || !view) return;
      e.preventDefault();
      e.stopPropagation();
      view.focus();
      openSearchPanel(view);
    };
    window.addEventListener("keydown", handleFindKey, true);
    return () => window.removeEventListener("keydown", handleFindKey, true);
  }, []);

  // 内容变化时原地替换文档
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const next = formatJson(content);
    if (view.state.doc.toString() === next) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
    });
  }, [content]);

  return (
    <div
      ref={hostRef}
      style={
        {
          height: "100%",
          width: "100%",
          "--json-bg": background,
        } as CSSProperties
      }
    />
  );
};
