export type ID = string;
export type ISODate = string;

export type DataType = 'text' | 'number' | 'date' | 'select' | 'multiselect'

export const DATA_TYPES: DataType[] = [
    'text',
    'number',
    'date',
    'select',
    'multiselect'
];

// LISTAS
export interface List {
    id: ID;
    ownerId?: ID;
    name: string;
    createdAt: ISODate;
    updatedAt: ISODate;
    archived?: boolean;
}

export interface Property {
    id: ID;
    listId: ID;
    name: string;
    type: DataType;
    required: boolean;
    order: number;
}

export interface PropertyOption {
    id: ID;
    propertyId: ID;
    value: string;
    order: number;
}

// PROYECTOS
export interface Project{
    id: ID;
    ownerId?: ID;
    name: string;
    createdAt: ISODate;
    updatedAt: ISODate;
}

//Snapshot inmutable de una lista dentro del proyecto
export interface SnapshotOption {
    id: ID;
    value: string;
    order: number;
}

export interface SnapshotProperty {
    id: ID;
    name: string;
    type: DataType;
    required: boolean;
    order: number;
    options?: SnapshotOption[];
}

export interface ProjectList {
    id: ID;
    projectId: ID;
    listId: ID;
    listName: string;
    properties: SnapshotProperty[];
    order: number;
}

// ACTIVOS DEL PROYECTO
export type AssetKind = 'image' | 'pdf';

/**
 * Representa un archivo (imagen o PDF) vinculado a un proyecto.
 * Se almacena como Blob en IndexedDB para soporte offline.
 */
export interface Asset {
  id: ID;             // PK
  projectId: ID;      // FK -> Project
  kind: AssetKind;    // 'image' | 'pdf'
  mime: string;       // tipo MIME, ej. 'image/png'
  blob: Blob;         // archivo binario (File/Blob)
  width: number;      // dimensiones de imagen
  height: number;     // dimensiones de imagen
  pageCount?: number; // si es PDF
  createdAt: ISODate; // fecha de registro
}


// PUNTOS
export interface Point {
  id: ID;
  projectId: ID;
  listId: ID;   
  assetId: ID;
  x: number;              
  y: number;
  page?: number;              // para PDF (opcional)
  values: Record<string, string | number | string[]>;
  name?: string
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ScalarValue = string | number | null;
export type MultiValue = string[];

export interface PointValue {
    id: ID;
    pointId: ID;
    propertyId: ID;

    // Para text/number/date -> ScalarValue
    // Para select -> string (optionId)
    // Para multiselect -> string[] (optionId[])

    value: ScalarValue | MultiValue;
}

// NUEVO: registros de un punto
export interface PointEntry {
  id: ID;
  pointId: ID;                                // FK -> Point
  listId: ID
  values: Record<string, string | number | string[]>;
  createdAt: ISODate;
  updatedAt: ISODate;
}
