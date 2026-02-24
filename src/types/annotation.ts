export type AnnotationType = 'power' | 'parking' | 'sound' | 'light' | 'access' | 'ceiling' | 'restriction' | 'custom'

export interface AnnotationConfig {
  type: AnnotationType
  icon: string
  label: string
  color: string
}

export const ANNOTATION_TYPES: Record<AnnotationType, AnnotationConfig> = {
  power:       { type: 'power',       icon: '\u26A1', label: 'Electrical Panel/Outlet', color: '#FBBF24' },
  parking:     { type: 'parking',     icon: 'P',      label: 'Vehicle Access/Parking',  color: '#3B82F6' },
  sound:       { type: 'sound',       icon: '\uD83D\uDD07', label: 'Sound Issue (AC, traffic)', color: '#EF4444' },
  light:       { type: 'light',       icon: '\u2600',  label: 'Natural Light Source',    color: '#F59E0B' },
  access:      { type: 'access',      icon: '\uD83D\uDEAA', label: 'Load-in/Access Point',    color: '#10B981' },
  ceiling:     { type: 'ceiling',     icon: '\uD83D\uDD0D', label: 'Ceiling Height',          color: '#8B5CF6' },
  restriction: { type: 'restriction', icon: '\u26A0',  label: 'Restriction/Limitation',  color: '#F97316' },
  custom:      { type: 'custom',      icon: '\uD83D\uDCDD', label: 'Custom Note',             color: '#6B7280' },
}

export interface Annotation {
  id: string
  locationId: string
  virtualTourId: string
  sessionId: string | null
  position: [number, number, number]
  normal: [number, number, number]
  type: AnnotationType
  title: { en: string; th: string }
  description: { en: string; th: string }
  measurement?: {
    start: [number, number, number]
    end: [number, number, number]
    distance: number
  }
  visibility: 'private' | 'team' | 'public'
  createdBy: string
  createdAt: Date
}
