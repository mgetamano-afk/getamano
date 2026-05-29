import ComunidadPage from "./ComunidadPage";

/**
 * BarrioPage — Section 89 v4 (unified).
 *
 * After the Feed/Barrio merge there's no longer a separate Barrio page.
 * This thin wrapper just renders the rich `<ComunidadPage>` in barrio
 * mode so legacy URLs like `/comunidad/barrio` and `/community/barrio`
 * keep working as before — only now they also gain inline comments,
 * pull-to-refresh, polling and filters.
 */
export default function BarrioPage() {
  return <ComunidadPage embedded barrio />;
}
