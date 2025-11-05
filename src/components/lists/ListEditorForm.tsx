'use client'
import { useState, useEffect } from 'react'
import type { DataType } from '@/types/models'

export type UiProperty = {
  key: string
  name: string
  type: DataType
  required: boolean
  options: string[]
}

const DATA_TYPES: DataType[] = ['text','number','date','select','multiselect','file']

export default function ListEditorForm({
  initialName = '',
  initialProps = [{ key: crypto.randomUUID(), name: '', type: 'text' as DataType, required: false, options: [] }],
  submitLabel = 'Guardar',
  onSubmit,
}: {
  initialName?: string
  initialProps?: UiProperty[]
  submitLabel?: string
  onSubmit: (payload: { name: string; props: UiProperty[] }) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [props, setProps] = useState<UiProperty[]>(initialProps)

  useEffect(() => { setName(initialName) }, [initialName])
  useEffect(() => { setProps(initialProps) }, [initialProps])

  const addRow = () => setProps(p => [...p, { key: crypto.randomUUID(), name:'', type:'text', required:false, options:[] }])
  const removeRow = (key: string) => setProps(p => p.length>1 ? p.filter(r=>r.key!==key) : p)
  const updateRow = (key: string, patch: Partial<UiProperty>) =>
    setProps(rows => rows.map(r => r.key === key ? { ...r, ...patch } : r))

  const addOption = (key: string) =>
    setProps(rows => rows.map(r => r.key===key ? { ...r, options:[...r.options, ''] } : r))
  const updateOption = (key: string, idx: number, value: string) =>
    setProps(rows => rows.map(r => r.key===key ? { ...r, options:r.options.map((v,i)=> i===idx? value : v) } : r))
  const removeOption = (key: string, idx: number) =>
    setProps(rows => rows.map(r => r.key===key ? { ...r, options:r.options.filter((_,i)=> i!==idx) } : r))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return alert('Ponle un nombre a la lista')
    const clean = props
      .map((p,i) => ({
        ...p,
        name: p.name.trim(),
        order: i,
        options: (p.type==='select'||p.type==='multiselect')
          ? p.options.map((o,j)=>o.trim()).filter(Boolean)
          : [],
      }))
    await onSubmit({ name: trimmed, props: clean })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      <div>
        <label className="block text-sm font-medium">Nombre</label>
        <input
          className="mt-1 w-full rounded-md border px-3 py-2"
          placeholder="Nombre de la lista"
          value={name}
          onChange={(e)=>setName(e.target.value)}
        />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide">Propiedades</h2>
          <button type="button" onClick={addRow} className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">+</button>
        </div>

        <div className="space-y-3">
          {props.map((row, idx) => (
            <div key={row.key} className="rounded-xl border p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                <div className="md:col-span-5">
                  <label className="block text-[11px] font-medium">Nombre</label>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder={`Propiedad ${idx + 1}`}
                    value={row.name}
                    onChange={(e)=>updateRow(row.key,{ name:e.target.value })}
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-medium">Tipo de dato</label>
                  <select
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={row.type}
                    onChange={(e)=>updateRow(row.key,{ type:e.target.value as DataType })}
                  >
                    {DATA_TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-medium">Requerido</label>
                  <label className="mt-[6px] inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={row.required} onChange={(e)=>updateRow(row.key,{ required:e.target.checked })}/>
                    <span>Sí</span>
                  </label>
                </div>
                <div className="flex items-end justify-end gap-2 md:col-span-2">
                  <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={addRow}>＋</button>
                  <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={()=>removeRow(row.key)}>🗑</button>
                </div>
              </div>

              {(row.type==='select' || row.type==='multiselect') && (
                <div className="mt-3 border-t pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Opciones</span>
                    <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={()=>addOption(row.key)}>+ Opción</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.options.map((opt,i)=>(
                      <div key={i} className="group flex items-center gap-1 rounded-full border px-2 py-1">
                        <input
                          className="w-28 bg-transparent px-1 text-sm outline-none"
                          value={opt}
                          onChange={(e)=>updateOption(row.key,i,e.target.value)}
                        />
                        <button type="button" className="rounded-full px-2 py-0.5 text-xs text-gray-400 hover:text-red-400" onClick={()=>removeOption(row.key,i)}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-white">{submitLabel}</button>
      </div>
    </form>
  )
}