/* Single source of truth for the Inboxly brand mark, so the pulse dot and
   wordmark are identical everywhere they appear (sidebar, resource centre
   footer). Mirrors the treatment used in the dashboard sidebar header. */
export function Logo({
  size = 32,           // px, the hit area around the pulse dot
  text = true,         // render the "Inboxly" wordmark alongside
  textSize,            // px, defaults to a size-relative value
  onClick,
  style = {},
  ariaLabel = 'Inboxly',
}) {
  const mark = Math.round(size * 0.86);
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={onClick ? ariaLabel : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      <span
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {/* The chat-bubble mark used on the landing and sign-in pages. */}
        <span
          style={{
            width: mark,
            height: mark,
            borderRadius: Math.round(mark * 0.3),
            background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
            boxShadow: '0 2px 8px rgba(13,148,136,0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width={Math.round(mark * 0.52)} height={Math.round(mark * 0.52)} viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 1C4.13 1 1 4.13 1 8c0 1.29.35 2.5.96 3.54L1 15l3.46-.96A7 7 0 1 0 8 1z" fill="#ffffff" />
          </svg>
        </span>
      </span>
      {text && (
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: textSize || Math.round(size * 0.5),
            color: 'var(--t1)',
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          Inboxly
        </span>
      )}
    </div>
  );
}

export default Logo;
