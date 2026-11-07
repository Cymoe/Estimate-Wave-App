import { APP_NAME, SUPPORT_EMAIL } from '../config/brand';

/**
 * The Terms and Privacy Policy in Spanish, as a courtesy translation. The
 * English pages in Legal.tsx are the ones that govern, and these say so.
 */

export const GOVERNS_ES =
  'Esta traducción al español se ofrece por conveniencia. La versión en inglés es la que rige; si hay diferencias, vale la versión en inglés.';

export const TermsEs = () => (
  <>
    <p>
      Estos términos son un acuerdo entre tú y {APP_NAME} (&ldquo;nosotros&rdquo;). Al crear una cuenta, solicitar una o usar {APP_NAME}, los aceptas.
      Si usas {APP_NAME} para una empresa, los aceptas en nombre de esa empresa.
    </p>

    <h2>Qué es {APP_NAME}</h2>
    <p>
      {APP_NAME} da a los contratistas de servicios para el hogar herramientas para hacer presupuestos, enviar contratos a firma, dar seguimiento a
      proyectos, costos y pagos, y comprar solicitudes de propietarios en nuestro mercado. No somos parte de ningún contrato entre un contratista y su
      cliente, y no realizamos ni garantizamos ningún trabajo.
    </p>

    <h2>Tu cuenta</h2>
    <ul>
      <li>Debes tener al menos 18 años y dar información correcta sobre ti y tu empresa.</li>
      <li>Eres responsable de todo lo que se haga con tu cuenta y de mantener privado tu acceso.</li>
      <li>Los dueños y administradores de una cuenta de empresa pueden agregar, quitar y asignar roles a sus miembros.</li>
    </ul>

    <h2>Solicitudes y tu saldo</h2>
    <ul>
      <li>
        Las solicitudes (leads) son pedidos de propietarios que recopilamos y verificamos lo mejor posible. Las vendemos como se describe en cada una,
        normalmente a una sola empresa.
      </li>
      <li>
        El dinero que agregas a tu saldo es un prepago por solicitudes y nunca vence. Los precios se muestran antes de comprar, ofertar o fijar una
        oferta permanente.
      </li>
      <li>
        Una solicitud con un número equivocado, o que no sea un pedido real de trabajo, puede reportarse dentro de los 3 días de recibirla; si estamos
        de acuerdo, su precio se acredita a tu saldo. Fuera de eso, las compras de solicitudes son definitivas. Que una solicitud no se convierta en
        trabajo no es motivo de reembolso.
      </li>
      <li>Los saldos no son efectivo y no pueden retirarse, salvo donde la ley lo exija.</li>
      <li>
        Te comprometes a contactar a los propietarios conforme a la ley: respetar las solicitudes de no llamar, seguir las reglas de telemarketing y
        mensajes de texto, y usar los datos solo para el trabajo solicitado.
      </li>
    </ul>

    <h2>Presupuestos, contratos y pagos</h2>
    <ul>
      <li>
        Eres responsable del contenido de tus presupuestos y contratos, incluidos precios, condiciones, licencias y cualquier aviso que exija tu
        oficio o tu estado.
      </li>
      <li>
        Las firmas electrónicas recogidas a través de {APP_NAME} buscan ser vinculantes entre tú y tu cliente según la ley aplicable de firma
        electrónica. Guardamos un registro de qué se firmó y cuándo.
      </li>
      <li>
        Los pagos que registras en {APP_NAME} son tus propios registros. Los pagos con tarjeta para tu saldo los procesa Stripe bajo sus condiciones.
      </li>
    </ul>

    <h2>Asistentes conectados</h2>
    <p>
      Puedes conectar un asistente de IA como Claude o ChatGPT a tu cuenta. Actúa con los permisos que le das, como si fueras tú, y eres responsable
      de lo que hace. Puedes desconectarlo cuando quieras en Configuración.
    </p>

    <h2>Uso aceptable</h2>
    <p>
      No uses {APP_NAME} para violar la ley, enviar spam, acosar a nadie, extraer o revender nuestros datos o solicitudes, probar nuestros sistemas ni
      interferir con otros usuarios. Podemos suspender o cerrar las cuentas que lo hagan.
    </p>

    <h2>Tarifas y cambios</h2>
    <p>
      Los precios y las funciones pueden cambiar. Avisaremos de los cambios importantes a funciones de pago antes de que entren en vigor. Seguir
      usando {APP_NAME} después de un cambio significa que lo aceptas.
    </p>

    <h2>Fin del acuerdo</h2>
    <p>
      Puedes dejar de usar {APP_NAME} cuando quieras. Podemos suspender o terminar tu acceso por incumplir estos términos o si dejamos de ofrecer el
      servicio, e intentaremos avisar con antelación razonable. Los registros firmados de los que dependen tus clientes pueden conservarse según lo
      exija la ley.
    </p>

    <h2>Exenciones y límites</h2>
    <p>
      {APP_NAME} se ofrece &ldquo;tal cual&rdquo;. No prometemos que esté libre de errores o siempre disponible, ni que una solicitud se convierta en
      trabajo. En la medida que la ley lo permite, no respondemos por pérdidas indirectas o consecuentes, y nuestra responsabilidad total contigo por
      cualquier reclamo se limita a lo que nos pagaste en los 12 meses anteriores al reclamo.
    </p>

    <h2>Ley aplicable</h2>
    <p>Estos términos se rigen por las leyes del Estado de Texas. Las disputas se resolverán en los tribunales del Condado de Midland, Texas.</p>

    <h2>Contacto</h2>
    <p>
      Preguntas sobre estos términos: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>
  </>
);

export const PrivacyEs = () => (
  <>
    <p>
      Esta política explica qué recopila {APP_NAME}, por qué, y las opciones que tienes. Cubre a los contratistas que usan {APP_NAME}, a los
      propietarios cuyas solicitudes se convierten en leads, y a cualquiera que abra un enlace de presupuesto, contrato o pago enviado a través de{' '}
      {APP_NAME}.
    </p>

    <h2>Qué recopilamos</h2>
    <ul>
      <li>
        <strong>Cuentas de contratistas:</strong> nombre, correo, teléfono, datos de la empresa y lo que haces en {APP_NAME} (presupuestos, proyectos,
        costos, lista de precios, solicitudes). Si inicias sesión con Google, recibimos de Google tu nombre, correo y foto de perfil.
      </li>
      <li>
        <strong>Solicitudes de propietarios:</strong> nombre, teléfono, correo, dirección y una descripción del trabajo, recogidos en nuestros
        formularios, anuncios y socios, además de si confirmaste la solicitud y cuándo.
      </li>
      <li>
        <strong>Enlaces de presupuesto y contrato:</strong> cuándo se abrió la página, el nombre escrito y la firma dibujada al firmar, y los
        documentos aceptados.
      </li>
      <li>
        <strong>Pagos:</strong> los pagos con tarjeta los maneja Stripe; recibimos el monto y una confirmación, nunca el número completo de tu
        tarjeta.
      </li>
      <li>
        <strong>Técnicos:</strong> información del dispositivo, navegador y uso, necesaria para operar y proteger el servicio.
      </li>
    </ul>

    <h2>Cómo la usamos</h2>
    <ul>
      <li>
        Para operar {APP_NAME}: mostrar tus presupuestos y trabajos, entregar solicitudes, procesar pagos y enviar los correos y mensajes que pediste.
      </li>
      <li>Para enviar la solicitud de un propietario al contratista que la compra, para que pueda contactarte sobre el trabajo.</li>
      <li>Para enviar recordatorios de presupuestos sin firmar, en nombre del contratista, y permitirte responderle directamente.</li>
      <li>Para guardar registros de los documentos firmados, como exigen los contratos.</li>
      <li>Para prevenir fraudes, darte soporte y mejorar el servicio.</li>
    </ul>

    <h2>Nuestras marcas para propietarios</h2>
    <p>
      Nuestros anuncios y formularios de solicitud de presupuesto funcionan bajo nombres de consumidor que {APP_NAME} posee y opera, y ese nombre
      aparece en el formulario, en la línea de consentimiento y en los mensajes que recibe el propietario. Una solicitud hecha a través de uno de
      ellos es una solicitud a {APP_NAME}, está cubierta por esta política y va a un solo contratista como se describe abajo.
    </p>

    <h2>Mensajes de texto y correos</h2>
    <p>
      Los contratistas que solicitan una cuenta aceptan una llamada y mensajes de texto de {APP_NAME} sobre su cuenta y nuevas solicitudes. Los
      propietarios que piden un presupuesto pueden recibir un mensaje para confirmar la solicitud y mensajes del contratista asignado. Pueden aplicar
      tarifas de mensajes y datos. Responde STOP a cualquier mensaje para dejar de recibir textos de ese número, o HELP (AYUDA) para ayuda. Puedes
      desactivar las alertas por correo en Configuración.
    </p>

    <h2>Con quién la compartimos</h2>
    <ul>
      <li>
        <strong>Contratistas:</strong> la solicitud y los datos de contacto de un propietario van al contratista que compra la solicitud (y a nadie
        más).
      </li>
      <li>
        <strong>Tus clientes:</strong> las páginas de presupuesto, contrato y pago que envías muestran los datos de tu empresa a las personas a
        quienes las envías.
      </li>
      <li>
        <strong>Proveedores de servicio</strong> que nos ayudan a operar {APP_NAME}: alojamiento y base de datos (Vercel, Convex), correo (Resend),
        mensajes de texto (Twilio), pagos (Stripe) e inicio de sesión (Google). Solo pueden usar los datos para prestarnos su servicio.
      </li>
      <li>
        <strong>Asistentes conectados:</strong> si conectas Claude o ChatGPT, puede leer y cambiar los datos de tu empresa en {APP_NAME} dentro de los
        permisos que apruebes. Tu uso del asistente se rige por la política de su proveedor.
      </li>
      <li>Cuando la ley lo exija, o para proteger a {APP_NAME}, a nuestros usuarios o a otros.</li>
    </ul>
    <p>No vendemos información personal, salvo la venta de solicitudes de propietarios a contratistas como se describe arriba.</p>

    <h2>Cuánto tiempo la guardamos</h2>
    <p>
      Los datos de la cuenta se conservan mientras esté abierta y un tiempo razonable después. Los presupuestos y contratos firmados se guardan
      mientras sean necesarios para los registros de las partes y los requisitos legales. Las solicitudes se conservan para poder atender créditos y
      disputas, y luego se depuran.
    </p>

    <h2>Tus opciones</h2>
    <ul>
      <li>Puedes ver y actualizar los datos de tu cuenta en Configuración, y pedirnos que eliminemos tu cuenta.</li>
      <li>
        Los propietarios pueden pedirnos eliminar su solicitud o dejar de compartirla contactándonos; el contratista que ya la recibió conserva su
        propia copia.
      </li>
      <li>Puedes dejar de recibir mensajes de texto respondiendo STOP, y las alertas por correo en Configuración.</li>
    </ul>

    <h2>Seguridad</h2>
    <p>
      Los datos se cifran en tránsito, el inicio de sesión lo manejan proveedores establecidos, y el acceso dentro de {APP_NAME} se limita a los
      registros de tu propia empresa. Ningún sistema es perfectamente seguro, así que mantén privado tu acceso.
    </p>

    <h2>Menores</h2>
    <p>{APP_NAME} es para empresas y adultos. No recopilamos a sabiendas información de menores de 18 años.</p>

    <h2>Cambios</h2>
    <p>
      Publicaremos los cambios aquí y actualizaremos la fecha de arriba. Los cambios importantes también se anunciarán en la aplicación o por correo.
    </p>

    <h2>Contacto</h2>
    <p>
      Preguntas o solicitudes de privacidad: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. {APP_NAME} · Midland, Texas.
    </p>
  </>
);
