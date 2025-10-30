'use client'

import React from 'react'
import type { Point, ProjectList, SnapshotProperty } from '@/types/models'

/**
 * Renderiza una tabla simple con los puntos de un asset.
 * - Muestra fecha y un resumen de valores
 * - Permite editar y eliminar
 */

type Props = {
  points: Point[]
  // Snapshot usados para rotular los valores (nombre de la propiedad)
  projectLists: ProjectList[]
  onEdit: (p: Point) => void
  onDelete: (p: Point) => void
}

export default function PointsTable({ points, projectLists, onEdit, onDelete }: Props) {
  // Mapa rápido: listId -> { propId -> SnapshotProperty }
  // const propMapByList: Record<string, Record<string, SnapshotProperty>> = React.useMemo(() => {
  //   const out: Record<string, Record<string, SnapshotProperty>> = {}
  //   for (const pl of projectLists) {
  //     out[pl.id] = {}
  //     for (const sp of pl.properties) out[pl.id][sp.id] = sp
  //   }
  //   return out
  // }, [projectLists])

  if (points.length === 0) {
    return <p className="mt-3 text-xs text-gray-500">No hay puntos.</p>
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-background text-gray-700">
          <tr>
            <th className="px-3 py-2 text-left">Fecha</th>
            <th className="px-3 py-2 text-left">Nombre</th>
            <th className="px-3 py-2 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {points
            .slice()
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
            .map((p) => {
              const name =
                p.name
              return (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2 text-xs text-gray-400">
                    {new Date(p.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{name}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded-md border px-2 py-1 text-xs"
                        onClick={() => onEdit(p)}
                        title="Editar"
                      >
                        👁️✏️
                      </button>
                      <button
                        className="rounded-md border px-2 py-1 text-xs bg-red-700 text-white"
                        onClick={() => onDelete(p)}
                        title="Eliminar"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}