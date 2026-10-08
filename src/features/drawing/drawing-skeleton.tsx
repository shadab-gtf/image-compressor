export function DrawingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading drawing workspace"
      className="overflow-hidden rounded-3xl border border-line bg-surface p-4"
    >
      <div className="flex gap-3">
        {[0, 1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="h-11 w-24 rounded-xl bg-surface-3 motion-safe:animate-pulse"
          />
        ))}
      </div>
      <div className="mt-4 h-20 rounded-xl bg-surface-3 motion-safe:animate-pulse" />
      <div className="mt-4 grid min-h-[460px] grid-cols-[56px_1fr] gap-4">
        <div className="rounded-xl bg-surface-3 motion-safe:animate-pulse" />
        <div className="rounded-xl bg-surface-2 motion-safe:animate-pulse" />
      </div>
      <span className="sr-only">Preparing your canvas</span>
    </div>
  );
}
