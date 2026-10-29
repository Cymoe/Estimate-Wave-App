import type { Lang } from '../../convex/lib/i18n';

/**
 * Tolliver's built-in agreement, in both languages. `en` is the wording the
 * contract page has always carried. The Spanish text is a courtesy
 * translation: the English version governs, and the Spanish says so.
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
  stagesNote: '*Some of the following stages progress steps might not be applicable to your project.',
  stage1: '1. Stage 1 - Per Job Attached Scope design:',
  stage1Lines: [
    ['Demolition:', 'Demo and Prep all areas where work will be performed. Disposal of all debris from demolition.'],
    ['Sprinkler:', 'Trench all areas where Sprinkler work will be performed.'],
    ['Framing/Forms:', 'Framing and building of all forms on project designated areas.'],
    ['Electrical/Plumbing:', 'Run all Rough in electrical, Plumbing, and Sprinkler piping/valves for project designated areas.'],
  ],
  stagePurchased: (stage: number, contractor: string) => `All required material and tooling for ${stage === 2 ? 'Stage' : 'stage'} ${stage} will be purchased by ${contractor}.`,
  stage2: '2. Stage 2 - Per Job Attached Scope design:',
  stage2Lines: [
    ['Earthwork:', 'Leveling of all areas where work will be performed.'],
    ['Concrete:', 'Assure concrete forms are ready for pouring, and add rebar/steel mesh if applicable.'],
    ['Tree/Plants:', 'Install all Trees, Plants, Shrubs according to plan design.'],
    ['Stone/Rock:', 'Spray Weed/grass killer, weed barrier fabric, rock/stones installation according to plan design.'],
  ],
  stage3: '3. Stage 3 - Per Job Attached Scope design:',
  stage3Lines: [
    ['Concrete pouring:', 'Pour all concrete to all areas of project scope.'],
    ['Gazebo/Pergola:', 'Build/Install Gazebo, Pergola, Shed According to plan design.'],
    ['Masonry:', 'Build fire pits, flower beds, retaining walls, posts wraps per plan design if applicable.'],
    ['Fencing:', 'Installation of Fencing per plan design.'],
    ['Electrical/Plumbing:', 'Install all Electrical and Plumbing Top out.'],
    ['Sod:', 'Install all sod to project designated areas.'],
    ['Artificial Turf:', 'Installation of artificial turf on all designated areas.'],
    ['Final Punch:', 'Clean the site and verify all work aligns with the approved scope and design.'],
  ],
  startDate: 'Estimated Project Start date:',
  completionDate: 'Estimated completion date:',
  toBeAgreed: 'To be agreed',
  paymentTerms: 'Payment Terms',
  scopeTotal: 'Job estimate Scope Total',
  total: 'Total',
  financing: '"If customer chooses Good Leap financing, project funding will be due at project completion, if chooses self funded pay structure is listed below"',
  deposit: 'Initial deposit of 50% due at signing date',
  stage1Draw: 'Stage 1 Draw of 50% due at signing date',
  totalLabel: 'Total:',
  stage2Draw: 'Stage 2: 40% Second draw at Stage 2 completion.',
  stage3Draw: 'Stage 3: Final 10% payment at Stage 3 completion',
  quickbooks: 'Initial deposit Payment must be submitted by QuickBooks Secured payment link.',
  lateFee: 'Payments must be submitted on time of stage completion or late fee* of 10% will be added to each payment.',
  paymentDefault: 'Payment Default:',
  lien: "*Mechanic's Lien:",
  lienText: 'If payment is past due past more than 30 days after project completion a Lien will be filed against the property.',
  duration: '*Project Duration Clause',
  durationText: (contractor: string) =>
    `The estimated project duration is based on standard construction timelines; however, actual completion dates may vary due to factors beyond our control. These factors include, but are not limited to, adverse weather conditions, delays in material availability, unforeseen site conditions, changes requested by the client, and scheduling or performance issues with subcontractors or suppliers. ${contractor} will make reasonable efforts to mitigate delays and keep the client informed of any significant changes to the project timeline. Any such delays shall not constitute a breach of contract, nor shall they result in penalties or liability for additional costs unless otherwise agreed in writing.`,
  warranty: (contractor: string) => `*${contractor} offers 2 year workmanship warranty attached at the end of this contract and signed at project completion.`,
  turfWarranty: '*Vendor 16 year warranty for turf materials shared separately from this contract.',
  changeOrders: '*Change Order Policy',
  changeOrdersText:
    'Any changes to the original scope of work, once this Agreement has been signed, must be requested in writing through a Change Order Form. Each approved change order is subject to the following terms:',
  changeOrderFee: 'Change Order Fee:',
  changeOrderFeeText:
    'A service fee of 10% of the original contract value (or $500 minimum, whichever is greater) will be charged per change order request. This fee covers administrative time, scheduling adjustments, material procurement, and potential rework of existing plans.',
  additionalCosts: 'Additional Costs:',
  additionalCostsText:
    'Any materials, labor, or subcontractor costs directly associated with the requested change will be added to (or deducted from) the contract total and must be approved by the Client before work begins.',
  timelineImpact: 'Timeline Impact:',
  timelineImpactText: (contractor: string) =>
    `Changes may affect the original project timeline. ${contractor} will provide an updated estimated completion date with each approved change.`,
  intent: 'Intent:',
  intentText:
    'This policy is in place to encourage clarity and certainty in the design and planning phase, and to prevent costly and disruptive mid-project changes. We believe in doing things right the first time—for your benefit and ours.',
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
  stagesNote: '*Algunas de las siguientes etapas podrían no aplicar a tu proyecto.',
  stage1: '1. Etapa 1 - Según el diseño de alcance adjunto:',
  stage1Lines: [
    ['Demolición:', 'Demolición y preparación de todas las áreas donde se realizará el trabajo. Retiro de todos los escombros.'],
    ['Riego:', 'Zanjas en todas las áreas donde se instalará el riego.'],
    ['Estructura/Formas:', 'Armado de estructuras y de todas las formas en las áreas designadas del proyecto.'],
    ['Electricidad/Plomería:', 'Instalación de toda la tubería y válvulas preliminares de electricidad, plomería y riego en las áreas designadas.'],
  ],
  stagePurchased: (stage, contractor) => `Todo el material y las herramientas necesarias para la etapa ${stage} serán comprados por ${contractor}.`,
  stage2: '2. Etapa 2 - Según el diseño de alcance adjunto:',
  stage2Lines: [
    ['Movimiento de tierra:', 'Nivelación de todas las áreas donde se realizará el trabajo.'],
    ['Concreto:', 'Verificar que las formas de concreto estén listas para el vaciado y agregar varilla o malla de acero si aplica.'],
    ['Árboles/Plantas:', 'Instalación de todos los árboles, plantas y arbustos según el diseño.'],
    ['Piedra/Roca:', 'Aplicación de herbicida, tela antimaleza e instalación de piedra o roca según el diseño.'],
  ],
  stage3: '3. Etapa 3 - Según el diseño de alcance adjunto:',
  stage3Lines: [
    ['Vaciado de concreto:', 'Vaciado de todo el concreto en las áreas del alcance del proyecto.'],
    ['Gazebo/Pérgola:', 'Construcción o instalación de gazebo, pérgola o cobertizo según el diseño.'],
    ['Albañilería:', 'Construcción de fogatas, jardineras, muros de contención y forros de postes según el diseño, si aplica.'],
    ['Cercas:', 'Instalación de cercas según el diseño.'],
    ['Electricidad/Plomería:', 'Instalación final de toda la electricidad y la plomería.'],
    ['Césped:', 'Instalación de todo el césped en las áreas designadas.'],
    ['Pasto artificial:', 'Instalación de pasto artificial en todas las áreas designadas.'],
    ['Revisión final:', 'Limpieza del sitio y verificación de que todo el trabajo corresponde al alcance y diseño aprobados.'],
  ],
  startDate: 'Fecha estimada de inicio:',
  completionDate: 'Fecha estimada de terminación:',
  toBeAgreed: 'Por acordar',
  paymentTerms: 'Condiciones de pago',
  scopeTotal: 'Total del alcance del presupuesto',
  total: 'Total',
  financing:
    '"Si el cliente elige financiamiento con Good Leap, el pago del proyecto vence al terminarlo; si paga por su cuenta, el esquema de pagos es el siguiente"',
  deposit: 'Depósito inicial del 50 % al firmar',
  stage1Draw: 'Pago de la etapa 1, 50 %, al firmar',
  totalLabel: 'Total:',
  stage2Draw: 'Etapa 2: segundo pago del 40 % al terminar la etapa 2.',
  stage3Draw: 'Etapa 3: pago final del 10 % al terminar la etapa 3',
  quickbooks: 'El depósito inicial debe pagarse por el enlace de pago seguro de QuickBooks.',
  lateFee: 'Los pagos deben hacerse al terminar cada etapa; de lo contrario se agregará un cargo por mora* del 10 % a cada pago.',
  paymentDefault: 'Falta de pago:',
  lien: '*Gravamen de constructor (Mechanic\'s Lien):',
  lienText: 'Si un pago lleva más de 30 días de atraso después de terminado el proyecto, se presentará un gravamen sobre la propiedad.',
  duration: '*Cláusula de duración del proyecto',
  durationText: (contractor) =>
    `La duración estimada del proyecto se basa en plazos normales de construcción; sin embargo, las fechas reales de terminación pueden variar por causas fuera de nuestro control. Entre ellas, sin limitarse a estas: mal clima, retrasos en la disponibilidad de materiales, condiciones imprevistas del sitio, cambios pedidos por el cliente y problemas de calendario o desempeño de subcontratistas o proveedores. ${contractor} hará esfuerzos razonables por reducir los retrasos y mantener al cliente informado de cualquier cambio importante en el calendario. Tales retrasos no constituyen incumplimiento del contrato ni generan penalizaciones ni responsabilidad por costos adicionales, salvo acuerdo por escrito.`,
  warranty: (contractor) => `*${contractor} ofrece una garantía de mano de obra de 2 años, anexa al final de este contrato y firmada al terminar el proyecto.`,
  turfWarranty: '*La garantía de 16 años del proveedor del pasto artificial se entrega por separado de este contrato.',
  changeOrders: '*Política de órdenes de cambio',
  changeOrdersText:
    'Cualquier cambio al alcance original del trabajo, una vez firmado este Contrato, debe solicitarse por escrito mediante un formulario de orden de cambio. Cada orden de cambio aprobada queda sujeta a lo siguiente:',
  changeOrderFee: 'Cargo por orden de cambio:',
  changeOrderFeeText:
    'Se cobrará un cargo por servicio del 10 % del valor original del contrato (o $500 como mínimo, lo que sea mayor) por cada orden de cambio. Este cargo cubre el tiempo administrativo, los ajustes de calendario, la compra de materiales y el posible rehacer de los planes existentes.',
  additionalCosts: 'Costos adicionales:',
  additionalCostsText:
    'Cualquier costo de materiales, mano de obra o subcontratistas directamente relacionado con el cambio solicitado se sumará al (o restará del) total del contrato y debe ser aprobado por el Cliente antes de empezar el trabajo.',
  timelineImpact: 'Efecto en el calendario:',
  timelineImpactText: (contractor) =>
    `Los cambios pueden afectar el calendario original del proyecto. ${contractor} entregará una nueva fecha estimada de terminación con cada cambio aprobado.`,
  intent: 'Propósito:',
  intentText:
    'Esta política busca claridad y certeza en la etapa de diseño y planeación, y evitar cambios costosos y disruptivos a medio proyecto. Creemos en hacer las cosas bien desde la primera vez, por tu beneficio y el nuestro.',
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
    'Antes de firmar un contrato para construir mejoras en tu propiedad, asegúrate de haber investigado a tu contratista. Pide y verifica referencias de otras personas que hayan contratado al contratista para un proyecto del mismo tipo y tamaño en su propiedad.',
  texasWriting: 'PONLO POR ESCRITO.',
  texasWritingText:
    'Asegúrate de tener un contrato escrito con tu contratista que incluya: (1) una descripción del trabajo que realizará; (2) el tiempo requerido o estimado para terminarlo; (3) el costo del trabajo o cómo se determinará; y (4) el procedimiento y la forma de pago, incluidas las disposiciones sobre la reserva de fondos que exige la ley y las condiciones del pago final.',
};

export const AGREEMENT: Record<Lang, typeof en> = { en, es };
