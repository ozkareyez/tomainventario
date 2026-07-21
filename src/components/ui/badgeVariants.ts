import { cva, type VariantProps } from 'class-variance-authority';

export const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-white hover:bg-primary-hover',
        secondary: 'border-transparent bg-gray-100 text-gray-800 hover:bg-gray-200',
        destructive: 'border-transparent bg-danger text-white hover:bg-danger-hover',
        outline: 'text-gray-700 border-gray-300',
        success: 'border-transparent bg-success text-white hover:bg-success-hover',
        warning: 'border-transparent bg-warning text-white hover:bg-warning-hover',
        cuadrada: 'border-transparent bg-success text-white',
        faltante: 'border-transparent bg-danger text-white',
        sobrante: 'border-transparent bg-warning text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;