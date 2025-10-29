'use client'

/**
 * COMPONENTE: PointCanvas
 * --------------------------------------------
 * - Muestra una imagen (Asset tipo image)
 * - Detecta clics para crear puntos (x, y normalizados)
 * - Renderiza los puntos existentes sobre la imagen
 */

import React, { useRef, useState, useEffect } from 'react'
import type { Point } from '@/types/models'

type PointCanvasProps = {
  assetUrl: string           // URL temporal (ObjectURL o blob:)
  assetId: string
  points: Point[]
  onAddPoint?: (coords: { x: number; y: number }) => void
  onSelectPoint?: (point: Point) => void
}

export default function PointCanvas({
  assetUrl,
  points,
  onAddPoint,
  onSelectPoint,
}: PointCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 })

  // 🔹 Detectar tamaño de imagen al cargar
  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const handleLoad = () => {
      setDimensions({ w: img.width, h: img.height })
    }
    img.addEventListener('load', handleLoad)
    return () => img.removeEventListener('load', handleLoad)
  }, [assetUrl])

  // 🔹 Manejar clic sobre el contenedor
  const handleClick = (e: React.MouseEvent) => {
    const rect = (containerRef.current as HTMLElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    if (onAddPoint) onAddPoint({ x, y })
  }

  // 🔹 Renderizar puntos posicionados relativamente
  const renderPoints = () =>
    points.map((p) => (
      <div
        key={p.id}
        onClick={(e) => {
          e.stopPropagation()
          onSelectPoint?.(p)
        }}
        className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500 cursor-pointer hover:scale-110 transition-transform"
        style={{
          left: `${p.x * 100}%`,
          top: `${p.y * 100}%`,
        }}
        title={`(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`}
      />
    ))

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="relative inline-block w-full cursor-crosshair select-none"
    >
      <img
        ref={imgRef}
        src={assetUrl}
        alt="Asset"
        className="w-full h-auto rounded-md shadow-md"
      />
      {renderPoints()}
    </div>
  )
}
