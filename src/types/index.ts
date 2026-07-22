export interface TomaInventario {
  id: number;
  bodega: string;
  fecha_inicio: string;
  fecha_cierre?: string | null;
  estado: 'en_progreso' | 'cerrada';
  archivo_sistema_origen?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Rack {
  id: number;
  nombre: string;
  toma_inventario_id: number;
  num_posiciones: number;
  created_at: string;
}

export interface Posicion {
  id: number;
  rack_id: number;
  codigo: string;
  nivel: number | null;
  columna: number | null;
  created_at: string;
}

export interface ReferenciaCatalogo {
  id: number;
  toma_inventario_id: number;
  referencia: string;
  descripcion: string;
  unidad_medida: string;
  sublinea: string | null;
  existencia_sistema: number;
  cod_barras: string | null;
  created_at: string;
}

export interface Usuario {
  id: number;
  nombre: string;
  rol: 'auxiliar' | 'supervisor';
  created_at: string;
}

export interface Cuerpo {
  id: number;
  rack_id: number;
  codigo: string;
  total_posiciones: number;
  created_at: string;
}

export interface CuerpoWithDetails extends Cuerpo {
  rack_nombre: string;
}

export interface ConteoLinea {
  id: number;
  toma_inventario_id: number;
  posicion_id: number;
  cuerpo_id?: number | null;
  referencia: string;
  cantidad: number;
  posiciones_ocupadas: number;
  posiciones_vacias: number;
  formula_text: string;
  auxiliar_id: number;
  fecha_hora: string;
  origen: 'app' | 'offline';
  created_at: string;
}

export interface ConteoLineaWithDetails extends ConteoLinea {
  posicion_codigo: string;
  rack_id: number;
  rack_nombre: string;
  auxiliar_nombre: string;
  descripcion?: string;
}

export interface ExcelRow {
  'C.O. bodega': string;
  Referencia: string;
  'Desc. Item': string;
  'U.M.': string;
  Existencia: number;
  'Cant. comprometida': number;
  'Cant. disponible': number;
  'Cant. tránsito': number;
  'Peso en KIL': number;
  Sublínea: string;
  'Cod. Barras'?: string;
}

export interface ConteoPorReferencia {
  referencia: string;
  descripcion: string;
  unidad_medida: string;
  sublinea: string | null;
  existencia_sistema: number;
  total_fisico: number;
  diferencia: number;
  porcentaje_diferencia: number;
  estado: 'cuadrada' | 'faltante' | 'sobrante';
  detalle_por_rack: {
    rack_id: number;
    rack_nombre: string;
    cantidad: number;
    posiciones: { posicion_id: number; posicion_codigo: string; cantidad: number }[];
  }[];
}

export interface InformeDiferencias {
  toma_inventario_id: number;
  fecha_generacion: string;
  total_referencias: number;
  cuadradas: number;
  faltantes: number;
  sobrantes: number;
  referencias: ConteoPorReferencia[];
  referencias_no_contadas: ReferenciaCatalogo[];
  referencias_no_en_sistema: { referencia: string; total_fisico: number }[];
}

export interface AvanceRack {
  rack_id: number;
  rack_nombre: string;
  total_posiciones: number;
  posiciones_contadas: number;
  porcentaje: number;
}

export interface ActividadAuxiliar {
  auxiliar_id: number;
  auxiliar_nombre: string;
  lineas_contadas: number;
  ultimo_registro: string | null;
}

export type Tolerancia = 'estricto' | 'normal' | 'flexible';

export const TOLERANCIA_VALORES: Record<Tolerancia, number> = {
  estricto: 0,
  normal: 2,
  flexible: 5,
};

export interface ConfigInventario {
  tolerancia: Tolerancia;
  racks: { nombre: string; num_posiciones: number; num_cuerpos?: number }[];
}