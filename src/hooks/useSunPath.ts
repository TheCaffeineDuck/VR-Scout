import { useMemo } from 'react'
import SunCalc from 'suncalc'
import { useToolStore } from '@/stores/tool-store'

export interface SunData {
  azimuth: number   // radians, 0 = south, positive = west
  altitude: number  // radians, above horizon
  direction: [number, number, number] // unit vector pointing toward sun
  colorTemp: number // Kelvin
  isGoldenHour: boolean
}

/**
 * Compute sun position and color temperature based on GPS + date + time.
 */
export function computeSunPosition(
  lat: number,
  lng: number,
  date: Date,
  normalizedTime: number, // 0-1 mapping sunrise to sunset
): SunData {
  const times = SunCalc.getTimes(date, lat, lng)
  const sunrise = times.sunrise.getTime()
  const sunset = times.sunset.getTime()

  // Interpolate between sunrise and sunset
  const timeMs = sunrise + normalizedTime * (sunset - sunrise)
  const targetDate = new Date(timeMs)

  const pos = SunCalc.getPosition(targetDate, lat, lng)

  // Convert azimuth/altitude to directional vector
  // SunCalc: azimuth is clockwise from south, altitude from horizon
  const cosAlt = Math.cos(pos.altitude)
  const direction: [number, number, number] = [
    -Math.sin(pos.azimuth) * cosAlt,
    Math.sin(pos.altitude),
    -Math.cos(pos.azimuth) * cosAlt,
  ]

  // Color temperature based on altitude
  const altDeg = (pos.altitude * 180) / Math.PI
  let colorTemp: number
  if (altDeg < 0) colorTemp = 1800    // below horizon
  else if (altDeg < 6) colorTemp = 2000  // golden hour
  else if (altDeg < 15) colorTemp = 3500  // warm
  else if (altDeg < 30) colorTemp = 4500  // neutral warm
  else colorTemp = 5500                   // daylight

  const isGoldenHour = altDeg > 0 && altDeg < 10

  return {
    azimuth: pos.azimuth,
    altitude: pos.altitude,
    direction,
    colorTemp,
    isGoldenHour,
  }
}

/**
 * Convert color temperature (Kelvin) to approximate RGB.
 * Based on Tanner Helland's algorithm.
 */
export function colorTempToRGB(kelvin: number): [number, number, number] {
  const temp = kelvin / 100
  let r: number, g: number, b: number

  if (temp <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(temp) - 161.1195681661
    b = temp <= 19
      ? 0
      : 138.5177312231 * Math.log(temp - 10) - 305.0447927307
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492)
    b = 255
  }

  return [
    Math.max(0, Math.min(255, r)) / 255,
    Math.max(0, Math.min(255, g)) / 255,
    Math.max(0, Math.min(255, b)) / 255,
  ]
}

/**
 * Hook that returns current sun data based on tool store state.
 * Uses default GPS of Los Angeles.
 */
export function useSunPath(lat = 34.0522, lng = -118.2437): SunData {
  const sunTime = useToolStore((s) => s.sunTime)
  const sunDate = useToolStore((s) => s.sunDate)

  return useMemo(
    () => computeSunPosition(lat, lng, sunDate, sunTime),
    [lat, lng, sunDate, sunTime],
  )
}
