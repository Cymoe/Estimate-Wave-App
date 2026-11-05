/** The mailing line as a letter would carry it: "1 MAIN ST, DALLAS, TX, 75201". */
export const mailingLine = (m: { address?: string; city?: string; state?: string; zip?: string }) =>
  [m.address, [m.city, m.state].filter(Boolean).join(', '), m.zip?.slice(0, 5)].filter(Boolean).join(', ');
