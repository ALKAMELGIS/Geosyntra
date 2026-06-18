/** Canonical GeoSyntra / AgroCloud map pointer + Mapbox navigation contract. */
export const MAP_MOUSE_BEHAVIOR_SPEC = {
  pan: {
    gesture: 'زر الماوس الأيسر + سحب',
    gestureEn: 'Left mouse button + drag',
    cursor: 'grab',
  },
  /** Flat 2D — Mapbox bearing rotate only (no pitch). */
  rotate2d: {
    gesture: 'زر الماوس الأيمن + سحب',
    gestureEn: 'Right mouse button + drag',
    rightButtonDrag: true,
    pitchWithRotate: false,
  },
  /** 3D — custom right-drag orbit (bearing + pitch + viewing angle). */
  orbit3d: {
    gesture: 'زر الماوس الأيمن + سحب',
    gestureEn: 'Right mouse button + drag',
    bearingSensitivity: 0.42,
    pitchSensitivity: 0.38,
    pitchClamp: { min: 0, max: 78 },
  },
  zoom: { wheel: true, doubleClick: 'flyTo' as const, touchPinch: true },
  select: { gesture: 'نقرة واحدة (زر أيسر)', gestureEn: 'Single left click' },
  popup: { gesture: 'نقرة على المعلم أو الحقل', gestureEn: 'Click on feature or field' },
  draw: { gesture: 'حسب الأداة النشطة', gestureEn: 'Depends on active tool' },
} as const;

/**
 * react-map-gl props — native dragRotate off; 3D orbit uses custom RMB handler only.
 * Double-click focus fly-to is handled by siMapGisCameraController (not Mapbox dblclick zoom).
 */
export const MAPBOX_NAVIGATION_PROPS = {
  dragRotate: false,
  pitchWithRotate: MAP_MOUSE_BEHAVIOR_SPEC.rotate2d.pitchWithRotate,
  touchPitch: true,
  touchZoomRotate: true,
  doubleClickZoom: false,
  scrollZoom: true,
  cooperativeGestures: false,
  minPitch: MAP_MOUSE_BEHAVIOR_SPEC.orbit3d.pitchClamp.min,
  maxPitch: MAP_MOUSE_BEHAVIOR_SPEC.orbit3d.pitchClamp.max,
  renderWorldCopies: false,
} as const;

export const SI_MAP_CAMERA_ORBIT_BEARING_SENS = MAP_MOUSE_BEHAVIOR_SPEC.orbit3d.bearingSensitivity;
export const SI_MAP_CAMERA_ORBIT_PITCH_SENS = MAP_MOUSE_BEHAVIOR_SPEC.orbit3d.pitchSensitivity;
export const SI_MAP_FREE_CAMERA_PITCH_MIN = MAP_MOUSE_BEHAVIOR_SPEC.orbit3d.pitchClamp.min;
export const SI_MAP_FREE_CAMERA_PITCH_MAX = MAP_MOUSE_BEHAVIOR_SPEC.orbit3d.pitchClamp.max;

export type SiMapMouseControlRow = {
  id: string;
  actionAr: string;
  actionEn: string;
  gestureAr: string;
  gestureEn: string;
  icon: string;
  tone: 'slate' | 'blue' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet' | 'purple';
  section: 'general' | 'mode3d';
};

/** User-facing control table — consistent 2D + 3D GIS navigation. */
export const SI_MAP_MOUSE_CONTROL_ROWS: SiMapMouseControlRow[] = [
  {
    id: 'pan',
    actionAr: 'تحريك الخريطة (Pan)',
    actionEn: 'Pan map',
    gestureAr: MAP_MOUSE_BEHAVIOR_SPEC.pan.gesture,
    gestureEn: MAP_MOUSE_BEHAVIOR_SPEC.pan.gestureEn,
    icon: 'fa-solid fa-up-down-left-right',
    tone: 'slate',
    section: 'general',
  },
  {
    id: 'rotate',
    actionAr: 'دوران الخريطة (2D)',
    actionEn: 'Rotate map (2D)',
    gestureAr: MAP_MOUSE_BEHAVIOR_SPEC.rotate2d.gesture,
    gestureEn: MAP_MOUSE_BEHAVIOR_SPEC.rotate2d.gestureEn,
    icon: 'fa-solid fa-rotate',
    tone: 'blue',
    section: 'general',
  },
  {
    id: 'zoom-wheel',
    actionAr: 'تكبير / تصغير',
    actionEn: 'Zoom in / out',
    gestureAr: 'عجلة الماوس',
    gestureEn: 'Mouse wheel',
    icon: 'fa-solid fa-magnifying-glass-plus',
    tone: 'emerald',
    section: 'general',
  },
  {
    id: 'zoom-dbl',
    actionAr: 'تركيز + طيران',
    actionEn: 'Focus + fly-to',
    gestureAr: 'نقرة مزدوجة',
    gestureEn: 'Double click',
    icon: 'fa-solid fa-bolt',
    tone: 'amber',
    section: 'general',
  },
  {
    id: 'select',
    actionAr: 'تحديد عنصر',
    actionEn: 'Select feature',
    gestureAr: MAP_MOUSE_BEHAVIOR_SPEC.select.gesture,
    gestureEn: MAP_MOUSE_BEHAVIOR_SPEC.select.gestureEn,
    icon: 'fa-solid fa-bullseye',
    tone: 'rose',
    section: 'general',
  },
  {
    id: 'popup',
    actionAr: 'فتح Popup',
    actionEn: 'Open popup',
    gestureAr: MAP_MOUSE_BEHAVIOR_SPEC.popup.gesture,
    gestureEn: MAP_MOUSE_BEHAVIOR_SPEC.popup.gestureEn,
    icon: 'fa-solid fa-location-dot',
    tone: 'violet',
    section: 'general',
  },
  {
    id: 'draw',
    actionAr: 'قياس أو رسم',
    actionEn: 'Measure or draw',
    gestureAr: MAP_MOUSE_BEHAVIOR_SPEC.draw.gesture,
    gestureEn: MAP_MOUSE_BEHAVIOR_SPEC.draw.gestureEn,
    icon: 'fa-solid fa-ruler-combined',
    tone: 'purple',
    section: 'general',
  },
  {
    id: 'pan-3d',
    actionAr: 'تحريك أثناء 3D',
    actionEn: 'Pan in 3D',
    gestureAr: MAP_MOUSE_BEHAVIOR_SPEC.pan.gesture,
    gestureEn: MAP_MOUSE_BEHAVIOR_SPEC.pan.gestureEn,
    icon: 'fa-solid fa-map',
    tone: 'slate',
    section: 'mode3d',
  },
  {
    id: 'orbit-3d',
    actionAr: 'دوران · مدار · إمالة (3D)',
    actionEn: 'Rotate · orbit · tilt (3D)',
    gestureAr: MAP_MOUSE_BEHAVIOR_SPEC.orbit3d.gesture,
    gestureEn: MAP_MOUSE_BEHAVIOR_SPEC.orbit3d.gestureEn,
    icon: 'fa-solid fa-mountain-sun',
    tone: 'cyan',
    section: 'mode3d',
  },
];
