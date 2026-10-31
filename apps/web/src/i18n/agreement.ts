import type { Lang } from '../../convex/lib/i18n';

/**
 * Webb Leads' built-in agreement, in both languages. It reads from the
 * estimate (the work, the price, the dates) and from the company's wording
 * (payment terms, warranty, extra clauses), so it fits any trade. The
 * Spanish text is a courtesy translation: the English version governs, and
 * the Spanish says so.
 */
const en = {
  governs: null as string | null,
  parties: 'PARTIES',
  partiesLead: 'This services contract agreement (Hereinafter referred to as the "Agreement") is entered into',
  partiesMiddle: '(The effective date), by and between',
  yourBusiness: 'Your business',
  constructor: '(Hereinafter referred to as the "Constructor") and',
  theClient: 'the client',
  client: '(Hereinafter referred to as the "Client") (Collectively referred to as the "Parties").',
  agreedDesign: 'AGREED DESIGN',
  designAttached: 'The agreed design is attached:',
  property: 'CONSTRUCTION PROPERTY',
  propertyText: 'The property the work is to be performed is located at the following address:',
  propertyPlaceholder: 'Property Address',
  scope: 'SCOPE OF WORK',
  scopeText: 'The Constructor agrees to perform the following work, as itemised in the estimate:',
  scopeEmpty: 'No work has been added to the estimate yet.',
  materials: (contractor: string) => `${contractor} supplies the materials, tools and labour for this work unless the estimate says otherwise.`,
  startDate: 'Estimated Project Start date:',
  completionDate: 'Estimated completion date:',
  toBeAgreed: 'To be agreed',
  price: 'CONTRACT PRICE',
  priceText: 'The Client agrees to pay the following for the work above:',
  total: 'Total',
  paymentTerms: 'PAYMENT TERMS',
  paymentTermsPlaceholder: 'e.g. 50% deposit upon signing, 50% upon completion',
  latePayments: 'Late payments:',
  latePaymentsText:
    'If a payment is more than 30 days late, the Constructor may charge interest as the law allows and may file a lien against the property for the unpaid amount.',
  duration: 'Project duration:',
  durationText: (contractor: string) =>
    `The estimated project duration is based on standard construction timelines; however, actual completion dates may vary due to factors beyond our control. These factors include, but are not limited to, adverse weather conditions, delays in material availability, unforeseen site conditions, changes requested by the client, and scheduling or performance issues with subcontractors or suppliers. ${contractor} will make reasonable efforts to mitigate delays and keep the client informed of any significant changes to the project timeline. Any such delays shall not constitute a breach of contract, nor shall they result in penalties or liability for additional costs unless otherwise agreed in writing.`,
  warranty: 'WARRANTY',
  warrantyText: (contractor: string, period: string) =>
    `${contractor} warrants its workmanship for ${period} from completion and will repair defects in its work reported within that time at no charge. Manufacturers' warranties on materials pass to the Client where the manufacturer allows. Normal wear, misuse and work done by others are not covered.`,
  warrantyPlaceholder: 'e.g. 1 year',
  changeOrders: 'CHANGE ORDERS',
  changeOrdersText:
    'Any change to the work after this Agreement is signed is written up as a change order that shows the work added or removed and its price. It takes effect once the Client approves it, and it may move the completion date.',
  extraTerms: 'ADDITIONAL TERMS',
  cancellation: 'Notice of Cancellation',
  cancellation1:
    'You may cancel this transaction, without any penalty or obligation, within three business days from the above date. If you cancel, any property traded in, any payments made by you under the contract of sale, and any negotiable instrument executed by you will be returned within ten (10) days following receipt by the seller of your cancellation notice, and any security interest arising out of the transaction will be cancelled.',
  cancellation2:
    "If you cancel, you must make available to the seller at your residence, in substantially as good condition as when received, any goods delivered to you under this contract or sale, or you may, if you wish, comply with the instructions of the seller regarding the return shipment of the goods at the seller's expense and risk.",
  cancellation3: (contact: string) => `To cancel this transaction, customer should contact ${contact}`,
  theContractor: 'the contractor',
  texasCode: 'TEXAS PROPERTY CODE',
  texasKnow: '"KNOW YOUR RIGHTS AND RESPONSIBILITIES UNDER THE LAW.',
  texasIntro:
    'You are about to enter into a transaction to build a new home or remodel existing residential property. Texas law requires your contractor to provide you with this brief overview of some of your rights, responsibilities, and risks in this transaction."',
  texasConveyance: 'CONVEYANCE TO CONTRACTOR NOT REQUIRED.',
  texasConveyanceText:
    'Your contractor may not require you to convey your real property to your contractor as a condition to the agreement for the construction of improvements on your property.',
  texasKnowContractor: 'KNOW YOUR CONTRACTOR.',
  texasKnowContractorText:
    'Before you enter into your agreement for the construction of improvements to your real property, make sure that you have investigated your contractor. Obtain and verify references from other people who have used the contractor for the type and size of construction project on your property.',
  texasWriting: 'GET IT IN WRITING.',
  texasWritingText:
    'Make sure that you have a written agreement with your contractor that includes: (1) a description of the work the contractor is to perform; (2) the required or estimated time for completion of the work; (3) the cost of the work or how the cost will be determined; and (4) the procedure and method of payment, including provisions for statutory reservation of funds and conditions for final payment.',
};

const es: typeof en = {
  governs:
    'Esta traducción al español se ofrece por conveniencia. La versión en inglés es el contrato que rige; si hay diferencias, vale la versión en inglés.',
  parties: 'PARTES',
  partiesLead: 'Este contrato de servicios (en adelante, el "Contrato") se celebra el',
  partiesMiddle: '(la fecha de vigencia), entre',
  yourBusiness: 'Tu empresa',
  constructor: '(en adelante, el "Constructor") y',
  theClient: 'el cliente',
  client: '(en adelante, el "Cliente") (en conjunto, las "Partes").',
  agreedDesign: 'DISEÑO ACORDADO',
  designAttached: 'El diseño acordado se adjunta:',
  property: 'PROPIEDAD DE LA OBRA',
  propertyText: 'La propiedad donde se realizará el trabajo está en la siguiente dirección:',
  propertyPlaceholder: 'Dirección de la propiedad',
  scope: 'ALCANCE DEL TRABAJO',
  scopeText: 'El Constructor se compromete a realizar el siguiente trabajo, según se detalla en el presupuesto:',
  scopeEmpty: 'Todavía no se ha agregado trabajo al presupuesto.',
  materials: (contractor) =>
    `${contractor} aporta los materiales, las herramientas y la mano de obra para este trabajo, salvo que el presupuesto diga otra cosa.`,
  startDate: 'Fecha estimada de inicio:',
  completionDate: 'Fecha estimada de terminación:',
  toBeAgreed: 'Por acordar',
  price: 'PRECIO DEL CONTRATO',
  priceText: 'El Cliente se compromete a pagar lo siguiente por el trabajo descrito arriba:',
  total: 'Total',
  paymentTerms: 'CONDICIONES DE PAGO',
  paymentTermsPlaceholder: 'p. ej. 50 % de depósito al firmar, 50 % al terminar',
  latePayments: 'Pagos atrasados:',
  latePaymentsText:
    'Si un pago lleva más de 30 días de atraso, el Constructor podrá cobrar intereses según lo permita la ley y presentar un gravamen sobre la propiedad por el monto pendiente.',
  duration: 'Duración del proyecto:',
  durationText: (contractor) =>
    `La duración estimada del proyecto se basa en plazos normales de construcción; sin embargo, las fechas reales de terminación pueden variar por causas fuera de nuestro control. Entre ellas, sin limitarse a estas: mal clima, retrasos en la disponibilidad de materiales, condiciones imprevistas del sitio, cambios pedidos por el cliente y problemas de calendario o desempeño de subcontratistas o proveedores. ${contractor} hará esfuerzos razonables por reducir los retrasos y mantener al cliente informado de cualquier cambio importante en el calendario. Tales retrasos no constituyen incumplimiento del contrato ni generan penalizaciones ni responsabilidad por costos adicionales, salvo acuerdo por escrito.`,
  warranty: 'GARANTÍA',
  warrantyText: (contractor, period) =>
    `${contractor} garantiza su mano de obra por ${period} a partir de la terminación y reparará sin costo los defectos de su trabajo que se reporten en ese plazo. Las garantías de los fabricantes de los materiales pasan al Cliente cuando el fabricante lo permite. No se cubren el desgaste normal, el mal uso ni el trabajo hecho por terceros.`,
  warrantyPlaceholder: 'p. ej. 1 año',
  changeOrders: 'ÓRDENES DE CAMBIO',
  changeOrdersText:
    'Cualquier cambio al trabajo después de firmado este Contrato se documenta en una orden de cambio que muestra el trabajo agregado o retirado y su precio. Entra en vigor cuando el Cliente la aprueba y puede mover la fecha de terminación.',
  extraTerms: 'CONDICIONES ADICIONALES',
  cancellation: 'Aviso de cancelación',
  cancellation1:
    'Puedes cancelar esta transacción, sin penalización ni obligación, dentro de los tres días hábiles siguientes a la fecha indicada arriba. Si cancelas, cualquier bien entregado a cambio, cualquier pago hecho bajo el contrato de venta y cualquier instrumento negociable firmado por ti te serán devueltos dentro de los diez (10) días siguientes a que el vendedor reciba tu aviso de cancelación, y cualquier garantía derivada de la transacción quedará cancelada.',
  cancellation2:
    'Si cancelas, debes poner a disposición del vendedor, en tu domicilio y en condiciones sustancialmente iguales a como los recibiste, los bienes que te hayan entregado bajo este contrato o venta; o, si lo prefieres, puedes seguir las instrucciones del vendedor para devolverlos por su cuenta y riesgo.',
  cancellation3: (contact) => `Para cancelar esta transacción, el cliente debe comunicarse con ${contact}`,
  theContractor: 'el contratista',
  texasCode: 'CÓDIGO DE PROPIEDAD DE TEXAS',
  texasKnow: '"CONOCE TUS DERECHOS Y RESPONSABILIDADES SEGÚN LA LEY.',
  texasIntro:
    'Estás por celebrar una transacción para construir una casa nueva o remodelar una propiedad residencial existente. La ley de Texas exige que tu contratista te entregue este breve resumen de algunos de tus derechos, responsabilidades y riesgos en esta transacción."',
  texasConveyance: 'NO SE EXIGE TRANSFERIR LA PROPIEDAD AL CONTRATISTA.',
  texasConveyanceText:
    'Tu contratista no puede exigirte que le transfieras tu propiedad como condición para el contrato de construcción de mejoras en ella.',
  texasKnowContractor: 'CONOCE A TU CONTRATISTA.',
  texasKnowContractorText:
    'Antes de firmar un contrato para construir mejoras en tu propiedad, asegúrate de haber investigado al contratista. Pide y verifica referencias de otras personas que hayan contratado al contratista para un proyecto del mismo tipo y tamaño en su propiedad.',
  texasWriting: 'PONLO POR ESCRITO.',
  texasWritingText:
    'Asegúrate de tener un contrato escrito con tu contratista que incluya: (1) una descripción del trabajo que realizará; (2) el tiempo requerido o estimado para terminarlo; (3) el costo del trabajo o cómo se determinará; y (4) el procedimiento y la forma de pago, incluidas las disposiciones sobre la reserva de fondos que exige la ley y las condiciones del pago final.',
};

export const AGREEMENT: Record<Lang, typeof en> = { en, es };
