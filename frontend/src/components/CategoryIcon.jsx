import { getCategoryIcon, ICON_DEFAULT_SIZE, ICON_DEFAULT_COLOR } from "../config/categoryIcons";

/**
 * CategoryIcon — Renderiza el icono de Tabler de una categoría por su slug.
 *
 * Props:
 *  slug      {string} — slug de la categoría (ej: 'jardineria')
 *  size      {number} — tamaño en px (default: 24)
 *  color     {string} — color hex (default: brand teal #2F9D94)
 *  stroke    {number} — grosor del trazo (default: 1.75)
 *  className {string} — clases extra para el SVG
 *  ...rest pasa al SVG generado por Tabler (aria-label, data-testid, etc.)
 */
export default function CategoryIcon({
  slug,
  size = ICON_DEFAULT_SIZE,
  color = ICON_DEFAULT_COLOR,
  stroke = 1.75,
  className = "",
  ...rest
}) {
  const Icon = getCategoryIcon(slug);
  return (
    <Icon
      size={size}
      color={color}
      stroke={stroke}
      className={className}
      data-testid={rest["data-testid"] || `category-icon-${slug || "default"}`}
      {...rest}
    />
  );
}

export { getCategoryIcon };
