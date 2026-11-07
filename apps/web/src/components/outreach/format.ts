/** The mailing line as a letter would carry it: "1 MAIN ST, DALLAS, TX, 75201". */
export const mailingLine = (m: { address?: string; city?: string; state?: string; zip?: string }) =>
  [m.address, [m.city, m.state].filter(Boolean).join(', '), m.zip?.slice(0, 5)].filter(Boolean).join(', ');

/** "4325550100" → "(432) 555-0100". */
export const phoneText = (n: string) => (n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : n);

/** "batchdata" → "BatchData", "tx-comptroller" → "Texas Comptroller". */
export const sourceName = (s: string) =>
  ({
    roll: 'the appraisal roll',
    permits: 'city permits',
    batchdata: 'BatchData',
    tracerfy: 'Tracerfy',
    enformion: 'EnformionGO',
    hunter: 'Hunter',
    leadmagic: 'LeadMagic',
    'tx-comptroller': 'Texas Comptroller',
    cobalt: 'State registry (Cobalt)',
    zerobounce: 'ZeroBounce',
    twilio: 'the carrier (Twilio)',
    trestle: 'the contact check (Trestle)',
    'tracerfy-dnc': 'the Do Not Call scrub (Tracerfy)',
    claude: 'the web',
    shared: 'a related owner (no charge)',
  })[s] ?? s;

/** A number worth calling: not on the Do Not Call list and not a known litigator. */
export const callOk = (p: { dnc?: boolean; litigator?: boolean }) => !p.dnc && !p.litigator;

/** "the appraisal roll and city permits", for a person two or more sources agree on. */
export const sourceList = (sources: string[]) => {
  const names = sources.map(sourceName);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/** The Midland County Clerk's deed records for an owner, where the deed of trust names who signed for the company. */
export const deedSearchUrl = (owner: string) =>
  `https://midland.tx.publicsearch.us/results?department=RP&limit=50&offset=0&searchOcrText=false&searchType=quickSearch&searchValue=${encodeURIComponent(owner)}`;
