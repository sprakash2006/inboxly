/* Single source of truth for the Inboxly brand mark (public/logo.png) and
   wordmark, so they are identical everywhere they appear (sidebar, resource
   centre, legal and setup pages). */
export function Logo({
  size = 32,           // px, the hit area around the mark
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
        <img src="/logo.png" alt="" width={mark} height={mark} style={{ display: 'block' }} />
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
