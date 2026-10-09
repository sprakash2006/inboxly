// The one avatar used across the app. Null-safe on purpose: callers pass
// nullable fields straight through (contact.name, user.name), and a crash
// here used to take the whole view down.
const COLORS = ['#0d9488', '#7c3aed', '#2563eb', '#d97706', '#db2777'];

// The shell's identity mark: a soft pastel gradient with dark ink initials.
// Each pair stays within neighbouring hues so none of them reads as muddy.
const GRADS = [
  'linear-gradient(135deg,#99f6e4,#a5f3fc)',
  'linear-gradient(135deg,#ddd6fe,#c7d2fe)',
  'linear-gradient(135deg,#bae6fd,#99f6e4)',
  'linear-gradient(135deg,#fde68a,#fed7aa)',
  'linear-gradient(135deg,#fbcfe8,#ddd6fe)',
];

export const initials = (name) =>
  String(name ?? '').trim().split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

// variant: 'tint' (default, coloured outline on a faint fill) or 'gradient'.
export const Avatar = ({ name, size = 32, showRing = false, variant = 'tint' }) => {
  const init = initials(name);
  const seed = [...init].reduce((a, ch) => a + ch.charCodeAt(0), 0);

  if (variant === 'gradient') {
    return (
      <div aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: GRADS[seed % GRADS.length],
        boxShadow: showRing ? '0 0 0 2px rgba(13,148,136,0.28), inset 0 1px 0 rgba(255,255,255,0.6)' : 'inset 0 1px 0 rgba(255,255,255,0.6), 0 0 0 1px rgba(15,23,42,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * .38 + 'px', fontWeight: 800, color: 'var(--ink)',
        letterSpacing: '-.02em', flexShrink: 0 }}>
        {init}
      </div>
    );
  }

  const c = COLORS[seed % COLORS.length];
  return (
    <div aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: `${c}18`, border: `1.5px solid ${showRing ? c : c + '44'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * .34 + 'px', fontWeight: 700, color: c, flexShrink: 0 }}>
      {init}
    </div>
  );
};
