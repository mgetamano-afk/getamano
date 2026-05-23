/**
 * DiceBear avataaars fallback (Section 33).
 *
 * Returns a stable SVG URL that derives a friendly illustrated avatar from
 * the provider's name. Used when the provider has not uploaded a real photo.
 */
export function getDicebearAvatar(name = "Provider") {
  const seed = encodeURIComponent(String(name).trim() || "Provider");
  const params = new URLSearchParams({
    seed,
    backgroundColor: "b6e3f4,c0aede,ffd5dc,d1f4e0,fde68a",
    backgroundType: "solid",
    mouth: "smile,default",
    eyes: "happy,default,wink",
    eyebrows: "defaultNatural,default",
    top: "longHairStraight,longHairCurly,shortHairShortFlat,shortHairDreads01,shortHairTheCaesar",
    skinColor: "f8d25c,edb98a,ae5d29,614335,d08b5b",
  });
  return `https://api.dicebear.com/7.x/avataaars/svg?${params.toString()}`;
}
