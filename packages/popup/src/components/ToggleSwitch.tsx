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
