'use client'

import { getDocument } from 'pdfjs-dist'
import { db, getProjectById, getAssetsByProject } from '@/lib/db/local'
import type { Asset, Point, ProjectList, SnapshotProperty, PointEntry } from '@/types/models'

/* =============== helpers de descarga =============== */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = url
  })
}

/* =============== layout y dibujo de tablas =============== */

type TableRow = Record<string, string>
type Table = {
  title: string          // "Punto: nombre"
  columns: string[]      // columnas (Fecha, Lista, ...props)
  rows: TableRow[]       // valores string por columna
}

const PAD = 20
const GAP = 12
const TITLE_H = 24
const CELL_PAD_X = 8
const CELL_PAD_Y = 6
const HEADER_BG = '#111827'      // gris oscuro
const HEADER_FG = '#ffffff'
const CELL_BG = 'rgba(255,255,255,0.92)'
const CELL_FG = '#111827'
const RULE = 'rgba(0,0,0,0.15)'

function measureWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): { lines: string[], height: number } {
  if (!text) return { lines: [''], height: 16 }
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > maxWidth) {
      if (line) lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  const height = lines.length * 16
  return { lines, height }
}

function drawTable(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  table: Table,
  maxWidth: number
): number {
  // 1) título
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 18px system-ui, sans-serif'
  ctx.fillText(table.title, x, y + TITLE_H - 6)
  let cy = y + TITLE_H + 8

  // 2) calcular ancho de columnas (equitable simple)
  //    si quieres exacto por contenido, aquí podrías medir por cada columna.
  const colW = Math.floor((maxWidth - 2) / table.columns.length)
  const innerW = colW - CELL_PAD_X * 2

  // 3) header
  ctx.fillStyle = HEADER_BG
  ctx.fillRect(x, cy, colW * table.columns.length, 28)
  ctx.fillStyle = HEADER_FG
  ctx.font = 'bold 13px system-ui, sans-serif'
  table.columns.forEach((col, i) => {
    const tx = x + i * colW + CELL_PAD_X
    ctx.fillText(col, tx, cy + 19)
  })
  cy += 28

  // 4) filas
  ctx.font = '12px system-ui, sans-serif'
  for (const row of table.rows) {
    // altura dinámica por wraps
    let rowH = 0
    const perColLines: string[][] = []
    const perColHeights: number[] = []

    table.columns.forEach((col) => {
      const val = row[col] ?? ''
      const { lines, height } = measureWrapped(ctx, val, innerW)
      perColLines.push(lines)
      perColHeights.push(height)
      rowH = Math.max(rowH, Math.max(18, height + CELL_PAD_Y * 2))
    })

    // fondo
    ctx.fillStyle = CELL_BG
    ctx.fillRect(x, cy, colW * table.columns.length, rowH)
    // líneas
    ctx.strokeStyle = RULE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, cy + rowH + 0.5)
    ctx.lineTo(x + colW * table.columns.length, cy + rowH + 0.5)
    ctx.stroke()

    // texto
    ctx.fillStyle = CELL_FG
    table.columns.forEach((col, i) => {
      const tx = x + i * colW + CELL_PAD_X
      let ty = cy + CELL_PAD_Y + 12
      perColLines[i].forEach((ln) => {
        ctx.fillText(ln, tx, ty)
        ty += 16
      })
    })

    cy += rowH
  }

  return cy - y
}

/* =============== construir tablas por punto =============== */

function buildTablesForAsset(
  points: Point[],
  entriesByPoint: Map<string, PointEntry[]>,
  projectLists: ProjectList[]
): Table[] {
  // Para cada punto, columnas = Fecha, Lista, ...union de propiedades (por nombre de propiedad snapshot/base)
  const tables: Table[] = []

  for (const p of points) {
    const entries = entriesByPoint.get(p.id) ?? []
    // columnas base
    const colSet = new Set<string>(['Fecha', 'Lista'])
    // union de propiedades por nombre legible
    for (const e of entries) {
      const listProps = projectLists.find(pl => pl.id === e.listId || pl.listId === e.listId)?.properties ?? []
      const nameById: Record<string, string> = {}
      listProps.forEach(sp => { nameById[sp.id] = sp.name })

      for (const [pid] of Object.entries(e.values ?? {})) {
        const label = nameById[pid] ?? pid
        colSet.add(label)
      }
    }
    const columns = Array.from(colSet)

    // rows
    const rows: TableRow[] = entries.map(e => {
      const listName =
        projectLists.find(pl => pl.id === e.listId || pl.listId === e.listId)?.listName
        ?? e.listId

      const listProps = projectLists.find(pl => pl.id === e.listId || pl.listId === e.listId)?.properties ?? []
      const nameById: Record<string, string> = {}
      listProps.forEach(sp => { nameById[sp.id] = sp.name })

      const row: TableRow = {
        'Fecha': new Date(e.createdAt).toLocaleString(),
        'Lista': listName,
      }

      // rellena columnas de propiedades
      for (const col of columns) {
        if (col === 'Fecha' || col === 'Lista') continue
        // encuentra qué id de propiedad mapea a este nombre
        const pid = Object.entries(nameById).find(([, nm]) => nm === col)?.[0]
        const value = pid ? e.values?.[pid] : ''
        row[col] = Array.isArray(value)
        ? value.join(', ')
        : String(value ?? '')
      }
      return row
    })

    tables.push({
      title: `Punto: ${p.name ?? '(sin nombre)'}  —  (${(p.x*100).toFixed(1)}%, ${(p.y*100).toFixed(1)}%)`,
      columns,
      rows,
    })
  }

  return tables
}

/* =============== pins + etiquetas =============== */

function drawPinsAndLabels(
  ctx: CanvasRenderingContext2D,
  baseW: number,
  baseH: number,
  points: Point[],
) {
  ctx.save()
  ctx.fillStyle = '#ef4444'
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 2
  ctx.font = '16px system-ui, sans-serif'
  ctx.textBaseline = 'bottom'
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 2

  for (const p of points) {
    const x = (p.x ?? 0) * baseW
    const y = (p.y ?? 0) * baseH
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

  ctx.restore()
}

/* =========================================================
   API: exporta PNG(s) con:
   - imagen/pdf renderizado
   - pines y nombres
   - tablas por punto debajo
   (una imagen por asset/página)
========================================================= */
export async function exportAssetVisualWithTables(projectId: string, assetId: string) {
  const project = await getProjectById(projectId)
  if (!project) { alert('Proyecto no encontrado'); return }

  const [asset, projectListsAll] = await Promise.all([
    db.assets.get(assetId),
    db.projectLists.where({ projectId }).toArray(),
  ])
  if (!asset) { alert('Asset no encontrado'); return }

  const allPoints = await db.points.where({ assetId }).toArray()
  // agrupa entries por punto
  const entries = await db.pointEntries.where('pointId').anyOf(allPoints.map(p => p.id)).toArray()
  const entriesByPoint = new Map<string, PointEntry[]>()
  entries.forEach(e => {
    const arr = entriesByPoint.get(e.pointId) ?? []
    arr.push(e)
    entriesByPoint.set(e.pointId, arr)
  })

  // helper de render “una página”
  const renderOne = async (baseBitmap: HTMLImageElement, filenameSuffix: string, pageFilter?: number) => {
    // filtra puntos por página si aplica
    const pagePoints = typeof pageFilter === 'number'
      ? allPoints.filter(p => (p.page ?? 1) === pageFilter)
      : allPoints

    // tablas por punto (según filtro)
    const tables = buildTablesForAsset(pagePoints, entriesByPoint, projectListsAll)

    // compute canvas size
    const SCALE = 2 // más nítido
    const baseW = Math.floor(baseBitmap.naturalWidth * SCALE)
    const baseH = Math.floor(baseBitmap.naturalHeight * SCALE)

    // estimar alto de tablas dibujando sobre un offscreen ctx
    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d')!
    offCtx.font = '12px system-ui, sans-serif'

    let tablesHeight = 0
    tables.forEach(tbl => {
      // título + gap
      let h = TITLE_H + 8
      // header + filas
      // calculamos aproximadamente en ancho = baseW - PAD*2
      const colCount = Math.max(1, tbl.columns.length)
      const colW = Math.floor((baseW - PAD*2 - 2) / colCount)
      const innerW = colW - CELL_PAD_X * 2

      h += 28 // header
      for (const row of tbl.rows) {
        let rowH = 0
        tbl.columns.forEach(col => {
          const val = row[col] ?? ''
          const { height } = measureWrapped(offCtx, val, innerW)
          rowH = Math.max(rowH, Math.max(18, height + CELL_PAD_Y * 2))
        })
        h += rowH
      }
      tablesHeight += h + GAP
    })

    const totalH = baseH + PAD + tablesHeight + PAD
    const canvas = document.createElement('canvas')
    canvas.width = baseW + PAD*2
    canvas.height = totalH
    const ctx = canvas.getContext('2d')!

    // fondo
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // dibuja base (escalada a SCALE)
    ctx.drawImage(baseBitmap, PAD, PAD, baseW, baseH)

    // pines/labels
    drawPinsAndLabels(ctx, baseW, baseH, pagePoints)

    // tablas
    let cy = PAD + baseH + PAD
    tables.forEach(tbl => {
      const used = drawTable(ctx, PAD, cy, tbl, baseW)
      cy += used + GAP
    })

    // export
    await new Promise<void>(res =>
      canvas.toBlob(b => { downloadBlob(b!, `${project.name || 'proyecto'}_${filenameSuffix}.png`); res() }, 'image/png', 0.95)
    )
  }

  if (asset.kind === 'image') {
    const img = await loadImage(URL.createObjectURL(asset.blob))
    await renderOne(img, `${asset.id}`)
  } else if (asset.kind === 'pdf') {
    const pdf = await (getDocument({ data: await asset.blob.arrayBuffer() }) as any).promise
    const total = pdf.numPages
    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 2 }) // calidad buena
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      canvas.width = viewport.width as number
      canvas.height = viewport.height as number
      await page.render({ canvasContext: ctx as any, viewport: viewport as any, canvas: canvas as any } as any).promise
      const img = await loadImage(canvas.toDataURL('image/png'))
      await renderOne(img, `${asset.id}_p${i}`, i)
    }
  } else {
    alert('Tipo de asset no soportado en export visual')
  }
}