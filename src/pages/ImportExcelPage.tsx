'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Upload, Loader2, CheckCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useInventoryStore } from '@/store/inventoryStore';
import { initDatabase } from '@/db/database';
import { TomaInventarioRepo, ReferenciaCatalogoRepo, RackRepo, UsuarioRepo } from '@/db/repositories';
import { ExcelRepo } from '@/db/repositories';
import { toast } from '@/hooks/useToast';
import { formatNumber } from '@/utils/helpers';

export function ImportExcelPage() {
  const navigate = useNavigate();
  const store = useInventoryStore();
  const { setLoading, setError, setCatalogo, currentTomaId, config } = store;
  
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [bodega, setBodega] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);

  useEffect(() => {
    initDatabase().catch(console.error);
    UsuarioRepo.seedDefaults();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      toast({ title: 'Archivo inválido', description: 'Por favor seleccione un archivo Excel (.xlsx o .xls)', variant: 'destructive' });
      return;
    }

    setFile(selectedFile);
    setError(null);
    setImportResult(null);
    setShowPreview(false);

    try {
      setLoading(true);
      const data = await ExcelRepo.parseExcel(selectedFile);
      setPreviewData(data.slice(0, 50));
      setShowPreview(true);
    } catch (error) {
      console.error('Error parsing Excel:', error);
      toast({ title: 'Error al leer archivo', description: 'No se pudo procesar el archivo Excel', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [setLoading, store.setError]);

  const handleImport = useCallback(async () => {
    if (!file || !bodega.trim()) {
      toast({ title: 'Datos incompletos', description: 'Por favor seleccione un archivo e ingrese el nombre de la bodega', variant: 'destructive' });
      return;
    }

    setIsImporting(true);
    setLoading(true);

    try {
      const data = await ExcelRepo.parseExcel(file);
      
      const tomaId = await TomaInventarioRepo.create(bodega.trim(), file.name);
      await RackRepo.createMultiple(tomaId, config.racks);

      const items = data.map((row) => ({
        referencia: row.Referencia,
        descripcion: row['Desc. Item'],
        unidad_medida: row['U.M.'],
        sublinea: row.Sublínea,
        existencia_sistema: row.Existencia,
        cod_barras: row['Cod. Barras'] || null,
      }));

      const result = await ReferenciaCatalogoRepo.bulkCreate(tomaId, items);

      await RackRepo.generateAllCuerpos(tomaId);
      await UsuarioRepo.seedDefaults();

      setCatalogo(items.map((item, index) => ({ id: index + 1, toma_inventario_id: tomaId, ...item, created_at: new Date().toISOString() })));
      store.setCurrentToma({ id: tomaId, bodega: bodega.trim(), fecha_inicio: new Date().toISOString(), estado: 'en_progreso', archivo_sistema_origen: file.name, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      store.setCurrentTomaId(tomaId);

      setImportResult({ success: result.success, errors: result.errors });
      
      toast({ 
        title: 'Importación exitosa', 
        description: `${result.success} referencias cargadas correctamente`, 
        variant: 'success' 
      });

      setTimeout(() => navigate('/capture'), 1500);
    } catch (error) {
      console.error('Import error:', error);
      toast({ title: 'Error en importación', description: 'Ocurrió un error al procesar el archivo', variant: 'destructive' });
    } finally {
      setIsImporting(false);
      setLoading(false);
    }
  }, [file, bodega, config.racks, navigate, setLoading, setCatalogo, store]);

  if (currentTomaId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Toma de inventario ya creada
              </CardTitle>
              <CardDescription>Bodega: {store.currentToma?.bodega}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button onClick={() => navigate('/capture')} size="lg">
                <ArrowRight className="h-4 w-4 mr-2" />
                Ir a captura
              </Button>
              <Button variant="outline" onClick={() => store.reset()}>
                Nueva toma
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Importar Excel de Inventario</h1>
          <p className="text-gray-600 mt-1">Cargue el archivo exportado del ERP para crear la línea base teórica</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>1. Datos de la toma</CardTitle>
            <CardDescription>Información básica de la bodega y archivo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Bodega / Centro de costo"
              placeholder="Ej: Bodega Principal, CD Medellín, etc."
              value={bodega}
              onChange={(e) => setBodega(e.target.value)}
              required
            />
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                id="excel-file"
                disabled={isImporting}
              />
              <label htmlFor="excel-file" className="cursor-pointer">
                <Upload className="h-12 w-12 mx-auto text-gray-400" />
                <p className="mt-2 text-gray-600">Arrastre el archivo Excel aquí o haga clic para seleccionar</p>
                <p className="text-sm text-gray-500 mt-1">Formatos: .xlsx, .xls (máx. 10MB)</p>
              </label>
              {file && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-700">
                  <FileText className="h-5 w-5 text-primary" />
                  <span>{file.name}</span>
                  <span>({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {showPreview && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                2. Vista previa de datos ({previewData.length} mostradas)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referencia</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>U.M.</TableHead>
                      <TableHead className="text-right">Existencia</TableHead>
                      <TableHead>Sublínea</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.slice(0, 20).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono">{row.Referencia}</TableCell>
                        <TableCell>{row['Desc. Item']}</TableCell>
                        <TableCell>{row['U.M.']}</TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(row.Existencia)}</TableCell>
                        <TableCell className="text-xs text-gray-500">{row.Sublínea}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {importResult && (
          <Card className="mt-6 border-green-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-5 w-5" />
                Importación completada
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-green-700">{importResult.success} referencias importadas correctamente</p>
              {importResult.errors.length > 0 && (
                <p className="text-yellow-700 mt-1">{importResult.errors.length} filas con advertencias</p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => { setFile(null); setPreviewData([]); setShowPreview(false); setImportResult(null); setBodega(''); }}>
            Limpiar
          </Button>
          <Button onClick={handleImport} disabled={!file || !bodega.trim() || isImporting} size="lg">
            {isImporting ? (
              <> <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando... </ >
            ) : (
              <> <FileText className="h-4 w-4 mr-2" /> Crear toma e importar </ >
            )}
          </Button>
        </div>

        <Card className="mt-8 border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Formato esperado del Excel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-gray-700">Columnas requeridas:</p>
                <ul className="mt-1 space-y-1 text-gray-600">
                  <li>• C.O. bodega</li>
                  <li>• Referencia</li>
                  <li>• Desc. Item</li>
                  <li>• U.M.</li>
                  <li>• Existencia</li>
                  <li>• Sublínea</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-gray-700">Notas:</p>
                <ul className="mt-1 space-y-1 text-gray-600">
                  <li>• La primera fila debe ser encabezados</li>
                  <li>• Referencia es el código único del ítem</li>
                  <li>• Existencia = cantidad teórica en sistema</li>
                  <li>• Se ignoran filas sin referencia</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}