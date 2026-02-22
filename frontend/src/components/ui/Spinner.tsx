import { cn } from '../../lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center p-8', className)}>
      <div
        className="w-8 h-8 rounded-full animate-spin"
        style={{
          border: '2px solid var(--accent-subtle)',
          borderTopColor: 'var(--accent)',
        }}
      />
    </div>
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-full min-h-[300px]">
      <div className="text-center">
        <div
          className="w-10 h-10 rounded-full animate-spin mx-auto mb-3"
          style={{
            border: '2px solid var(--accent-subtle)',
            borderTopColor: 'var(--accent)',
          }}
        />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</p>
      </div>
    </div>
  );
}
