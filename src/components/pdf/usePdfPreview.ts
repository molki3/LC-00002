'use client'

/**
 * Convierte una página de un PDF (Blob) en una imagen (Blob URL) para usar en <img/> o canvas.
 * - page: 1-based
 * - maxWidth: ancho objetivo de render (escala proporcional)
 */

import { useEffect, useState } from 'react'
import { ensurePdfWorker } from '@/lib/pdf' // tu helper que fija GlobalWorkerOptions.workerSrc

export function usePdfPreview(
  blob: Blob,
  page: number = 1,
  maxWidth: number = 1200
) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [width, setWidth] = useState<number | null>(null)
  const [height, setHeight] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    let tmpUrl: string | null = null

    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        await ensurePdfWorker()
        const { getDocument } = await import('pdfjs-dist')

        const buf = await blob.arrayBuffer()
        const pdf = await (getDocument as any)({ data: buf }).promise
        const pg = await pdf.getPage(page)

        // escala a maxWidth manteniendo proporción
        const vp1 = pg.getViewport({ scale: 1 })
        const scale = Math.min(1, maxWidth / (vp1.width as number)) || (maxWidth / (vp1.width as number))
        const vp = pg.getViewport({ scale })

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('No canvas 2d context')
        canvas.width = vp.width as number
        canvas.height = vp.height as number

        await pg.render({ canvasContext: ctx as any, viewport: vp as any } as any).promise

        const pngBlob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png', 0.92)!)
        tmpUrl = URL.createObjectURL(pngBlob)

        if (!alive) return
        setImageUrl(tmpUrl)
        setWidth(canvas.width)
        setHeight(canvas.height)
      } catch (e: any) {
        if (!alive) return
        console.error(e)
        setError(e?.message ?? 'Error al rasterizar PDF')
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
      if (tmpUrl) URL.revokeObjectURL(tmpUrl)
    }
  }, [blob, page, maxWidth])

  return { imageUrl, width, height, loading, error }
}
