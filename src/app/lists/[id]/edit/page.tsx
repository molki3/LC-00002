'use client'

/**
 * ==========================================
 * PANTALLA 1.3 — EDITAR LISTA
 * ==========================================
 * Permite editar una lista existente:
 *  - Cambiar el nombre
 *  - Cambiar/Agregar/Quitar propiedades
 *  - Para select/multiselect, manejar opciones
 *
 * Estrategia de guardado (MVP):
 *  - Reemplazo total de propiedades/opciones
 *    (más simple y segura en local-first)
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  getListById,
  updateListReplacingAll,
} from '@/lib/db/local'
import type { DataType } from '@/types/models'

/** Tipos válidos de propiedades */
const DATA_TYPES: DataType[] = ['text', 'number', 'date', 'select', 'multiselect']

/** Tipo local para manejar propiedades en el formulario */
type UiProperty = {
  key: string         // id temporal solo frontend
  name: string
  type: DataType
  required: boolean
  options: string[]   // solo para select/multiselect
}

/** Crea una propiedad vacía */
const emptyProp = (): UiProperty => ({
  key: Math.random().toString(36).slice(2),
  name: '',
  type: 'text',
  required: false,
  options: [],
})

export default function EditListPage() {
  /** id de la ruta dinámica /lists/[id]/edit */
  const params = useParams<{ id: string }>()
  const listId = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id), [params.id])

  /** Router para redirigir tras guardar */
  const router = useRouter()

  /** Estados del formulario */
  const [name, setName] = useState('')
  const [props, setProps] = useState<UiProperty[]>([emptyProp()])

  /** Estados de UX */
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // -----------------------------------------------
  // Cargar la lista por id al montar
  // -----------------------------------------------
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await getListById(listId)
        if (!data) {
          setError('Lista no encontrada')
          return
        }

        // Rellenar nombre
        setName(data.name)

        // Mapear propiedades BD -> UiProperty formulario
        const uiProps: UiProperty[] = data.properties
          .sort((a, b) => a.order - b.order)
          .map((p) => ({
            key: Math.random().toString(36).slice(2),
            name: p.name,
            type: p.type,
            required: p.required,
            options: ['select', 'multiselect'].includes(p.type)
              ? p.options.sort((x, y) => x.order - y.order).map((o) => o.value)
              : [],
          }))

        setProps(uiProps.length > 0 ? uiProps : [emptyProp()])
      } catch (e: any) {
        console.error(e)
        setError('Error cargando la lista')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [listId])

  // -----------------------------------------------
  // Helpers de formulario (idénticos a “new”)
  // -----------------------------------------------
  const addRow = () => setProps((p) => [...p, emptyProp()])

  const removeRow = (key: string) =>
    setProps((p) => (p.length > 1 ? p.filter((r) => r.key !== key) : p))

  const updateRow = (key: string, patch: Partial<UiProperty>) =>
    setProps((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const addOption = (key: string) =>
    setProps((rows) =>
      rows.map((r) => (r.key === key ? { ...r, options: [...r.options, ''] } : r)),
    )

  const updateOption = (key: string, idx: number, value: string) =>
    setProps((rows) =>
      rows.map((r) =>
        r.key === key
          ? { ...r, options: r.options.map((v, i) => (i === idx ? value : v)) }
          : r,
      ),
    )

  const removeOption = (key: string, idx: number) =>
    setProps((rows) =>
      rows.map((r) =>
        r.key === key ? { ...r, options: r.options.filter((_, i) => i !== idx) } : r,
      ),
    )

  // -----------------------------------------------
  // Guardar cambios (UPDATE replace)
  // -----------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) return alert('Ponle un nombre a la lista')

    // Normalizar propiedades del formulario a FlatPropInput
    const flat = props
      .map((p, i) => ({
        name: p.name.trim(),
        type: p.type,
        required: p.required,
        order: i,
        options:
          p.type === 'select' || p.type === 'multiselect'
            ? p.options.map((o, j) => ({ value: o.trim(), order: j })).filter((x) => x.value.length > 0)
            : [],
      }))
      .filter((p) => p.name)

    if (flat.length === 0) return alert('Agrega al menos una propiedad con nombre')

    for (const p of flat) {
      if ((p.type === 'select' || p.type === 'multiselect') && (!p.options || p.options.length === 0)) {
        return alert(`La propiedad "${p.name}" necesita al menos una opción`)
      }
    }

    try {
      setSaving(true)
      await updateListReplacingAll({
        id: listId,
        name: trimmedName,
        properties: flat,
      })
      router.push('/')
    } catch (e: any) {
      console.error(e)
      alert('No se pudo guardar la lista. Revisa la consola.')
    } finally {
      setSaving(false)
    }
  }

  // -----------------------------------------------
  // Render
  // -----------------------------------------------
  if (loading) {
    return <div className="mx-auto max-w-3xl p-6 text-sm text-gray-600">Cargando…</div>
  }

  if (error) {
    return <div className="mx-auto max-w-3xl p-6 text-sm text-red-600">{error}</div>
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Encabezado */}
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Editar Lista</h1>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="mt-4 space-y-6">
        {/* Campo: Nombre */}
        <div>
          <label className="block text-sm font-medium">Nombre</label>
          <input
            className="mt-1 w-full rounded-md border px-3 py-2"
            placeholder="Nombre de la lista"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Campo: Propiedades */}
        <div>
          <div className="mb-2 text-sm font-medium">Propiedades</div>

          <div className="space-y-4">
            {props.map((row, idx) => (
              <div
                key={row.key}
                className="grid grid-cols-12 items-start gap-3 rounded-lg border p-3"
              >
                {/* Nombre de la propiedad */}
                <div className="col-span-4">
                  <label className="block text-xs font-medium">Nombre</label>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    placeholder={`Propiedad ${idx + 1}`}
                    value={row.name}
                    onChange={(e) => updateRow(row.key, { name: e.target.value })}
                  />
                </div>

                {/* Tipo de dato */}
                <div className="col-span-3">
                  <label className="block text-xs font-medium">Tipo de datos</label>
                  <select
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    value={row.type}
                    onChange={(e) =>
                      updateRow(row.key, { type: e.target.value as DataType })
                    }
                  >
                    {DATA_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Checkbox: requerido */}
                <div className="col-span-2 flex items-end">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.required}
                      onChange={(e) => updateRow(row.key, { required: e.target.checked })}
                    />
                    Requerido
                  </label>
                </div>

                {/* Botones de agregar/eliminar propiedad */}
                <div className="col-span-2 flex items-end justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border px-3 py-2 text-sm"
                    onClick={() => addRow()}
                    title="Agregar propiedad"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="rounded-md border px-3 py-2 text-sm"
                    onClick={() => removeRow(row.key)}
                    title="Eliminar propiedad"
                  >
                    🗑
                  </button>
                </div>

                {/* Opciones si es select/multiselect */}
                {(row.type === 'select' || row.type === 'multiselect') && (
                  <div className="col-span-12">
                    <div className="text-xs font-medium">Opciones</div>
                    <div className="mt-2 space-y-2">
                      {row.options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            className="w-full rounded-md border px-3 py-2"
                            placeholder={`Opción ${i + 1}`}
                            value={opt}
                            onChange={(e) => updateOption(row.key, i, e.target.value)}
                          />
                          <button
                            type="button"
                            className="rounded-md border px-2 py-2 text-sm"
                            onClick={() => removeOption(row.key, i)}
                          >
                            🗑
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="rounded-md border px-3 py-2 text-sm"
                        onClick={() => addOption(row.key)}
                      >
                        Agregar opción
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md border px-4 py-2"
            onClick={() => router.push('/')}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}