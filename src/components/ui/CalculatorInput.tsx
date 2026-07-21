'use client';

import * as React from 'react';
import { cn } from '../../utils/helpers';
import { Calculator } from 'lucide-react';

export interface CalculatorInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  showPreview?: boolean;
}

const safeEval = (expression: string): number | null => {
  const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
  if (sanitized !== expression.trim()) return null;
  
  try {
    const result = Function(`"use strict"; return (${sanitized})`)();
    return Number.isFinite(result) && Number.isInteger(result) && result >= 0 ? result : null;
  } catch {
    return null;
  }
};

export const CalculatorInput = React.forwardRef<HTMLInputElement, CalculatorInputProps>(
  ({ className, label, error, helperText, showPreview = true, id, name, onChange, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const [rawValue, setRawValue] = React.useState('');
    const [calculatedValue, setCalculatedValue] = React.useState<number | null>(null);
    const [showCalculator, setShowCalculator] = React.useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setRawValue(e.target.value);
      if (onChange) onChange(e);
    };

    React.useEffect(() => {
      const result = safeEval(rawValue);
      setCalculatedValue(result);
    }, [rawValue]);

    React.useEffect(() => {
      if (calculatedValue !== null && onChange) {
        onChange({
          target: { name, value: String(calculatedValue) },
        } as React.ChangeEvent<HTMLInputElement>);
      }
    }, [calculatedValue, name, onChange]);

    const handleBlur = () => {
      setShowCalculator(false);
    };

    const handleFocus = () => {
      setShowCalculator(true);
    };

    const insertValue = (value: string) => {
      setRawValue(prev => prev + value);
    };

    const clear = () => {
      setRawValue('');
      setCalculatedValue(null);
    };

    const backspace = () => {
      setRawValue(prev => prev.slice(0, -1));
    };

    const displayValue = rawValue || (calculatedValue !== null ? String(calculatedValue) : props.value || '');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-gray-700">
            {label}
            {showPreview && calculatedValue !== null && rawValue && (
              <span className="ml-2 text-xs text-primary font-normal">
                = {calculatedValue.toLocaleString()}
              </span>
            )}
          </label>
        )}
        
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            type="text"
            inputMode="numeric"
            value={displayValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={cn(
              'flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-10',
              error && 'border-danger focus-visible:ring-danger',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            {...props}
          />
          
          <button
            type="button"
            onClick={() => setShowCalculator(!showCalculator)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary transition-colors"
            aria-label="Calculadora"
          >
            <Calculator className="h-4 w-4" />
          </button>
        </div>

        {showCalculator && (
          <div className="absolute z-10 mt-1 w-56 bg-white border border-gray-300 rounded-md shadow-lg p-3">
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {['7', '8', '9', '⌫', '4', '5', '6', '×', '1', '2', '3', '÷', '0', '00', 'C', '='].map((key, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (key === '⌫') backspace();
                    else if (key === 'C') clear();
                    else if (key === '=') { /* evaluated on blur */ }
                    else if (key === '×') insertValue('*');
                    else if (key === '÷') insertValue('/');
                    else insertValue(key);
                  }}
                  className={cn(
                    'h-10 w-full rounded text-sm font-medium transition-colors',
                    key === '=' ? 'bg-primary text-white hover:bg-primary/90 col-span-4' :
                    key === 'C' ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' :
                    key === '⌫' ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' :
                    'bg-gray-50 text-gray-900 hover:bg-gray-100'
                  )}
                >
                  {key}
                </button>
              ))}
            </div>
            {rawValue && calculatedValue !== null && (
              <div className="text-right text-sm text-primary font-medium">
                Resultado: {calculatedValue.toLocaleString()}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-1.5 text-sm text-danger" role="alert">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    );
  }
);
CalculatorInput.displayName = 'CalculatorInput';