'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  getProjectWithLists,
  getAllLists,
  renameProject,
  addListToProject,
  unlinkListFromProject,
  toggleProjectListEnabled,
  reorderProjectLists,
} from '@/lib/db/local'
import type { List, Project, ProjectList } from '@/types/models'

export default function EditProjectPage() {
  const params = useParams<{ id: string }>()
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id
  const router = useRouter()

  const [project, setProject] = useState<Project | null>(null)
  const [pls, setPls] = useState<ProjectList[]>([])
  const [allLists, setAllLists] = useState<List[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingName, setSavingName] = useState(false)
  const [addingId, setAddingId] = useState<string>('')

  const refresh = async () => {
    const [{ project, projectLists }, lists] = await Promise.all([
      getProjectWithLists(projectId),
      getAllLists(),
    ])
    setProject(project ?? null)
    setPls(projectLists.sort((a, b) => a.order - b.order))
    setAllLists(lists)
    setName(project?.name ?? '')
    setLoading(false)
  }

  useEffect(() => { refresh() }, [projectId])

  const attachedListIds = useMemo(() => new Set(pls.map(pl => pl.listId)), [pls])
  const availableLists = useMemo(() => allLists.filter(l => !attachedListIds.has(l.id)), [allLists, attachedListIds])

  const handleSaveName = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === project?.name) return
    setSavingName(true)
    await renameProject(projectId, trimmed)
    setSavingName(false)
    await refresh()
  }

  const handleAddList = async () => {
    if (!addingId) return
    await addListToProject(projectId, addingId)
    setAddingId('')
    await refresh()
  }

  const handleToggle = async (pl: ProjectList) => {
    await toggleProjectListEnabled(pl.id, !pl.enabled)
    await refresh()
  }

  const handleRemove = async (pl: ProjectList) => {
    if (!confirm('¿Quitar esta lista del proyecto? (No borra puntos; solo la deshabilita)')) return
    await unlinkListFromProject(pl.id)
    await refresh()
  }

  // (opcional) reordenar: aquí un “subir/bajar”
  const move = async (plId: string, dir: -1 | 1) => {
    const ordered = [...pls].sort((a,b)=>a.order-b.order)
    const idx = ordered.findIndex(p => p.id === plId)
    const j = idx + dir
    if (j < 0 || j >= ordered.length) return
    ;[ordered[idx], ordered[j]] = [ordered[j], ordered[idx]]
    await reorderProjectLists(projectId, ordered.map(p => p.id))
    await refresh()
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Cargando…</div>

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <button className="text-md font-bold underline cursor-pointer" onClick={() => router.push(`/projects/${projectId}`)}>⭠ Ir al Proyecto</button>

      <h1 className="text-2xl font-semibold">Editar proyecto</h1>

      {/* Nombre */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-medium">Nombre</h2>
        <div className="flex gap-2">
          <input
            className="w-full rounded-md border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSaveName}
          />
          <button
            className="rounded-md border px-3 py-2"
            onClick={handleSaveName}
            disabled={savingName}
          >
            {savingName ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </section>

      {/* Listas incluidas */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-medium">Listas del proyecto</h2>

        {pls.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no has agregado listas.</p>
        ) : (
          <ul className="space-y-2">
            {pls.sort((a,b)=>a.order-b.order).map((pl) => (
              <li key={pl.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-3">
                  <strong className="text-sm">{pl.listName ?? pl.listId}</strong>
                  <span className={`rounded px-2 py-0.5 text-xs ${pl.enabled !== false ? 'bg-emerald-600/20 text-emerald-500' : 'bg-gray-500/20 text-gray-400'}`}>
                    {pl.enabled !== false ? 'Habilitada' : 'Archivada'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => move(pl.id, -1)}>↑</button>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => move(pl.id, +1)}>↓</button>

                  <button
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => handleToggle(pl)}
                    title="Habilitar/archivar"
                  >
                    {pl.enabled !== false ? 'Archivar' : 'Habilitar'}
                  </button>
                  <button
                    className="rounded border border-red-400 px-2 py-1 text-xs text-red-400"
                    onClick={() => handleRemove(pl)}
                    title="Quitar del proyecto (no borra puntos)"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Agregar lista */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            className="rounded-md border px-2 py-2"
            value={addingId}
            onChange={(e) => setAddingId(e.target.value)}
          >
            <option value="">— Seleccionar lista para agregar —</option>
            {availableLists.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <button
            className="rounded-md bg-emerald-600 px-3 py-2 text-white disabled:opacity-60"
            onClick={handleAddList}
            disabled={!addingId}
          >
            Agregar lista
          </button>
        </div>
      </section>
    </div>
  )
}