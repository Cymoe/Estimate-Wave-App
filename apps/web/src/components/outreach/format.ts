/** The mailing line as a letter would carry it: "1 MAIN ST, DALLAS, TX, 75201". */
export const mailingLine = (m: { address?: string; city?: string; state?: string; zip?: string }) =>
  [m.address, [m.city, m.state].filter(Boolean).join(', '), m.zip?.slice(0, 5)].filter(Boolean).join(', ');

/** "4325550100" → "(432) 555-0100". */
export const phoneText = (n: string) => (n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : n);

/** "batchdata" → "BatchData", "tx-comptroller" → "Texas Comptroller". */
export const sourceName = (s: string) => ({ batchdata: 'BatchData', tracerfy: 'Tracerfy', 'tx-comptroller': 'Texas Comptroller', zerobounce: 'ZeroBounce', claude: 'the web' })[s] ?? s;
