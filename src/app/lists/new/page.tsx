'use client'

/**
 * ==========================================
 * PANTALLA 1.2 - CREAR NUEVA LISTA
 * ==========================================
 * Este componente permite crear una lista con propiedades
 * personalizadas y, en caso de ser necesario, opciones
 * para campos tipo "select" o "multiselect".
 * 
 * Los datos se almacenan localmente usando IndexedDB
 * (a través de la librería Dexie).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createListWithProperties } from '@/lib/db/local'
import type { DataType } from '@/types/models'

/**
 * Lista de tipos de datos disponibles para las propiedades.
 * Cada tipo define cómo se capturará el valor más adelante
 * (texto, número, fecha o selección múltiple).
 */
const DATA_TYPES: DataType[] = ['text', 'number', 'date', 'select', 'multiselect', 'file']

/**
 * Tipo local utilizado para manejar las propiedades en el formulario
 * antes de ser guardadas en la base de datos.
 */
type UiProperty = {
  key: string              // Identificador temporal usado solo en el frontend
  name: string             // Nombre de la propiedad
  type: DataType           // Tipo de dato (text, number, date, select, multiselect)
  required: boolean        // Indica si el campo será obligatorio
  options: string[]        // Lista de opciones (solo para select/multiselect)
}

/**
 * Función auxiliar que genera una propiedad vacía inicial
 * para mostrar en el formulario de creación.
 */
const emptyProp = (): UiProperty => ({
  key: Math.random().toString(36).slice(2),
  name: '',
  type: 'text',
  required: false,
  options: [],
})

/**
 * ===============================
 * COMPONENTE PRINCIPAL
 * ===============================
 * Representa la página donde el usuario puede:
 *  - Ingresar un nombre para la lista
 *  - Agregar propiedades personalizadas
 *  - Añadir opciones en caso de propiedades de tipo select/multiselect
 */
export default function NewListPage() {
  /**
   * Hook para redirigir después de crear la lista
   */
  const router = useRouter()

  /**
   * Nombre de la lista ingresado por el usuario
   */
  const [name, setName] = useState('')

  /**
   * Lista dinámica de propiedades creadas por el usuario.
   * Se inicializa con una propiedad vacía para mejor UX.
   */
  const [props, setProps] = useState<UiProperty[]>([emptyProp()])

  // -----------------------------------------------
  // 🔧 Funciones para manipular propiedades del formulario
  // -----------------------------------------------

  /**
   * Agrega una nueva fila de propiedad vacía al formulario.
   */
  const addRow = () => setProps((p) => [...p, emptyProp()])

  /**
   * Elimina una fila de propiedad según su "key".
   * Si solo hay una propiedad, no la elimina (por UX).
   */
  const removeRow = (key: string) =>
    setProps((p) => (p.length > 1 ? p.filter((r) => r.key !== key) : p))

  /**
   * Actualiza un campo específico dentro de una propiedad.
   * @param key - identificador local de la propiedad
   * @param patch - objeto parcial con las modificaciones
   */
  const updateRow = (key: string, patch: Partial<UiProperty>) =>
    setProps((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  /**
   * Agrega una nueva opción vacía a una propiedad tipo select/multiselect.
   */
  const addOption = (key: string, value = '') =>
  setProps((rows) =>
    rows.map((r) =>
      r.key === key ? { ...r, options: [...r.options, value] } : r
    )
  )

  /**
   * Actualiza el valor de una opción existente en una propiedad.
   * @param key - id de la propiedad
   * @param idx - índice de la opción dentro del array
   * @param value - nuevo valor para esa opción
   */
  const updateOption = (key: string, idx: number, value: string) =>
    setProps((rows) =>
      rows.map((r) =>
        r.key === key
          ? { ...r, options: r.options.map((v, i) => (i === idx ? value : v)) }
          : r
      )
    )

  /**
   * Elimina una opción de una propiedad tipo select/multiselect.
   */
  const removeOption = (key: string, idx: number) =>
    setProps((rows) =>
      rows.map((r) =>
        r.key === key
          ? { ...r, options: r.options.filter((_, i) => i !== idx) }
          : r
      )
    )

  // -----------------------------------------------
  // 💾 Función principal para validar y guardar la lista
  // -----------------------------------------------

  /**
   * Envía el formulario para crear una nueva lista.
   * Valida todos los campos antes de guardarlos en Dexie.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Limpieza del nombre principal
    const trimmedName = name.trim()
    if (!trimmedName) return alert('Ponle un nombre a la lista')

    // Prepara las propiedades antes de guardar
    const clean = props
      .map((p, i) => ({
        name: p.name.trim(),
        type: p.type,
        required: p.required,
        order: i,
        options:
          p.type === 'select' || p.type === 'multiselect'
            ? p.options
                .map((o, j) => ({ value: o.trim(), order: j }))
                .filter((x) => x.value.length > 0)
            : [],
      }))
      .filter((p) => p.name) // elimina las propiedades sin nombre

    // Validación: debe haber al menos una propiedad
    if (clean.length === 0)
      return alert('Agrega al menos una propiedad con nombre')

    // Validación: los campos select/multiselect necesitan opciones
    for (const p of clean) {
      if (
        (p.type === 'select' || p.type === 'multiselect') &&
        (!p.options || p.options.length === 0)
      ) {
        return alert(`La propiedad "${p.name}" necesita al menos una opción`)
      }
    }

    // Guarda la lista completa en Dexie
    await createListWithProperties({ name: trimmedName, properties: clean })

    // Redirige al usuario al inicio (pantalla principal)
    router.push('/')
  }

  // -----------------------------------------------
  // 🧩 Render principal del formulario
  // -----------------------------------------------
  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Encabezado principal */}
      <h1 className="text-2xl font-semibold">Nueva Lista</h1>

      {/* Formulario principal */}
      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {/* Campo: Nombre de la lista */}
        <div>
          <label className="block text-sm font-medium">Nombre</label>
          <input
            className="mt-1 w-full rounded-md border px-3 py-2"
            placeholder="Supervisión Obra"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* ==== PROPIEDADES ==== */}
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide">Propiedades</h2>
              <button
                type="button"
                onClick={addRow}
                className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                +
              </button>
            </div>

            <div className="space-y-3">
              {props.map((row, idx) => (
                <div
                  key={row.key}
                  className="rounded-xl border border-white/10 bg-background p-3 shadow-sm"
                >
                  {/* ✅ MOBILE + DESKTOP: todos los campos visibles */}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                    {/* Nombre */}
                    <div className="md:col-span-5">
                      <label className="block text-[11px] font-medium text-gray-700">Nombre</label>
                      <input
                        className="mt-1 w-full rounded-md border border-white/10 bg-black/10 px-3 py-2 text-sm outline-none placeholder:text-gray-500 focus:border-emerald-500"
                        placeholder={`Propiedad ${idx + 1}`}
                        value={row.name}
                        onChange={(e) => updateRow(row.key, { name: e.target.value })}
                      />
                    </div>

                    {/* Tipo de dato */}
                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-medium text-gray-700">Tipo de dato</label>
                      <select
                        className="mt-1 w-full rounded-md border border-white/10 bg-black/10 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                        value={row.type}
                        onChange={(e) => updateRow(row.key, { type: e.target.value as DataType })}
                      >
                        {DATA_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    {/* Requerido */}
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-medium text-gray-700">Requerido</label>
                      <label className="mt-[6px] inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-white/20 bg-black/30 text-emerald-500 focus:ring-emerald-500"
                          checked={row.required}
                          onChange={(e) => updateRow(row.key, { required: e.target.checked })}
                        />
                        <span className="text-gray-200">Sí</span>
                      </label>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-end justify-end gap-2 md:col-span-2">
                      <button
                        type="button"
                        className="rounded-md border border-white/10 px-3 py-2 text-sm hover:border-white/30"
                        onClick={() => addRow()}
                        title="Agregar propiedad"
                      >
                        ＋
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-white/10 px-3 py-2 text-sm hover:border-red-400/40"
                        onClick={() => removeRow(row.key)}
                        title="Eliminar propiedad"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* Opciones (solo para select/multiselect) */}
                  {(row.type === 'select' || row.type === 'multiselect') && (
                    <div className="mt-3 border-t border-white/10 pt-3">
                      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                          Opciones
                        </span>

                        {/* Añadir opción rápida */}
                        <div className="flex items-center gap-2">
                          <input
                            id={`quick-opt-${row.key}`}
                            className="w-44 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-gray-500 focus:border-emerald-500"
                            placeholder="Nueva opción…"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const el = e.currentTarget as HTMLInputElement
                                const v = el.value.trim()
                                if (v) { addOption(row.key, v); el.value = '' }   // <-- usar addOption
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="rounded-md border border-white/10 px-3 py-2 text-sm hover:border-white/30"
                            onClick={() => {
                              const el = document.getElementById(`quick-opt-${row.key}`) as HTMLInputElement | null
                              const v = el?.value?.trim()
                              if (v) { addOption(row.key, v); if (el) el.value = '' }   // <-- usar addOption
                            }}
                          >
                            Agregar
                          </button>

                        </div>
                      </div>

                      {/* Chips de opciones + edición inline */}
                      <div className="flex flex-wrap gap-2">
                        {row.options.map((opt, i) => (
                          <div key={i} className="group flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2 py-1">
                            <input
                              className="w-28 bg-transparent px-1 text-sm outline-none"
                              value={opt}
                              onChange={(e) => updateOption(row.key, i, e.target.value)}
                            />
                            <button
                              type="button"
                              className="rounded-full px-2 py-0.5 text-xs text-gray-400 hover:text-red-400"
                              onClick={() => removeOption(row.key, i)}
                              title="Eliminar opción"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>


        {/* Botón final de guardado */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-emerald-500 px-4 py-2 text-white"
          >
            Crear Lista
          </button>
        </div>
      </form>
    </div>
  )
}
