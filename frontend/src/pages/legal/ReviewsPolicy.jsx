import LegalLayout from "./LegalLayout";

export default function ReviewsPolicy() {
  return (
    <LegalLayout title="Política de Reseñas" lastUpdated="Mayo 2026" testId="legal-reviews">
      <h2>1. Propósito del sistema de reseñas</h2>
      <p>Las reseñas en getamano tienen como único propósito proporcionar información honesta y útil a los clientes para que puedan tomar decisiones informadas al contratar un proveedor. Un sistema de reseñas confiable beneficia a toda la comunidad.</p>

      <h2>2. Quién puede dejar una reseña</h2>
      <p>Pueden dejar reseñas los clientes que hayan contactado a un proveedor a través de getamano, ya sea enviando una solicitud de cotización o contactando directamente por WhatsApp desde el perfil del proveedor. getamano se reserva el derecho de verificar que existe una relación previa entre el cliente y el proveedor.</p>

      <h2>3. Contenido permitido</h2>
      <p>Las reseñas deben ser honestas, basadas en una experiencia real con el proveedor, respetuosas y constructivas, escritas en primera persona describiendo la experiencia personal, y pueden incluir aspectos positivos y negativos del servicio.</p>

      <h2>4. Contenido no permitido</h2>
      <p>Está estrictamente prohibido publicar reseñas con:</p>
      <ul>
        <li>Lenguaje ofensivo, discriminatorio o de odio</li>
        <li>Información personal del proveedor (dirección, teléfono personal)</li>
        <li>Contenido falso o fabricado</li>
        <li>Reseñas a cambio de pago o beneficios (reseñas incentivadas)</li>
        <li>Múltiples reseñas del mismo cliente al mismo proveedor</li>
        <li>Reseñas de competidores con la intención de dañar la reputación</li>
      </ul>

      <h2>5. Información de precios en reseñas</h2>
      <p>Las reseñas incluyen un campo opcional para reportar el rango de precio pagado por el servicio. Esta información es <strong>privada</strong>: no aparece en el perfil público del proveedor ni es visible para otros usuarios. Se utiliza únicamente de forma agregada para mejorar la plataforma.</p>

      <h2>6. Moderación</h2>
      <p>getamano modera las reseñas publicadas. Una reseña puede ser eliminada si viola esta política, si hay indicios razonables de ser falsa o fabricada, o si el proveedor reporta una disputa fundamentada.</p>

      <h2>7. Proceso de disputa para proveedores</h2>
      <p>Si un proveedor considera que una reseña es falsa o viola esta política, puede reportarla desde su dashboard en la sección "Solicitudes". getamano revisará el caso en un plazo de 5 días hábiles. Si la reseña viola la política, será eliminada. Si la reseña es legítima, permanecerá publicada.</p>

      <h2>8. Respuestas del proveedor</h2>
      <p>Los proveedores con plan Básico, Pro o Premium pueden responder públicamente a cualquier reseña. Las respuestas deben ser profesionales y constructivas. getamano puede eliminar respuestas que violen esta política.</p>

      <h2>9. Prohibición de manipulación</h2>
      <p>Está prohibido solicitar a familiares, amigos o empleados que dejen reseñas falsas, ofrecer descuentos o compensaciones a cambio de reseñas positivas, y presionar a clientes para que modifiquen o eliminen reseñas negativas. Las cuentas que violen esta política pueden ser suspendidas o eliminadas permanentemente.</p>

      <h2>10. Contacto</h2>
      <p>Para reportar abuso del sistema de reseñas: <a href="mailto:hola@getamano.us">hola@getamano.us</a></p>
    </LegalLayout>
  );
}
