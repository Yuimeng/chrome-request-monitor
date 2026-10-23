/**
 * 模块：devtool / components / JsonEditor —— 只读 JSON 查看器（CodeMirror 6）
 *
 * 组成：
 *   - sortObjectKeys  递归按字母序排序对象 key，让解密前后字段对比更稳定
 *   - formatJson       解析 + 排序 + 两空格缩进；非 JSON 内容原样返回
 *   - readOnlyTheme    透明背景 / code-font 主题，跟随外层容器配色（解密态黄色可透出）
 *   - EditorView       basicSetup + readOnly + editable(false) + json() 语法高亮
 *
 * 协作：由 BodyTab 全权渲染请求体/响应体；content 变化时 dispatch 替换文档，
 *   不重建 EditorView（保留滚动位置），卸载时 destroy 避免 DOM 叠加泄漏。
 */
import { useEffect, useRef } from "react";
import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { json } from "@codemirror/lang-json";

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
    backgroundColor: "transparent",
    fontSize: "11px",
    color: "#333",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily:
      '"code-font", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    lineHeight: "1.5",
    // 不换行：超长单行靠横向滚动条查看
    overflow: "auto",
  },
  ".cm-content": {
    padding: "8px 0",
    whiteSpace: "pre",
    wordBreak: "normal",
    overflowWrap: "normal",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "#bbb",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 4px" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
});

export const JsonEditor = ({ content }: { content: string }) => {
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

  return <div ref={hostRef} style={{ height: "100%", width: "100%" }} />;
};
