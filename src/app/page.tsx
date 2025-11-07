'use client'

/**
 * ==========================================
 * PANTALLA 1 — INICIO
 * ==========================================
 * Muestra dos secciones:
 *  - Proyectos: crear, abrir, eliminar
 *  - Listas: crear, ver, eliminar
 *
 * Lee desde Dexie usando helpers de src/lib/db/local.ts
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getProjects,
  deleteProject,
  getLists,
  deleteList,
} from '@/lib/db/local'
import type { Project, List, Property, PropertyOption } from '@/types/models'

/** Shape enriquecido que devuelve getLists() */
type ListWithProps = List & {
  properties: Array<Property & { options: PropertyOption[] }>
}

export default function HomePage() {
  // --------------------------
  // Estado: Proyectos
  // --------------------------
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)

  // --------------------------
  // Estado: Listas
  // --------------------------
  const [lists, setLists] = useState<ListWithProps[]>([])
  const [loadingLists, setLoadingLists] = useState(true)

  // --------------------------
  // Errores simples de UX
  // --------------------------
  const [error, setError] = useState<string | null>(null)

  // --------------------------
  // Cargar proyectos y listas al montar
  // --------------------------
  useEffect(() => {
    const loadAll = async () => {
      try {
        setError(null)
        setLoadingProjects(true)
        setLoadingLists(true)

        const [p, l] = await Promise.all([getProjects(), getLists()])
        setProjects(p)
        setLists(l)
      } catch (e: any) {
        console.error(e)
        setError('No se pudieron cargar los datos de inicio')
      } finally {
        setLoadingProjects(false)
        setLoadingLists(false)
      }
    }
    loadAll()
  }, [])

  // --------------------------
  // Acciones: eliminar
  // --------------------------
  const onDeleteProject = async (id: string) => {
    const ok = confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')
    if (!ok) return
    await deleteProject(id)
    setProjects((prev) => prev.filter((p) => p.id !== id))
  }

  const onDeleteList = async (id: string) => {
    const ok = confirm('¿Eliminar esta lista? Esta acción no se puede deshacer.')
    if (!ok) return
    await deleteList(id)
    setLists((prev) => prev.filter((l) => l.id !== id))
  }

  // --------------------------
  // Helper visual para listas
  // --------------------------
  const summarizeProps = (props: ListWithProps['properties']) => {
    const counts = props.reduce(
      (acc, p) => {
        acc[p.type] = (acc[p.type] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
    return Object.entries(counts)
      .map(([t, n]) => `${t}: ${n}`)
      .join(' · ')
  }

  // --------------------------
  // Render
  // --------------------------
  return (
    <div className="mx-auto max-w-6xl p-6 space-y-10">
      {/* Título global */}
      <h1 className="text-2xl font-semibold"></h1>

      {/* ---------------- Proyectos ---------------- */}
      <section>
        {/* Header de sección + CTA */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl font-medium">Proyectos</h2>
          <Link
            href="/projects/new"
            className="rounded-md bg-emerald-500 px-4 py-2 text-white"
          >
            +
          </Link>
        </div>

        {/* Estados de carga / error */}
        {loadingProjects && (
          <p className="text-sm text-gray-600">Cargando proyectos…</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Grid de proyectos */}
        {!loadingProjects && projects.length === 0 ? (
          <div className="rounded border p-4 text-sm text-gray-600">
            Aún no tienes proyectos. Crea el primero con
            <span className="mx-1 font-semibold">+</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {projects.map((p) => (
              <article key={p.id} className="rounded-lg border p-4 shadow-sm">
                <header className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-medium">{p.name}</h3>
                    <p className="text-xs text-gray-500">
                      Creado: {new Date(p.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/projects/${p.id}`}
                      className="rounded-md border px-3 py-1.5 text-sm"
                      title="Abrir"
                    >
                      Abrir
                    </Link>
                    <Link
                      href={`/projects/${p.id}/edit`}
                      className="rounded-md border px-3 py-1 text-sm"
                      title="Editar proyecto"
                    >
                      Editar
                    </Link>
                    <button
                      onClick={() => onDeleteProject(p.id)}
                      className="rounded-md border px-3 py-1.5 text-sm bg-red-700 text-white"
                      title="Eliminar"
                    >
                      🗑
                    </button>
                  </div>
                </header>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Listas ---------------- */}
      <section>
        {/* Header de sección + CTA */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl font-medium">Mis Listas</h2>
          <Link
            href="/lists/new"
            className="rounded-md bg-emerald-500 px-4 py-2 text-white"
          >
            +
          </Link>
          
        </div>

        {/* Estados de carga / error */}
        {loadingLists && <p className="text-sm text-gray-600">Cargando listas…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Grid de listas */}
        {!loadingLists && lists.length === 0 ? (
          <div className="rounded border p-4 text-sm text-gray-600">
            Aún no tienes listas. Crea una desde el botón
            <span className="mx-1 font-semibold">“+ Nueva Lista”</span>.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {lists.map((list) => (
              <article key={list.id} className="rounded-lg border p-4 shadow-sm">
                <header className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-medium">{list.name}</h3>
                    <p className="text-xs text-gray-500">
                      Creada: {new Date(list.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onDeleteList(list.id)}
                      className="rounded-md border px-3 py-1.5 text-sm bg-red-700 text-white"
                      title="Eliminar lista"
                    >
                      🗑
                    </button>
                    <li key={list.id} className="flex items-center justify-between rounded">
                      <Link
                        href={`/lists/${list.id}/edit`}
                        className="rounded-md border px-3 py-1 text-sm"
                      >
                        Editar
                      </Link>
                    </li>
                  </div>
                </header>

                <div className="rounded-md bg-gray-50 p-3 text-sm">
                  <div className="mb-2 font-medium">Propiedades</div>
                  <div className="text-gray-700">
                    {list.properties.length === 0
                      ? '— (sin propiedades)'
                      : summarizeProps(list.properties)}
                  </div>
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-gray-700">
                    Ver propiedades
                  </summary>
                  <ul className="mt-2 space-y-2 text-sm">
                    {list.properties.map((p) => (
                      <li key={p.id} className="rounded border p-2">
                        <div className="flex items-center justify-between">
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
                        {['select', 'multiselect'].includes(p.type) &&
                          p.options.length > 0 && (
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
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}