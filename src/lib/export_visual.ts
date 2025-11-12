// src/lib/export_visual.ts
'use client'

import jsPDF from 'jspdf'
import { getDocument } from 'pdfjs-dist'
import { db, getProjectById, getAssetsByProject } from '@/lib/db/local'
import type { Asset, Point, ProjectList, PointEntry, SnapshotProperty } from '@/types/models'

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

/* =============== tipos de tablas =============== */
type TableRow = Record<string, string>
type Table = {
  title: string
  columns: string[]
  rows: TableRow[]
  kind?: 'heading' | 'data'
}

/* =============== constantes de dibujo =============== */
const PAD = 20
const GAP = 12
const TITLE_H = 24
const CELL_PAD_X = 8
const CELL_PAD_Y = 6
const HEADER_BG = '#111827'
const HEADER_FG = '#ffffff'
const CELL_BG = 'rgba(255,255,255,0.92)'
const CELL_FG = '#111827'
const RULE = 'rgba(0,0,0,0.15)'
const PREVIEW_WIDTH = 1200;
const MAX_PAGE_HEIGHT = 2200;

/* =============== utilidades de texto =============== */
function measureWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): { lines: string[]; height: number } {
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
  return { lines, height: lines.length * 16 }
}

// estima alto de una tabla (lo usas dentro de renderOne)
function estimateTableHeight(
  ctx: CanvasRenderingContext2D,
  table: Table,
  contentWidth: number
): number {
  if (table.kind === 'heading' || table.columns.length === 0) {
    return TITLE_H + GAP;
  }
  const colW = Math.floor((contentWidth - 2) / table.columns.length);
  const innerW = colW - CELL_PAD_X * 2;

  let h = TITLE_H + 8; // título
  h += 28;             // header

  ctx.font = '12px system-ui, sans-serif';
  for (const row of table.rows) {
    let rowH = 0;
    for (const col of table.columns) {
      const val = row[col] ?? '';
      const { height } = measureWrapped(ctx, val, innerW);
      rowH = Math.max(rowH, Math.max(18, height + CELL_PAD_Y * 2));
    }
    h += rowH;
  }
  return h;
}


function drawTable(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  table: Table,
  maxWidth: number
): number {
  if (table.kind === 'heading' || table.columns.length === 0) {
    ctx.fillStyle = '#111827'
    ctx.font = 'bold 20px system-ui, sans-serif'
    ctx.fillText(table.title, x, y + TITLE_H)
    return TITLE_H + GAP
  }
  // título
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 18px system-ui, sans-serif'
  ctx.fillText(table.title, x, y + TITLE_H - 6)
  let cy = y + TITLE_H + 8

  // ancho de columnas simple equitativo
  const colW = Math.floor((maxWidth - 2) / table.columns.length)
  const innerW = colW - CELL_PAD_X * 2

  // header
  ctx.fillStyle = HEADER_BG
  ctx.fillRect(x, cy, colW * table.columns.length, 28)
  ctx.fillStyle = HEADER_FG
  ctx.font = 'bold 13px system-ui, sans-serif'
  table.columns.forEach((col, i) => {
    const tx = x + i * colW + CELL_PAD_X
    ctx.fillText(col, tx, cy + 19)
  })
  cy += 28

  // filas
  ctx.font = '12px system-ui, sans-serif'
  for (const row of table.rows) {
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

    // fondo + regla
    ctx.fillStyle = CELL_BG
    ctx.fillRect(x, cy, colW * table.columns.length, rowH)
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
  const tables: Table[] = []

  for (const p of points) {
    const entries = (entriesByPoint.get(p.id) ?? []).slice()
      .sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

    // 1) ENCABEZADO del punto (una sola vez)
    tables.push({
      kind: 'heading',
      title: `${p.name ?? '(sin nombre)'}`,
      columns: [],
      rows: [],
    })

    // 2) Agrupa registros por lista
    const byList = new Map<string, PointEntry[]>()
    for (const e of entries) {
      const arr = byList.get(e.listId) ?? []
      arr.push(e)
      byList.set(e.listId, arr)
    }

    // 3) Crea una tabla por lista
    for (const [listId, listEntries] of byList.entries()) {
      const pl = projectLists.find(x => x.id === listId || x.listId === listId)
      const listName = pl?.listName ?? listId
      const listProps = pl?.properties ?? []

      // columnas = Fecha, Lista, ...propiedades SOLO de esta lista
      const columns = ['Fecha', 'Lista', ...listProps.map(sp => sp.name)]

      // mapeo idProp -> nombre legible
      const nameById: Record<string, string> = {}
      listProps.forEach(sp => { nameById[sp.id] = sp.name })

      const rows: TableRow[] = listEntries.map(e => {
        const row: TableRow = {
          'Fecha': new Date(e.createdAt).toLocaleString(),
          'Lista': listName,
        }
        for (const sp of listProps) {
          const val = e.values?.[sp.id]
          row[nameById[sp.id]] = Array.isArray(val) ? val.join(', ') : String(val ?? '')
        }
        return row
      })

      tables.push({
        kind: 'data',
        title: listName,    // 👈 título SOLO de la lista
        columns,
        rows,
      })
    }
  }

  return tables
}


function drawPinsAndLabels(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  baseW: number,
  baseH: number,
  points: Point[],
) {
  ctx.save();
  ctx.translate(offsetX, offsetY); // 👈 aplicar el margen de dibujo de la imagen

  ctx.fillStyle = '#ef4444';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.font = '16px system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 2;

  for (const p of points) {
    const x = (p.x ?? 0) * baseW;
    const y = (p.y ?? 0) * baseH;

    // pin
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // etiqueta
    if (p.name) {
      const padX = 6, padY = 4;
      const text = p.name;
      const tw = ctx.measureText(text).width;
      const th = 16;
      const bx = x + 10;
      const by = y - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx, by - th, tw + padX * 2, th + padY);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, bx + padX, by);
      ctx.fillStyle = '#ef4444';
    }
  }

  ctx.restore();
}

function paginateCanvasIntoPages(
  source: HTMLCanvasElement,
  usableWidth: number,       // = pdfWidth - 2*PAD
  usableHeight: number       // = pdfHeight - 2*PAD
): { canvas: HTMLCanvasElement; filenameSuffix: string }[] {
  // Si no hay nada que paginar, devuelve al menos 1 página
  if (source.width <= 0 || source.height <= 0) {
    const c = document.createElement('canvas');
    c.width = Math.max(usableWidth, 1);
    c.height = Math.max(usableHeight, 1);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
    return [{ canvas: c, filenameSuffix: 'p1' }];
  }

  const pages: { canvas: HTMLCanvasElement; filenameSuffix: string }[] = [];
  const pageH = usableHeight;                         // alto útil por página
  const scale = usableWidth / source.width;           // escalado para cubrir el ancho

  let ySrc = 0; let page = 1;
  while (ySrc < source.height) {
    const sliceH = Math.min(source.height - ySrc, Math.floor(pageH / scale));

    const c = document.createElement('canvas');
    c.width = Math.floor(usableWidth + PAD * 2);      // ya con pad
    c.height = Math.floor(usableHeight + PAD * 2);

    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);

    // dibuja la fracción vertical del canvas base
    ctx.drawImage(
      source,
      0, ySrc, source.width, sliceH,
      PAD, PAD, usableWidth, Math.floor(sliceH * scale)
    );

    pages.push({ canvas: c, filenameSuffix: `p${page}` });
    ySrc += sliceH;
    page++;
  }

  // Por si algo raro ocurre, nunca regreses vacío
  return pages.length ? pages : [{ canvas: source, filenameSuffix: 'p1' }];
}



/* =========================================================
   RENDER CANVAS(ES) VISUALES (reutilizable para PNG o PDF)
   Devuelve: { canvases: Array<{canvas, filenameSuffix}> , projectName }
========================================================= */
async function renderVisualCanvasesForAsset(
  projectId: string,
  assetId: string
): Promise<{ canvases: { canvas: HTMLCanvasElement; filenameSuffix: string }[]; projectName: string }> {
  const project = await getProjectById(projectId)
  if (!project) throw new Error('Proyecto no encontrado')

  const [asset, projectListsAll] = await Promise.all([
    db.assets.get(assetId),
    db.projectLists.where({ projectId }).toArray(),
  ])
  if (!asset) throw new Error('Asset no encontrado')

  const allPoints = await db.points.where({ assetId }).toArray()
  const entries = await db.pointEntries.where('pointId').anyOf(allPoints.map(p => p.id)).toArray()
  const entriesByPoint = new Map<string, PointEntry[]>()
  entries.forEach(e => {
    const arr = entriesByPoint.get(e.pointId) ?? []
    arr.push(e)
    entriesByPoint.set(e.pointId, arr)
  })

  // helper que construye UN canvas (imagen de base + pines + tablas)
  // helper que construye UNO o VARIOS canvases (imagen de base + pines + tablas paginadas)
  // dentro de renderVisualCanvasesForAsset, sustituye COMPLETO el renderOne por este:
const renderOne = async (
  baseBitmap: HTMLImageElement,
  filenameSuffix: string,
  pageFilter?: number
): Promise<{ canvas: HTMLCanvasElement; filenameSuffix: string }[]> => {
  const pagePoints = typeof pageFilter === 'number'
    ? allPoints.filter(p => (p.page ?? 1) === pageFilter)
    : allPoints;

  const tables = buildTablesForAsset(pagePoints, entriesByPoint, projectListsAll);

  const baseW = baseBitmap.naturalWidth;
  const baseH = baseBitmap.naturalHeight;

  // offscreen para estimar
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d')!;
  offCtx.font = '12px system-ui, sans-serif';

  const pages: { canvas: HTMLCanvasElement; filenameSuffix: string }[] = [];
  const pageWidth = baseW + PAD * 2;

  // ---- Página de trabajo
  let work = document.createElement('canvas');
  work.width = pageWidth;
  work.height = MAX_PAGE_HEIGHT;
  let ctx = work.getContext('2d')!;

  // fondo + imagen + pines
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, work.width, work.height);
  ctx.drawImage(baseBitmap, PAD, PAD, baseW, baseH);
  drawPinsAndLabels(ctx, PAD, PAD, baseW, baseH, pagePoints);

  // y arranca debajo de la imagen
  let y = PAD + baseH + PAD;
  let pageNo = 1;

  const pushCurrent = () => {
    // recorta a lo utilizado (mínimo un poco de margen)
    const usedH = Math.min(Math.max(y + PAD, PAD + baseH + PAD), MAX_PAGE_HEIGHT);
    const final = document.createElement('canvas');
    final.width = work.width;
    final.height = usedH;
    final.getContext('2d')!.drawImage(work, 0, 0);
    pages.push({ canvas: final, filenameSuffix: `${filenameSuffix}_p${pageNo++}` });
  };

  const newTablesPage = () => {
    // antes de reemplazar la página, empuja la actual
    pushCurrent();

    // nueva página SOLO de tablas
    work = document.createElement('canvas');
    work.width = pageWidth;
    work.height = MAX_PAGE_HEIGHT;
    ctx = work.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, work.width, work.height);
    y = PAD;
  };

  // --- Si NO hay tablas, aún así devolvemos la página con la imagen
  if (tables.length === 0) {
    pushCurrent();
    return pages;
  }

  // --- Colocar tablas con salto cuando no quepan
  const contentWidth = baseW; // tablas alineadas al ancho de la imagen
  for (const tbl of tables) {
    const need = estimateTableHeight(offCtx, tbl, contentWidth);
    if (y + need + PAD > MAX_PAGE_HEIGHT) {
      // pasar a nueva página de tablas
      newTablesPage();
    }
    const used = drawTable(ctx, PAD, y, tbl, contentWidth);
    y += used + GAP;
  }

  // Empuja la última página usada
  pushCurrent();
  return pages;
};



  // genera canvases según tipo de asset
  if (asset.kind === 'image') {
    const img = await loadImage(URL.createObjectURL(asset.blob));
    const pages = await renderOne(img, `${asset.id}`);
    return { canvases: pages, projectName: project.name || 'proyecto' };
  } else if (asset.kind === 'pdf') {
      const pdf = await (getDocument({ data: await asset.blob.arrayBuffer() }) as any).promise;
      const total = pdf.numPages;
      const out: { canvas: HTMLCanvasElement; filenameSuffix: string }[] = [];

      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const rotation = (page.rotate || 0) as number;

        const baseVp = page.getViewport({ scale: 1, rotation });
        const targetWidth = PREVIEW_WIDTH || (baseVp.width as number);   // fallback
        const scale = targetWidth / (baseVp.width as number);
        const viewport = page.getViewport({ scale, rotation });

        const c = document.createElement('canvas');
        c.width  = Math.ceil(viewport.width as number);
        c.height = Math.ceil(viewport.height as number);
        const cctx = c.getContext('2d')!;
        await page.render({ canvasContext: cctx as any, viewport }).promise;

        const img = await loadImage(c.toDataURL('image/png'));
        const pagesForThis = await renderOne(img, `${asset.id}_p${i}`, i);
        out.push(...pagesForThis);
      }
      return { canvases: out, projectName: project.name || 'proyecto' };
    } else {
        throw new Error('Tipo de asset no soportado en export visual')
  }
}

/* =========================================================
   PNG (si quieres seguir teniendo salida PNG por asset)
========================================================= */
export async function exportAssetVisualWithTablesPNG(projectId: string, assetId: string) {
  const { canvases, projectName } = await renderVisualCanvasesForAsset(projectId, assetId)
  for (const { canvas, filenameSuffix } of canvases) {
    await new Promise<void>(res =>
      canvas.toBlob(b => { downloadBlob(b!, `${projectName}_${filenameSuffix}.png`); res() }, 'image/png', 0.95)
    )
  }
}

/* =========================================================
   PDF por ASSET (combina múltiples páginas en 1 PDF si el asset es PDF)
========================================================= */
export async function exportAssetVisualWithTablesPDF(projectId: string, assetId: string) {
  const { canvases, projectName } = await renderVisualCanvasesForAsset(projectId, assetId);

  // Si tu renderOne devuelve un canvas MUY alto, pagínalo aquí:
  const paged: { canvas: HTMLCanvasElement; filenameSuffix: string }[] = [];
  for (const { canvas } of canvases) {
    const pdfW = 2480;           // ~A4 apaisado @300dpi (puedes ajustar)
    const pdfH = 1754;
    const usableW = pdfW - PAD * 2;
    const usableH = pdfH - PAD * 2;

    // Si el canvas ya cabe, envuélvelo tal cual; si no, páginalo
    if (canvas.height <= usableH && canvas.width <= usableW) {
      const c = document.createElement('canvas');
      c.width = pdfW; c.height = pdfH;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
      const scale = Math.min(usableW / canvas.width, usableH / canvas.height);
      const w = Math.floor(canvas.width * scale);
      const h = Math.floor(canvas.height * scale);
      const ox = PAD + Math.floor((usableW - w)/2);
      const oy = PAD + Math.floor((usableH - h)/2);
      ctx.drawImage(canvas, ox, oy, w, h);
      paged.push({ canvas: c, filenameSuffix: 'p1' });
    } else {
      paged.push(...paginateCanvasIntoPages(canvas, usableW, usableH));
    }
  }

  if (!paged.length) {
    alert('No se generó ninguna página para exportar.');
    return;
  }

  // Crea el PDF
  const first = paged[0].canvas;
  const orientation = first.width >= first.height ? 'l' : 'p' as const;
  const pdf = new jsPDF({ orientation, unit: 'px', format: [first.width, first.height] });

  // primera página
  pdf.addImage(first.toDataURL('image/png'), 'PNG', 0, 0, first.width, first.height);

  // páginas siguientes (usando el mismo tamaño del documento para consistencia)
  for (let i = 1; i < paged.length; i++) {
    const c = paged[i].canvas;
    pdf.addPage([first.width, first.height], orientation);
    pdf.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, first.width, first.height);
  }

  const blob = pdf.output('blob');
  downloadBlob(blob, `${projectName}_${assetId}.pdf`);
}



/* =========================================================
   PDF para TODOS los ASSETS del proyecto (lo que usa tu botón)
   — genera un PDF por asset (descargas múltiples)
========================================================= */
export async function exportAllAssetsVisualWithTables(projectId: string) {
  const project = await getProjectById(projectId)
  if (!project) { alert('Proyecto no encontrado'); return }

  const assets = await getAssetsByProject(projectId)
  for (const a of assets) {
    await exportAssetVisualWithTablesPDF(projectId, a.id)
  }
}
