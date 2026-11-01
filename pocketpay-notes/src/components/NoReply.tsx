// Three different things can be behind "I sent the payment and heard nothing back".
// The phone's side of each row is identical; only the server's side differs.
const rows = [
  { name: 'Lost on the way in', reach: false, server: 'never saw it', truth: 'nothing paid', paid: false, cut: 300 },
  { name: 'Server crashed', reach: true, server: 'crashed: rolled back', truth: 'nothing paid', paid: false, cut: 0 },
  { name: 'Lost on the way out', reach: true, server: 'paid ₹40, sent 201', truth: 'paid ₹40', paid: true, cut: 370 },
];

const PH = { x: 10, w: 150 };
const SV = { x: 470, w: 190 };

function Cross({ x, y }: { x: number; y: number }) {
  return (
    <g stroke="var(--cut)" strokeWidth={3.2} strokeLinecap="round">
      <line x1={x - 8} y1={y - 8} x2={x + 8} y2={y + 8} />
      <line x1={x - 8} y1={y + 8} x2={x + 8} y2={y - 8} />
    </g>
  );
}

export default function NoReply() {
  return (
    <figure className="not-prose my-6 rounded-lg border border-rule bg-panel p-4 text-ink sm:p-5">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 780 320" className="mx-auto block h-auto w-full min-w-[600px]" role="img"
          aria-label="Three cases: the request is lost on the way in, the server crashes, or the reply is lost on the way out. In all three, the phone sees the same thing: no reply. Only in the third was Riya actually charged.">
          <defs>
            <marker id="nr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>
          <text x={PH.x + PH.w / 2} y={22} textAnchor="middle" fontSize={14} fontWeight={800}>What the phone sees</text>
          <text x={SV.x + SV.w / 2} y={22} textAnchor="middle" fontSize={14} fontWeight={800}>What really happened</text>
          <text x={722} y={22} textAnchor="middle" fontSize={14} fontWeight={800}>Riya</text>
          {rows.map((r, k) => {
            const y = 70 + k * 92;
            const reqEnd = r.reach ? SV.x : r.cut - 14;
            return (
              <g key={r.name}>
                <text x={315} y={y - 30} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--muted)">{k + 1}. {r.name}</text>
                <rect x={PH.x} y={y - 24} width={PH.w} height={52} rx={10} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.6} />
                <text x={PH.x + PH.w / 2} y={y - 2} textAnchor="middle" fontSize={14} fontWeight={700}>◌ Paying…</text>
                <text x={PH.x + PH.w / 2} y={y + 16} textAnchor="middle" fontSize={12} fill="var(--muted)">then: no reply</text>

                <path d={`M${PH.x + PH.w},${y - 8} H${reqEnd}`} stroke="var(--sat)" strokeWidth={2.2} fill="none" markerEnd={r.reach ? 'url(#nr-arrow)' : undefined} />
                <text x={200} y={y - 14} fontSize={12} fill="var(--muted)">POST ₹40</text>
                {!r.reach && <Cross x={r.cut} y={y - 8} />}
                {r.cut > 0 && r.reach && (
                  <>
                    <path d={`M${SV.x},${y + 12} H${r.cut + 14}`} stroke="var(--sat)" strokeWidth={2.2} fill="none" strokeDasharray="6 4" />
                    <text x={410} y={y + 30} fontSize={12} fill="var(--muted)">201</text>
                    <Cross x={r.cut} y={y + 12} />
                  </>
                )}

                <rect x={SV.x} y={y - 24} width={SV.w} height={52} rx={10} fill={r.paid ? 'var(--sat)' : 'var(--paper)'}
                  stroke="var(--sat)" strokeWidth={1.6} strokeDasharray={r.reach ? undefined : '6 4'} />
                <text x={SV.x + SV.w / 2} y={y - 2} textAnchor="middle" fontSize={14} fontWeight={800} fill={r.paid ? 'var(--on-sat)' : 'var(--ink)'}>PocketPay</text>
                <text x={SV.x + SV.w / 2} y={y + 16} textAnchor="middle" fontSize={12} fill={r.paid ? 'var(--on-sat)' : 'var(--muted)'}>{r.server}</text>

                <text x={722} y={y + 6} textAnchor="middle" fontSize={14} fontWeight={800} fill={r.paid ? 'var(--cut)' : 'var(--ink)'}>{r.truth}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-2 text-sm text-muted">The left column is the same in all three rows. That’s the problem: from the phone, “not paid” and “paid, but the answer got lost” look identical.</figcaption>
    </figure>
  );
}
