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
  removed: 'Removed',
  /** In the company's preview: what goes out with the next send. */
  newBadge: 'New',
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
  // The card app (PortalView): tiles, the all-clear, each job's progress.
  toDo: 'To do',
  documentsTile: 'Documents',
  allCaughtUp: "You're all caught up",
  allCaughtUpBody: "We'll let you know when there's something for you.",
  reviewSign: 'Review & sign',
  status: { planning: 'Planned', in_progress: 'In progress', on_hold: 'On hold', completed: 'Complete', cancelled: 'Cancelled' } as Record<
    string,
    string
  >,
  stepsDone: (done: number, all: number) => `${done} of ${all} steps done`,
  showAllSteps: (n: number) => `Show all ${n} steps`,
  showFewer: 'Show fewer',
  agreementSigned: 'Agreement signed',
  now: 'Now',
  documentsHeading: 'Documents',
  contact: 'Questions? Reach us anytime.',
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
    previewForm: 'Your client picks here: a link to the product, its name and price.',
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
  removed: 'Quitado',
  newBadge: 'Nuevo',
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
  toDo: 'Pendientes',
  documentsTile: 'Documentos',
  allCaughtUp: 'Estás al día',
  allCaughtUpBody: 'Te avisaremos cuando haya algo para ti.',
  reviewSign: 'Revisar y firmar',
  status: { planning: 'Planeado', in_progress: 'En curso', on_hold: 'En pausa', completed: 'Terminado', cancelled: 'Cancelado' },
  stepsDone: (done, all) => `${done} de ${all} pasos hechos`,
  showAllSteps: (n) => `Ver los ${n} pasos`,
  showFewer: 'Ver menos',
  agreementSigned: 'Contrato firmado',
  now: 'Ahora',
  documentsHeading: 'Documentos',
  contact: '¿Preguntas? Escríbenos o llámanos cuando quieras.',
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
    previewForm: 'Tu cliente elige aquí: un enlace al producto, su nombre y precio.',
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

/** "tile" from "Tile allowance". */
const thingOf = (description: string) =>
  description
    .replace(/\s*allowance\s*$/i, '')
    .trim()
    .toLowerCase() || description;

/**
 * The text that goes with the link when the company sends what was waiting:
 * the picks to make (by the soonest pick-by date) and changes to sign.
 */
export function sendMessage(
  clientName: string | undefined,
  picks: Array<{ description: string; pickBy?: string }>,
  changeOrders: number,
  lang: Lang,
) {
  if (picks.length === 0 && changeOrders === 0) return portalMessage(clientName, lang);
  const first = firstName(clientName);
  const things = picks.map((p) => thingOf(p.description));
  const soonest = picks
    .map((p) => p.pickBy)
    .filter((d): d is string => Boolean(d))
    .sort()[0];
  const by = soonest ? formatDay(soonest, lang, { month: 'short', day: 'numeric' }) : undefined;
  const join = (list: string[], and: string) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} ${and} ${list[list.length - 1]}`);
  if (lang === 'es') {
    const parts = [
      ...(things.length ? [`elige ${join(things, 'y')}${by ? ` antes del ${by}` : ''}`] : []),
      ...(changeOrders ? ['firma los cambios al trabajo'] : []),
    ];
    return `${first ? `Hola ${first}, ` : ''}por favor ${parts.join(' y ')} aquí:`;
  }
  const parts = [
    ...(things.length ? [`pick your ${join(things, 'and')}${by ? ` by ${by}` : ''}`] : []),
    ...(changeOrders ? ['sign the changes to the work'] : []),
  ];
  return `${first ? `Hi ${first}, please` : 'Please'} ${parts.join(' and ')} here:`;
}
