import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  message?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title = 'No data', message = 'Nothing to show yet.', action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 dark:bg-gray-800">
        {icon || <Inbox className="w-8 h-8 text-gray-400" />}
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-1 dark:text-gray-100">{title}</h3>
      <p className="text-sm text-gray-500 max-w-sm dark:text-gray-400">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
