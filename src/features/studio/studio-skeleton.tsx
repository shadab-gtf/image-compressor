export function StudioSkeleton() {
  return (
    <div
      className="sf-card-flat grid min-w-0 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_350px]"
      role="status"
      aria-label="Loading image studio"
    >
      <div className="col-span-full flex min-h-14 gap-4 border-b border-line px-4 py-4">
        <div className="h-5 w-20 rounded-full bg-surface-3 motion-safe:animate-pulse" />
        <div className="h-5 w-16 rounded-full bg-surface-3 motion-safe:animate-pulse" />
        <div className="h-5 w-20 rounded-full bg-surface-3 motion-safe:animate-pulse" />
      </div>
      <div className="flex min-h-[270px] flex-col items-center justify-center gap-4 p-6 sm:min-h-[360px] lg:min-h-[440px] lg:border-r lg:border-line">
        <div className="size-14 rounded-2xl bg-surface-3 motion-safe:animate-pulse" />
        <div className="h-6 w-48 rounded-lg bg-surface-3 motion-safe:animate-pulse" />
        <div className="h-12 w-44 rounded-full bg-accent-soft motion-safe:animate-pulse" />
      </div>
      <div className="space-y-4 border-t border-line p-4 lg:border-t-0 lg:p-6">
        <div className="h-8 w-3/4 rounded-lg bg-surface-3 motion-safe:animate-pulse" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-28 rounded-2xl bg-surface-3 motion-safe:animate-pulse" />
          <div className="h-28 rounded-2xl bg-surface-3 motion-safe:animate-pulse" />
        </div>
        <div className="h-10 rounded-xl bg-surface-3 motion-safe:animate-pulse" />
        <div className="h-11 rounded-xl bg-surface-3 motion-safe:animate-pulse" />
      </div>
      <div className="col-span-full hidden min-h-20 items-center justify-between gap-5 border-t border-line p-4 md:flex">
        <div className="h-5 w-36 rounded-lg bg-surface-3 motion-safe:animate-pulse" />
        <div className="h-12 w-40 rounded-full bg-accent-soft motion-safe:animate-pulse" />
      </div>
      <span className="sr-only">Loading image studio</span>
    </div>
  );
}
