'use client'

// import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { db, getProjectById } from '@/lib/db/local'
import type { Point, PointEntry, ProjectList } from '@/types/models'

// ========== helpers ==========
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// (opcional) reusa tus funciones existentes
type TableRow = Record<string, string>
type Table = { title: string; columns: string[]; rows: TableRow[]; kind?: 'heading'|'data' }

const PAD = 20, GAP = 12, TITLE_H = 24, CELL_PAD_X = 8, CELL_PAD_Y = 6
const HEADER_BG = '#111827', HEADER_FG = '#fff', CELL_BG = 'rgba(255,255,255,0.92)', CELL_FG = '#111827', RULE = 'rgba(0,0,0,0.15)'
const MAX_PAGE_HEIGHT = 16384

function measureWrapped(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (!text) return { lines: [''], height: 16 }
  const words = text.split(/\s+/)
  const lines:string[]=[]; let line=''
  for (const w of words) {
    const t = line ? line+' '+w : w
    if (ctx.measureText(t).width > maxWidth) { if (line) lines.push(line); line = w }
    else line = t
  }
  if (line) lines.push(line)
  return { lines, height: lines.length*16 }
}

function drawTable(ctx: CanvasRenderingContext2D, x:number,y:number, table:Table, maxWidth:number){
  if (table.kind==='heading' || table.columns.length===0) {
    ctx.fillStyle='#111827'; ctx.font='bold 20px system-ui, sans-serif'
    ctx.fillText(table.title, x, y+TITLE_H); return TITLE_H+GAP
  }
  ctx.fillStyle='#111827'; ctx.font='bold 18px system-ui, sans-serif'
  ctx.fillText(table.title, x, y+TITLE_H-6); let cy=y+TITLE_H+8
  const colW = Math.floor((maxWidth-2)/table.columns.length), innerW = colW - CELL_PAD_X*2

  ctx.fillStyle=HEADER_BG; ctx.fillRect(x, cy, colW*table.columns.length, 28)
  ctx.fillStyle=HEADER_FG; ctx.font='bold 13px system-ui, sans-serif'
  table.columns.forEach((c,i)=>ctx.fillText(c, x+i*colW+CELL_PAD_X, cy+19))
  cy += 28

  ctx.font='12px system-ui, sans-serif'
  for (const row of table.rows) {
    let rowH=0; const linesPer:string[][]=[]
    table.columns.forEach((c,i)=>{ const {lines,height}=measureWrapped(ctx, row[c]??'', innerW); linesPer[i]=lines; rowH=Math.max(rowH, Math.max(18,height+CELL_PAD_Y*2)) })
    ctx.fillStyle=CELL_BG; ctx.fillRect(x, cy, colW*table.columns.length, rowH)
    ctx.strokeStyle=RULE; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x, cy+rowH+0.5); ctx.lineTo(x+colW*table.columns.length, cy+rowH+0.5); ctx.stroke()
    ctx.fillStyle=CELL_FG
    table.columns.forEach((c,i)=>{ let ty=cy+CELL_PAD_Y+12; const tx=x+i*colW+CELL_PAD_X; linesPer[i].forEach(ln=>{ctx.fillText(ln, tx, ty); ty+=16}) })
    cy += rowH
  }
  return cy-y
}

// ========== tablas por punto (misma lógica que ya tienes, agrupando por lista) ==========
function buildTablesForAsset(points: Point[], entriesByPoint: Map<string, PointEntry[]>, projectLists: ProjectList[]): Table[] {
  const tables: Table[] = []
  for (const p of points) {
    const entries = (entriesByPoint.get(p.id) ?? []).slice()
      .sort((a,b)=> new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

    tables.push({ kind:'heading', title: `${p.name ?? '(sin nombre)'}`, columns:[], rows:[] })

    const byList = new Map<string, PointEntry[]>()
    for (const e of entries) (byList.get(e.listId) ?? byList.set(e.listId, []).get(e.listId)!).push(e)

    for (const [listId, listEntries] of byList.entries()) {
      const pl = projectLists.find(x => x.id===listId || x.listId===listId)
      const listName = pl?.listName ?? listId
      const listProps = pl?.properties ?? []
      const columns = ['Fecha','Lista', ...listProps.map(sp=>sp.name)]
      const nameById: Record<string,string> = {}; listProps.forEach(sp => nameById[sp.id]=sp.name)

      const rows: TableRow[] = listEntries.map(e=>{
        const row: TableRow = { 'Fecha': new Date(e.createdAt).toLocaleString(), 'Lista': listName }
        for (const sp of listProps) {
          const v = e.values?.[sp.id]
          row[nameById[sp.id]] = Array.isArray(v) ? v.join(', ') : String(v ?? '')
        }
        return row
      })
      tables.push({ kind:'data', title:listName, columns, rows })
    }
  }
  return tables
}

// ========== 1) Exportar la vista actual (PDF) ==========
// export async function exportViewportPDF(viewEl: HTMLElement, filename='Plano.pdf') {
//   const scale = Math.min(2, (window.devicePixelRatio || 1) * 2) // buen detalle
//   const canvas = await html2canvas(viewEl, { backgroundColor:'#fff', scale, useCORS:true, logging:false })
//   const w = canvas.width, h = canvas.height
//   const pdf = new jsPDF({ orientation: w>=h ? 'l':'p', unit:'px', format: [w, h] })
//   pdf.addImage(canvas.toDataURL('image/jpeg',0.95), 'JPEG', 0, 0, w, h)
//   pdf.save(filename)
// }

// // ========== 2) Exportar la vista + tablas (PDF) ==========
// export async function exportViewportWithTablesPDF(
//   viewEl: HTMLElement,
//   projectId: string,
//   assetId: string,
//   filename = 'Plano_con_tablas.pdf'
// ) {
//   const project = await getProjectById(projectId)
//   if (!project) { alert('Proyecto no encontrado'); return }

//   // 2.1 screenshot exacto del viewport (pines exactos)
//   const scale = Math.min(2, (window.devicePixelRatio || 1) * 2)
//   const shot = await html2canvas(viewEl, { backgroundColor:'#fff', scale, useCORS:true, logging:false })
//   const baseW = shot.width, baseH = shot.height

//   // 2.2 puntos/entradas para tablas
//   const points = await db.points.where({ assetId }).toArray()
//   const entries = await db.pointEntries.where('pointId').anyOf(points.map(p=>p.id)).toArray()
//   const map = new Map<string, PointEntry[]>()
//   entries.forEach(e => { (map.get(e.pointId) ?? map.set(e.pointId, []).get(e.pointId)!).push(e) })
//   const projectLists = await db.projectLists.where({ projectId }).toArray()

//   const tables = buildTablesForAsset(points, map, projectLists)

//   // 2.3 compone páginas: screenshot arriba + tablas debajo (paginado)
//   const pageWidth = baseW + PAD*2
//   const meas = document.createElement('canvas').getContext('2d')!
//   meas.font = '12px system-ui, sans-serif'

//   let work = document.createElement('canvas')
//   work.width = pageWidth
//   work.height = MAX_PAGE_HEIGHT
//   let ctx = work.getContext('2d')!

//   ctx.fillStyle='#fff'; ctx.fillRect(0,0,work.width,work.height)
//   ctx.drawImage(shot, PAD, PAD) // sin reescalar

//   let y = PAD + baseH + PAD
//   let pageNo = 1
//   const pages: HTMLCanvasElement[] = []

//   const pushCurrent = () => {
//     const used = Math.min(Math.max(y+PAD, PAD+baseH+PAD), MAX_PAGE_HEIGHT)
//     const final = document.createElement('canvas')
//     final.width = work.width; final.height = used
//     final.getContext('2d')!.drawImage(work, 0, 0)
//     pages.push(final)
//   }

//   const newTablesPage = () => {
//     pushCurrent()
//     work = document.createElement('canvas')
//     work.width = pageWidth; work.height = MAX_PAGE_HEIGHT
//     ctx = work.getContext('2d')!
//     ctx.fillStyle='#fff'; ctx.fillRect(0,0,work.width,work.height)
//     y = PAD
//   }

//   const estimate = (tbl:Table) => {
//     if (tbl.kind==='heading' || tbl.columns.length===0) return TITLE_H+GAP
//     const colW = Math.floor((baseW - 2)/tbl.columns.length)
//     const innerW = colW - CELL_PAD_X*2
//     let h = TITLE_H + 8 + 28
//     for (const row of tbl.rows) {
//       let rowH = 0
//       tbl.columns.forEach(c=>{
//         const t = row[c] ?? ''
//         const words = String(t).split(/\s+/)
//         let line=''; let lines=0
//         for (const w of words) {
//           const test = line ? line+' '+w : w
//           if (meas.measureText(test).width > innerW) { if (line) lines++; line=w }
//           else line=test
//         }
//         if (line) lines++
//         const hCell = Math.max(18, lines*16 + CELL_PAD_Y*2)
//         rowH = Math.max(rowH, hCell)
//       })
//       h += rowH
//     }
//     return h + GAP
//   }

//   for (const tbl of tables) {
//     const need = estimate(tbl)
//     if (y + need + PAD > MAX_PAGE_HEIGHT) newTablesPage()
//     const used = drawTable(ctx, PAD, y, tbl, baseW)
//     y += used + GAP
//   }
//   pushCurrent()

//   // 2.4 genera el PDF final
//   const pdf = new jsPDF({ orientation: pageWidth>=Math.max(...pages.map(p=>p.height)) ? 'l':'p', unit:'px', format:[pageWidth, pages[0].height] })
//   pages.forEach((c, i) => {
//     if (i>0) pdf.addPage([pageWidth, c.height], pageWidth>=c.height ? 'l':'p')
//     pdf.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, c.height)
//   })
//   pdf.save(filename || `${project.name || 'proyecto'}_${assetId}.pdf`)
// }
