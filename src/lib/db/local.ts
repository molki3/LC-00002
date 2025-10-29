// =========================================================
// Archivo: src/lib/db/local.ts
// Descripción:
//  Módulo de base de datos local usando Dexie.js (IndexedDB)
//  Administra:
//   - Listas, Propiedades y Opciones (pantallas 1, 1.2, 1.3)
//   - Proyectos y el snapshot de Listas dentro del Proyecto (1.1)
// =========================================================

import Dexie, { Table } from 'dexie'
import type {
  List,
  Property,
  PropertyOption,
  Project,
  ProjectList,
  SnapshotProperty,
  SnapshotOption,
  ID,
  ISODate,
  Asset,
  Point,
  PointEntry
} from '@/types/models'
import { ensurePdfWorker } from '@/lib/pdf'

// ---------------------------------------------------------
// Clase principal de la base de datos local
// ---------------------------------------------------------
export class LocalDB extends Dexie {
  // Listas
  lists!: Table<List, string>
  properties!: Table<Property, string>
  options!: Table<PropertyOption, string>

  // Proyectos
  projects!: Table<Project, string>
  projectLists!: Table<ProjectList, string> // contiene el snapshot de propiedades

  // Assets
  assets!: Table<Asset, string>

  // Points
  points!: Table<Point, string>

  pointEntries!: Table<PointEntry, string>

  constructor() {
    super('ixpin_local')

    // 🔁 IMPORTANTE: Al agregar nuevas tablas, subimos la versión
    // v1: listas/properties/options
    this.version(1).stores({
      lists: 'id, name, createdAt',
      properties: 'id, listId, name, type, order',
      options: 'id, propertyId, value, order',
    })

    // v2: proyectos/projectLists
    this.version(2).stores({
      projects: 'id, name, createdAt',
      projectLists: 'id, projectId, listId, order',
    })

    // v3: assets (blob)
    this.version(3).stores({
      assets: 'id, projectId, kind, createdAt'
    })
  }
}

// Instancia global
export const db = new LocalDB()

// ---------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------
const nowISO = () => new Date().toISOString()
const now = (): ISODate => new Date().toISOString()

/** Id único (UUID si disponible, sino random string) */
const rid = (): ID =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

// ---------------------------------------------------------
// Tipos de entrada (Listas)
// ---------------------------------------------------------

/** Propiedad “plana” para crear/actualizar listas */
type FlatPropInput = {
  id?: string
  name: string
  type: Property['type']
  required: boolean
  order: number
  options?: Array<{ id?: string; value: string; order?: number }>
}

/** Entrada para crear lista */
export type CreateListInput = {
  name: string
  properties: FlatPropInput[]
}

/** Entrada para actualizar lista */
export type UpdateListInput = {
  id: string
  name: string
  properties: FlatPropInput[]
}

// ---------------------------------------------------------
// CREATE — Lista con propiedades y opciones
// ---------------------------------------------------------
export async function createListWithProperties(input: CreateListInput): Promise<string> {
  const id = rid()

  const list: List = {
    id,
    name: input.name.trim(),
    createdAt: now(),
    updatedAt: now(),
  }

  await db.transaction('rw', db.lists, db.properties, db.options, async () => {
    await db.lists.add(list)

    for (const p of input.properties) {
      const propId = rid()
      const property: Property = {
        id: propId,
        listId: id,
        name: p.name.trim(),
        type: p.type,
        required: p.required,
        order: p.order,
      }
      await db.properties.add(property)

      if (p.options?.length) {
        let idx = 0
        for (const val of p.options) {
          const opt: PropertyOption = {
            id: rid(),
            propertyId: propId,
            value: val.value.trim(),
            order: val.order ?? idx++,
          }
          await db.options.add(opt)
        }
      }
    }
  })

  return id
}

// ---------------------------------------------------------
// READ — Todas las listas (con propiedades y opciones)
// ---------------------------------------------------------
export async function getLists(): Promise<
  Array<List & { properties: Array<Property & { options: PropertyOption[] }> }>
> {
  const lists = await db.lists.toArray()
  const results: Array<List & { properties: Array<Property & { options: PropertyOption[] }> }> = []

  for (const l of lists) {
    const props = await db.properties.where('listId').equals(l.id).sortBy('order')
    const propsWithOpts: Array<Property & { options: PropertyOption[] }> = []
    for (const p of props) {
      const opts = await db.options.where('propertyId').equals(p.id).sortBy('order')
      propsWithOpts.push({ ...p, options: opts })
    }
    results.push({ ...l, properties: propsWithOpts })
  }

  return results
}

// ---------------------------------------------------------
// READ — Lista por id (con propiedades y opciones)
// ---------------------------------------------------------
export async function getListById(listId: string): Promise<
  (List & { properties: Array<Property & { options: PropertyOption[] }> }) | null
> {
  const l = await db.lists.get(listId)
  if (!l) return null

  const props = await db.properties.where('listId').equals(listId).sortBy('order')
  const propsWithOpts: Array<Property & { options: PropertyOption[] }> = []
  for (const p of props) {
    const opts = await db.options.where('propertyId').equals(p.id).sortBy('order')
    propsWithOpts.push({ ...p, options: opts })
  }

  return { ...l, properties: propsWithOpts }
}

// ---------------------------------------------------------
// UPDATE — Reemplazar completamente propiedades/opciones de una lista
// ---------------------------------------------------------
export async function updateListReplacingAll(input: UpdateListInput): Promise<void> {
  await db.transaction('rw', db.lists, db.properties, db.options, async () => {
    const existing = await db.lists.get(input.id)
    if (!existing) throw new Error('Lista no encontrada')

    await db.lists.update(input.id, {
      name: input.name.trim(),
      updatedAt: now(),
    })

    const currentProps = await db.properties.where('listId').equals(input.id).toArray()
    const propIds = currentProps.map((p) => p.id)
    await db.options.where('propertyId').anyOf(propIds).delete()
    await db.properties.where('listId').equals(input.id).delete()

    for (const p of input.properties) {
      const propId = rid()
      const property: Property = {
        id: propId,
        listId: input.id,
        name: p.name.trim(),
        type: p.type,
        required: p.required,
        order: p.order,
      }
      await db.properties.add(property)

      if (p.options?.length) {
        let idx = 0
        for (const val of p.options) {
          const opt: PropertyOption = {
            id: rid(),
            propertyId: propId,
            value: val.value.trim(),
            order: val.order ?? idx++,
          }
          await db.options.add(opt)
        }
      }
    }
  })
}

// ---------------------------------------------------------
// DELETE — Lista con propiedades y opciones
// ---------------------------------------------------------
export async function deleteList(listId: string) {
  await db.transaction('rw', db.lists, db.properties, db.options, async () => {
    const props = await db.properties.where('listId').equals(listId).toArray()
    const propIds = props.map((p) => p.id)
    await db.options.where('propertyId').anyOf(propIds).delete()
    await db.properties.where('listId').equals(listId).delete()
    await db.lists.delete(listId)
  })
}

// =========================================================
// PROYECTOS (1.1) — Crear proyecto y snapshot de listas
// =========================================================

/** Entrada para crear un proyecto con selección de listas */
export type CreateProjectInput = {
  name: string
  listIds: string[] // ids de List ya existentes
}

/**
 * Crea un Project y, por cada lista seleccionada, genera un ProjectList
 * con un SNAPSHOT inmutable de sus propiedades/opciones.
 * Devuelve el id del proyecto creado.
 */
export async function createProjectWithLists(input: CreateProjectInput): Promise<string> {
  const projectId = rid()

  const project: Project = {
    id: projectId,
    name: input.name.trim(),
    createdAt: now(),
    updatedAt: now(),
  }

  await db.transaction('rw', [db.projects, db.projectLists, db.lists, db.properties, db.options], async () => {
    // 1) Guardar el proyecto
    await db.projects.add(project)

    // 2) Para cada lista seleccionada, construir snapshot y guardar ProjectList
    let order = 0
    for (const listId of input.listIds) {
      const baseList = await db.lists.get(listId)
      if (!baseList) continue // si la lista no existe, la saltamos

      const props = await db.properties.where('listId').equals(listId).sortBy('order')
      const snapshotProps: SnapshotProperty[] = []

      for (const p of props) {
        const opts = await db.options.where('propertyId').equals(p.id).sortBy('order')
        const snapOpts: SnapshotOption[] | undefined =
          (p.type === 'select' || p.type === 'multiselect')
            ? opts.map((o) => ({ id: o.id, value: o.value, order: o.order }))
            : undefined

        snapshotProps.push({
          id: p.id, // preservamos el id de la propiedad original para referenciarlo en PointValue
          name: p.name,
          type: p.type,
          required: p.required,
          order: p.order,
          options: snapOpts,
        })
      }

      const pl: ProjectList = {
        id: rid(),
        projectId,
        listId: baseList.id,
        listName: baseList.name,
        properties: snapshotProps.sort((a, b) => a.order - b.order),
        order: order++,
      }

      await db.projectLists.add({
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        projectId,
        listId: baseList.id,
        listName: baseList.name,
        properties: snapshotProps.sort((a, b) => a.order - b.order),
        order: order++,
      })
    }
  })

  return projectId
}

/**
 * Devuelve todos los proyectos.
 * (Para UI: opcionalmente podrías incluir el conteo de listas snapshot)
 */
export async function getProjects(): Promise<Project[]> {
  return db.projects.orderBy('createdAt').reverse().toArray()
}

/**
 * Devuelve un proyecto por id con sus ProjectList (snapshot de listas).
 */
export async function getProjectById(projectId: string): Promise<
  (Project & { lists: ProjectList[] }) | null
> {
  const project = await db.projects.get(projectId)
  if (!project) return null

  const lists = await db.projectLists.where('projectId').equals(projectId).sortBy('order')
  return { ...project, lists }
}

/**
 * Elimina un proyecto y sus snapshots de listas (ProjectList).
 * (No elimina Listas globales porque son plantillas compartidas.)
 */
export async function deleteProject(projectId: string) {
  await db.transaction('rw', db.projects, db.projectLists, async () => {
    await db.projectLists.where('projectId').equals(projectId).delete()
    await db.projects.delete(projectId)
  })
}

// ASSETS — crear / leer / borrar
// =========================================================

/**
 * Crea un Asset a partir de un File (sólo imagen por ahora).
 * Guarda el BLOB en IndexedDB. Calcula width/height del bitmap.
 * Devuelve el id del asset creado.
 */
export async function createImageAssetFromFile(projectId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Sólo se admiten imágenes por ahora')
  }

  // Obtener dimensiones de la imagen (navegador)
  const bitmap = await createImageBitmap(file)
  const width = bitmap.width
  const height = bitmap.height

  const asset: Asset = {
    id: rid(),
    projectId,
    kind: 'image',
    mime: file.type,
    blob: file, // guardamos el propio File (es un Blob)
    width,
    height,
    createdAt: now(),
  }

  await db.assets.add(asset)
  return asset.id
}

/** Devuelve todos los assets de un proyecto (sin crear URLs aún). */
export async function getAssetsByProject(projectId: string): Promise<Asset[]> {
  return db.assets.where('projectId').equals(projectId).sortBy('createdAt')
}

/** Elimina un asset. */
export async function deleteAsset(assetId: string) {
  await db.assets.delete(assetId)
}

/**
 * Crea un Asset de tipo PDF a partir de un File.
 * - Guarda el Blob en IndexedDB
 * - Lee el número de páginas con pdfjs
 * Devuelve el id del asset.
 */
export async function createPdfAssetFromFile(projectId: string, file: File): Promise<string> {
  if (file.type !== 'application/pdf') {
    throw new Error('El archivo no es un PDF válido')
  }

  await ensurePdfWorker()                                   // 👈 Asegura versión
  const { getDocument } = await import('pdfjs-dist')

  const buf = await file.arrayBuffer()
  const pdf = await (getDocument as any)({ data: buf }).promise
  const pageCount = pdf.numPages as number

  const asset: Asset = {
    id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
    projectId,
    kind: 'pdf',
    mime: file.type,
    blob: file,
    width: 0,
    height: 0,
    pageCount,
    createdAt: new Date().toISOString(),
  }

  await db.assets.add(asset)
  return asset.id
}

/*-----------
------ PUNTOS
---------- */ 
db.version(7).stores({
  lists: '++id, name, createdAt, updatedAt',
  properties: '++id, listId, order',
  options: '++id, propertyId, order',
  projects: '++id, name, createdAt, updatedAt',
  projectLists: '++id, projectId, order',
  assets: '++id, projectId',
  points: '++id, projectId, assetId, listId',
  pointEntries: '++id, pointId, listId, createdAt',
}).upgrade(async (tx) => {
  // set default name if missing (opcional)
  const pts = await tx.table('points').toArray()
  let c = 1
  for (const p of pts) {
    if (!('name' in p) || p.name == null) {
      await tx.table('points').update(p.id, { name: `Punto ${c++}` })
    }
  }
})

// Entrada para crear un punto (sin id/fechas)
export type CreatePointInput = {
  projectId: ID;
  assetId: ID;
  listId: ID;
  x: number;
  y: number;
  page?: number;
  values?: Record<string, string | number | string[]>;
};

// Genera un nombre por defecto para un asset (Punto 1, Punto 2, ...)
export async function nextPointNameForAsset(assetId: string): Promise<string> {
  const count = await db.points.where({ assetId }).count()
  return `Punto ${count + 1}`
}

// addPoint: genera id y fechas, normaliza values
export async function addPoint(input: Omit<Point, 'id'|'createdAt'|'updatedAt'> & { name?: string }) {
  const id = rid();
  const now = new Date().toISOString();
  const withName = {
    ...input,
    name: input.name ?? await nextPointNameForAsset(input.assetId),
  }

  // si te estaba llegando listRefId por error:
  // const listId = (input as any).listRefId ?? input.listId;

  await db.points.add({
    id,
    ...withName,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

export async function getPointsByAsset(assetId: string): Promise<Point[]> {
  return await db.points.where({ assetId }).toArray()
}

// 🔧 ACTUALIZAR PUNTO
export async function updatePoint(
  id: string,
  patch: Partial<Pick<Point, 'values' | 'x' | 'y' | 'listId' | 'page'>>,
): Promise<void> {
  await db.points.update(id, { ...patch, updatedAt: new Date().toISOString() })
}

// 🗑 ELIMINAR PUNTO
export async function deletePoint(id: string): Promise<void> {
  await db.points.delete(id)
}

// POINTS ENTRIES
export async function getEntriesByPoint(pointId: string): Promise<PointEntry[]> {
  return db.pointEntries.where({ pointId }).reverse().sortBy('createdAt')
}

export async function addPointEntry(pointId: string, listId: string,
  values: Record<string, any>) {
  const id = rid(); const now = nowISO()
  await db.pointEntries.add({ id, pointId, listId, values, createdAt: now, updatedAt: now })
  return id
}

export async function updatePointEntry(id: string, patch: {
  values?: Record<string, any>, listId?: string
}) {
  await db.pointEntries.update(id, { ...patch, updatedAt: nowISO() })
}

// actualizar nombre del punto
export async function updatePointName(pointId: string, name: string) {
  await db.points.update(pointId, { name, updatedAt: nowISO() })
}

export async function deletePointEntry(id: string) {
  await db.pointEntries.delete(id)
}
