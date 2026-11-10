/** The mailing line as a letter would carry it: "1 MAIN ST, DALLAS, TX, 75201". */
export const mailingLine = (m: { address?: string; city?: string; state?: string; zip?: string }) =>
  [m.address, [m.city, m.state].filter(Boolean).join(', '), m.zip?.slice(0, 5)].filter(Boolean).join(', ');

/** "4325550100" → "(432) 555-0100". */
export const phoneText = (n: string) => (n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : n);

const PHONE_TYPE: Record<string, string> = { mobile: 'mobile', landline: 'landline', voip: 'VoIP', unknown: '' };
/** "mobile · personal", "landline · work": the type, then whose line it is when known. */
export const phoneKind = (p: { type: string; line?: string }) => [PHONE_TYPE[p.type] ?? p.type, p.line].filter(Boolean).join(' · ');

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
    'leadmagic-mobile': 'the LeadMagic mobile finder',
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

/** The sources refresh about monthly, so a "none found" is worth another try after this long. */
export const TRY_AGAIN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** When a "none found" cell is due another try. */
export const tryAgainFrom = (c: { status: string; at?: string }) => (c.status === 'none' && c.at ? new Date(Date.parse(c.at) + TRY_AGAIN_DAYS * DAY_MS) : undefined);
/** A "none found" old enough to try again (one with no date is). */
export const dueAgain = (c: { status: string; at?: string }, now = Date.now()) => c.status === 'none' && (!c.at || now >= Date.parse(c.at) + TRY_AGAIN_DAYS * DAY_MS);
/** A cell a lookup would run: never asked, failed, or a "none found" due another try. */
export const openToLook = (c: { status: string; at?: string }) => c.status === 'locked' || c.status === 'failed' || dueAgain(c);
/** Nobody to call: no phone found, or every number found is Do Not Call or a litigator. The mailing address is always there. */
export const mailOnly = (r: { phones: Array<{ dnc?: boolean; litigator?: boolean }>; enrichment: { phone: { status: string } } }) =>
  r.enrichment.phone.status === 'none' || (r.enrichment.phone.status === 'found' && r.phones.length > 0 && !r.phones.some(callOk));

/** "the appraisal roll and city permits", for a person two or more sources agree on. */
export const sourceList = (sources: string[]) => {
  const names = sources.map(sourceName);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/** The county clerk's deed records for an owner, where the deed of trust names who signed for the company: Midland's for now, none elsewhere yet. */
export const deedSearchUrl = (owner: string, county = 'Midland') =>
  county === 'Midland'
    ? `https://midland.tx.publicsearch.us/results?department=RP&limit=50&offset=0&searchOcrText=false&searchType=quickSearch&searchValue=${encodeURIComponent(owner)}`
    : undefined;

/** What a running lookup is doing, for its cell: "Asking the Texas Comptroller". */
/** How long a lookup can sit before its first source without looking stuck: after that it says it's waiting its turn. */
export const QUEUED_AFTER_MS = 20_000;
export const askingText = (s?: string, since?: string) =>
  s
    ? ({
        roll: 'Reading the appraisal roll',
        permits: 'Reading city permits',
        'tx-comptroller': 'Asking the Texas Comptroller',
        cobalt: 'Asking the state registry',
        batchdata: 'Asking BatchData',
        tracerfy: 'Asking Tracerfy',
        enformion: 'Asking EnformionGO',
        hunter: 'Asking Hunter',
        leadmagic: 'Asking LeadMagic',
        'leadmagic-mobile': 'Asking LeadMagic for the mobile',
        trestle: 'Checking the lines',
        twilio: 'Checking the lines',
        'tracerfy-dnc': 'Do Not Call scrub',
        zerobounce: 'Checking the email',
        claude: 'Reading the web',
      }[s] ?? `Asking ${s}`)
    : since && Date.now() - Date.parse(since) > QUEUED_AFTER_MS
      ? 'Waiting its turn'
      : 'Starting';

/** Each status in words. Only New, In Leads and Skipped are set now; the rest are earlier statuses some rows still have. */
export const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  lead: 'In Leads',
  skip: 'Skipped',
  no_answer: 'No answer',
  callback: 'Call back',
  interested: 'Interested',
  not_interested: 'Not interested',
  client: 'Client',
  sent: 'Sent',
  done: 'Done',
};

/** A lead's stage as Leads names it, for an owner already sent: "Contacted", "Estimate Sent", "Job sold". */
export const LEAD_STAGE: Record<string, string> = {
  new: 'New lead',
  no_answer: 'No answer',
  contacted: 'Contacted',
  scheduled: 'Estimate scheduled',
  quoted: 'Estimate sent',
  won: 'Job sold',
  lost: 'Lost',
};

/** True when any of an owner's answers came from the stand-in, not a real source. */
export const isSimulated = (r: { enrichment: Record<string, { simulated?: boolean } | undefined> }) => Object.values(r.enrichment).some((c) => c?.simulated);
