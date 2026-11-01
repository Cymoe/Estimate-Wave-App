import type { Lang } from '../../convex/lib/i18n';
import { formatDay } from './lang';

/**
 * The client portal, in the homeowner's language. `es` must have every key
 * `en` has. Refusals from the server (selection_*, link_invalid) are in
 * share.ts, where refusalText reads them.
 */
const en = {
  loading: 'Loading…',
  invalid: "This link isn't valid any more. Ask the company for a new one.",
  hello: (first?: string) => (first ? `Hi ${first}` : 'Hello'),
  intro: (company: string) => `Everything for your work with ${company}, in one place.`,
  /** On the estimate and sign-off pages, back to the portal. */
  backLink: (company: string) => `Everything for your work with ${company}`,
  theCompany: 'your contractor',
  needsYou: 'What we need from you',
  nothing: 'Nothing needed from you right now.',
  signEstimate: 'Review and sign your estimate',
  signChanges: 'Sign the changes to the work',
  signComplete: 'Sign that the job is complete',
  changeBy: (amount: string, up: boolean) => (up ? `Adds ${amount}` : `Takes off ${amount}`),
  open: 'Open',
  yourJobs: 'Your jobs',
  agreed: (total: string) => `Agreed total ${total}`,
  documents: {
    estimate: (number: string) => `Estimate & agreement ${number}`,
    change_order: (n: number) => `Change order ${n}`,
    affidavit: 'Job complete sign-off',
  },
  signedOn: (day: string) => `Signed ${day}`,
  view: 'View',
  chosen: 'Your selections',
  call: 'Call',
  email: 'Email',
  /** A pick the company asked for (tile, a faucet). */
  picks: {
    pickYour: (what: string) => `Pick: ${what}`,
    included: (amount: string) => `${amount} included`,
    each: (quantity: number, price: string) => `${quantity} × ${price}`,
    pickBy: (date: string) => `Pick by ${date}`,
    pickYours: 'Pick yours',
    change: 'Change',
    cancel: 'Cancel',
    link: 'Link to the product',
    linkHint: 'Paste the page from Home Depot, Lowe’s or any store.',
    name: 'What is it? (optional)',
    namePlaceholder: 'e.g. Delta Trinsic faucet, matte black',
    price: (perUnit: boolean): string => (perUnit ? 'Price per unit (optional)' : 'Price (optional)'),
    note: 'Note (optional)',
    send: 'Send my pick',
    sending: 'Sending...',
    sent: 'Sent. We’ll confirm the price.',
    waiting: 'Sent: waiting for the company to confirm',
    over: (amount: string) => `${amount} over what's included`,
    under: (amount: string) => `${amount} under what's included`,
    even: "Right at what's included",
    openLink: 'Open the link',
    failed: "Your pick couldn't be sent. Please try again.",
  },
};

const es: typeof en = {
  loading: 'Cargando…',
  invalid: 'Este enlace ya no es válido. Pide uno nuevo a la empresa.',
  hello: (first) => (first ? `Hola ${first}` : 'Hola'),
  intro: (company) => `Todo tu trabajo con ${company}, en un solo lugar.`,
  backLink: (company) => `Todo tu trabajo con ${company}`,
  theCompany: 'tu contratista',
  needsYou: 'Lo que necesitamos de ti',
  nothing: 'Por ahora no necesitamos nada de ti.',
  signEstimate: 'Revisa y firma tu presupuesto',
  signChanges: 'Firma los cambios al trabajo',
  signComplete: 'Firma que la obra está terminada',
  changeBy: (amount, up) => (up ? `Suma ${amount}` : `Resta ${amount}`),
  open: 'Abrir',
  yourJobs: 'Tus trabajos',
  agreed: (total) => `Total acordado ${total}`,
  documents: {
    estimate: (number) => `Presupuesto y contrato ${number}`,
    change_order: (n) => `Orden de cambio ${n}`,
    affidavit: 'Confirmación de obra terminada',
  },
  signedOn: (day) => `Firmado el ${day}`,
  view: 'Ver',
  chosen: 'Tus selecciones',
  call: 'Llamar',
  email: 'Correo',
  picks: {
    pickYour: (what) => `Elige: ${what}`,
    included: (amount) => `${amount} incluido`,
    each: (quantity, price) => `${quantity} × ${price}`,
    pickBy: (date) => `Elegir antes del ${date}`,
    pickYours: 'Elegir',
    change: 'Cambiar',
    cancel: 'Cancelar',
    link: 'Enlace al producto',
    linkHint: 'Pega la página de Home Depot, Lowe’s o cualquier tienda.',
    name: '¿Qué es? (opcional)',
    namePlaceholder: 'p. ej. llave Delta Trinsic, negro mate',
    price: (perUnit) => (perUnit ? 'Precio por unidad (opcional)' : 'Precio (opcional)'),
    note: 'Nota (opcional)',
    send: 'Enviar mi selección',
    sending: 'Enviando...',
    sent: 'Enviado. Confirmaremos el precio.',
    waiting: 'Enviado: esperando que la empresa lo confirme',
    over: (amount) => `${amount} más de lo incluido`,
    under: (amount) => `${amount} menos de lo incluido`,
    even: 'Justo lo incluido',
    openLink: 'Abrir el enlace',
    failed: 'No se pudo enviar tu selección. Inténtalo de nuevo.',
  },
};

export const PORTAL: Record<Lang, typeof en> = { en, es };

const firstName = (name?: string) => name?.trim().split(/\s+/)[0] || undefined;

/** What the client is told with their portal link, in their language. */
export function portalMessage(clientName: string | undefined, lang: Lang) {
  const first = firstName(clientName);
  return lang === 'es'
    ? `${first ? `Hola ${first}, aquí` : 'Aquí'} está tu página con todo lo de tu trabajo:`
    : `${first ? `Hi ${first}, here` : 'Here'}'s your page with everything for your job:`;
}

/** Asking the client to pick one thing ("tile" from "Tile allowance"), by a date if there is one. */
export function pickMessage(clientName: string | undefined, what: string, pickBy: string | undefined, lang: Lang) {
  const first = firstName(clientName);
  const thing =
    what
      .replace(/\s*allowance\s*$/i, '')
      .trim()
      .toLowerCase() || what;
  const by = pickBy ? formatDay(pickBy, lang, { month: 'short', day: 'numeric' }) : undefined;
  return lang === 'es'
    ? `${first ? `Hola ${first}, ` : ''}elige tu ${thing}${by ? ` antes del ${by}` : ''} aquí:`
    : `${first ? `Hi ${first}, please` : 'Please'} pick your ${thing}${by ? ` by ${by}` : ''} here:`;
}
