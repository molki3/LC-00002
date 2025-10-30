'use client'
import React, { useRef, useState } from 'react'

type Pin = { id: string; x: number; y: number; name?: string }

type Props = {
  assetUrl: string
  assetId: string
  points: Pin[] | any[]
  onAddPoint?: (pos: { x: number; y: number }) => void
  onSelectPoint?: (p: any) => void
  onDeletePoint?: (p: any) => void
}

export default function PointCanvas({
  assetUrl,
  points,
  onAddPoint,
  onSelectPoint,
  onDeletePoint,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const [natural, setNatural] = useState({ w: 0, h: 0 })

  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)

  // pan / drag refs
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const viewStartRef = useRef({ tx: 0, ty: 0 })
  const dragDistanceRef = useRef(0)
  const [isGrabbing, setIsGrabbing] = useState(false)

  // pinch refs
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchRef = useRef<{
    active: boolean
    startDist: number
    startScale: number
    cx: number
    cy: number
  }>({ active: false, startDist: 0, startScale: 1, cx: 0, cy: 0 })

  const MIN_SCALE = 0.5
  const MAX_SCALE = 8
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

  // ===== helpers =====
  const lockBodyScroll = () => {
    document.body.style.overflow = 'hidden'
  }
  const unlockBodyScroll = () => {
    document.body.style.overflow = ''
  }

  const handleImgLoad: React.ReactEventHandler<HTMLImageElement> = (e) => {
    const img = e.currentTarget
    const w = img.naturalWidth
    const h = img.naturalHeight
    setNatural({ w, h })

    const cont = containerRef.current
    if (!cont) return

    const fit = cont.clientWidth / w
    setScale(fit)

    const contentH = h * fit
    const dy = (cont.clientHeight - contentH) / 2
    setTx(0)
    setTy(dy > 0 ? dy : 0)
  }

  const clientToNormalized = (clientX: number, clientY: number) => {
    const cont = containerRef.current
    if (!cont) return { x: 0, y: 0 }
    const rect = cont.getBoundingClientRect()

    const cx = clientX - rect.left
    const cy = clientY - rect.top

    const ix = (cx - tx) / scale
    const iy = (cy - ty) / scale

    const nx = natural.w ? ix / natural.w : 0
    const ny = natural.h ? iy / natural.h : 0

    return {
      x: clamp(nx, 0, 1),
      y: clamp(ny, 0, 1),
    }
  }

  // ===== zoom con wheel / doble click =====
  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    // Bloquea scroll de la página
    e.preventDefault()

    const cont = containerRef.current
    if (!cont) return
    const delta = -e.deltaY
    const factor = Math.exp(delta * 0.0015)
    const newScale = clamp(scale * factor, MIN_SCALE, MAX_SCALE)

    const rect = cont.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top

    const nx = (cx - tx) / scale
    const ny = (cy - ty) / scale

    setScale(newScale)
    setTx(cx - nx * newScale)
    setTy(cy - ny * newScale)
  }

  const onDoubleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const cont = containerRef.current
    if (!cont) return

    const rect = cont.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top

    const newScale = clamp(scale * 1.5, MIN_SCALE, MAX_SCALE)

    const nx = (cx - tx) / scale
    const ny = (cy - ty) / scale

    setScale(newScale)
    setTx(cx - nx * newScale)
    setTy(cy - ny * newScale)
  }

  // ===== pan con mouse =====
  const handleMouseEnter: React.MouseEventHandler<HTMLDivElement> = () => {
    lockBodyScroll()
  }
  const handleMouseLeave: React.MouseEventHandler<HTMLDivElement> = () => {
    // si dejamos presionado y salimos, también soltamos
    isPanningRef.current = false
    setIsGrabbing(false)
    unlockBodyScroll()
  }

  const handleMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if ((e.target as HTMLElement).dataset.pin === '1') return

    isPanningRef.current = true
    setIsGrabbing(true)

    panStartRef.current = { x: e.clientX, y: e.clientY }
    viewStartRef.current = { tx, ty }
    dragDistanceRef.current = 0
  }

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!isPanningRef.current) return
    const dx = e.clientX - panStartRef.current.x
    const dy = e.clientY - panStartRef.current.y

    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > dragDistanceRef.current) {
      dragDistanceRef.current = dist
    }

    setTx(viewStartRef.current.tx + dx)
    setTy(viewStartRef.current.ty + dy)
  }

  const finishPanAndMaybeClick = (clientX: number, clientY: number, targetEl: HTMLElement) => {
    isPanningRef.current = false
    setIsGrabbing(false)

    const CLICK_THRESHOLD = 4
    const wasClick = dragDistanceRef.current < CLICK_THRESHOLD
    if (!wasClick) return
    if (targetEl.dataset.pin === '1') return
    if (!onAddPoint) return

    const { x, y } = clientToNormalized(clientX, clientY)
    onAddPoint({ x, y })
  }

  const handleMouseUp: React.MouseEventHandler<HTMLDivElement> = (e) => {
    finishPanAndMaybeClick(e.clientX, e.clientY, e.target as HTMLElement)
  }

  // ===== pinch / pan touch =====
  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if ((e.target as HTMLElement).dataset.pin === '1') return

    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    lockBodyScroll()

    if (pointers.current.size === 1) {
      // pan 1 dedo
      isPanningRef.current = true
      setIsGrabbing(true)

      panStartRef.current = { x: e.clientX, y: e.clientY }
      viewStartRef.current = { tx, ty }
      dragDistanceRef.current = 0
    } else if (pointers.current.size === 2) {
      // pinch
      const [p1, p2] = Array.from(pointers.current.values())
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy)

      const rect = e.currentTarget.getBoundingClientRect()
      const cx = (p1.x + p2.x) / 2 - rect.left
      const cy = (p1.y + p2.y) / 2 - rect.top

      pinchRef.current.active = true
      pinchRef.current.startDist = dist
      pinchRef.current.startScale = scale
      pinchRef.current.cx = cx
      pinchRef.current.cy = cy

      isPanningRef.current = false
      setIsGrabbing(false)
    }
  }

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // pinch?
    if (pinchRef.current.active && pointers.current.size >= 2) {
      const [p1, p2] = Array.from(pointers.current.values())
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy)

      const factor = dist / (pinchRef.current.startDist || 1)
      const newScale = clamp(
        pinchRef.current.startScale * factor,
        MIN_SCALE,
        MAX_SCALE
      )

      const cx = pinchRef.current.cx
      const cy = pinchRef.current.cy
      const nx = (cx - tx) / scale
      const ny = (cy - ty) / scale

      setScale(newScale)
      setTx(cx - nx * newScale)
      setTy(cy - ny * newScale)
      return
    }

    // pan 1 dedo
    if (isPanningRef.current && pointers.current.size === 1) {
      const p = pointers.current.get(e.pointerId)!
      const dx = p.x - panStartRef.current.x
      const dy = p.y - panStartRef.current.y

      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > dragDistanceRef.current) {
        dragDistanceRef.current = dist
      }

      setTx(viewStartRef.current.tx + dx)
      setTy(viewStartRef.current.ty + dy)
    }
  }

  const onPointerUpOrCancel: React.PointerEventHandler<HTMLDivElement> = (e) => {
    // si quedaba un solo dedo haciendo pan, decidir si fue click
    if (pointers.current.size === 1 && isPanningRef.current) {
      finishPanAndMaybeClick(e.clientX, e.clientY, e.target as HTMLElement)
    }

    pointers.current.delete(e.pointerId)

    if (pointers.current.size < 2) {
      pinchRef.current.active = false
    }
    if (pointers.current.size === 0) {
      isPanningRef.current = false
      setIsGrabbing(false)
      unlockBodyScroll()
    }

    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
    } catch {}
  }

  // ===== helpers UI =====
  const resetView = () => {
    const cont = containerRef.current
    const img = imgRef.current
    if (!cont || !img) return

    const fit = cont.clientWidth / img.naturalWidth
    setScale(fit)

    const contentH = img.naturalHeight * fit
    const dy = (cont.clientHeight - contentH) / 2
    setTx(0)
    setTy(dy > 0 ? dy : 0)
  }

  const zoomIn = () =>
    setScale((s) => Math.min(s * 1.25, MAX_SCALE))
  const zoomOut = () =>
    setScale((s) => Math.max(s / 1.25, MIN_SCALE))

  // ===== render =====
  return (
    <div className="w-full">
      {/* Controles zoom */}
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1 text-sm"
          onClick={zoomOut}
        >
          −
        </button>
        <span className="text-xs tabular-nums">{scale.toFixed(2)}x</span>
        <button
          type="button"
          className="rounded border px-2 py-1 text-sm"
          onClick={zoomIn}
        >
          ＋
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-sm"
          onClick={resetView}
        >
          Ajustar
        </button>
      </div>

      {/* Viewport interactivo */}
      <div
        ref={containerRef}
        className={`relative h-[70vh] w-full overflow-hidden rounded border bg-black/5 touch-none ${
          isGrabbing ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUpOrCancel}
        onPointerCancel={onPointerUpOrCancel}
      >
        {/* capa transformada */}
        <div
          className="absolute left-0 top-0 will-change-transform"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          <img
            ref={imgRef}
            src={assetUrl}
            alt="asset"
            draggable={false}
            onLoad={handleImgLoad}
            className="block select-none pointer-events-none"
          />

          {/* puntos */}
          {natural.w > 0 &&
            points.map((p: any) => (
              <button
                key={p.id}
                data-pin="1"
                type="button"
                className="
                  absolute
                  -translate-x-1/2
                  -translate-y-1/2
                  rounded-full
                  bg-rose-500
                  shadow
                  ring-2 ring-white
                  cursor-pointer
                  z-20
                "
                style={{
                  left: (p.x ?? 0) * natural.w,
                  top: (p.y ?? 0) * natural.h,
                  width: 14,
                  height: 14,
                  outline: '2px solid rgba(0,0,0,0.35)',
                }}
                title={p.name ?? 'Punto'}
                onClick={(e) => {
                  e.stopPropagation()
                  if (e.altKey && onDeletePoint) {
                    return onDeletePoint(p)
                  }
                  onSelectPoint?.(p)
                }}
              />
            ))}
        </div>

        {/* labels flotantes sin escala */}
        {natural.w > 0 && (
          <div className="pointer-events-none absolute inset-0">
            {points.map((p: any) => {
              if (!p.name) return null
              const sx = tx + (p.x ?? 0) * natural.w * scale
              const sy = ty + (p.y ?? 0) * natural.h * scale
              return (
                <div
                  key={`lbl-${p.id}`}
                  className="
                    absolute
                    -translate-x-1/2
                    translate-y-3
                    whitespace-nowrap
                    rounded
                    bg-black/70
                    px-2
                    py-0.5
                    text-[11px]
                    text-white
                    shadow
                    pointer-events-none
                  "
                  style={{
                    left: sx,
                    top: sy,
                  }}
                  title={p.name}
                >
                  {p.name}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
