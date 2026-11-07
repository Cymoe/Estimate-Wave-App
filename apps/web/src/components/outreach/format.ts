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

/** The Midland County Clerk's deed records for an owner, where the deed of trust names who signed for the company. */
export const deedSearchUrl = (owner: string) =>
  `https://midland.tx.publicsearch.us/results?department=RP&limit=50&offset=0&searchOcrText=false&searchType=quickSearch&searchValue=${encodeURIComponent(owner)}`;

/** What a running lookup is doing, for its cell: "Asking the Texas Comptroller". */
export const askingText = (s?: string) =>
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
        trestle: 'Checking the lines',
        twilio: 'Checking the lines',
        'tracerfy-dnc': 'Do Not Call scrub',
        zerobounce: 'Checking the email',
        claude: 'Reading the web',
      }[s] ?? `Asking ${s}`)
    : 'Starting';

/** Each status in words. The last three are the earlier statuses some rows still have. */
export const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  no_answer: 'No answer',
  callback: 'Call back',
  interested: 'Interested',
  not_interested: 'Not interested',
  lead: 'In Leads',
  client: 'Client',
  sent: 'Sent',
  done: 'Done',
  skip: 'Skipped',
};
/** The outcomes of a call, in the order they're offered. */
export const OUTCOMES = ['no_answer', 'callback', 'interested', 'not_interested'] as const;
/** After no answer, they come back on Due today this many days later. */
export const NO_ANSWER_DAYS = 2;

/** A day as YYYY-MM-DD where you are (the UTC date is already tomorrow on US evenings), `plus` days on. */
export const localDay = (plus = 0, from = new Date()) => {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + plus);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Waiting on a call back or a retry whose day has come. */
export const isDue = (r: { status: string; followUpOn?: string }, today = localDay()) =>
  (r.status === 'no_answer' || r.status === 'callback') && !!r.followUpOn && r.followUpOn <= today;
/** "Today", "Tomorrow", "Overdue · Nov 5", "Tue, Nov 10". */
export const followUpText = (day: string, today = localDay()) => {
  if (day === today) return 'Today';
  if (day === localDay(1)) return 'Tomorrow';
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const short = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return day < today ? `Overdue · ${short}` : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};
/** "2026-11-06" → "Nov 6", as written. */
export const dayText = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
