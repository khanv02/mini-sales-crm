import type { ButtonHTMLAttributes } from 'react';
import { buttonStyles } from '../../lib/button-styles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
}

export function Button({ className, variant = 'default', size = 'default', ...props }: ButtonProps) {
  return <button className={buttonStyles({ variant, size, className })} {...props} />;
}
