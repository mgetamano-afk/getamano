// categoryIcons.js — Mapeo de slug de categoría → icono de Tabler
// Fuente: @tabler/icons-react (MIT) — https://tabler.io/icons
// Sincronizado con los 184 slugs reales servidos por /api/seo/sectors.

import {
  // Hogar & limpieza
  IconSpray, IconBucket, IconWashMachine, IconTruckDelivery, IconPackage,
  // Construcción & remodelación
  IconPaint, IconHammer, IconDoor, IconLayersDifference, IconRuler, IconBuildingArch,
  IconTool, IconFlame, IconSnowflake, IconBolt, IconPlug, IconDroplet, IconBulb,
  IconWindow, IconHomeBolt,
  // Pisos
  IconSquare, IconSquaresSelected, IconGridPattern,
  // Exterior & jardín
  IconPlant, IconTree, IconLeaf, IconShovel, IconSwimming,
  // Mudanzas / transporte
  IconHomeMove, IconTruck, IconTruckLoading, IconTruckReturn, IconBus, IconPlane,
  // Tecnología
  IconDeviceMobile, IconDeviceDesktop, IconDeviceLaptop, IconWorld, IconBrandInstagram,
  IconChartBar, IconCode, IconPrinter, IconCamera, IconVideo, IconWifi, IconHeadset,
  IconDeviceTv,
  // Automotriz
  IconCar, IconEngine, IconGauge, IconCarCrash, IconShieldCheckered, IconShield,
  IconMicrophone, IconSnowman, IconWash,
  // Salud & bienestar
  IconMassage, IconYoga, IconHeartRateMonitor, IconStethoscope, IconDental, IconEye,
  IconNurse, IconCrutches, IconWheelchair, IconBrain, IconBandage, IconUserHeart,
  IconActivity,
  // Belleza
  IconScissors, IconMoodSmile, IconHandFinger, IconSparkles, IconDiamond, IconSun,
  // Mascotas
  IconPaw, IconDog, IconCat, IconWalk,
  // Educación
  IconBook, IconSchool, IconLanguage, IconMath, IconMusic, IconMicrophone2,
  IconPalette, IconPencil, IconPiano, IconGuitarPick,
  // Niños
  IconMoodKid, IconBabyBottle,
  // Eventos
  IconConfetti, IconCake, IconBalloon, IconToolsKitchen2, IconGlass, IconFlower,
  IconChairDirector, IconTent, IconChefHat, IconUsers,
  // Finanzas & legal
  IconFileInvoice, IconScale, IconBuildingBank, IconReceiptTax, IconCertificate,
  IconCoin, IconBusinessplan, IconSignature,
  // Inmobiliario
  IconBuildingCommunity, IconKey, IconHomeDollar,
  // Moda
  IconNeedleThread, IconHanger, IconShoe,
  // Religioso / espiritual
  IconCandle, IconPray,
  // Otros
  IconBriefcase, IconBug, IconBuildingFactory, IconGardenCart, IconBrandSnapchat,
  IconArrowsTransferUpDown, IconClipboardList,
} from "@tabler/icons-react";

export const ICON_DEFAULT_SIZE = 24;
export const ICON_DEFAULT_COLOR = "#0077B6"; // brand teal

// Helper: resolve to the first available icon (fallback chain) so missing Tabler exports never crash.
const pick = (...candidates) => candidates.find(Boolean) || IconBriefcase;

// Slugs reales del DB de getamano. Si agregas un slug nuevo y no lo mapeas, cae al icono `default` (Briefcase).
export const categoryIcons = {
  // ─── LEGACY / sector aliases ───
  "cleaning": IconSpray,
  "tutoring": IconBook,
  "catering": IconToolsKitchen2,
  "construction": IconHammer,
  "handyman": IconTool,
  "auto": IconCar,
  "beauty": IconSparkles,
  "moving": IconHomeMove,
  "legal": IconScale,
  "events": IconConfetti,
  "landscaping": IconPlant,
  "health": IconStethoscope,

  // ─── HOGAR & LIMPIEZA ───
  "limpieza-hogar": IconSpray,
  "limpieza-comercial": IconSpray,
  "limpieza-alfombras": IconBucket,
  "limpieza-ventanas": IconDroplet,
  "limpieza-post-construccion": IconBucket,
  "organizacion-hogar": IconPackage,
  "lavanderia": IconWashMachine,
  "lavanderia-entrega": IconTruckDelivery,

  // ─── CONSTRUCCIÓN & REMODELACIÓN ───
  "construccion": IconHammer,
  "plomeria": IconDroplet,
  "electricidad": IconBolt,
  "hvac": IconSnowflake,
  "techos": IconBuildingArch,
  "pintura-interior": IconPaint,
  "pintura-exterior": IconPaint,
  "drywall": IconLayersDifference,
  "carpinteria": IconHammer,
  "pisos": IconSquare,
  "azulejos": IconSquaresSelected,
  "gabinetes": pick(IconClipboardList, IconBriefcase),
  "ventanas-puertas": IconDoor,
  "herreria": IconTool,
  "cercas": IconRuler,
  "concreto": IconRuler,
  "impermeabilizacion": IconDroplet,
  "alarmas-camaras": IconCamera,
  "iluminacion": IconBulb,
  "electrodomesticos": IconWashMachine,
  "garage-door": IconHomeBolt,
  "demolicion": IconBuildingFactory,

  // ─── EXTERIOR & JARDÍN ───
  "jardineria": IconPlant,
  "arboles": IconTree,
  "diseno-jardines": IconShovel,
  "sod": IconGridPattern,
  "riego": IconDroplet,
  "piscina": IconSwimming,
  "construccion-piscina": IconSwimming,
  "deck-pergola": IconBuildingArch,
  "pressure-washing": IconSpray,
  "excavacion": IconShovel,
  "mantenimiento-propiedades": IconHomeBolt,

  // ─── PEST CONTROL ───
  "fumigacion": IconBug,
  "chinches": IconBug,

  // ─── MUDANZAS ───
  "mudanzas": IconHomeMove,
  "mudanzas-largo": IconTruck,
  "junk-removal": IconTruckLoading,

  // ─── AUTOMOTRIZ ───
  "mecanica": IconEngine,
  "mecanica-domicilio": IconTruck,
  "frenos": IconCar,
  "transmision": IconArrowsTransferUpDown,
  "llantas": IconCar,
  "pintura-autos": IconPaint,
  "hojalateria": IconCarCrash,
  "detailing": IconWash,
  "ac-autos": IconSnowflake,
  "audio-autos": IconMicrophone,
  "tinted-autos": IconShield,
  "cristales-autos": IconShieldCheckered,
  "grua": IconTruck,
  "inspeccion-autos": IconGauge,
  "seguro-auto": IconShield,
  "lavado-autos": IconWash,

  // ─── FINANZAS & LEGAL ───
  "impuestos": IconFileInvoice,
  "contabilidad": IconBuildingBank,
  "notario": IconSignature,
  "traduccion": IconLanguage,
  "seguros": IconReceiptTax,
  "bienes-raices": IconBuildingCommunity,
  "hipotecas": IconHomeDollar,
  "credito": IconCoin,
  "consultoria": IconBusinessplan,
  "registro-llc": IconCertificate,
  "asistente-virtual": IconBrandSnapchat,
  "tramites": IconCertificate,

  // ─── SALUD & BIENESTAR ───
  "entrenamiento": IconHeartRateMonitor,
  "yoga": IconYoga,
  "masajes": IconMassage,
  "nutricion": IconActivity,
  "terapia-fisica": IconCrutches,
  "enfermeria": IconNurse,
  "cuidado-heridas": IconBandage,
  "quiropractico": IconCrutches,
  "acupuntura": IconHeartRateMonitor,
  "psicologia": IconBrain,
  "medicina-alternativa": IconActivity,

  // ─── ADULTOS MAYORES ───
  "cuidado-mayores": IconWheelchair,
  "companero-mayores": IconUserHeart,
  "asistencia-mayores": IconWheelchair,

  // ─── BELLEZA & CUIDADO PERSONAL ───
  "peluqueria": IconScissors,
  "barberia": IconScissors,
  "nails": IconHandFinger,
  "maquillaje": IconSparkles,
  "cejas-pestanas": IconEye,
  "depilacion": IconSparkles,
  "spa": IconMoodSmile,
  "estilismo": IconScissors,
  "maquillaje-eventos": IconSparkles,
  "extensiones": IconScissors,
  "bronceado": IconSun,
  "tatuajes": IconDiamond,
  "piercings": IconDiamond,

  // ─── NIÑOS ───
  "cuidado-ninos": IconMoodKid,
  "ninera": IconBabyBottle,
  "guarderia": IconMoodKid,

  // ─── EDUCACIÓN ───
  "tutoria": IconBook,
  "clases-ingles": IconLanguage,
  "clases-espanol": IconLanguage,
  "musica": IconMusic,
  "guitarra": pick(IconGuitarPick, IconMusic),
  "piano": pick(IconPiano, IconMusic),
  "baile": IconHeartRateMonitor,
  "arte": IconPalette,
  "computacion": IconDeviceLaptop,
  "transporte-escolar": IconBus,

  // ─── COMIDA & CATERING ───
  "chef-domicilio": IconChefHat,
  "reposteria": IconCake,
  "comida-tradicional": IconToolsKitchen2,
  "meal-prep": IconToolsKitchen2,
  "bartending": IconGlass,
  "meseros": IconUsers,
  "food-truck": IconTruck,
  "clases-cocina": IconToolsKitchen2,
  "pinatas": IconConfetti,

  // ─── FOTOGRAFÍA & VIDEO ───
  "fotografia": IconCamera,
  "videografia": IconVideo,
  "fotografia-quinceanera": IconCamera,
  "fotografia-bodas": IconCamera,
  "fotografia-productos": IconCamera,
  "fotografia-mascotas": IconCamera,

  // ─── ENTRETENIMIENTO ───
  "dj": IconMusic,
  "mariachi": pick(IconMicrophone2, IconMicrophone),
  "animacion-fiestas": IconBalloon,
  "payasos-magos": IconSparkles,
  "brincolines": IconBalloon,

  // ─── EVENTOS — PLANIFICACIÓN ───
  "decoracion-eventos": IconConfetti,
  "planner-quinceanera": IconChairDirector,
  "planner-bodas": IconChairDirector,
  "planner-eventos": IconChairDirector,
  "flores": IconFlower,
  "renta-mobiliario": IconChairDirector,
  "carpas": IconTent,
  "fotomaton": IconCamera,

  // ─── MASCOTAS ───
  "grooming": IconPaw,
  "pet-sitting": IconCat,
  "dog-walking": IconWalk,
  "entrenamiento-perros": IconDog,
  "veterinario": IconStethoscope,
  "hotel-mascotas": IconPaw,

  // ─── TECNOLOGÍA ───
  "reparacion-computadoras": IconDeviceDesktop,
  "reparacion-celulares": IconDeviceMobile,
  "redes-wifi": IconWifi,
  "soporte-tecnico": IconHeadset,
  "diseno-web": IconWorld,
  "diseno-grafico": IconPalette,
  "social-media": IconBrandInstagram,
  "edicion-digital": IconVideo,
  "impresion": IconPrinter,
  "tv-sonido": IconDeviceTv,
  "smart-home": IconPlug,

  // ─── TRANSPORTE ───
  "transporte-medico": IconStethoscope,
  "transporte-aeropuerto": IconPlane,
  "delivery": IconTruckDelivery,
  "transporte-carga": IconTruck,
  "flete": IconTruckReturn,

  // ─── MODA & COSTURA ───
  "costura": IconNeedleThread,
  "diseno-ropa": IconHanger,
  "bordados": IconNeedleThread,
  "serigrafia": IconPaint,
  "tintoreria": IconWashMachine,
  "zapatero": IconShoe,

  // ─── RELIGIOSO / ESPIRITUAL ───
  "musica-religiosa": IconMusic,
  "fotografia-religiosa": IconCamera,
  "altares": pick(IconCandle, IconSparkles),
  "limpia-espiritual": pick(IconPray, IconSparkles),

  // ─── GENÉRICO (fallback) ───
  "default": IconBriefcase,
};

// Helper: obtener componente de icono por slug con fallback al genérico.
export function getCategoryIcon(slug) {
  if (!slug) return categoryIcons["default"];
  return categoryIcons[slug] || categoryIcons["default"];
}
