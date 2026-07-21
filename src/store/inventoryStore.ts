import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TomaInventario, Rack, Posicion, ReferenciaCatalogo, Usuario, ConteoLineaWithDetails, ConteoPorReferencia, InformeDiferencias, AvanceRack, ActividadAuxiliar, ConfigInventario } from '../types';

interface InventoryState {
  // Current session
  currentTomaId: number | null;
  currentToma: TomaInventario | null;
  currentUser: Usuario | null;
  currentUserId: number | null;
  currentRackId: number | null;
  
  // Data
  racks: Rack[];
  posiciones: Posicion[];
  catalogo: ReferenciaCatalogo[];
  usuarios: Usuario[];
  conteos: ConteoLineaWithDetails[];
  conteoConsolidado: ConteoPorReferencia[];
  informeDiferencias: InformeDiferencias | null;
  avanceRacks: AvanceRack[];
  actividadAuxiliares: ActividadAuxiliar[];
  
  // Config
  config: ConfigInventario;
  
  // UI State
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  selectedPosicion: Posicion | null;
  selectedReferencia: ReferenciaCatalogo | null;
  pendingSync: boolean;
  
  // Actions
  setCurrentToma: (toma: TomaInventario | null) => void;
  setCurrentTomaId: (id: number | null) => void;
  setCurrentUser: (user: Usuario | null) => void;
  setCurrentRack: (rackId: number | null) => void;
  setRacks: (racks: Rack[]) => void;
  setPosiciones: (posiciones: Posicion[]) => void;
  setCatalogo: (catalogo: ReferenciaCatalogo[]) => void;
  setUsuarios: (usuarios: Usuario[]) => void;
  setConteos: (conteos: ConteoLineaWithDetails[]) => void;
  setConteoConsolidado: (conteos: ConteoPorReferencia[]) => void;
  setInformeDiferencias: (informe: InformeDiferencias | null) => void;
  setAvanceRacks: (avance: AvanceRack[]) => void;
  setActividadAuxiliares: (actividad: ActividadAuxiliar[]) => void;
  setConfig: (config: Partial<ConfigInventario>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedPosicion: (posicion: Posicion | null) => void;
  setSelectedReferencia: (referencia: ReferenciaCatalogo | null) => void;
  setPendingSync: (pending: boolean) => void;
  
  // Computed
  getCurrentAuxiliar: () => Usuario | null;
  getRackById: (id: number) => Rack | undefined;
  getPosicionById: (id: number) => Posicion | undefined;
  getReferenciaByCodigo: (codigo: string) => ReferenciaCatalogo | undefined;
  getConteosByPosicion: (posicionId: number) => ConteoLineaWithDetails[];
  getConteoTotalByReferencia: (referencia: string) => number;
  getConteoByRackReferencia: (rackId: number, referencia: string) => number;
  
  // Reset
  reset: () => void;
}

const defaultConfig: ConfigInventario = {
  tolerancia: 'normal',
  racks: [
    { nombre: 'R1', num_posiciones: 100 },
    { nombre: 'R2', num_posiciones: 80 },
    { nombre: 'R3', num_posiciones: 80 },
    { nombre: 'R4', num_posiciones: 90 },
    { nombre: 'R5', num_posiciones: 90 },
    { nombre: 'R6', num_posiciones: 90 },
    { nombre: 'R7', num_posiciones: 90 },
    { nombre: 'R8', num_posiciones: 100 },
  ],
};

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentTomaId: null,
      currentToma: null,
      currentUser: null,
      currentUserId: null,
      currentRackId: null,
      racks: [],
      posiciones: [],
      catalogo: [],
      usuarios: [],
      conteos: [],
      conteoConsolidado: [],
      informeDiferencias: null,
      avanceRacks: [],
      actividadAuxiliares: [],
      config: defaultConfig,
      isLoading: false,
      error: null,
      searchQuery: '',
      selectedPosicion: null,
      selectedReferencia: null,
      pendingSync: false,

      // Actions
      setCurrentToma: (toma) => set({ currentToma: toma, currentTomaId: toma?.id || null }),
      setCurrentTomaId: (id) => set({ currentTomaId: id }),
      setCurrentUser: (user) => set({ currentUser: user, currentUserId: user?.id || null }),
      setCurrentRack: (rackId) => set({ currentRackId: rackId }),
      setRacks: (racks) => set({ racks }),
      setPosiciones: (posiciones) => set({ posiciones }),
      setCatalogo: (catalogo) => set({ catalogo }),
      setUsuarios: (usuarios) => set({ usuarios }),
      setConteos: (conteos) => set({ conteos }),
      setConteoConsolidado: (conteoConsolidado) => set({ conteoConsolidado }),
      setInformeDiferencias: (informe) => set({ informeDiferencias: informe }),
      setAvanceRacks: (avance) => set({ avanceRacks: avance }),
      setActividadAuxiliares: (actividad) => set({ actividadAuxiliares: actividad }),
      setConfig: (config) => set((state) => ({ config: { ...state.config, ...config } })),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSelectedPosicion: (selectedPosicion) => set({ selectedPosicion }),
      setSelectedReferencia: (selectedReferencia) => set({ selectedReferencia }),
      setPendingSync: (pendingSync) => set({ pendingSync }),

      // Computed
      getCurrentAuxiliar: () => {
        const { currentUser } = get();
        return currentUser?.rol === 'auxiliar' ? currentUser : null;
      },
      getRackById: (id) => get().racks.find((r) => r.id === id),
      getPosicionById: (id) => get().posiciones.find((p) => p.id === id),
      getReferenciaByCodigo: (codigo) => get().catalogo.find((r) => r.referencia === codigo),
      getConteosByPosicion: (posicionId) => get().conteos.filter((c) => c.posicion_id === posicionId),
      getConteoTotalByReferencia: (referencia) =>
        get().conteos.filter((c) => c.referencia === referencia).reduce((sum, c) => sum + c.cantidad, 0),
      getConteoByRackReferencia: (rackId, referencia) =>
        get().conteos.filter((c) => c.rack_id === rackId && c.referencia === referencia).reduce((sum, c) => sum + c.cantidad, 0),

      // Reset
      reset: () =>
        set({
          currentTomaId: null,
          currentToma: null,
          currentUser: null,
          currentUserId: null,
          currentRackId: null,
          racks: [],
          posiciones: [],
          catalogo: [],
          usuarios: [],
          conteos: [],
          conteoConsolidado: [],
          informeDiferencias: null,
          avanceRacks: [],
          actividadAuxiliares: [],
          config: defaultConfig,
          isLoading: false,
          error: null,
          searchQuery: '',
          selectedPosicion: null,
          selectedReferencia: null,
          pendingSync: false,
        }),
    }),
    {
      name: 'inventario-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentTomaId: state.currentTomaId,
        currentUserId: state.currentUserId,
        currentRackId: state.currentRackId,
        config: state.config,
      }),
    }
  )
);