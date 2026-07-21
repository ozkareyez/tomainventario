import { executeQuery, executeRun, executeTransaction, persistDatabase } from '../db/database';
import type {
  TomaInventario,
  Rack,
  Posicion,
  Cuerpo,
  CuerpoWithDetails,
  ReferenciaCatalogo,
  Usuario,
  ConteoLinea,
  ConteoLineaWithDetails,
  ConteoPorReferencia,
  InformeDiferencias,
  AvanceRack,
  ActividadAuxiliar,
  ExcelRow,
} from '../types';

const TOLERANCIA_PORCENTAJE = 2;

export const TomaInventarioRepo = {
  async create(bodega: string, archivoOrigen?: string): Promise<number> {
    const result = executeRun(
      `INSERT INTO toma_inventario (bodega, fecha_inicio, archivo_sistema_origen) VALUES (?, datetime('now'), ?)`,
      [bodega, archivoOrigen || null]
    );
    await persistDatabase();
    return result.lastInsertRowid;
  },

  async getAll(): Promise<TomaInventario[]> {
    return executeQuery<TomaInventario>(`SELECT * FROM toma_inventario ORDER BY fecha_inicio DESC`);
  },

  async getById(id: number): Promise<TomaInventario | null> {
    const results = executeQuery<TomaInventario>(`SELECT * FROM toma_inventario WHERE id = ?`, [id]);
    return results[0] || null;
  },

  async getActive(): Promise<TomaInventario | null> {
    const results = executeQuery<TomaInventario>(
      `SELECT * FROM toma_inventario WHERE estado = 'en_progreso' ORDER BY fecha_inicio DESC LIMIT 1`
    );
    return results[0] || null;
  },

  async close(id: number): Promise<void> {
    executeRun(`UPDATE toma_inventario SET estado = 'cerrada', fecha_cierre = datetime('now') WHERE id = ?`, [id]);
    await persistDatabase();
  },

  async delete(id: number): Promise<void> {
    executeRun(`DELETE FROM toma_inventario WHERE id = ?`, [id]);
    await persistDatabase();
  },
};

export const RackRepo = {
  async create(nombre: string, tomaInventarioId: number, numPosiciones = 100): Promise<number> {
    const result = executeRun(
      `INSERT INTO rack (nombre, toma_inventario_id, num_posiciones) VALUES (?, ?, ?)`,
      [nombre, tomaInventarioId, numPosiciones]
    );
    await persistDatabase();
    return result.lastInsertRowid;
  },

  async createMultiple(tomaInventarioId: number, racks: { nombre: string; num_posiciones: number }[]): Promise<void> {
    const queries = racks.map((r) => ({
      sql: `INSERT INTO rack (nombre, toma_inventario_id, num_posiciones) VALUES (?, ?, ?)`,
      params: [r.nombre, tomaInventarioId, r.num_posiciones],
    }));
    executeTransaction(queries);
    await persistDatabase();
  },

  async getByTomaInventario(tomaInventarioId: number): Promise<Rack[]> {
    return executeQuery<Rack>(`SELECT * FROM rack WHERE toma_inventario_id = ? ORDER BY nombre`, [tomaInventarioId]);
  },

  async getById(id: number): Promise<Rack | null> {
    const results = executeQuery<Rack>(`SELECT * FROM rack WHERE id = ?`, [id]);
    return results[0] || null;
  },

  async updatePosiciones(id: number, numPosiciones: number): Promise<void> {
    executeRun(`UPDATE rack SET num_posiciones = ? WHERE id = ?`, [numPosiciones, id]);
    await persistDatabase();
  },

  async generatePosiciones(rackId: number, numPosiciones: number): Promise<void> {
    const rack = await this.getById(rackId);
    if (!rack) return;

    const existing = executeQuery<Posicion>(`SELECT codigo FROM posicion WHERE rack_id = ?`, [rackId]);
    const existingCodes = new Set(existing.map((p) => p.codigo));

    const queries: { sql: string; params: (string | number | null)[] }[] = [];
    for (let i = 1; i <= numPosiciones; i++) {
      const rackPrefix = rack.nombre.startsWith('Rack ') ? rack.nombre.replace('Rack ', 'R') : rack.nombre;
      const codigo = `${rackPrefix}-${String(i).padStart(3, '0')}`;
      if (!existingCodes.has(codigo)) {
        queries.push({
          sql: `INSERT INTO posicion (rack_id, codigo, nivel, columna) VALUES (?, ?, ?, ?)`,
          params: [rackId, codigo, Math.ceil(i / 10), ((i - 1) % 10) + 1],
        });
      }
    }

    if (queries.length > 0) {
      executeTransaction(queries);
      await persistDatabase();
    }
  },

  async generateCuerpos(rackId: number, numCuerpos: number): Promise<void> {
    const rack = await this.getById(rackId);
    if (!rack) return;

    const existing = executeQuery<{ codigo: string }>(`SELECT codigo FROM cuerpo WHERE rack_id = ?`, [rackId]);
    const existingCodes = new Set(existing.map((p) => p.codigo));

    const queries: { sql: string; params: (string | number | null)[] }[] = [];
    const rackPrefix = rack.nombre.startsWith('Rack ') ? rack.nombre.replace('Rack ', 'R') : rack.nombre;
    
    for (let i = 1; i <= numCuerpos; i++) {
      const codigo = `${rackPrefix}C${i}`;
      if (!existingCodes.has(codigo)) {
        queries.push({
          sql: `INSERT INTO cuerpo (rack_id, codigo, orden, total_posiciones) VALUES (?, ?, ?, ?)`,
          params: [rackId, codigo, i, 5],
        });
      }
    }

    if (queries.length > 0) {
      executeTransaction(queries);
      await persistDatabase();
    }
  },

  async generateAllCuerpos(tomaInventarioId: number): Promise<void> {
    const racks = await this.getByTomaInventario(tomaInventarioId);
    for (const rack of racks) {
      const numCuerpos = Math.ceil(rack.num_posiciones / 5);
      await this.generateCuerpos(rack.id, numCuerpos);
    }
  },
};

export const PosicionRepo = {
  async getByRack(rackId: number): Promise<Posicion[]> {
    return executeQuery<Posicion>(`SELECT * FROM posicion WHERE rack_id = ? ORDER BY codigo`, [rackId]);
  },

  async getById(id: number): Promise<Posicion | null> {
    const results = executeQuery<Posicion>(`SELECT * FROM posicion WHERE id = ?`, [id]);
    return results[0] || null;
  },

  async getByCodigo(rackId: number, codigo: string): Promise<Posicion | null> {
    const results = executeQuery<Posicion>(`SELECT * FROM posicion WHERE rack_id = ? AND codigo = ?`, [rackId, codigo]);
    return results[0] || null;
  },

  async getWithRackByTomaInventario(tomaInventarioId: number): Promise<(Posicion & { rack_nombre: string; rack_id: number })[]> {
    return executeQuery(
      `SELECT p.*, r.nombre as rack_nombre, r.id as rack_id 
       FROM posicion p 
       JOIN rack r ON p.rack_id = r.id 
       WHERE r.toma_inventario_id = ? 
       ORDER BY r.nombre, p.codigo`,
      [tomaInventarioId]
    );
  },
};

export const CuerpoRepo = {
  async getByRack(rackId: number): Promise<Cuerpo[]> {
    return executeQuery<Cuerpo>(`SELECT * FROM cuerpo WHERE rack_id = ? ORDER BY orden`, [rackId]);
  },

  async getByTomaInventario(tomaInventarioId: number): Promise<CuerpoWithDetails[]> {
    return executeQuery<CuerpoWithDetails>(
      `SELECT c.*, r.nombre as rack_nombre
       FROM cuerpo c
       JOIN rack r ON c.rack_id = r.id
       WHERE r.toma_inventario_id = ?
       ORDER BY r.nombre, c.orden`,
      [tomaInventarioId]
    );
  },

  async getById(id: number): Promise<Cuerpo | null> {
    const results = executeQuery<Cuerpo>(`SELECT * FROM cuerpo WHERE id = ?`, [id]);
    return results[0] || null;
  },
};

export const ReferenciaCatalogoRepo = {
  async create(tomaInventarioId: number, data: Omit<ReferenciaCatalogo, 'id' | 'toma_inventario_id' | 'created_at'>): Promise<number> {
    const result = executeRun(
      `INSERT INTO referencia_catalogo (toma_inventario_id, referencia, descripcion, unidad_medida, sublinea, existencia_sistema)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tomaInventarioId, data.referencia, data.descripcion, data.unidad_medida, data.sublinea, data.existencia_sistema]
    );
    await persistDatabase();
    return result.lastInsertRowid;
  },

  async bulkCreate(tomaInventarioId: number, items: Omit<ReferenciaCatalogo, 'id' | 'toma_inventario_id' | 'created_at'>[]): Promise<{ success: number; errors: string[] }> {
    const queries = items.map((item) => ({
      sql: `INSERT OR IGNORE INTO referencia_catalogo (toma_inventario_id, referencia, descripcion, unidad_medida, sublinea, existencia_sistema)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [tomaInventarioId, item.referencia, item.descripcion, item.unidad_medida, item.sublinea, item.existencia_sistema],
    }));
    executeTransaction(queries);
    await persistDatabase();
    return { success: items.length, errors: [] };
  },

  async getByTomaInventario(tomaInventarioId: number): Promise<ReferenciaCatalogo[]> {
    return executeQuery<ReferenciaCatalogo>(
      `SELECT * FROM referencia_catalogo WHERE toma_inventario_id = ? ORDER BY referencia`,
      [tomaInventarioId]
    );
  },

  async search(tomaInventarioId: number, query: string, limit = 20): Promise<ReferenciaCatalogo[]> {
    return executeQuery<ReferenciaCatalogo>(
      `SELECT * FROM referencia_catalogo 
       WHERE toma_inventario_id = ? AND (referencia LIKE ? OR descripcion LIKE ?)
       ORDER BY 
         CASE WHEN referencia LIKE ? THEN 0 ELSE 1 END,
         referencia
       LIMIT ?`,
      [tomaInventarioId, `${query}%`, `%${query}%`, `${query}%`, limit]
    );
  },

  async searchByDescription(tomaInventarioId: number, query: string, limit = 20): Promise<ReferenciaCatalogo[]> {
    // Split query into words for partial matching (e.g., "ADULT" matches "ADULTO")
    const words = query.trim().split(/\s+/).filter(w => w.length >= 2);
    
    if (words.length === 0) return [];
    
    if (words.length === 1) {
      // Single word - match prefix, contains, and word boundaries
      const term = words[0];
      return executeQuery<ReferenciaCatalogo>(
        `SELECT * FROM referencia_catalogo 
         WHERE toma_inventario_id = ? AND (
           referencia LIKE ? 
           OR descripcion LIKE ? 
           OR descripcion LIKE ?
           OR descripcion LIKE ?
           OR descripcion LIKE ?
         )
         ORDER BY 
           CASE WHEN descripcion LIKE ? THEN 0 ELSE 1 END,
           CASE WHEN referencia LIKE ? THEN 0 ELSE 1 END,
           descripcion
         LIMIT ?`,
        [tomaInventarioId, `${term}%`, `%${term}%`, `% ${term}%`, `%${term} %`, `% ${term} %`, `${term}%`, `${term}%`, limit]
      );
    }
    
    // Multiple words - ALL must match (AND logic)
    const whereClauses = words.map(() => `(referencia LIKE ? OR descripcion LIKE ?)`).join(' AND ');
    const params: (string | number)[] = [tomaInventarioId];
    words.forEach(w => {
      params.push(`%${w}%`, `%${w}%`);
    });
    params.push(limit);
    
    return executeQuery<ReferenciaCatalogo>(
      `SELECT * FROM referencia_catalogo 
       WHERE toma_inventario_id = ? AND ${whereClauses}
       ORDER BY descripcion
       LIMIT ?`,
      params
    );
  },

  async getByReferencia(tomaInventarioId: number, referencia: string): Promise<ReferenciaCatalogo | null> {
    const results = executeQuery<ReferenciaCatalogo>(
      `SELECT * FROM referencia_catalogo WHERE toma_inventario_id = ? AND referencia = ?`,
      [tomaInventarioId, referencia]
    );
    return results[0] || null;
  },

  async deleteByTomaInventario(tomaInventarioId: number): Promise<void> {
    executeRun(`DELETE FROM referencia_catalogo WHERE toma_inventario_id = ?`, [tomaInventarioId]);
    await persistDatabase();
  },

  async deleteByPattern(tomaInventarioId: number, pattern: string): Promise<number> {
    const result = executeRun(`DELETE FROM referencia_catalogo WHERE toma_inventario_id = ? AND referencia LIKE ?`, [tomaInventarioId, pattern]);
    await persistDatabase();
    return result.changes;
  },

  async deleteUncountedByPattern(tomaInventarioId: number, pattern: string): Promise<number> {
    const result = executeRun(
      `DELETE FROM referencia_catalogo 
       WHERE toma_inventario_id = ? AND referencia LIKE ?
       AND referencia NOT IN (SELECT DISTINCT referencia FROM conteo_linea WHERE toma_inventario_id = ?)`,
      [tomaInventarioId, pattern, tomaInventarioId]
    );
    await persistDatabase();
    return result.changes;
  },
};

export const UsuarioRepo = {
  async create(nombre: string, rol: 'auxiliar' | 'supervisor'): Promise<number> {
    const result = executeRun(`INSERT INTO usuario (nombre, rol) VALUES (?, ?)`, [nombre, rol]);
    await persistDatabase();
    return result.lastInsertRowid;
  },

  async getAll(): Promise<Usuario[]> {
    return executeQuery<Usuario>(`SELECT * FROM usuario ORDER BY nombre`);
  },

  async getByRol(rol: 'auxiliar' | 'supervisor'): Promise<Usuario[]> {
    return executeQuery<Usuario>(`SELECT * FROM usuario WHERE rol = ? ORDER BY nombre`, [rol]);
  },

  async getById(id: number): Promise<Usuario | null> {
    const results = executeQuery<Usuario>(`SELECT * FROM usuario WHERE id = ?`, [id]);
    return results[0] || null;
  },

  async seedDefaults(): Promise<void> {
    const existing = await this.getAll();
    if (existing.length === 0) {
      const queries = [
        { sql: `INSERT INTO usuario (nombre, rol) VALUES (?, ?)`, params: ['Auxiliar 1', 'auxiliar'] },
        { sql: `INSERT INTO usuario (nombre, rol) VALUES (?, ?)`, params: ['Auxiliar 2', 'auxiliar'] },
        { sql: `INSERT INTO usuario (nombre, rol) VALUES (?, ?)`, params: ['Supervisor', 'supervisor'] },
      ];
      executeTransaction(queries);
      await persistDatabase();
    }
  },
};

export const ConteoLineaRepo = {
  async create(
    tomaInventarioId: number,
    posicionId: number,
    referencia: string,
    cantidad: number,
    auxiliarId: number,
    origen: 'app' | 'offline' = 'app',
    cuerpoId?: number,
    posicionesOcupadas = 1,
    posicionesVacias = 0,
    formulaText = ''
  ): Promise<number> {
    const result = executeRun(
      `INSERT INTO conteo_linea (toma_inventario_id, posicion_id, referencia, cantidad, posiciones_ocupadas, posiciones_vacias, formula_text, auxiliar_id, fecha_hora, origen, cuerpo_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`,
      [tomaInventarioId, posicionId, referencia, cantidad, posicionesOcupadas, posicionesVacias, formulaText, auxiliarId, origen, cuerpoId || null]
    );
    await persistDatabase();
    return result.lastInsertRowid;
  },

  async bulkCreate(items: Omit<ConteoLinea, 'id' | 'created_at'>[]): Promise<void> {
    const queries = items.map((item) => ({
      sql: `INSERT INTO conteo_linea (toma_inventario_id, posicion_id, referencia, cantidad, auxiliar_id, fecha_hora, origen)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [item.toma_inventario_id, item.posicion_id, item.referencia, item.cantidad, item.auxiliar_id, item.fecha_hora, item.origen],
    }));
    executeTransaction(queries);
    await persistDatabase();
  },

  async getByTomaInventario(tomaInventarioId: number): Promise<ConteoLineaWithDetails[]> {
    return executeQuery<ConteoLineaWithDetails>(
      `SELECT cl.*,
              COALESCE(c.codigo, p.codigo) as posicion_codigo,
              COALESCE(cr.nombre, pr.nombre) as rack_nombre,
              COALESCE(cr.id, pr.id) as rack_id,
              u.nombre as auxiliar_nombre
       FROM conteo_linea cl
       JOIN usuario u ON cl.auxiliar_id = u.id
       LEFT JOIN cuerpo c ON cl.cuerpo_id = c.id
       LEFT JOIN rack cr ON c.rack_id = cr.id
       LEFT JOIN posicion p ON cl.posicion_id = p.id
       LEFT JOIN rack pr ON p.rack_id = pr.id
       WHERE cl.toma_inventario_id = ?
       ORDER BY cl.fecha_hora DESC`,
      [tomaInventarioId]
    );
  },

  async getByPosicion(posicionId: number): Promise<ConteoLineaWithDetails[]> {
    return executeQuery<ConteoLineaWithDetails>(
      `SELECT cl.*, p.codigo as posicion_codigo, r.nombre as rack_nombre, u.nombre as auxiliar_nombre
       FROM conteo_linea cl
       JOIN posicion p ON cl.posicion_id = p.id
       JOIN rack r ON p.rack_id = r.id
       JOIN usuario u ON cl.auxiliar_id = u.id
       WHERE cl.posicion_id = ?
       ORDER BY cl.fecha_hora DESC`,
      [posicionId]
    );
  },

  async getByCuerpo(cuerpoId: number): Promise<ConteoLineaWithDetails[]> {
    return executeQuery<ConteoLineaWithDetails>(
      `SELECT cl.*, c.codigo as posicion_codigo, r.nombre as rack_nombre, u.nombre as auxiliar_nombre
       FROM conteo_linea cl
       JOIN cuerpo c ON cl.cuerpo_id = c.id
       JOIN rack r ON c.rack_id = r.id
       JOIN usuario u ON cl.auxiliar_id = u.id
       WHERE cl.cuerpo_id = ?
       ORDER BY cl.fecha_hora DESC`,
      [cuerpoId]
    );
  },

  async getByReferencia(tomaInventarioId: number, referencia: string): Promise<ConteoLineaWithDetails[]> {
    return executeQuery<ConteoLineaWithDetails>(
      `SELECT cl.*,
              COALESCE(c.codigo, p.codigo) as posicion_codigo,
              COALESCE(cr.nombre, pr.nombre) as rack_nombre,
              COALESCE(cr.id, pr.id) as rack_id,
              u.nombre as auxiliar_nombre
       FROM conteo_linea cl
       JOIN usuario u ON cl.auxiliar_id = u.id
       LEFT JOIN cuerpo c ON cl.cuerpo_id = c.id
       LEFT JOIN rack cr ON c.rack_id = cr.id
       LEFT JOIN posicion p ON cl.posicion_id = p.id
       LEFT JOIN rack pr ON p.rack_id = pr.id
       WHERE cl.toma_inventario_id = ? AND cl.referencia = ?
       ORDER BY cl.fecha_hora DESC`,
      [tomaInventarioId, referencia]
    );
  },

  async getByAuxiliar(auxiliarId: number): Promise<ConteoLineaWithDetails[]> {
    return executeQuery<ConteoLineaWithDetails>(
      `SELECT cl.*,
              COALESCE(c.codigo, p.codigo) as posicion_codigo,
              COALESCE(cr.nombre, pr.nombre) as rack_nombre,
              COALESCE(cr.id, pr.id) as rack_id,
              u.nombre as auxiliar_nombre
       FROM conteo_linea cl
       JOIN usuario u ON cl.auxiliar_id = u.id
       LEFT JOIN cuerpo c ON cl.cuerpo_id = c.id
       LEFT JOIN rack cr ON c.rack_id = cr.id
       LEFT JOIN posicion p ON cl.posicion_id = p.id
       LEFT JOIN rack pr ON p.rack_id = pr.id
       WHERE cl.auxiliar_id = ?
       ORDER BY cl.fecha_hora DESC`,
      [auxiliarId]
    );
  },

  async getConteoCuerpoIdsByRack(rackId: number): Promise<Set<number>> {
    const results = executeQuery<{ cuerpo_id: number }>(
      `SELECT DISTINCT cl.cuerpo_id
       FROM conteo_linea cl
       JOIN cuerpo c ON cl.cuerpo_id = c.id
       WHERE c.rack_id = ? AND cl.cuerpo_id IS NOT NULL`,
      [rackId]
    );
    return new Set(results.map(r => r.cuerpo_id));
  },

  async delete(id: number): Promise<void> {
    executeRun(`DELETE FROM conteo_linea WHERE id = ?`, [id]);
    await persistDatabase();
  },

  async getConteoPorReferencia(tomaInventarioId: number): Promise<Map<string, number>> {
    const results = executeQuery<{ referencia: string; total: number }>(
      `SELECT referencia, SUM(cantidad) as total
       FROM conteo_linea
       WHERE toma_inventario_id = ?
       GROUP BY referencia`,
      [tomaInventarioId]
    );
    const map = new Map<string, number>();
    results.forEach((r) => map.set(r.referencia, r.total));
    return map;
  },

  async getConteoPorRackReferencia(tomaInventarioId: number): Promise<Map<string, Map<number, number>>> {
    const results = executeQuery<{ referencia: string; rack_id: number; rack_nombre: string; total: number }>(
      `SELECT cl.referencia,
              COALESCE(cr.id, pr.id) as rack_id,
              COALESCE(cr.nombre, pr.nombre) as rack_nombre,
              SUM(cl.cantidad) as total
       FROM conteo_linea cl
       LEFT JOIN cuerpo c ON cl.cuerpo_id = c.id
       LEFT JOIN rack cr ON c.rack_id = cr.id
       LEFT JOIN posicion p ON cl.posicion_id = p.id
       LEFT JOIN rack pr ON p.rack_id = pr.id
       WHERE cl.toma_inventario_id = ?
       GROUP BY cl.referencia, COALESCE(cr.id, pr.id), COALESCE(cr.nombre, pr.nombre)
       ORDER BY cl.referencia, rack_nombre`,
      [tomaInventarioId]
    );

    const map = new Map<string, Map<number, number>>();
    results.forEach((r) => {
      if (!map.has(r.referencia)) map.set(r.referencia, new Map());
      map.get(r.referencia)!.set(r.rack_id, r.total);
    });
    return map;
  },

  async getDetallePorReferencia(tomaInventarioId: number, referencia: string): Promise<{
    rack_id: number;
    rack_nombre: string;
    posiciones: { posicion_id: number; posicion_codigo: string; cantidad: number; auxiliar_nombre: string; fecha_hora: string }[];
  }[]> {
    const results = executeQuery<{
      rack_id: number;
      rack_nombre: string;
      posicion_id: number;
      posicion_codigo: string;
      cantidad: number;
      auxiliar_nombre: string;
      fecha_hora: string;
    }>(
      `SELECT COALESCE(cr.id, pr.id) as rack_id,
              COALESCE(cr.nombre, pr.nombre) as rack_nombre,
              COALESCE(c.id, p.id) as posicion_id,
              COALESCE(c.codigo, p.codigo) as posicion_codigo,
              cl.cantidad, u.nombre as auxiliar_nombre, cl.fecha_hora
       FROM conteo_linea cl
       JOIN usuario u ON cl.auxiliar_id = u.id
       LEFT JOIN cuerpo c ON cl.cuerpo_id = c.id
       LEFT JOIN rack cr ON c.rack_id = cr.id
       LEFT JOIN posicion p ON cl.posicion_id = p.id
       LEFT JOIN rack pr ON p.rack_id = pr.id
       WHERE cl.toma_inventario_id = ? AND cl.referencia = ?
       ORDER BY rack_nombre, posicion_codigo`,
      [tomaInventarioId, referencia]
    );

    const grouped = new Map<number, { rack_id: number; rack_nombre: string; posiciones: typeof results }>();
    results.forEach((r) => {
      if (!grouped.has(r.rack_id)) {
        grouped.set(r.rack_id, { rack_id: r.rack_id, rack_nombre: r.rack_nombre, posiciones: [] });
      }
      grouped.get(r.rack_id)!.posiciones.push(r);
    });

    return Array.from(grouped.values());
  },
};

export const InventarioRepo = {
  async getAvanceRacks(tomaInventarioId: number): Promise<AvanceRack[]> {
    return executeQuery<AvanceRack>(
      `SELECT r.id as rack_id, r.nombre as rack_nombre, 
              COUNT(DISTINCT c.id) as total_posiciones,
              COUNT(DISTINCT CASE WHEN cl.id IS NOT NULL THEN c.id END) as posiciones_contadas,
              ROUND(
                CAST(COUNT(DISTINCT CASE WHEN cl.id IS NOT NULL THEN c.id END) AS REAL) * 100.0 / 
                CASE WHEN COUNT(DISTINCT c.id) = 0 THEN 1 ELSE COUNT(DISTINCT c.id) END, 
              1) as porcentaje
       FROM rack r
       LEFT JOIN cuerpo c ON r.id = c.rack_id
       LEFT JOIN conteo_linea cl ON c.id = cl.cuerpo_id AND cl.toma_inventario_id = ?
       WHERE r.toma_inventario_id = ?
       GROUP BY r.id, r.nombre
       ORDER BY r.nombre`,
      [tomaInventarioId, tomaInventarioId]
    );
  },

  async getActividadAuxiliares(tomaInventarioId: number): Promise<ActividadAuxiliar[]> {
    return executeQuery<ActividadAuxiliar>(
      `SELECT u.id as auxiliar_id, u.nombre as auxiliar_nombre,
              COUNT(cl.id) as lineas_contadas,
              MAX(cl.fecha_hora) as ultimo_registro
       FROM usuario u
       LEFT JOIN conteo_linea cl ON u.id = cl.auxiliar_id AND cl.toma_inventario_id = ?
       WHERE u.rol = 'auxiliar'
       GROUP BY u.id, u.nombre
       ORDER BY lineas_contadas DESC`,
      [tomaInventarioId]
    );
  },

  async getConteoConsolidado(tomaInventarioId: number, toleranciaPorcentaje = TOLERANCIA_PORCENTAJE): Promise<ConteoPorReferencia[]> {
    const catalogo = await ReferenciaCatalogoRepo.getByTomaInventario(tomaInventarioId);
    const conteoFisico = await ConteoLineaRepo.getConteoPorReferencia(tomaInventarioId);
    const conteoPorRack = await ConteoLineaRepo.getConteoPorRackReferencia(tomaInventarioId);

    return catalogo.map((cat) => {
      const totalFisico = conteoFisico.get(cat.referencia) || 0;
      const existenciaSistema = cat.existencia_sistema;
      const diferencia = totalFisico - existenciaSistema;
      const porcentajeDiferencia = existenciaSistema > 0 ? (Math.abs(diferencia) / existenciaSistema) * 100 : (totalFisico > 0 ? 100 : 0);

      let estado: 'cuadrada' | 'faltante' | 'sobrante';
      if (diferencia === 0) estado = 'cuadrada';
      else if (diferencia < 0) estado = 'faltante';
      else estado = 'sobrante';

      if (porcentajeDiferencia <= toleranciaPorcentaje && diferencia !== 0) {
        estado = 'cuadrada';
      }

      const rackMap = conteoPorRack.get(cat.referencia) || new Map();
      const detallePorRack = Array.from(rackMap.entries()).map(([rackId, cantidad]) => ({
        rack_id: rackId,
        rack_nombre: '',
        cantidad,
        posiciones: [] as { posicion_id: number; posicion_codigo: string; cantidad: number }[],
      }));

      return {
        referencia: cat.referencia,
        descripcion: cat.descripcion,
        unidad_medida: cat.unidad_medida,
        sublinea: cat.sublinea,
        existencia_sistema: existenciaSistema,
        total_fisico: totalFisico,
        diferencia,
        porcentaje_diferencia: Math.round(porcentajeDiferencia * 100) / 100,
        estado,
        detalle_por_rack: detallePorRack,
      };
    });
  },

  async getInformeDiferencias(tomaInventarioId: number, toleranciaPorcentaje = TOLERANCIA_PORCENTAJE): Promise<InformeDiferencias> {
    const referencias = await this.getConteoConsolidado(tomaInventarioId, toleranciaPorcentaje);
    const catalogo = await ReferenciaCatalogoRepo.getByTomaInventario(tomaInventarioId);
    const conteoFisico = await ConteoLineaRepo.getConteoPorReferencia(tomaInventarioId);

    const referenciasContadas = new Set(conteoFisico.keys());
    const referenciasNoContadas = catalogo.filter((c) => !referenciasContadas.has(c.referencia));

    const referenciasNoEnSistema = Array.from(conteoFisico.entries())
      .filter(([ref]) => !catalogo.some((c) => c.referencia === ref))
      .map(([referencia, total_fisico]) => ({ referencia, total_fisico }));

    return {
      toma_inventario_id: tomaInventarioId,
      fecha_generacion: new Date().toISOString(),
      total_referencias: referencias.length,
      cuadradas: referencias.filter((r) => r.estado === 'cuadrada').length,
      faltantes: referencias.filter((r) => r.estado === 'faltante').length,
      sobrantes: referencias.filter((r) => r.estado === 'sobrante').length,
      referencias,
      referencias_no_contadas: referenciasNoContadas,
      referencias_no_en_sistema: referenciasNoEnSistema,
    };
  },
};

export const ExcelRepo = {
  parseExcel(file: File): Promise<ExcelRow[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const workbook = (window as any).XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json = (window as any).XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (json.length < 2) {
            resolve([]);
            return;
          }

          const headers = json[0] as string[];
          const rows = json.slice(1) as any[][];

          const result: ExcelRow[] = rows
            .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ''))
            .map((row) => {
              const obj: Record<string, any> = {};
              headers.forEach((h, i) => (obj[h] = row[i]));
              
              // Normalize headers to handle case variations
              const getVal = (keys: string[]) => {
                for (const k of keys) {
                  if (obj[k] !== undefined) return obj[k];
                }
                return '';
              };

              return {
                'C.O. bodega': getVal(['C.O. bodega', 'C.O. Bodega', 'c.o. bodega']) || '',
                Referencia: String(getVal(['Referencia', 'referencia', 'REFERENCIA']) || '').trim(),
                'Desc. Item': String(getVal(['Desc. Item', 'Desc. item', 'DESC. ITEM', 'Descripción', 'Descripcion']) || '').trim(),
                'U.M.': String(getVal(['U.M.', 'U.M', 'u.m.', 'UM', 'Unidad Medida']) || '').trim(),
                Existencia: Number(getVal(['Existencia', 'existencia', 'EXISTENCIA']) || 0),
                'Cant. comprometida': Number(getVal(['Cant. comprometida', 'Cant. Comprometida', 'cant. comprometida']) || 0),
                'Cant. disponible': Number(getVal(['Cant. disponible', 'Cant. Disponible', 'cant. disponible']) || 0),
                'Cant. tránsito': Number(getVal(['Cant. tránsito', 'Cant. Tránsito', 'cant. tránsito', 'Cant. transito']) || 0),
                'Peso en KIL': Number(getVal(['Peso en KIL', 'Peso en KIL', 'peso en kil', 'PESO EN KIL']) || 0),
                Sublínea: String(getVal(['Sublínea', 'Sublinea', 'sublinea', 'SUBLINEA']) || '').trim(),
              };
            })
            .filter((r) => r.Referencia);

          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  },

  async exportInforme(tomaInventarioId: number, bodega: string): Promise<void> {
    const informe = await InventarioRepo.getInformeDiferencias(tomaInventarioId);
    const conteos = await ConteoLineaRepo.getByTomaInventario(tomaInventarioId);
    const workbook = (window as any).XLSX.utils.book_new();

    // Hoja 1: Resumen
    const resumenData = [
      ['Informe de Diferencias - ' + bodega],
      ['Fecha', new Date().toLocaleString()],
      ['Total Referencias', informe.total_referencias],
      ['Cuadradas', informe.cuadradas],
      ['Faltantes', informe.faltantes],
      ['Sobrantes', informe.sobrantes],
      [],
      ['Referencia', 'Descripción', 'U.M.', 'Sublinea', 'Sistema', 'Físico', 'Diferencia', '% Diff', 'Estado']
    ];
    informe.referencias.forEach(r => {
      resumenData.push([r.referencia, r.descripcion, r.unidad_medida, r.sublinea || '', r.existencia_sistema, r.total_fisico, r.diferencia, r.porcentaje_diferencia, r.estado]);
    });
    const wsResumen = (window as any).XLSX.utils.aoa_to_sheet(resumenData);
    (window as any).XLSX.utils.book_append_sheet(workbook, wsResumen, 'Resumen');

    // Hoja 2: Detalle Conteos
    const detalleData = [
      ['Detalle de Conteos - ' + bodega],
      ['Fecha', new Date().toLocaleString()],
      ['Total Registros', conteos.length],
      [],
      ['Referencia', 'Descripción', 'Posición', 'Rack', 'Cantidad', 'Auxiliar', 'Fecha/Hora', 'Origen']
    ];
    conteos.forEach(c => {
      detalleData.push([c.referencia, c.descripcion || '', c.posicion_codigo, c.rack_nombre, String(c.cantidad), c.auxiliar_nombre, c.fecha_hora, c.origen]);
    });
    const wsDetalle = (window as any).XLSX.utils.aoa_to_sheet(detalleData);
    (window as any).XLSX.utils.book_append_sheet(workbook, wsDetalle, 'Detalle Conteos');

    // Hoja 3: No contadas
    if (informe.referencias_no_contadas.length > 0) {
      const noContadasData = [
        ['Referencias NO Contadas - ' + bodega],
        [],
        ['Referencia', 'Descripción', 'U.M.', 'Sublinea', 'Existencia Sistema']
      ];
      informe.referencias_no_contadas.forEach(r => {
        noContadasData.push([r.referencia, r.descripcion, r.unidad_medida, r.sublinea || '', String(r.existencia_sistema)]);
      });
      const wsNoContadas = (window as any).XLSX.utils.aoa_to_sheet(noContadasData);
      (window as any).XLSX.utils.book_append_sheet(workbook, wsNoContadas, 'No Contadas');
    }

    // Hoja 4: No en sistema
    if (informe.referencias_no_en_sistema.length > 0) {
      const noEnSistemaData = [
        ['Referencias Contadas NO en Sistema - ' + bodega],
        [],
        ['Referencia', 'Total Físico']
      ];
      informe.referencias_no_en_sistema.forEach(r => {
        noEnSistemaData.push([r.referencia, String(r.total_fisico)]);
      });
      const wsNoEnSistema = (window as any).XLSX.utils.aoa_to_sheet(noEnSistemaData);
      (window as any).XLSX.utils.book_append_sheet(workbook, wsNoEnSistema, 'No En Sistema');
    }

    const fileName = `Inventario_${bodega}_${new Date().toISOString().split('T')[0]}.xlsx`;
    (window as any).XLSX.writeFile(workbook, fileName);
  },

  async exportCatalogo(tomaInventarioId: number, bodega: string): Promise<void> {
    const catalogo = await ReferenciaCatalogoRepo.getByTomaInventario(tomaInventarioId);
    const workbook = (window as any).XLSX.utils.book_new();
    
    const data = [
      ['Catálogo de Referencias - ' + bodega],
      ['Fecha', new Date().toLocaleString()],
      ['Total', catalogo.length],
      [],
      ['Referencia', 'Descripción', 'U.M.', 'Sublinea', 'Existencia Sistema']
    ];
    
    catalogo.forEach(r => {
      data.push([r.referencia, r.descripcion, r.unidad_medida, r.sublinea || '', r.existencia_sistema]);
    });
    
    const ws = (window as any).XLSX.utils.aoa_to_sheet(data);
    (window as any).XLSX.utils.book_append_sheet(workbook, ws, 'Catálogo');
    
    const fileName = `Catalogo_${bodega}_${new Date().toISOString().split('T')[0]}.xlsx`;
    (window as any).XLSX.writeFile(workbook, fileName);
  }
};