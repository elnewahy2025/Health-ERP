import { Spinner } from './Spinner';

interface PageLoaderProps {
  message?: string;
}

export function PageLoader({ message = 'Loading...' }: PageLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4" role="status" aria-label={message}>
      <Spinner size="lg" />
      <p className="text-sm text-gray-500 animate-pulse dark:text-gray-400">{message}</p>
    </div>
  );
}
