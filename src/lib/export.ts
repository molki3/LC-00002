// src/lib/export.ts
'use client'

import JSZip from 'jszip'
import { getDocument } from 'pdfjs-dist'
import {
  db,
  getProjectById,
  getAssetsByProject,
  
   // Asegúrate de tener este helper en local.ts
} from '@/lib/db/local'
import type { Asset, Point } from '@/types/models'

/** Descargar un Blob con nombre */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Serializa arreglo de objetos a CSV (encabezados por keys) */
function toCSV(rows: any[]): string {
  if (!rows || rows.length === 0) return ''

  const headers: string[] = Array.from(
    rows.reduce((set: Set<string>, r: any) => {
      Object.keys(r).forEach((k) => set.add(k))
      return set
    }, new Set<string>())
  )

  const escape = (v: any) => {
    if (v == null) return ''
    const s = String(v)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const head = headers.join(',')
  const body = rows
    .map((r) => {
      const rec = r as Record<string, any>
      return headers.map((h: string) => escape(rec[h])).join(',')
    })
    .join('\n')

  return head + '\n' + body
}


/** Crea un PNG con la imagen + pins y etiquetas (para assets tipo imagen). */
async function renderAnnotatedImagePNG(asset: Asset, points: Point[]): Promise<Blob> {
  const img = await loadImage(URL.createObjectURL(asset.blob))
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  // dibujar imagen base
  ctx.drawImage(img, 0, 0)
  // estilo pines
  ctx.fillStyle = '#ef4444'
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 2
  ctx.font = '16px system-ui, sans-serif'
  ctx.textBaseline = 'bottom'
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 2

  for (const p of points) {
    const x = (p.x ?? 0) * asset.width
    const y = (p.y ?? 0) * asset.height
    // pin
    ctx.beginPath()
    ctx.arc(x, y, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // etiqueta
    if (p.name) {
      const padX = 6, padY = 4
      const text = p.name
      const tw = ctx.measureText(text).width
      const th = 16
      const bx = x + 10
      const by = y - 10
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillRect(bx, by - th, tw + padX * 2, th + padY)
      ctx.fillStyle = '#fff'
      ctx.fillText(text, bx + padX, by)
      ctx.fillStyle = '#ef4444'
    }
  }

  return await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png', 0.92)!)
}

/** Render de PDFs: devuelve un array de PNGs anotados (uno por página) */
async function renderAnnotatedPdfPNGs(asset: Asset, points: Point[]): Promise<Blob[]> {
  const pdf = await (getDocument({ data: await asset.blob.arrayBuffer() }) as any).promise
  const total = pdf.numPages
  const out: Blob[] = []

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 }) // calidad buena
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = viewport.width as number
    canvas.height = viewport.height as number
    await page.render({ canvasContext: ctx as any, viewport: viewport as any, canvas: canvas as any } as any).promise

    // Sobreponer pines (los puntos con page==i; si no guardas page, todos en 1)
    const pagePoints = points.filter(p => !p.page || p.page === i)
    // Escalado de coordenadas normalizadas a tamaño renderizado
    ctx.fillStyle = '#ef4444'
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 2
    ctx.font = '16px system-ui, sans-serif'
    ctx.textBaseline = 'bottom'
    ctx.shadowColor = 'rgba(0,0,0,0.4)'
    ctx.shadowBlur = 2

    for (const p of pagePoints) {
      const x = (p.x ?? 0) * (viewport.width as number)
      const y = (p.y ?? 0) * (viewport.height as number)
      ctx.beginPath()
      ctx.arc(x, y, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      if (p.name) {
        const padX = 6, padY = 4
        const text = p.name
        const tw = ctx.measureText(text).width
        const th = 16
        const bx = x + 10
        const by = y - 10
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(bx, by - th, tw + padX * 2, th + padY)
        ctx.fillStyle = '#fff'
        ctx.fillText(text, bx + padX, by)
        ctx.fillStyle = '#ef4444'
      }
    }

    const blob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png', 0.92)!)
    out.push(blob)
  }
  return out
}

/** Helper para cargar <img> */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/** Exporta solo CSV (una descarga .zip con todos los CSVs de las tablas del proyecto) */
export async function exportProjectCSV(projectId: string) {
  const zip = new JSZip()
  const project = await getProjectById(projectId)
  if (!project) return alert('Proyecto no encontrado')

  // Recolecta tablas del proyecto
  const [assets, points] = await Promise.all([
    getAssetsByProject(projectId),
    db.points.where({ projectId }).toArray(),
  ])
  const projectLists = await db.projectLists.where({ projectId }).toArray()
  const lists = await db.lists.toArray()
  const properties = await db.properties.toArray()
  const options = await db.options.toArray()
  const pointEntries = await db.pointEntries.where('pointId').anyOf(points.map(p => p.id)).toArray()

  // CSVs normalizados por tabla
  zip.file('projects.csv', toCSV([project]))
  zip.file('project_lists.csv', toCSV(projectLists))
  zip.file('lists.csv', toCSV(lists))
  zip.file('properties.csv', toCSV(properties))
  zip.file('options.csv', toCSV(options))
  zip.file('assets.csv', toCSV(assets))
  zip.file('points.csv', toCSV(points))

  // Entradas “denormalizadas” (expande values)
  const entriesFlat = pointEntries.map(pe => {
    const point = points.find(p => p.id === pe.pointId)
    return {
      id: pe.id,
      pointId: pe.pointId,
      pointName: point?.name ?? '',
      assetId: point?.assetId ?? '',
      projectId: point?.projectId ?? '',
      listId: pe.listId,
      createdAt: pe.createdAt,
      ...pe.values, // propiedades como columnas
    }
  })
  zip.file('point_entries.csv', toCSV(entriesFlat))

  // Descargar ZIP
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, `project_${projectId}_csv.zip`)
}

/** Exporta ZIP con CSV + Imágenes/PDF anotados + manifest.json */
export async function exportProjectZip(projectId: string) {
  const zip = new JSZip()
  const project = await getProjectById(projectId)
  if (!project) return alert('Proyecto no encontrado')

  // 1) CSVs como en exportProjectCSV
  const [assets, points] = await Promise.all([
    getAssetsByProject(projectId),
    db.points.where({ projectId }).toArray(),
  ])
  const projectLists = await db.projectLists.where({ projectId }).toArray()
  const lists = await db.lists.toArray()
  const properties = await db.properties.toArray()
  const options = await db.options.toArray()
  const pointEntries = await db.pointEntries.where('pointId').anyOf(points.map(p => p.id)).toArray()

  zip.file('csv/projects.csv', toCSV([project]))
  zip.file('csv/project_lists.csv', toCSV(projectLists))
  zip.file('csv/lists.csv', toCSV(lists))
  zip.file('csv/properties.csv', toCSV(properties))
  zip.file('csv/options.csv', toCSV(options))
  zip.file('csv/assets.csv', toCSV(assets))
  zip.file('csv/points.csv', toCSV(points))

  const entriesFlat = pointEntries.map(pe => {
    const point = points.find(p => p.id === pe.pointId)
    return {
      id: pe.id,
      pointId: pe.pointId,
      pointName: point?.name ?? '',
      assetId: point?.assetId ?? '',
      projectId: point?.projectId ?? '',
      listId: pe.listId,
      createdAt: pe.createdAt,
      ...pe.values,
    }
  })
  zip.file('csv/point_entries.csv', toCSV(entriesFlat))

  // 2) Manifest JSON completo
  zip.file('manifest.json', JSON.stringify({
    project,
    projectLists,
    lists,
    properties,
    options,
    assets: assets.map(a => ({
      id: a.id, projectId: a.projectId, kind: a.kind, mime: a.mime, width: a.width, height: a.height, pageCount: a.pageCount,
    })), // (no metemos blobs en JSON)
    points,
    pointEntries,
  }, null, 2))

  // 3) Recursos anotados (assets/)
  for (const a of assets) {
    const pts = points.filter(p => p.assetId === a.id)

    if (a.kind === 'image') {
      const png = await renderAnnotatedImagePNG(a, pts)
      zip.file(`assets/${a.id}.png`, png)
    } else if (a.kind === 'pdf') {
      const pages = await renderAnnotatedPdfPNGs(a, pts)
      pages.forEach((blob, idx) => {
        zip.file(`assets/${a.id}_p${idx + 1}.png`, blob)
      })
    } else {
      // otros tipos (a futuro)
    }
  }

  // Descargar ZIP
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, `project_${projectId}_export.zip`)
}
