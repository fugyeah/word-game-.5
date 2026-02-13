import type { ApiError } from '@/types/domain';

interface ErrorPanelProps {
  readonly errors: readonly ApiError[];
}

export function ErrorPanel({ errors }: ErrorPanelProps): JSX.Element | null {
  if (errors.length === 0) {
    return null;
  }

  return (
    <aside className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-100">
      <ul className="space-y-1">
        {errors.map((error, index) => (
          <li key={`${error.code}-${index}`}>{error.message}</li>
        ))}
      </ul>
    </aside>
  );
}
