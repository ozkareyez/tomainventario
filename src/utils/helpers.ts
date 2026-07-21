import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-CO').format(num);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateShort(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function getEstadoColor(estado: 'cuadrada' | 'faltante' | 'sobrante'): string {
  switch (estado) {
    case 'cuadrada':
      return 'bg-green-100 text-green-800';
    case 'faltante':
      return 'bg-red-100 text-red-800';
    case 'sobrante':
      return 'bg-yellow-100 text-yellow-800';
  }
}

export function getEstadoLabel(estado: 'cuadrada' | 'faltante' | 'sobrante'): string {
  switch (estado) {
    case 'cuadrada':
      return 'Cuadrada';
    case 'faltante':
      return 'Faltante';
    case 'sobrante':
      return 'Sobrante';
  }
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}