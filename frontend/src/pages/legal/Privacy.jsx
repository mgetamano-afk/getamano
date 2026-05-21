import LegalLayout from "./LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout title="Política de Privacidad" lastUpdated="Mayo 2026" testId="legal-privacy">
      <h2>1. Introducción</h2>
      <p>En getamano valoramos tu privacidad. Esta Política de Privacidad describe qué datos recopilamos, cómo los usamos y los derechos que tienes sobre tu información personal, de conformidad con las leyes aplicables en Estados Unidos, incluyendo la California Consumer Privacy Act (CCPA).</p>

      <h2>2. Información que recopilamos</h2>
      <h3>Información que tú nos proporcionas</h3>
      <ul>
        <li>Nombre completo y datos de contacto (email, teléfono)</li>
        <li>Información de tu negocio (nombre, categoría, descripción, dirección de servicio, fotos)</li>
        <li>Tarifas y precios de tus servicios</li>
        <li>Información de pago procesada por Stripe (getamano no almacena datos de tarjetas)</li>
      </ul>
      <h3>Información recopilada automáticamente</h3>
      <ul>
        <li>Dirección IP y datos del navegador</li>
        <li>Páginas visitadas dentro de getamano y tiempo de navegación</li>
        <li>Datos de uso de la plataforma (búsquedas realizadas, perfiles visitados)</li>
        <li>Cookies (ver <a href="/cookies">Política de Cookies</a>)</li>
      </ul>
      <h3>Información de terceros</h3>
      <p>Si te registras con Google, recibimos tu nombre, email y foto de perfil de Google.</p>

      <h2>3. Cómo usamos tu información</h2>
      <p>Utilizamos tu información para operar y mejorar la plataforma, procesar pagos de suscripciones, enviarte notificaciones sobre solicitudes de cotización y actividad en tu perfil, mostrarte en resultados de búsqueda relevantes para clientes, y analizar el uso de la plataforma para mejorar la experiencia.</p>

      <h2>4. Compartir información con terceros</h2>
      <p>getamano no vende tu información personal. Compartimos datos únicamente con:</p>
      <ul>
        <li><strong>Stripe, Inc.</strong> — para procesar pagos de suscripciones</li>
        <li><strong>Google LLC</strong> — si usas Google para iniciar sesión (Google OAuth)</li>
        <li><strong>Supabase</strong> — proveedor de base de datos donde almacenamos tu información de forma segura</li>
        <li><strong>Autoridades legales</strong> — cuando sea requerido por ley o para proteger los derechos de getamano y sus usuarios</li>
      </ul>

      <h2>5. Datos de precios e inteligencia de mercado</h2>
      <p>Los datos de tarifas que publicas voluntariamente en "Mis Tarifas", los rangos de presupuesto de solicitudes de cotización y los montos reportados en reseñas se utilizan de forma agregada y anonimizada para generar inteligencia de mercado. Nunca se expone información individual de precios entre usuarios.</p>

      <h2>6. Retención de datos</h2>
      <p>Conservamos tu información mientras tu cuenta esté activa. Si eliminas tu cuenta, borraremos tus datos personales en un plazo de 30 días, salvo que la ley nos obligue a conservarlos por más tiempo.</p>

      <h2>7. Seguridad</h2>
      <p>Implementamos medidas técnicas y organizativas para proteger tu información, incluyendo cifrado en tránsito (HTTPS) y en reposo. Sin embargo, ningún sistema es 100% seguro.</p>

      <h2>8. Tus derechos (CCPA y derechos generales)</h2>
      <p>Tienes derecho a acceder a los datos personales que tenemos sobre ti, solicitar la corrección de datos incorrectos, solicitar la eliminación de tus datos, oponerte al uso de tus datos para ciertos fines, y portabilidad de datos. Para ejercer estos derechos, escríbenos a <a href="mailto:hola@getamano.us">hola@getamano.us</a>.</p>

      <h2>9. Privacidad de menores</h2>
      <p>getamano no está dirigida a personas menores de 18 años y no recopila intencionalmente información de menores.</p>

      <h2>10. Cambios a esta política</h2>
      <p>Notificaremos cambios significativos a esta política por email o mediante un aviso visible en la plataforma con al menos 15 días de anticipación.</p>

      <h2>11. Contacto</h2>
      <p>Responsable del tratamiento de datos: getamano — <a href="mailto:hola@getamano.us">hola@getamano.us</a></p>
    </LegalLayout>
  );
}
