import LegalLayout from "./LegalLayout";

export default function Cookies() {
  return (
    <LegalLayout title="Política de Cookies" lastUpdated="Mayo 2026" testId="legal-cookies">
      <h2>1. ¿Qué son las cookies?</h2>
      <p>Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo cuando visitas un sitio web. Nos ayudan a recordar tus preferencias, analizar el tráfico y mejorar tu experiencia en getamano.</p>

      <h2>2. Tipos de cookies que utilizamos</h2>
      <h3>Cookies estrictamente necesarias (no se pueden desactivar)</h3>
      <ul>
        <li>Sesión de usuario autenticado (para mantener tu sesión iniciada)</li>
        <li>Preferencias de idioma y región</li>
        <li>Token de seguridad CSRF para proteger tu cuenta</li>
      </ul>
      <h3>Cookies de funcionalidad</h3>
      <ul>
        <li>Recordar filtros de búsqueda usados anteriormente</li>
        <li>Preferencias de visualización del dashboard</li>
      </ul>
      <h3>Cookies de análisis y rendimiento</h3>
      <ul>
        <li>Páginas más visitadas y tiempo de navegación</li>
        <li>Errores técnicos para mejorar la plataforma</li>
        <li>Origen del tráfico (búsqueda, redes sociales, directo)</li>
      </ul>
      <h3>Cookies de terceros</h3>
      <ul>
        <li><strong>Google OAuth</strong>: si inicias sesión con Google, Google puede instalar sus propias cookies según su política de privacidad</li>
        <li><strong>Stripe</strong>: para el procesamiento seguro de pagos en la página de planes</li>
      </ul>

      <h2>3. Cookies que NO usamos</h2>
      <p>getamano no utiliza cookies de publicidad comportamental ni de retargeting, no comparte datos de cookies con redes publicitarias de terceros, y no instala cookies de seguimiento entre sitios web.</p>

      <h2>4. Cómo controlar las cookies</h2>
      <p>Puedes configurar tu navegador para rechazar todas las cookies, aceptar solo cookies de sitios específicos, o ser notificado cuando se instale una cookie. Ten en cuenta que desactivar las cookies estrictamente necesarias puede afectar el funcionamiento de la plataforma.</p>
      <p>Instrucciones por navegador: <strong>Chrome</strong> → Configuración → Privacidad y seguridad → Cookies | <strong>Safari</strong> → Preferencias → Privacidad | <strong>Firefox</strong> → Opciones → Privacidad y seguridad.</p>

      <h2>5. Duración de las cookies</h2>
      <p>Las cookies de sesión se eliminan al cerrar el navegador. Las cookies de funcionalidad y análisis tienen una duración máxima de 12 meses.</p>

      <h2>6. Consentimiento</h2>
      <p>Al continuar navegando en getamano después de ver el aviso de cookies, aceptas el uso de las cookies descritas en esta política. Puedes revocar tu consentimiento en cualquier momento desde la configuración de tu navegador.</p>

      <h2>7. Cambios a esta política</h2>
      <p>Cualquier cambio significativo en el uso de cookies será comunicado mediante un nuevo aviso en la plataforma.</p>

      <h2>8. Contacto</h2>
      <p>Para preguntas sobre cookies: <a href="mailto:hola@getamano.us">hola@getamano.us</a></p>
    </LegalLayout>
  );
}
