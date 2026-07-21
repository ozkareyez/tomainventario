'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Warehouse, Plus, Eye, Trash2, Upload, Download,
  Loader2, Filter, User, Clock, Package
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { Toaster } from '@/components/ui/Toaster';
import { useInventoryStore } from '@/store/inventoryStore';
import { initDatabase, exportDatabase, importDatabase } from '@/db/database';
import { 
  TomaInventarioRepo, RackRepo, CuerpoRepo, ReferenciaCatalogoRepo, 
  UsuarioRepo, ConteoLineaRepo, InventarioRepo, ExcelRepo
} from '@/db/repositories';
import { toast } from '@/hooks/useToast';
import { formatNumber, formatDate, getEstadoLabel } from '@/utils/helpers';
import type { ReferenciaCatalogo, Cuerpo } from '@/types';



export function CapturePage() {
  const navigate = useNavigate();
  const {
    currentToma, currentTomaId, currentUserId, currentRackId,
    racks, catalogo, usuarios, conteos,
    setLoading, setRacks, setCatalogo, setUsuarios,
    setCurrentUser, setCurrentRack, setAvanceRacks,
    setSearchQuery,
  } = useInventoryStore();

  const [posicionesOcupadas, setPosicionesOcupadas] = useState('');
  const [unidadesPorPosicion, setUnidadesPorPosicion] = useState('');
  const [posicionesVacias, setPosicionesVacias] = useState(0);
  const [referenciaInput, setReferenciaInput] = useState('');
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [filteredReferencias, setFilteredReferencias] = useState<ReferenciaCatalogo[]>([]);
  const [cuerpos, setCuerpos] = useState<Cuerpo[]>([]);
  const [selectedCuerpo, setSelectedCuerpo] = useState<Cuerpo | null>(null);
  const [conteosCuerpo, setConteosCuerpo] = useState<any[]>([]);
  const [conteoCuerpoIds, setConteoCuerpoIds] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResumen, setShowResumen] = useState(false);
  const [resumenData, setResumenData] = useState<any>(null);
  const [showCleanup, setShowCleanup] = useState(false);
  const [cleanupPattern, setCleanupPattern] = useState('');
  const [cleanupPreview, setCleanupPreview] = useState<ReferenciaCatalogo[]>([]);
  const referenciaInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const load = async () => {
      await initDatabase();
      await UsuarioRepo.seedDefaults();
      const activeToma = await TomaInventarioRepo.getActive();
      if (activeToma) {
        await loadTomaData(activeToma.id);
      } else {
        navigate('/import');
      }
    };
    load();
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const loadTomaData = async (tomaId: number) => {
    setLoading(true);
    try {
      const [toma, racksData, catalogoData, usuariosData] = await Promise.all([
        TomaInventarioRepo.getById(tomaId),
        RackRepo.getByTomaInventario(tomaId),
        ReferenciaCatalogoRepo.getByTomaInventario(tomaId),
        UsuarioRepo.getAll(),
      ]);

      if (toma) {
        useInventoryStore.getState().setCurrentToma(toma);
        useInventoryStore.getState().setCurrentTomaId(toma.id);
      }
      
      setRacks(racksData);
      setCatalogo(catalogoData);
      setUsuarios(usuariosData);

      const allConteos = await ConteoLineaRepo.getByTomaInventario(tomaId);
      useInventoryStore.getState().setConteos(allConteos);

      if (racksData.length > 0) {
        setCurrentRack(racksData[0].id);
        await loadCuerpos(racksData[0].id);
      }
    } catch (error) {
      console.error('Error loading toma data:', error);
      toast({ title: 'Error', description: 'No se pudo cargar la toma de inventario', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadCuerpos = async (rackId: number) => {
    let cuerposData = await CuerpoRepo.getByRack(rackId);
    
    if (cuerposData.length === 0 && currentTomaId) {
      await RackRepo.generateAllCuerpos(currentTomaId);
      cuerposData = await CuerpoRepo.getByRack(rackId);
    }

    const conteoIds = await ConteoLineaRepo.getConteoCuerpoIdsByRack(rackId);
    setCuerpos(cuerposData);
    setConteoCuerpoIds(conteoIds);
    if (cuerposData.length > 0) {
      setSelectedCuerpo(cuerposData[0]);
      await loadConteosCuerpo(cuerposData[0].id);
    }
    await loadAvanceRacks();
  };

  const loadConteosCuerpo = async (cuerpoId: number) => {
    const [data, conteoIds] = await Promise.all([
      ConteoLineaRepo.getByCuerpo(cuerpoId),
      currentRackId ? ConteoLineaRepo.getConteoCuerpoIdsByRack(currentRackId) : Promise.resolve(new Set<number>()),
    ]);
    setConteosCuerpo(data);
    if (conteoIds.size > 0) setConteoCuerpoIds(conteoIds);
  };

  const loadAvanceRacks = async () => {
    if (!currentTomaId) return;
    const data = await InventarioRepo.getAvanceRacks(currentTomaId);
    setAvanceRacks(data);
  };

  const handleReferenciaSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    
    searchDebounceRef.current = setTimeout(async () => {
      if (query.length >= 1 && currentTomaId) {
        const results = await ReferenciaCatalogoRepo.searchByDescription(currentTomaId, query);
        setFilteredReferencias(results);
        setShowProductDialog(results.length > 0);
      } else {
        setShowProductDialog(false);
      }
    }, 150);
  }, [currentTomaId, setSearchQuery]);

  const handleReferenciaSelect = (ref: ReferenciaCatalogo) => {
    setReferenciaInput(ref.referencia);
    setShowProductDialog(false);
    setPosicionesOcupadas('');
    setUnidadesPorPosicion('');
    setPosicionesVacias(0);
  };

  const handleAddConteo = async () => {
    if (!currentTomaId || !currentUserId || !selectedCuerpo || !referenciaInput.trim() || !posicionesOcupadas || !unidadesPorPosicion) {
      toast({ title: 'Datos incompletos', description: 'Complete todos los campos', variant: 'destructive' });
      return;
    }

    const ocupadas = parseInt(posicionesOcupadas);
    const porPosicion = parseInt(unidadesPorPosicion);
    if (isNaN(ocupadas) || isNaN(porPosicion) || ocupadas < 1 || porPosicion < 1) {
      toast({ title: 'Valores inválidos', description: 'Ingrese números válidos mayores a 0', variant: 'destructive' });
      return;
    }

    const total = ocupadas * porPosicion;
    if (ocupadas + posicionesVacias > (selectedCuerpo?.total_posiciones || 5)) {
      toast({
        title: 'Posiciones excedidas',
        description: `El cuerpo ${selectedCuerpo.codigo} tiene ${selectedCuerpo.total_posiciones} posiciones (${ocupadas} ocupadas + ${posicionesVacias} vacías)`,
        variant: 'destructive'
      });
      return;
    }

    const refExists = catalogo.find(c => c.referencia === referenciaInput.trim());

    setIsSubmitting(true);
    try {
      const formulaText = `${ocupadas}*${porPosicion}`;

      await ConteoLineaRepo.create(
        currentTomaId,
        0,
        referenciaInput.trim().toUpperCase(),
        total,
        currentUserId,
        'app',
        selectedCuerpo.id,
        ocupadas,
        posicionesVacias,
        formulaText
      );
      
      await loadConteosCuerpo(selectedCuerpo.id);
      await loadAvanceRacks();
      const allConteos = await ConteoLineaRepo.getByTomaInventario(currentTomaId);
      useInventoryStore.getState().setConteos(allConteos);
      
      toast({
        title: 'Guardado',
        description: `${refExists?.descripcion || referenciaInput.trim()} - ${formatNumber(total)} (${ocupadas} pos × ${porPosicion} uds)`,
        variant: 'success'
      });
      
      setPosicionesOcupadas('');
      setUnidadesPorPosicion('');
      setPosicionesVacias(0);
      setReferenciaInput('');
      setFilteredReferencias([]);

      const currentIndex = cuerpos.findIndex(c => c.id === selectedCuerpo?.id);
      if (currentIndex < cuerpos.length - 1) {
        const next = cuerpos[currentIndex + 1];
        setSelectedCuerpo(next);
        await loadConteosCuerpo(next.id);
      }
      
      setTimeout(() => referenciaInputRef.current?.focus(), 100);
    } catch (error) {
      console.error('Error saving count:', error);
      toast({ title: 'Error', description: 'No se pudo guardar el conteo', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConteo = async (conteoId: number) => {
    if (!confirm('¿Eliminar este registro de conteo?')) return;
    try {
      await ConteoLineaRepo.delete(conteoId);
      await loadConteosCuerpo(selectedCuerpo!.id);
      await loadAvanceRacks();
      const allConteos = await ConteoLineaRepo.getByTomaInventario(currentTomaId!);
      useInventoryStore.getState().setConteos(allConteos);
      toast({ title: 'Eliminado', description: 'Registro de conteo removido', variant: 'success' });
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' });
    }
  };

  const handleShowResumen = async () => {
    if (!currentTomaId) return;
    const data = await InventarioRepo.getInformeDiferencias(currentTomaId);
    setResumenData(data);
    setShowResumen(true);
  };

  const handleExportDB = async () => {
    const data = await exportDatabase();
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventario_${new Date().toISOString().split('T')[0]}.db`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado', description: 'Base de datos descargada', variant: 'success' });
  };

  const handleImportDB = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const buffer = await file.arrayBuffer();
      await importDatabase(new Uint8Array(buffer));
      toast({ title: 'Importado', description: 'Base de datos cargada, recargando...', variant: 'success' });
      setTimeout(() => window.location.reload(), 1000);
    };
    input.click();
  };

  const handleCleanupPreview = async () => {
    if (!currentTomaId || !cleanupPattern.trim()) return;
    const refs = catalogo.filter(r => r.referencia.includes(cleanupPattern.replace(/%/g, '')));
    const conteadas = new Set(conteos.map(c => c.referencia));
    setCleanupPreview(refs.filter(r => !conteadas.has(r.referencia)));
  };

  const handleCleanupExecute = async () => {
    if (!currentTomaId || !cleanupPattern.trim()) return;
    const pattern = cleanupPattern.includes('%') ? cleanupPattern : `${cleanupPattern}%`;
    const deleted = await ReferenciaCatalogoRepo.deleteUncountedByPattern(currentTomaId, pattern);
    const newCatalogo = await ReferenciaCatalogoRepo.getByTomaInventario(currentTomaId);
    setCatalogo(newCatalogo);
    setCleanupPreview([]);
    setCleanupPattern('');
    toast({ title: 'Limpieza completada', description: `${deleted} referencias eliminadas`, variant: 'success' });
  };

  const getAuxiliarOptions = () => 
    usuarios.filter(u => u.rol === 'auxiliar').map(u => ({ value: String(u.id), label: u.nombre }));

  if (!currentToma) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentRack = racks.find(r => r.id === currentRackId);
  const currentAuxiliar = usuarios.find(u => u.id === currentUserId);

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <Warehouse className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{currentToma.bodega}</h1>
                <p className="text-xs sm:text-sm text-gray-500 truncate">Toma de inventario • {formatDate(currentToma.fecha_inicio)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto overflow-x-auto">
              <select
                value={currentRackId || ''}
                onChange={(e) => { const id = Number(e.target.value); if (id) { setCurrentRack(id); loadCuerpos(id); } }}
                className="flex-1 sm:flex-none border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary min-w-0 max-w-[120px] sm:max-w-none"
              >
                <option value="">Rack</option>
                {racks.map(r => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
              <div className="flex items-center gap-0.5 sm:gap-1 border-l pl-2 sm:pl-3 border-gray-200">
                <Button variant="ghost" size="icon" onClick={handleExportDB} title="Exportar BD" className="h-8 w-8 sm:h-9 sm:w-9">
                  <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleImportDB} title="Importar BD" className="h-8 w-8 sm:h-9 sm:w-9">
                  <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowCleanup(true)} className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3">
                <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                <span className="hidden sm:inline">Limpiar</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleShowResumen} className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3">
                <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                <span className="hidden sm:inline">Resumen</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <Package className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                  <span className="truncate">Captura - {currentRack?.nombre || 'Seleccione rack'}</span>
                </CardTitle>
                {selectedCuerpo && (
                  <div className="flex gap-1.5 shrink-0">
                    <Badge variant="secondary" className="text-xs">{selectedCuerpo.codigo}</Badge>
                    <Badge variant="outline" className="text-xs">{selectedCuerpo.total_posiciones} pos</Badge>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-3 sm:p-4 space-y-3">
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs sm:text-sm font-medium text-gray-700">Producto</label>
                    <div className="flex gap-1.5 sm:gap-2">
                      <div className="flex-1 relative">
                        <Input
                          placeholder="Buscar producto..."
                          value={referenciaInput}
                          onChange={(e) => { setReferenciaInput(e.target.value.toUpperCase()); handleReferenciaSearch(e.target.value.toUpperCase()); }}
                          ref={referenciaInputRef}
                          autoComplete="off"
                          className="pr-10 text-sm h-9 sm:h-10"
                        />
                        {filteredReferencias.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowProductDialog(true)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs bg-primary/10 text-primary px-1.5 sm:px-2 py-0.5 rounded-full font-medium"
                          >
                            {filteredReferencias.length}
                          </button>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (referenciaInput.length >= 1 && currentTomaId) {
                            ReferenciaCatalogoRepo.searchByDescription(currentTomaId, referenciaInput).then(r => {
                              setFilteredReferencias(r);
                              setShowProductDialog(r.length > 0);
                            });
                          }
                        }}
                        className="shrink-0 h-9 sm:h-10 text-xs sm:text-sm"
                      >
                        Buscar
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                    <div>
                      <label className="mb-1 block text-xs sm:text-sm font-medium text-gray-700">Cuerpo</label>
                      <select
                        value={selectedCuerpo?.id || ''}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          const cuerpo = cuerpos.find(c => c.id === id);
                          if (cuerpo) {
                            setSelectedCuerpo(cuerpo);
                            loadConteosCuerpo(cuerpo.id);
                            setPosicionesOcupadas('');
                            setUnidadesPorPosicion('');
                            setPosicionesVacias(0);
                            setReferenciaInput('');
                          }
                        }}
                        className="w-full h-9 sm:h-10 rounded-md border border-gray-300 bg-white px-1.5 sm:px-2 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Cuerpo</option>
                        {cuerpos.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.codigo}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Input
                      label="Posiciones"
                      placeholder="0"
                      value={posicionesOcupadas}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setPosicionesOcupadas(val);
                        const n = parseInt(val) || 0;
                        const total = selectedCuerpo?.total_posiciones || 5;
                        setPosicionesVacias(Math.max(0, total - n));
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddConteo()}
                      inputMode="numeric"
                      className="text-sm h-9 sm:h-10"
                    />
                    <Input
                      label="Uds/pos"
                      placeholder="0"
                      value={unidadesPorPosicion}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setUnidadesPorPosicion(val);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddConteo()}
                      inputMode="numeric"
                      className="text-sm h-9 sm:h-10"
                    />
                  </div>

                  <div className="flex flex-row items-center gap-2 flex-wrap">
                    <div className="bg-primary/5 rounded-lg px-2.5 sm:px-3 py-1.5 sm:py-2 min-w-[100px] sm:min-w-[120px]">
                      <span className="text-[10px] sm:text-xs text-gray-500">Total</span>
                      <p className="text-base sm:text-lg font-bold font-mono text-primary">
                        {posicionesOcupadas && unidadesPorPosicion
                          ? formatNumber((parseInt(posicionesOcupadas) || 0) * (parseInt(unidadesPorPosicion) || 0))
                          : '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] sm:text-xs text-gray-500">Vacías:</span>
                      <Button variant="outline" size="sm" className="h-6 w-6 sm:h-7 sm:w-7 p-0 text-xs" onClick={() => setPosicionesVacias(Math.max(0, posicionesVacias - 1))} disabled={posicionesVacias <= 0}>−</Button>
                      <span className="w-6 sm:w-7 text-center font-mono font-bold text-xs sm:text-sm">{posicionesVacias}</span>
                      <Button variant="outline" size="sm" className="h-6 w-6 sm:h-7 sm:w-7 p-0 text-xs" onClick={() => setPosicionesVacias(Math.min((selectedCuerpo?.total_posiciones || 5) - (parseInt(posicionesOcupadas) || 0), posicionesVacias + 1))} disabled={posicionesVacias >= ((selectedCuerpo?.total_posiciones || 5) - (parseInt(posicionesOcupadas) || 0))}>+</Button>
                    </div>
                    <div className="flex items-center gap-1 sm:ml-auto">
                      <span className="text-[10px] sm:text-xs text-gray-500">Aux:</span>
                      <select
                        value={currentUserId || ''}
                        onChange={(e) => setCurrentUser(usuarios.find(u => u.id === Number(e.target.value)) || null)}
                        className="h-7 sm:h-8 rounded-md border border-gray-300 bg-white px-1.5 sm:px-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary max-w-[110px] sm:max-w-none"
                      >
                        <option value="">Sel.</option>
                        {getAuxiliarOptions().map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <Button onClick={handleAddConteo} disabled={isSubmitting || !selectedCuerpo || !currentUserId} size="lg" className="w-full h-10 sm:h-11 text-sm sm:text-base">
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Registrar Conteo
                  </Button>
                </div>

                {showProductDialog && filteredReferencias.length > 0 && (
                  <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
                    <DialogContent className="max-w-lg max-h-[60vh]">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <Package className="h-5 w-5" />
                          Productos encontrados
                        </DialogTitle>
                      </DialogHeader>
                      <div className="overflow-y-auto max-h-[45vh] space-y-1">
                        {filteredReferencias.slice(0, 50).map(ref => (
                          <button key={ref.id} onClick={() => handleReferenciaSelect(ref)}
                            className="w-full px-4 py-3 text-left hover:bg-gray-100 rounded-lg border border-gray-100 flex flex-col items-start gap-1 transition-colors"
                          >
                            <div className="flex items-center gap-2 w-full">
                              <span className="font-mono text-primary font-semibold text-sm">{ref.referencia}</span>
                              <span className="text-xs text-gray-400 ml-auto">{formatNumber(ref.existencia_sistema)} {ref.unidad_medida}</span>
                            </div>
                            <span className="text-gray-700 text-sm">{ref.descripcion}</span>
                          </button>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {conteosCuerpo.length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Conteos en {selectedCuerpo?.codigo} ({conteosCuerpo.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Producto</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead className="text-right">Fórmula</TableHead>
                            <TableHead className="text-right">Ocupadas</TableHead>
                            <TableHead className="text-right">Vacías</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Auxiliar</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {conteosCuerpo.map(c => (
                            <TableRow key={c.id}>
                              <TableCell className="font-mono text-primary">{c.referencia}</TableCell>
                              <TableCell className="text-sm">{c.descripcion || '-'}</TableCell>
                              <TableCell className="text-right font-mono text-xs text-gray-500">{c.formula_text || '-'}</TableCell>
                              <TableCell className="text-right">{c.posiciones_ocupadas}</TableCell>
                              <TableCell className="text-right text-gray-400">{c.posiciones_vacias}</TableCell>
                              <TableCell className="text-right font-mono font-medium">{formatNumber(c.cantidad)}</TableCell>
                              <TableCell className="text-sm">{c.auxiliar_nombre}</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteConteo(c.id)}>
                                  <Trash2 className="h-4 w-4 text-danger" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {conteosCuerpo.length === 0 && selectedCuerpo && (
                  <p className="text-center text-gray-400 py-4 text-sm">
                    Sin conteos registrados en {selectedCuerpo.codigo}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Cuerpos - {currentRack?.nombre}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-1 sm:gap-1.5 max-h-96 overflow-y-auto">
                  {cuerpos.map(cuerpo => {
                    const isSelected = selectedCuerpo?.id === cuerpo.id;
                    const isContado = conteoCuerpoIds.has(cuerpo.id);
                    return (
                      <button
                        key={cuerpo.id}
                        onClick={() => { setSelectedCuerpo(cuerpo); loadConteosCuerpo(cuerpo.id); setPosicionesOcupadas(''); setUnidadesPorPosicion(''); setPosicionesVacias(0); setReferenciaInput(''); }}
                        className={`p-1.5 sm:p-2 text-[10px] sm:text-xs rounded border transition-all ${
                          isSelected
                            ? 'bg-primary border-primary text-white'
                            : isContado
                              ? 'bg-green-50 border-green-300 text-green-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <div className="font-mono font-semibold">{cuerpo.codigo}</div>
                        <div className="text-[9px] sm:text-xs opacity-75">{cuerpo.total_posiciones} pos</div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <User className="h-4 w-4 sm:h-5 sm:w-5" />
                  Auxiliar
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0 sm:pt-0">
                <div className="space-y-2 sm:space-y-3">
                  <div className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs sm:text-sm text-gray-500">Usuario activo</p>
                    <p className="text-sm sm:text-base font-medium text-gray-900">{currentAuxiliar?.nombre || 'No seleccionado'}</p>
                    <p className="text-[10px] sm:text-xs text-gray-500">Rol: {currentAuxiliar?.rol || '-'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-xs sm:text-sm">
                    <div className="p-1.5 sm:p-2 bg-gray-50 rounded">
                      <p className="text-gray-500">Rack</p>
                      <p className="font-medium">{currentRack?.nombre || '-'}</p>
                    </div>
                    <div className="p-1.5 sm:p-2 bg-gray-50 rounded">
                      <p className="text-gray-500">Cuerpo</p>
                      <p className="font-medium">{selectedCuerpo?.codigo || '-'}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <Filter className="h-4 w-4 sm:h-5 sm:w-5" />
                  Avance por Rack
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0 sm:pt-0">
                <div className="space-y-2 sm:space-y-3">
                  {racks.map(rack => {
                    const avance = useInventoryStore.getState().avanceRacks.find(a => a.rack_id === rack.id);
                    const pct = avance?.porcentaje || 0;
                    const tc = Math.ceil(rack.num_posiciones / 5);
                    const ct = avance?.posiciones_contadas || 0;
                    return (
                      <div key={rack.id}>
                        <div className="flex justify-between text-xs sm:text-sm mb-1">
                          <span className="font-medium">{rack.nombre}</span>
                          <span className="text-gray-500">{ct}/{tc} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 sm:h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                  Actividad Reciente
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0 sm:pt-0">
                <div className="space-y-1.5 sm:space-y-2 max-h-48 sm:max-h-64 overflow-y-auto">
                  {conteos.slice(0, 10).map(c => (
                    <div key={c.id} className="p-2 sm:p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex justify-between text-[10px] sm:text-xs">
                        <span className="font-mono text-primary font-medium">{c.referencia}</span>
                        <span className="text-gray-500">{formatDate(c.fecha_hora)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] sm:text-xs mt-0.5 sm:mt-1">
                        <span className="text-gray-600">{c.posicion_codigo}</span>
                        <span className="font-medium">{formatNumber(c.cantidad)}{c.formula_text ? ` (${c.formula_text})` : ''}</span>
                      </div>
                      <div className="text-[9px] sm:text-xs text-gray-400">{c.auxiliar_nombre}</div>
                    </div>
                  ))}
                  {conteos.length === 0 && (
                    <p className="text-center text-gray-500 py-3 sm:py-4 text-xs sm:text-sm">No hay conteos registrados</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {showCleanup && (
        <Dialog open={showCleanup} onOpenChange={setShowCleanup}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-danger" />
                Limpiar referencias no contadas
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Patrón de referencias a eliminar
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ej: ANT% o %E%"
                    value={cleanupPattern}
                    onChange={(e) => setCleanupPattern(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleCleanupPreview()}
                  />
                  <Button variant="outline" onClick={handleCleanupPreview}>Previsualizar</Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Use % como comodín. Ej: <button className="text-primary underline" onClick={() => setCleanupPattern('ANT%')}>ANT%</button>,{' '}
                  <button className="text-primary underline" onClick={() => setCleanupPattern('%E%')}>%E%</button>
                </p>
              </div>

              {cleanupPreview.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {cleanupPreview.length} referencias no contadas coinciden
                  </p>
                  <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                    {cleanupPreview.slice(0, 50).map(r => (
                      <div key={r.id} className="flex justify-between text-sm">
                        <span className="font-mono text-primary">{r.referencia}</span>
                        <span className="text-gray-500 truncate ml-2">{r.descripcion}</span>
                      </div>
                    ))}
                    {cleanupPreview.length > 50 && (
                      <p className="text-xs text-gray-400 text-center">
                        ... y {cleanupPreview.length - 50} más
                      </p>
                    )}
                  </div>
                  <Button
                    className="mt-3 w-full"
                    variant="destructive"
                    onClick={handleCleanupExecute}
                  >
                    Eliminar {cleanupPreview.length} referencias
                  </Button>
                </div>
              )}

              {cleanupPattern && cleanupPreview.length === 0 && (
                <p className="text-sm text-gray-500 text-center">No se encontraron referencias no contadas con ese patrón</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showResumen && resumenData && (
        <Dialog open={showResumen} onOpenChange={setShowResumen}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Informe de Diferencias - {currentToma.bodega}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto max-h-[60vh] space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-2xl font-bold text-success">{resumenData.cuadradas}</p>
                  <p className="text-sm text-gray-500">Cuadradas</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-danger">{resumenData.faltantes}</p>
                  <p className="text-sm text-gray-500">Faltantes</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-warning">{resumenData.sobrantes}</p>
                  <p className="text-sm text-gray-500">Sobrantes</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referencia</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Sistema</TableHead>
                      <TableHead className="text-right">Físico</TableHead>
                      <TableHead className="text-right">Diff</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resumenData.referencias.slice(0, 100).map((r: any) => (
                      <TableRow key={r.referencia} className={r.estado !== 'cuadrada' ? 'bg-red-50' : ''}>
                        <TableCell className="font-mono text-primary">{r.referencia}</TableCell>
                        <TableCell className="text-sm max-w-xs truncate">{r.descripcion}</TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(r.existencia_sistema)}</TableCell>
                        <TableCell className="text-right font-mono font-medium">{formatNumber(r.total_fisico)}</TableCell>
                        <TableCell className="text-right font-mono font-medium text-danger">{r.diferencia > 0 ? '+' : ''}{formatNumber(r.diferencia)}</TableCell>
                        <TableCell><Badge variant={r.estado as any}>{getEstadoLabel(r.estado)}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {resumenData.referencias_no_contadas.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Referencias NO contadas ({resumenData.referencias_no_contadas.length})</h4>
                  <div className="flex flex-wrap gap-1">
                    {resumenData.referencias_no_contadas.slice(0, 20).map((r: any) => (
                      <Badge key={r.referencia} variant="secondary" className="text-xs">{r.referencia}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {resumenData.referencias_no_en_sistema.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-700 mb-2 text-warning">Contadas NO en sistema ({resumenData.referencias_no_en_sistema.length})</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Referencia</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resumenData.referencias_no_en_sistema.map((r: any) => (
                          <TableRow key={r.referencia}>
                            <TableCell className="font-mono text-warning">{r.referencia}</TableCell>
                            <TableCell className="text-right font-mono">{formatNumber(r.total_fisico)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowResumen(false)}>Cerrar</Button>
              <Button onClick={async () => {
                if (currentTomaId && currentToma?.bodega) {
                  await ExcelRepo.exportInforme(currentTomaId, currentToma.bodega);
                  toast({ title: 'Exportado', description: 'Informe descargado', variant: 'success' });
                }
              }}>Exportar Excel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
