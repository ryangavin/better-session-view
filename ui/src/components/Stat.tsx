export function Stat({
  k,
  v,
  highlight,
  warn,
  onClick,
}: {
  k: string;
  v: string | number | undefined;
  highlight?: boolean;
  /** Amber, for a count that is fine at zero and worth a look above it. */
  warn?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`stat${onClick ? ' clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className="k">{k}</div>
      <div className={`v${highlight || warn ? ' hl' : ''}`}>{v ?? '—'}</div>
    </div>
  );
}
