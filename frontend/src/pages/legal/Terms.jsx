import LegalLayout from "./LegalLayout";

export default function Terms() {
  return (
    <LegalLayout title="Términos y Condiciones" lastUpdated="Mayo 2026" testId="legal-terms">
      <h2>1. Aceptación de los términos</h2>
      <p>Al acceder o utilizar la plataforma getamano, disponible en getamano.us, usted acepta estar sujeto a estos Términos y Condiciones. Si no está de acuerdo con alguna parte de estos términos, no podrá utilizar nuestros servicios.</p>

      <h2>2. Descripción del servicio</h2>
      <p>getamano es un marketplace digital que conecta a proveedores de servicios latinos con clientes en Estados Unidos. La plataforma permite a los proveedores crear un perfil profesional (eCard), publicar sus servicios y recibir solicitudes de cotización de clientes. getamano actúa únicamente como intermediario y no es parte de los acuerdos que se celebren entre proveedores y clientes.</p>

      <h2>3. Tipos de usuarios</h2>
      <h3>Proveedores</h3>
      <p>Personas o empresas que ofrecen servicios a través de la plataforma. Para registrarse como proveedor, debes tener 18 años o más, residir o tener tu negocio en Estados Unidos, y proporcionar información veraz y actualizada sobre tus servicios.</p>
      <h3>Clientes</h3>
      <p>Personas que utilizan getamano para encontrar y contactar proveedores de servicios. Los clientes pueden navegar y solicitar cotizaciones sin necesidad de crear una cuenta.</p>

      <h2>4. Planes y pagos</h2>
      <p>getamano ofrece los siguientes planes para proveedores:</p>
      <ul>
        <li>Plan Gratuito: acceso básico sin costo</li>
        <li>Plan Básico: $10 USD/mes</li>
        <li>Plan Pro: $15 USD/mes</li>
        <li>Plan Premium: $25 USD/mes</li>
      </ul>
      <p>Los pagos se procesan a través de Stripe, Inc. Al suscribirte a un plan de pago, autorizas a getamano a cobrar el monto correspondiente de forma mensual a tu método de pago registrado. Todos los precios están en dólares estadounidenses (USD).</p>

      <h2>5. Programa Founding Members</h2>
      <p>El código promocional <strong>GETAMANO50</strong> otorga acceso gratuito al Plan Pro hasta el 31 de diciembre de 2027, exclusivo para los primeros 50 proveedores registrados. Este beneficio no es transferible y se aplica únicamente al plan Pro.</p>

      <h2>6. Cancelaciones y reembolsos</h2>
      <p>Puedes cancelar tu suscripción en cualquier momento desde tu panel de proveedor. La cancelación tiene efecto al final del período de facturación en curso. No se ofrecen reembolsos por períodos parciales ya facturados, excepto cuando lo exija la ley aplicable.</p>

      <h2>7. Responsabilidades del proveedor</h2>
      <p>Los proveedores son responsables de mantener su información actualizada, responder a las solicitudes de cotización de forma oportuna y profesional, cumplir con todas las leyes y regulaciones aplicables en su estado o ciudad, y poseer los permisos, licencias y seguros necesarios para prestar sus servicios. getamano no verifica ni garantiza las credenciales, licencias ni la calidad del trabajo de los proveedores.</p>

      <h2>8. Responsabilidades de getamano</h2>
      <p>getamano pone a disposición la plataforma tecnológica para facilitar la conexión entre proveedores y clientes. getamano no garantiza la disponibilidad ininterrumpida del servicio, no es responsable de disputas entre proveedores y clientes, no garantiza un número mínimo de contactos o contrataciones para los proveedores, y no responde por los servicios prestados por los proveedores a los clientes.</p>

      <h2>9. Contenido prohibido</h2>
      <p>Está prohibido publicar información falsa o engañosa, ofrecer servicios ilegales, utilizar la plataforma para actividades de spam o acoso, y hacer uso indebido del sistema de reseñas o del sistema de cotizaciones.</p>

      <h2>10. Propiedad intelectual</h2>
      <p>Todo el contenido de getamano, incluyendo el logo, diseño, textos e interfaz, son propiedad de getamano o sus licenciantes. Los proveedores conservan los derechos sobre el contenido que publican en sus perfiles, pero otorgan a getamano una licencia para mostrarlo en la plataforma.</p>

      <h2>11. Limitación de responsabilidad</h2>
      <p>En la máxima medida permitida por la ley aplicable, getamano no será responsable por daños indirectos, incidentales, especiales o consecuentes que surjan del uso o la imposibilidad de uso de la plataforma.</p>

      <h2>12. Modificaciones</h2>
      <p>getamano se reserva el derecho de modificar estos términos en cualquier momento. Los cambios entrarán en vigor 30 días después de su publicación en la plataforma. El uso continuado de getamano después de ese período constituye la aceptación de los nuevos términos.</p>

      <h2>13. Ley aplicable</h2>
      <p>Estos términos se rigen por las leyes del Estado de Texas, Estados Unidos, sin perjuicio de sus normas sobre conflictos de leyes.</p>

      <h2>14. Contacto</h2>
      <p>Para preguntas sobre estos términos, escríbenos a <a href="mailto:hola@getamano.us">hola@getamano.us</a>.</p>
    </LegalLayout>
  );
}
