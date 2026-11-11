import { cn } from './utils';

type Variant = 'default' | 'outline' | 'ghost';
type Size = 'default' | 'sm';

const variants: Record<Variant, string> = {
  default: 'bg-primary text-primary-foreground hover:opacity-90',
  outline: 'border border-border bg-transparent hover:bg-muted',
  ghost: 'bg-transparent hover:bg-muted',
};

const sizes: Record<Size, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 px-3 text-xs',
};

interface StyleOptions {
  variant?: Variant;
  size?: Size;
  className?: string;
}

export function buttonStyles({
  variant = 'default',
  size = 'default',
  className,
}: StyleOptions = {}): string {
  return cn(
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  );
}
