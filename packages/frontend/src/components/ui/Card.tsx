import { HTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ padding = 'md', className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={clsx('bg-white rounded-xl border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800', paddingStyles[padding], className)}
      {...props}
    >
      {children}
    </div>
  ),
);
Card.displayName = 'Card';

export const CardHeader = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx('px-6 py-4 border-b border-gray-200 dark:border-gray-800', className)} {...props}>
    {typeof children === 'string' ? <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{children}</h2> : children}
  </div>
);

export const CardBody = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx('p-6', className)} {...props}>{children}</div>
);
