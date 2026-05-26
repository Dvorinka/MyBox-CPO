"use client"

import { useState, useCallback } from "react"
import {
  Map as MapGL,
  Marker,
  Popup,
  NavigationControl,
  FullscreenControl,
  GeolocateControl,
  type ViewState,
} from "react-map-gl/maplibre"
import "maplibre-gl/dist/maplibre-gl.css"

export type MapViewport = {
  center: [number, number]
  zoom: number
  bearing?: number
  pitch?: number
}

interface MapProps {
  viewport?: MapViewport
  onViewportChange?: (viewport: MapViewport) => void
  center?: [number, number]
  zoom?: number
  children?: React.ReactNode
  className?: string
}

export function Map({
  viewport,
  onViewportChange,
  center,
  zoom = 10,
  children,
  className,
}: MapProps) {
  const initialLng = center ? center[0] : viewport?.center[0] ?? 14.4378
  const initialLat = center ? center[1] : viewport?.center[1] ?? 50.0755
  const initialZoom = zoom ?? viewport?.zoom ?? 10

  const [viewState, setViewState] = useState<ViewState>({
    longitude: initialLng,
    latitude: initialLat,
    zoom: initialZoom,
    bearing: viewport?.bearing ?? 0,
    pitch: viewport?.pitch ?? 0,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
  })

  const handleMove = useCallback(
    (evt: { viewState: ViewState }) => {
      setViewState(evt.viewState)
      if (onViewportChange) {
        onViewportChange({
          center: [evt.viewState.longitude, evt.viewState.latitude],
          zoom: evt.viewState.zoom,
          bearing: evt.viewState.bearing,
          pitch: evt.viewState.pitch,
        })
      }
    },
    [onViewportChange]
  )

  const isControlled = viewport !== undefined
  const currentViewState = isControlled
    ? {
        longitude: viewport.center[0],
        latitude: viewport.center[1],
        zoom: viewport.zoom,
        bearing: viewport.bearing ?? 0,
        pitch: viewport.pitch ?? 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
      }
    : viewState

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <MapGL
        {...currentViewState}
        onMove={handleMove}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        attributionControl={false}
      >
        {children}
      </MapGL>
    </div>
  )
}

interface MapControlsProps {
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left"
  showZoom?: boolean
  showCompass?: boolean
  showLocate?: boolean
  showFullscreen?: boolean
}

export function MapControls({
  position = "top-right",
  showZoom = true,
  showCompass = true,
  showLocate = false,
  showFullscreen = false,
}: MapControlsProps) {
  const style: React.CSSProperties =
    position === "top-right"
      ? { position: "absolute", top: 8, right: 8 }
      : position === "top-left"
      ? { position: "absolute", top: 8, left: 8 }
      : position === "bottom-right"
      ? { position: "absolute", bottom: 8, right: 8 }
      : { position: "absolute", bottom: 8, left: 8 }

  return (
    <div style={style} className="flex flex-col gap-1">
      {showZoom && <NavigationControl showCompass={showCompass} showZoom={showZoom} />}
      {showFullscreen && <FullscreenControl />}
      {showLocate && <GeolocateControl />}
    </div>
  )
}

interface MapMarkerProps {
  longitude: number
  latitude: number
  children?: React.ReactNode
}

export function MapMarker({ longitude, latitude, children }: MapMarkerProps) {
  return (
    <Marker longitude={longitude} latitude={latitude} anchor="center">
      <div className="relative flex items-center justify-center">{children}</div>
    </Marker>
  )
}

export function MarkerContent({ children }: { children: React.ReactNode }) {
  return <div className="cursor-pointer">{children}</div>
}

export function MarkerTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
      {children}
    </div>
  )
}

export function MarkerPopup({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 rounded-lg border border-border bg-background p-2 text-foreground shadow-lg group-hover:block">
      {children}
    </div>
  )
}

interface MapPopupProps {
  longitude: number
  latitude: number
  onClose?: () => void
  closeButton?: boolean
  focusAfterOpen?: boolean
  closeOnClick?: boolean
  children?: React.ReactNode
}

export function MapPopup({
  longitude,
  latitude,
  onClose,
  closeButton = true,
  focusAfterOpen = true,
  closeOnClick = true,
  children,
}: MapPopupProps) {
  return (
    <Popup
      longitude={longitude}
      latitude={latitude}
      onClose={onClose}
      closeButton={closeButton}
      focusAfterOpen={focusAfterOpen}
      closeOnClick={closeOnClick}
      anchor="bottom"
      offset={12}
      className="map-popup"
    >
      {children}
    </Popup>
  )
}
