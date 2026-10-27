/**
 * 模块：popup / components / ToggleSwitch —— 滑动开关
 *
 * 组成：受控开关（enabled + onChange），纯展示无内部状态；
 *   以 <button role="switch"> 实现，自带键盘可达性与 aria-checked 语义。
 * 协作：App 用它写入 ENABLED / AUTO_DECRYPT；变更会经 storage 链路实时生效。
 */
interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  /** 无障碍名称（按钮本身不显示文字，由外部标签承担） */
  label?: string;
  /** sm：用于行内次级开关（如 Auto decrypt） */
  size?: 'sm' | 'md';
}

export default function ToggleSwitch({ enabled, onChange, label, size = 'md' }: ToggleSwitchProps) {
  const className = [
    'switch',
    size === 'sm' ? 'switch-sm' : '',
    enabled ? 'is-on' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      className={className}
      onClick={() => onChange(!enabled)}
    >
      <span className="switch-knob" />
    </button>
  );
}
