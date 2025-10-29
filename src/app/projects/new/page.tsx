'use client'

/**
 * ==========================================
 * PANTALLA 1.1 — CREAR PROYECTO
 * ==========================================
 * Objetivo:
 *  - Ingresar nombre del proyecto
 *  - Seleccionar una o varias Listas existentes
 *  - Guardar el Proyecto y generar el SNAPSHOT de esas listas
 *
 * Notas:
 *  - Usa Dexie (IndexedDB) vía helpers en src/lib/db/local.ts
 *  - getLists() para mostrar listas disponibles
 *  - createProjectWithLists() para crear proyecto + snapshots
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getLists, createProjectWithLists } from '@/lib/db/local'
import type { List, Property, PropertyOption } from '@/types/models'

/**
 * Tipo auxiliar para el shape que devuelve getLists():
 * List con sus propiedades y opciones resueltas.
 */
type ListWithProps = List & {
  properties: Array<Property & { options: PropertyOption[] }>
}

export default function NewProjectPage() {
  // -----------------------------------------------
  // Estados básicos de formulario y UX
  // -----------------------------------------------

  /**
   * Nombre del proyecto a crear (input controlado).
   */
  const [name, setName] = useState<string>('')

  /**
   * Listas disponibles obtenidas de Dexie.
   */
  const [lists, setLists] = useState<ListWithProps[]>([])

  /**
   * Conjunto (Set) de ids de listas seleccionadas por el usuario.
   * Se usa Set para toggles eficientes sin duplicados.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set())

  /**
   * Estados de UX para carga/guardado/errores.
   */
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Hook de navegación (redirigir tras crear el proyecto).
   */
  const router = useRouter()

  // -----------------------------------------------
  // Cargar Listas existentes al montar la página
  // -----------------------------------------------
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await getLists()
        setLists(data)
      } catch (e: any) {
        console.error(e)
        setError('No se pudieron cargar las listas disponibles')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // -----------------------------------------------
  // Helpers de selección de listas (checkboxes)
  // -----------------------------------------------

  /**
   * Indica si una lista está seleccionada.
   * @param id - List.id
   */
  const isSelected = (id: string) => selected.has(id)

  /**
   * Toggle de selección: agrega o quita el id del Set.
   * @param id - List.id
   */
  const toggleList = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  /**
   * Devuelve un string resumen breve del conteo de propiedades por tipo,
   * útil para mostrarle al usuario la estructura de cada lista.
   */
  const summarizeProps = (props: ListWithProps['properties']) => {
    const counts = props.reduce((acc, p) => {
      acc[p.type] = (acc[p.type] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
    return Object.entries(counts)
      .map(([t, n]) => `${t}: ${n}`)
      .join(' · ')
  }

  // -----------------------------------------------
  // Envío del formulario: crear Proyecto + snapshots
  // -----------------------------------------------

  /**
   * Valida el formulario y crea el proyecto en Dexie.
   * Genera snapshots (ProjectList) a partir de las listas seleccionadas.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validaciones mínimas
    const trimmed = name.trim()
    if (!trimmed) return alert('Ponle un nombre al proyecto')
    if (selected.size === 0) return alert('Selecciona al menos una lista')

    // Crear proyecto con snapshots
    try {
      setSaving(true)
      const listIds = Array.from(selected)
      const projectId = await createProjectWithLists({ name: trimmed, listIds })

      // Redirigir:
      // Si ya tienes /app/projects/[id]/page.tsx, puedes enviar a `/projects/${projectId}`
      // Por ahora redirigimos a Inicio
      router.push(`/projects/${projectId}`)
    } catch (e: any) {
      console.error(e)
      alert('No se pudo crear el proyecto. Revisa la consola.')
    } finally {
      setSaving(false)
    }
  }

  // -----------------------------------------------
  // Render principal
  // -----------------------------------------------
  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Encabezado */}
      <h1 className="text-2xl font-semibold">Nuevo Proyecto</h1>

      {/* Mensajes de estado */}
      {loading && <p className="mt-4 text-sm text-gray-600">Cargando listas…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {/* Formulario principal */}
      {!loading && !error && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-8">
          {/* Campo: Nombre del proyecto */}
          <section>
            <label className="block text-sm font-medium">Nombre del proyecto</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="Mi proyecto de supervisión"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </section>

          {/* Selector de listas disponibles (checkboxes) */}
          <section>
            <div className="mb-2 text-sm font-medium">Selecciona las listas a incluir</div>

            {lists.length === 0 ? (
              <div className="rounded border p-4 text-sm text-gray-600">
                No hay listas disponibles. Crea una desde <span className="font-semibold">“Mis Listas”</span>.
              </div>
            ) : (
              <ul className="space-y-3">
                {lists.map((l) => (
                  <li key={l.id} className="rounded-lg border p-3">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={isSelected(l.id)}
                        onChange={() => toggleList(l.id)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{l.name}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(l.createdAt).toLocaleDateString()}
                          </div>
                        </div>

                        <div className="mt-1 text-xs text-gray-600">
                          {l.properties.length === 0
                            ? '— (sin propiedades)'
                            : summarizeProps(l.properties)}
                        </div>

                        {/* Detalle opcional de propiedades */}
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-gray-700">
                            Ver propiedades
                          </summary>
                          <ul className="mt-2 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                            {l.properties.map((p) => (
                              <li key={p.id} className="rounded border p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="font-medium">
                                    {p.name}{' '}
                                    <span className="ml-1 text-xs text-gray-500">
                                      ({p.type}{p.required ? ', requerido' : ''})
                                    </span>
                                  </div>
                                  {['select', 'multiselect'].includes(p.type) && (
                                    <span className="text-xs text-gray-500">
                                      {p.options.length} opción(es)
                                    </span>
                                  )}
                                </div>

                                {['select', 'multiselect'].includes(p.type) && p.options.length > 0 && (
                                  <ul className="mt-2 list-inside list-disc text-xs text-gray-600">
                                    {p.options.map((o) => (
                                      <li key={o.id}>{o.value}</li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

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
              disabled={saving || lists.length === 0}
              className="rounded-md bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
            >
              {saving ? 'Creando…' : 'Crear Proyecto'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
