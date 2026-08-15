import clsx from 'clsx';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'gray';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

const statusMap: Record<string, BadgeVariant> = {
  active: 'success', completed: 'success', paid: 'success', signed: 'success', checked_in: 'info',
  confirmed: 'info', scheduled: 'info', in_progress: 'warning', pending: 'warning',
  partial: 'warning', draft: 'gray', inactive: 'gray', cancelled: 'danger',
  no_show: 'danger', overdue: 'danger', refunded: 'danger',
};

export function Badge({ variant, children, className }: BadgeProps) {
  const resolvedVariant = variant || statusMap[String(children).toLowerCase()] || 'gray';
  return (
    <span className={clsx(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      variantStyles[resolvedVariant],
      className,
    )}>
      {children}
    </span>
  );
}
