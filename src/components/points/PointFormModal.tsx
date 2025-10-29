'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/ui/Modal'
import type { SnapshotProperty, Point, ProjectList, PointEntry } from '@/types/models'
import {
  getEntriesByPoint, addPointEntry, updatePointEntry, deletePointEntry, updatePointName
} from '@/lib/db/local'

export type PointValues = Record<string, string | number | string[]>

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  point: Point
  projectLists: ProjectList[]          // 👈 listas disponibles del proyecto
  resetKey?: string | number
  onDeletePoint?: () => Promise<void>  // 👈 callback para borrar el punto
  onPointUpdated?: (id: string) => void
}

export default function PointFormModal({
  open, onClose, title = 'Registros del punto', point, projectLists, resetKey, onDeletePoint, onPointUpdated
}: Props) {
  const [entries, setEntries] = useState<PointEntry[]>([])
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [editing, setEditing] = useState<PointEntry | null>(null)
  const empty = useMemo<PointValues>(() => ({}), [])
  const [values, setValues] = useState<PointValues>(empty)
  const [pointName, setPointName] = useState(point.name ?? '')
  const [savingName, setSavingName] = useState(false)

  // Lista elegida para el registro actual
  const [selectedListId, setSelectedListId] = useState<string>(() =>
    point.listId || projectLists[0]?.id || ''
  )

  // Propiedades de la lista seleccionada
  const selectedProps: SnapshotProperty[] =
    projectLists.find(pl => pl.id === selectedListId)?.properties ?? []

  // Cargar entries
  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      const list = await getEntriesByPoint(point.id)
      if (alive) setEntries(list)
    })()
    return () => { alive = false }
  }, [open, point.id, resetKey])

  // Reset editor cuando cambia modo/entry
  useEffect(() => {
    if (mode === 'edit' && editing) {
      setValues({ ...editing.values })
      setSelectedListId(editing.listId) // 👈 respeta la lista del entry
    } else {
      setValues({})
      // por defecto: la del punto o la primera del proyecto
      setSelectedListId(point.listId || projectLists[0]?.id || '')
    }
  }, [mode, editing, point.listId, projectLists])

  useEffect(() => {
    if (open) setPointName(point.name ?? '')
  }, [open, point.id, point.name])

  // 🔹 guarda automáticamente el nombre al salir del input o presionar Enter
  const handleSaveName = async () => {
    const trimmed = pointName.trim()
    if (!trimmed || trimmed === point.name) return
    setSavingName(true)
    await updatePointName(point.id, trimmed)
    setSavingName(false)

    // 👇 notifica al padre que este punto cambió
    onPointUpdated?.(point.id)
  }


  const setValue = (k: string, v: any) => setValues(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedListId) { alert('Selecciona una lista'); return }
    if (mode === 'create') {
      await addPointEntry(point.id, selectedListId, values)
    } else if (editing) {
      await updatePointEntry(editing.id, { values, listId: selectedListId })
    }
    setEntries(await getEntriesByPoint(point.id))
    setMode('create'); setEditing(null); setValues({})
  }

  const handleDeleteEntry = async (entry: PointEntry) => {
    if (!confirm('¿Eliminar este registro?')) return
    await deletePointEntry(entry.id)
    setEntries(await getEntriesByPoint(point.id))
    if (editing?.id === entry.id) { setMode('create'); setEditing(null); setValues({}) }
  }

  const summarize = (vals: PointValues, listId: string) => {
    const props = projectLists.find(pl => pl.id === listId)?.properties ?? []
    const nameById: Record<string, string> = {}
    props.forEach(p => { nameById[p.id] = p.name })
    const parts: string[] = []
    for (const [pid, v] of Object.entries(vals)) {
      const name = nameById[pid] ?? pid
      parts.push(`${name}: ${Array.isArray(v) ? v.join(', ') : String(v ?? '')}`)
    }
    return parts.join(' · ') || '(sin valores)'
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {/* ======================= NOMBRE DEL PUNTO ======================= */}
      <div className="mb-3">
        <label className="block text-md font-bold mb-1">Nombre del punto</label>
        <input
          type="text"
          value={pointName}
          onChange={(e) => setPointName(e.target.value)}
          onBlur={handleSaveName}          // 🔸 guarda al salir
          onKeyDown={(e) => e.key === 'Enter' && handleSaveName()} // 🔸 guarda con Enter
          className={`w-full rounded-md border px-3 py-2 bg-background ${
            savingName ? 'opacity-50' : ''
          }`}
          placeholder="Ej. Poste semáforo, entrada norte, etc."
          disabled={savingName}
        />
        {savingName && (
          <p className="mt-1 text-xs text-green-400">Guardando...</p>
        )}
      </div>
      {/* Lista de registros */}
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-md font-bold">Registros</h4>
        <div className="flex gap-2">
          {onDeletePoint && (
            <button
              className="rounded-md border border-red-400 px-3 py-1 text-sm text-red-400"
              onClick={async () => { if (confirm('¿Eliminar este punto y sus registros?')) await onDeletePoint() }}
              title="Eliminar punto"
            >
              Eliminar punto
            </button>
          )}
          <button
            className="rounded-md border px-3 py-1 text-sm"
            onClick={() => { setMode('create'); setEditing(null); setValues({}) }}
          >
            + Nuevo
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-gray-400">Sin registros todavía.</p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-auto pr-1">
          {entries.map(e => (
            <li key={e.id} className="rounded border p-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  {new Date(e.createdAt).toLocaleString()} ·
                  {' '}
                  {projectLists.find(pl => pl.id === e.listId)?.listName ?? e.listId}
                </div>
                <div className="flex gap-2">
                  <button className="rounded-md border px-2 py-1 text-xs"
                          onClick={() => { setMode('edit'); setEditing(e) }}>✏️</button>
                  <button className="rounded-md border px-2 py-1 text-xs"
                          onClick={() => handleDeleteEntry(e)}>🗑</button>
                </div>
              </div>
              <div className="mt-1 text-sm">{summarize(e.values, e.listId)}</div>
            </li>
          ))}
        </ul>
      )}

      {/* Editor */}
      <div className="mt-4 border-t pt-4">
        <h4 className="mb-2 text-md font-bold">
          {mode === 'edit' ? 'Editar registro' : 'Nuevo registro'}
        </h4>

        {/* Selección de lista para el registro */}
        <div className="mb-3">
          <label className="block text-sm">Lista del registro *</label>
          <select
            className="mt-1 w-full rounded-md border bg-background px-3 py-2"
            value={selectedListId}
            onChange={(e) => setSelectedListId(e.target.value)}
            required
          >
            {projectLists.map(pl => (
              <option key={pl.id} value={pl.id}>{pl.listName}</option>
            ))}
          </select>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {selectedProps
            .slice().sort((a,b)=>a.order-b.order)
            .map(p => {
              const id = p.id
              const label = `${p.name}${p.required ? ' *' : ''}`
              const current = values[id]

              if (p.type === 'text')
                return (
                  <div key={id}>
                    <label className="block text-sm">{label}</label>
                    <input className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                      value={(current as string) ?? ''}
                      onChange={(e)=>setValue(id, e.target.value)} required={p.required}/>
                  </div>
                )

              if (p.type === 'number')
                return (
                  <div key={id}>
                    <label className="block text-sm">{label}</label>
                    <input type="number" className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                      value={typeof current==='number'||typeof current==='string' ? current as any : ''}
                      onChange={(e)=>setValue(id, e.target.value===''?'':Number(e.target.value))}
                      required={p.required}/>
                  </div>
                )

              if (p.type === 'date')
                return (
                  <div key={id}>
                    <label className="block text-sm">{label}</label>
                    <input type="date" className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                      value={(current as string) ?? ''}
                      onChange={(e)=>setValue(id, e.target.value)} required={p.required}/>
                  </div>
                )

              if (p.type === 'select')
                return (
                  <div key={id}>
                    <label className="block text-sm">{label}</label>
                    <select className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                      value={(current as string) ?? ''} onChange={(e)=>setValue(id, e.target.value)}
                      required={p.required}>
                      <option value="">—</option>
                      {(p.options ?? []).slice().sort((a,b)=>a.order-b.order).map(o=>(
                        <option key={o.id} value={o.value}>{o.value}</option>
                      ))}
                    </select>
                  </div>
                )

              if (p.type === 'multiselect') {
                const arr = Array.isArray(current) ? (current as string[]) : []
                return (
                  <div key={id}>
                    <label className="block text-sm">{label}</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(p.options ?? []).slice().sort((a,b)=>a.order-b.order).map(o=>{
                        const checked = arr.includes(o.value)
                        const toggle = () => setValue(id, checked ? arr.filter(v=>v!==o.value) : [...arr, o.value])
                        return (
                          <label key={o.id} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={checked} onChange={toggle}/>
                            <span>{o.value}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              }

              return <div key={id} className="text-sm text-amber-400">Tipo no soportado: {p.type}</div>
            })}

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="rounded-md border px-4 py-2" onClick={onClose}>Cerrar</button>
            <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-white">
              {mode === 'edit' ? 'Guardar cambios' : 'Guardar registro'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
