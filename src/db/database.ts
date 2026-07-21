import initSqlJs, { Database } from 'sql.js';

const DB_NAME = 'inventario.db';
let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

async function getDbFileHandle(): Promise<FileSystemFileHandle | null> {
  if (!('storage' in navigator && 'getDirectory' in navigator.storage)) {
    return null;
  }
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getFileHandle(DB_NAME, { create: true });
  } catch {
    return null;
  }
}

async function loadDbFromOPFS(): Promise<Uint8Array | null> {
  const handle = await getDbFileHandle();
  if (!handle) return null;
  try {
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function saveDbToOPFS(db: Database): Promise<void> {
  const handle = await getDbFileHandle();
  if (!handle) return;
  try {
    const writable = await handle.createWritable();
    const data = db.export();
    await writable.write(data.buffer as ArrayBuffer);
    await writable.close();
  } catch (error) {
    console.error('Error saving to OPFS:', error);
  }
}

export async function initDatabase(): Promise<Database> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const SQL = await initSqlJs({
      locateFile: (_file) => `/sql-wasm-browser.wasm`,
    });

    const savedData = await loadDbFromOPFS();
    let db: Database;

    if (savedData) {
      db = new SQL.Database(savedData);
      // Ensure schema exists even for existing databases
      initializeSchema(db);
    } else {
      db = new SQL.Database();
      initializeSchema(db);
      await saveDbToOPFS(db);
    }

    dbInstance = db;
    return db;
  })();

  return initPromise;
}

function initializeSchema(db: Database): void {
  const schema = `
    CREATE TABLE IF NOT EXISTS toma_inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bodega TEXT NOT NULL,
      fecha_inicio TEXT NOT NULL,
      fecha_cierre TEXT,
      estado TEXT NOT NULL DEFAULT 'en_progreso' CHECK (estado IN ('en_progreso', 'cerrada')),
      archivo_sistema_origen TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rack (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      toma_inventario_id INTEGER NOT NULL,
      num_posiciones INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (toma_inventario_id) REFERENCES toma_inventario(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS posicion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rack_id INTEGER NOT NULL,
      codigo TEXT NOT NULL,
      nivel INTEGER,
      columna INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (rack_id) REFERENCES rack(id) ON DELETE CASCADE,
      UNIQUE(rack_id, codigo)
    );

    CREATE TABLE IF NOT EXISTS cuerpo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rack_id INTEGER NOT NULL,
      codigo TEXT NOT NULL,
      orden INTEGER NOT NULL DEFAULT 1,
      total_posiciones INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (rack_id) REFERENCES rack(id) ON DELETE CASCADE,
      UNIQUE(rack_id, codigo)
    );

    CREATE TABLE IF NOT EXISTS referencia_catalogo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      toma_inventario_id INTEGER NOT NULL,
      referencia TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      unidad_medida TEXT NOT NULL,
      sublinea TEXT,
      existencia_sistema INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (toma_inventario_id) REFERENCES toma_inventario(id) ON DELETE CASCADE,
      UNIQUE(toma_inventario_id, referencia)
    );

    CREATE TABLE IF NOT EXISTS usuario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      rol TEXT NOT NULL CHECK (rol IN ('auxiliar', 'supervisor')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conteo_linea (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      toma_inventario_id INTEGER NOT NULL,
      posicion_id INTEGER NOT NULL,
      referencia TEXT NOT NULL,
      cantidad INTEGER NOT NULL,
      auxiliar_id INTEGER NOT NULL,
      fecha_hora TEXT NOT NULL,
      origen TEXT NOT NULL DEFAULT 'app' CHECK (origen IN ('app', 'offline')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (toma_inventario_id) REFERENCES toma_inventario(id) ON DELETE CASCADE,
      FOREIGN KEY (posicion_id) REFERENCES posicion(id) ON DELETE CASCADE,
      FOREIGN KEY (auxiliar_id) REFERENCES usuario(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_conteo_toma ON conteo_linea(toma_inventario_id);
    CREATE INDEX IF NOT EXISTS idx_conteo_posicion ON conteo_linea(posicion_id);
    CREATE INDEX IF NOT EXISTS idx_conteo_referencia ON conteo_linea(referencia);
    CREATE INDEX IF NOT EXISTS idx_conteo_auxiliar ON conteo_linea(auxiliar_id);
    CREATE INDEX IF NOT EXISTS idx_posicion_rack ON posicion(rack_id);
    CREATE INDEX IF NOT EXISTS idx_rack_toma ON rack(toma_inventario_id);
    CREATE INDEX IF NOT EXISTS idx_catalogo_toma ON referencia_catalogo(toma_inventario_id);
    CREATE INDEX IF NOT EXISTS idx_catalogo_referencia ON referencia_catalogo(referencia);

    CREATE TRIGGER IF NOT EXISTS update_toma_updated_at
    AFTER UPDATE ON toma_inventario
    BEGIN
      UPDATE toma_inventario SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `;

  db.exec(schema);
  
  // Add new columns to conteo_linea if not present (migration)
  try { db.run("ALTER TABLE conteo_linea ADD COLUMN posiciones_ocupadas INTEGER NOT NULL DEFAULT 1"); } catch {}
  try { db.run("ALTER TABLE conteo_linea ADD COLUMN posiciones_vacias INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { db.run("ALTER TABLE conteo_linea ADD COLUMN formula_text TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE conteo_linea ADD COLUMN cuerpo_id INTEGER REFERENCES cuerpo(id)"); } catch {}
}

export function getDatabase(): Database | null {
  return dbInstance;
}

export function executeQuery<T>(sql: string, params: (string | number | null)[] = []): T[] {
  if (!dbInstance) throw new Error('Database not initialized');
  const stmt = dbInstance.prepare(sql);
  const results: T[] = [];
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export function executeRun(sql: string, params: (string | number | null)[] = []): { lastInsertRowid: number; changes: number } {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run(sql, params);
  const lastIdResult = dbInstance.exec('SELECT last_insert_rowid() as id');
  const lastInsertRowid = lastIdResult[0]?.values[0]?.[0] as number ?? 0;
  const changesResult = dbInstance.exec('SELECT changes() as ch');
  const changes = changesResult[0]?.values[0]?.[0] as number ?? 0;
  return { lastInsertRowid, changes };
}

export function executeTransaction(queries: { sql: string; params: (string | number | null)[] }[]): void {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run('BEGIN TRANSACTION');
  try {
    for (const { sql, params } of queries) {
      dbInstance.run(sql, params);
    }
    dbInstance.run('COMMIT');
  } catch (error) {
    dbInstance.run('ROLLBACK');
    throw error;
  }
}

export async function persistDatabase(): Promise<void> {
  if (dbInstance) {
    await saveDbToOPFS(dbInstance);
  }
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    initPromise = null;
  }
}

export async function exportDatabase(): Promise<Uint8Array> {
  if (!dbInstance) throw new Error('Database not initialized');
  return dbInstance.export();
}

export async function importDatabase(data: Uint8Array): Promise<void> {
  const SQL = await initSqlJs({
    locateFile: () => `/sql-wasm-browser.wasm`,
  });
  const newDb = new SQL.Database(data);
  if (dbInstance) {
    dbInstance.close();
  }
  dbInstance = newDb;
  await saveDbToOPFS(newDb);
}