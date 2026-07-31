// Brand marks for the outbound project links, inlined as SVG.
//
// Inline rather than <img src="https://…"> on purpose: the app serves a strict CSP and these
// render inside server components, so a remote asset would be blocked and a local PNG would be
// another round trip for a 16px glyph. Both are drawn at 24x24 and scale from the parent's size.

export function TrelloMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect width="24" height="24" rx="3.5" fill="#0079BF" />
      <rect x="4.4" y="4.4" width="6.2" height="12.6" rx="1.1" fill="#fff" />
      <rect x="13.4" y="4.4" width="6.2" height="8" rx="1.1" fill="#fff" />
    </svg>
  );
}

export function QuickBooksMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="12" fill="#2CA01C" />
      {/* the "qb" monogram: two stems with facing bowls */}
      <path
        d="M10.15 6.4a4.15 4.15 0 0 0 0 8.3h.72V13H10.2a2.6 2.6 0 1 1 0-5.2h.67V17.6h1.62V6.4h-2.34Z"
        fill="#fff"
      />
      <path
        d="M13.85 17.6a4.15 4.15 0 0 0 0-8.3h-.72V11h.67a2.6 2.6 0 1 1 0 5.2h-.67V6.4h-1.62v11.2h2.34Z"
        fill="#fff"
      />
    </svg>
  );
}

