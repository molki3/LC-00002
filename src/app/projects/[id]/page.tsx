'use client'

import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  getProjectById, deleteProject,
  createImageAssetFromFile, getAssetsByProject, deleteAsset,
  createPdfAssetFromFile, addPoint, getPointsByAsset, deletePoint,
  
} from '@/lib/db/local'
import type { Project, ProjectList, Asset, Point } from '@/types/models'
import { ensurePdfWorker } from '@/lib/pdf'
import PointCanvas from '@/components/points/PointCanvas'
import PointFormModal from '@/components/points/PointFormModal'
import PointsTable from '@/components/points/PointsTable'
import { usePdfPreview } from '@/components/pdf/usePdfPreview'
import { exportProjectCSV, exportProjectZip } from '@/lib/export'
import Link from 'next/link'
import { exportAllAssetsVisualWithTables, exportAssetVisualWithTablesPDF, exportAssetVisualWithTablesPNG } from '@/lib/export_visual'


type ProjectWithLists = Project & { lists: ProjectList[] }
type PdfThumbProps = {
  blob: Blob
  maxWidth?: number
}
const fmt = (iso: string) => new Date(iso).toLocaleString()

// Utilidad para crear una URL temporal segura a partir de un Blob
const toObjectURL = (b: Blob) => URL.createObjectURL(b)

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const projectId = useMemo(
    () => (Array.isArray(params.id) ? params.id[0] : params.id),
    [params.id]
  )
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState<ProjectWithLists | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 🎯 NUEVO: estado de assets y de carga de assets
  const [assets, setAssets] = useState<Asset[]>([])
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [points, setPoints] = useState<Point[]>([])

  // Cargar proyecto
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await getProjectById(projectId)
        if (!data) {
          setError('Proyecto no encontrado')
          return
        }
        setProject(data)
      } catch (e) {
        console.error(e)
        setError('No se pudo cargar el proyecto.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId])

  // 🎯 NUEVO: cargar assets del proyecto
  useEffect(() => {
    const loadAssets = async () => {
      try {
        setLoadingAssets(true)
        const list = await getAssetsByProject(projectId)
        setAssets(list)
      } finally {
        setLoadingAssets(false)
      }
    }
    loadAssets()
  }, [projectId])

  /**
   * Renderiza la primera página de un PDF (Blob) dentro de un <canvas>.
   * Escala a un ancho máximo para vista previa.
   */

  function PdfThumb({ blob, maxWidth = 520 }: PdfThumbProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let destroyed = false

    ;(async () => {
      try {
        await ensurePdfWorker()
        const { getDocument } = await import('pdfjs-dist')

        const buf = await blob.arrayBuffer()
        const pdf = await (getDocument as any)({ data: buf }).promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 1 })

        // 1) Obtener referencia al canvas primero
        const canvas = canvasRef.current
        if (!canvas || destroyed) return

        // 2) Calcular escala en función del ancho del contenedor (fallback al viewport)
        const containerWidth =
          canvas.parentElement?.clientWidth ?? (viewport.width as number)

        // Si quieres limitar a un máximo, usa: Math.min(containerWidth, maxWidth)
        const targetWidth = Math.min(containerWidth, maxWidth)
        const scale = targetWidth / (viewport.width as number)
        const vp = page.getViewport({ scale })

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        canvas.width = vp.width as number
        canvas.height = vp.height as number

        await page.render({
          canvas: canvas as any,       // compat TS en pdfjs v3/v4/v5
          canvasContext: ctx as any,
          viewport: vp as any,
        } as any).promise
      } catch (e) {
        console.error('PDF preview error', e)
      }
    })()

    // Limpieza
    return () => {
      destroyed = true
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx?.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
  }, [blob, maxWidth])

  // ⬇️ Asegúrate de que el componente SIEMPRE devuelva JSX
  return (
    <canvas
      ref={canvasRef}
      className="mx-auto block w-full h-auto rounded-md shadow"
    />
    )
  }

  const handleDelete = async () => {
    if (!project) return
    const ok = confirm(`¿Eliminar el proyecto "${project.name}"?`)
    if (!ok) return
    await deleteProject(project.id)
    router.push('/')
  }

  // Subir imagen (PNG/JPG/WebP)
  const onPickImage: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const input = e.currentTarget
      const file = input.files?.[0]
      if (!file) return

      try {
        await createImageAssetFromFile(projectId, file)
        const list = await getAssetsByProject(projectId)
        setAssets(list)
      } catch (err) {
        console.error(err)
        alert('No se pudo subir la imagen')
      } finally {
        // ✅ ya no usamos e.currentTarget (que podría ser null)
        input.value = ''
      }
  }

  // Subir PDF (usa la misma recarga de assets)
  const onPickPdf: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const input = e.currentTarget  // guarda ref antes del await
    const file = input.files?.[0]
    if (!file) return
    try {
      await createPdfAssetFromFile(projectId, file)
      const list = await getAssetsByProject(projectId)
      setAssets(list)
    } catch (err) {
      console.error(err)
      alert('No se pudo subir el PDF')
    } finally {
      input.value = ''  // limpia el input
    }
  }


  const onDeleteAsset = async (id: string) => {
    await deleteAsset(id)
    setAssets((prev) => prev.filter((a) => a.id !== id))
  }

  if (loading) return <div className="mx-auto max-w-4xl p-6">Cargando…</div>
  if (error) return <div className="mx-auto max-w-4xl p-6 text-red-600">{error}</div>
  if (!project) return null

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header del proyecto */}
      <div className="mb-6 flex flex-col md:flex-row items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-xs text-gray-500">
            Creado: {fmt(project.createdAt)} · Última edición: {fmt(project.updatedAt)}
          </p>
          
        </div>

        <div className="flex items-center gap-2 p-5 md:p-0">
          {/* Subir imagen */}
          <label className="cursor-pointer rounded-md border px-3 py-2 text-sm">
            Imagen
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickImage}
            />
          </label>

          {/* Subir PDF */}
          <label className="cursor-pointer rounded-md border px-3 py-2 text-sm">
            PDF
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={onPickPdf}
            />
          </label>

          {/* Exportar CSV (placeholder) */}
          {/* Exportar */}
          <div className="relative">
            <details className="group">
              <summary className="cursor-pointer rounded-md border px-3 py-2 text-sm">
                Exportar
              </summary>
              <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border bg-background p-1 shadow">
                <button
                  type="button"
                  className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-white/10 cursor-pointer"
                  onClick={() => exportAllAssetsVisualWithTables (projectId)}
                >
                  Plano Visual (PDF)
                </button>
                {/* <p className='block w-full rounded px-3 py-2 text-left text-sm hover:bg-white/10'>Elementos Individuales:</p>
                {assets.map(a => (
                  <button
                    key={a.id}
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-white/10"
                    onClick={() => exportAssetVisualWithTables(projectId, a.id)}
                  >
                    - Exportar {a.mime}
                  </button>
                ))} */}
              </div>
            </details>
          </div>

          

          {/* Eliminar proyecto */}
          <button
            className="rounded-md border px-3 py-2 text-sm bg-red-700 text-white"
            onClick={handleDelete}
            title="Eliminar proyecto"
          >
            🗑
          </button>
        </div>
      </div>


      {/* Listas snapshot del proyecto (igual que antes) */}
      {/* ...tu sección de listas tal cual... */}

      {/* Assets del proyecto */}
      <section className="">
        {loadingAssets ? (
          <p className="text-sm text-gray-600">Cargando assets…</p>
        ) : assets.length === 0 ? (
          <p className="text-sm text-gray-600">Aún no has subido imágenes.</p>
        ) : (
          <div className="flex flex-col gap-8">
            {assets.map((a) => {
              if (a.kind === 'image') {
                return (
                  <ImageAssetCard
                    key={a.id}
                    asset={a}
                    projectId={project.id}
                    defaultListId={project.lists[0]?.id}
                    projectLists={project.lists}         // 👈 importante
                    onDelete={() => onDeleteAsset(a.id)}
                  />
                )
              }
              if (a.kind === 'pdf') {
                return (
                  <PdfAssetCard
                    key={a.id}
                    asset={a}
                    projectId={projectId}
                    defaultListId={project.lists[0]?.id}
                    projectLists={project.lists}
                    onDelete={() => onDeleteAsset(a.id)}
                  />
                )
              }

              return (
                <div key={a.id} className="rounded border p-3 text-sm">
                  {a.mime} (no soportado aún)
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

/* =========================================================
   COMPONENTE: ImageAssetCard
   - Aísla hooks por asset (carga puntos, añadir punto)
   - Evita usar hooks dentro del .map() del padre
========================================================= */
function ImageAssetCard({
  asset,
  projectId,
  defaultListId,
  projectLists,
  onDelete,
}: {
  asset: Asset
  projectId: string
  defaultListId?: string
  projectLists: ProjectList[]
  onDelete: () => void
}) {
  const [points, setPoints] = useState<Point[]>([])
  const [activeListId, setActiveListId] = useState<string | undefined>(defaultListId)

  const [entriesUIOpen, setEntriesUIOpen] = useState(false)
  const [entriesPoint, setEntriesPoint] = useState<Point | null>(null)
  const [entriesResetKey, setEntriesResetKey] = useState(0)

  // 1) Solo listas habilitadas (assume enabled === true si viene undefined)
  const enabledLists = useMemo(
    () => projectLists.filter(pl => pl.enabled !== false),
    [projectLists]
  )

  // 2) Listas que verá el modal: habilitadas + la lista del punto (aunque esté archivada)
  const listsForModal = useMemo(() => {
    if (!entriesPoint) return enabledLists
    // Busca por listId (el snapshotId no existe en tu Point)
    const its = projectLists.find(pl => pl.listId === entriesPoint.listId)
    const includeIts = its && !enabledLists.some(pl => pl.id === its.id)
    return includeIts ? [its!, ...enabledLists] : enabledLists
  }, [enabledLists, projectLists, entriesPoint])


  useEffect(() => {
    (async () => setPoints(await getPointsByAsset(asset.id)))()
  }, [asset.id])

  // Si no hay lista activa (o quedó una archivada), usa la primera habilitada
  useEffect(() => {
    if (!activeListId || !enabledLists.some(l => l.id === activeListId)) {
      setActiveListId(enabledLists[0]?.id)
    }
  }, [enabledLists, activeListId])

  const handleAddPointRequest = async ({ x, y }: { x: number; y: number }) => {
    const listId = activeListId ?? enabledLists[0]?.id
    if (!listId) { alert('Selecciona una lista activa'); return }

    const newId = await addPoint({
      projectId,
      assetId: asset.id,
      listId,
      x, y,
      values: {},
    })

    const refreshed = await getPointsByAsset(asset.id)
    setPoints(refreshed)

    const created = refreshed.find(p => p.id === newId)
    if (!created) return

    setEntriesPoint(created)
    setEntriesResetKey(k => k + 1)
    setEntriesUIOpen(true)
  }

  const handleSelectPoint = (p: Point) => {
    setEntriesPoint(p)
    setEntriesResetKey(k => k + 1)
    setEntriesUIOpen(true)
    setActiveListId(prev => prev ?? p.listId) // opcional
  }

  const handleEditFromTable = (p: Point) => handleSelectPoint(p)

  const handleDeletePoint = async (p: Point) => {
    if (!confirm('¿Eliminar este punto?')) return
    await deletePoint(p.id)
    setPoints(await getPointsByAsset(asset.id))
  }

  const url = URL.createObjectURL(asset.blob)

  return (
    <figure className="p-3 max-w-4xl w-full mx-auto">
      <PointCanvas
        assetUrl={url}
        assetId={asset.id}
        points={points}
        onAddPoint={handleAddPointRequest}
        onSelectPoint={handleSelectPoint}
      />

      <figcaption className="mt-2 flex items-center justify-between text-xs text-gray-600">
        <span>
          {asset.mime} · {asset.width}×{asset.height}px · {points.length} punto{points.length !== 1 && 's'}
        </span>
        <button className="rounded-md border px-2 py-1 bg-red-700 text-white" onClick={onDelete}>🗑</button>
      </figcaption>

      <PointsTable
        points={points}
        projectLists={enabledLists} 
        onEdit={handleEditFromTable}
        onDelete={handleDeletePoint}
      />

      {entriesPoint && (
        <PointFormModal
          open={entriesUIOpen}
          onClose={() => { setEntriesUIOpen(false); setEntriesPoint(null) }}
          title="Registros del punto"
          point={entriesPoint}
          projectLists={listsForModal}
          resetKey={entriesResetKey}
          onDeletePoint={async () => {
            await deletePoint(entriesPoint.id)
            setEntriesUIOpen(false)
            setEntriesPoint(null)
            setPoints(await getPointsByAsset(asset.id))
          }}
          onPointUpdated={async () => setPoints(await getPointsByAsset(asset.id))}
        />
      )}
    </figure>
  )
}


/* =========================================================
   COMPONENTE: PdfAssetCard
   - Renderiza miniatura de la 1ª página
========================================================= */
function PdfAssetCard({ asset, projectId, defaultListId, projectLists, onDelete }:{
  asset: Asset; projectId: string; defaultListId?: string; projectLists: ProjectList[]; onDelete: () => void
}) {
  const [points, setPoints] = useState<Point[]>([])
  const [activeListId, setActiveListId] = useState<string | undefined>(defaultListId)
  const [entriesUIOpen, setEntriesUIOpen] = useState(false)
  const [entriesPoint, setEntriesPoint] = useState<Point | null>(null)
  const [entriesResetKey, setEntriesResetKey] = useState(0)

  // 1) Solo listas habilitadas (assume enabled === true si viene undefined)
  const enabledLists = useMemo(
    () => projectLists.filter(pl => pl.enabled !== false),
    [projectLists]
  )

  // 2) Listas que verá el modal: habilitadas + la lista del punto (aunque esté archivada)
  const listsForModal = useMemo(() => {
    if (!entriesPoint) return enabledLists
    // Busca por listId (el snapshotId no existe en tu Point)
    const its = projectLists.find(pl => pl.listId === entriesPoint.listId)
    const includeIts = its && !enabledLists.some(pl => pl.id === its.id)
    return includeIts ? [its!, ...enabledLists] : enabledLists
  }, [enabledLists, projectLists, entriesPoint])


  useEffect(() => { (async () => setPoints(await getPointsByAsset(asset.id)))() }, [asset.id])

  useEffect(() => {
    if (!activeListId || !enabledLists.some(l => l.id === activeListId)) {
      setActiveListId(enabledLists[0]?.id)
    }
  }, [enabledLists, activeListId])

  const { imageUrl, loading, error } = usePdfPreview(asset.blob, 1, 1200)

  const handleAddPointRequest = async ({ x, y }: { x: number; y: number }) => {
    const listId = activeListId ?? enabledLists[0]?.id
    if (!listId) { alert('Selecciona una lista activa primero'); return }

    const newId = await addPoint({
      projectId,
      assetId: asset.id,
      listId,
      x, y,
      values: {},
      // page: 1,
    })

    const refreshed = await getPointsByAsset(asset.id)
    setPoints(refreshed)

    const created = refreshed.find(p => p.id === newId)
    if (!created) return

    setEntriesPoint(created)
    setEntriesResetKey(k => k + 1)
    setEntriesUIOpen(true)
  }

  const handleSelectPoint = (p: Point) => {
    setEntriesPoint(p)
    setEntriesUIOpen(true)
    setEntriesResetKey(k => k + 1)
  }

  const handleDeletePoint = async (p: Point) => {
    if (!confirm('¿Eliminar este punto?')) return
    await deletePoint(p.id)
    setPoints(await getPointsByAsset(asset.id))
  }

  return (
    <figure className="p-3 max-w-4xl w-full mx-auto">
      {loading && <div className="text-sm text-gray-400">Renderizando PDF…</div>}
      {error && <div className="text-sm text-red-500">{error}</div>}
      {imageUrl && (
        <PointCanvas
          assetUrl={imageUrl}
          assetId={asset.id}
          points={points}
          onAddPoint={handleAddPointRequest}
          onSelectPoint={handleSelectPoint}
        />
      )}

      <figcaption className="mt-2 flex items-center justify-between text-xs text-gray-600">
        <span>{asset.mime} · {asset.pageCount ?? 0} pág. · {points.length} punto{points.length !== 1 && 's'}</span>
        <button className="rounded-md border px-2 py-1 bg-red-700 text-white" onClick={onDelete}>🗑</button>
      </figcaption>

      <PointsTable
        points={points}
        projectLists={enabledLists}
        onEdit={handleSelectPoint}
        onDelete={handleDeletePoint}
      />

      {entriesPoint && (
        <PointFormModal
          open={entriesUIOpen}
          onClose={() => { setEntriesUIOpen(false); setEntriesPoint(null) }}
          title="Registros del punto"
          point={entriesPoint}
          projectLists={listsForModal}  
          resetKey={entriesResetKey}
          onDeletePoint={async () => {
            await deletePoint(entriesPoint.id)
            setEntriesUIOpen(false)
            setEntriesPoint(null)
            setPoints(await getPointsByAsset(asset.id))
          }}
          onPointUpdated={async () => setPoints(await getPointsByAsset(asset.id))}
        />
      )}
    </figure>
  )
}

/* =========================================================
   COMPONENTE: PdfThumb (ya lo tenías)
   - Lo dejamos fuera del render principal
   - Usa ensurePdfWorker() y pdfjs-dist con imports dinámicos
========================================================= */
function PdfThumb({ blob, maxWidth = 520 }: { blob: Blob; maxWidth?: number }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let destroyed = false
    ;(async () => {
      try {
        await ensurePdfWorker()
        const { getDocument } = await import('pdfjs-dist')

        const buf = await blob.arrayBuffer()
        const pdf = await (getDocument as any)({ data: buf }).promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 1 })

        const canvas = canvasRef.current
        if (!canvas || destroyed) return

        const containerWidth =
          canvas.parentElement?.clientWidth ?? (viewport.width as number)
        const targetWidth = Math.min(containerWidth, maxWidth)
        const scale = targetWidth / (viewport.width as number)
        const vp = page.getViewport({ scale })

        const ctx = canvas.getContext('2d')
        if (!ctx) return
        canvas.width = vp.width as number
        canvas.height = vp.height as number

        await page.render({
          canvas: canvas as any,
          canvasContext: ctx as any,
          viewport: vp as any,
        } as any).promise
      } catch (e) {
        console.error('PDF preview error', e)
      }
    })()

    return () => {
      destroyed = true
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx?.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
  }, [blob, maxWidth])

  return (
    <canvas
      ref={canvasRef}
      className="mx-auto block w-full h-auto rounded-md shadow-md"
    />
  )
}