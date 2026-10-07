function Skeleton({ className }: { className: string }) {
  return <div className={`rounded-xl bg-line/70 motion-safe:animate-pulse ${className}`} />;
}

export function PageSkeleton({ variant = "home" }: { variant?: "home" | "tool" }) {
  return (
    <main id="main" aria-busy="true" aria-label="Loading image tools" className="sf-page-shell min-h-dvh py-6">
      <span role="status" className="sr-only">Loading image tools…</span>
      <div aria-hidden="true" className="w-full">
        <div className="flex h-12 items-center justify-between"><Skeleton className="h-8 w-36" /><Skeleton className="h-9 w-32" /></div>
        {variant === "home" ? (
          <>
            <div className="grid items-center gap-12 py-14 lg:grid-cols-2 lg:gap-16 lg:py-20">
              <div className="space-y-5"><Skeleton className="h-7 w-60" /><Skeleton className="h-16 w-4/5" /><Skeleton className="h-16 w-full" /><Skeleton className="h-20 w-4/5" /><Skeleton className="h-28 w-4/5" /><Skeleton className="h-4 w-64" /></div>
              <div className="rounded-3xl border border-line bg-surface p-4"><Skeleton className="mb-4 h-4 w-64 max-w-full" /><Skeleton className="aspect-[3/2] w-full" /><div className="mt-5 flex justify-between"><Skeleton className="h-12 w-28" /><Skeleton className="h-12 w-32" /></div></div>
            </div>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="mt-16 h-10 w-96 max-w-full" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-52 w-full" />)}</div>
          </>
        ) : (
          <div className="mt-16 w-full"><Skeleton className="h-6 w-44" /><Skeleton className="mt-5 h-14 w-full max-w-xl" /><Skeleton className="mt-5 h-14 w-full max-w-2xl" /><div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"><Skeleton className="h-96 w-full" /><Skeleton className="h-96 w-full" /></div></div>
        )}
      </div>
    </main>
  );
}

export function WorkspaceSkeleton({ standalone = false }: { standalone?: boolean }) {
  const Container = standalone ? "main" : "div";
  return (
    <Container id={standalone ? "main" : undefined} aria-busy="true" aria-label="Loading workspace" className="sf-page-shell py-6">
      <span role="status" className="sr-only">Loading your image workspace…</span>
      <div aria-hidden="true" className="w-full">
        {standalone && <><div className="mb-10 flex h-12 items-center justify-between"><Skeleton className="h-8 w-36" /><Skeleton className="h-9 w-32" /></div><Skeleton className="mb-3 h-9 w-60" /><Skeleton className="mb-8 h-5 w-72 max-w-full" /></>}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4"><Skeleton className="h-56 w-full" />{[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 w-full" />)}</div>
          <div className="space-y-6 rounded-3xl border border-line bg-surface p-6"><Skeleton className="h-7 w-32" /><Skeleton className="h-12 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-12 w-full" /></div>
        </div>
      </div>
    </Container>
  );
}

export function ContentSkeleton({ table = false }: { table?: boolean }) {
  return (
    <main id="main" aria-busy="true" aria-label="Loading page" className="sf-page-shell min-h-dvh py-6">
      <span role="status" className="sr-only">Loading page…</span>
      <div aria-hidden="true" className="w-full">
        <div className="flex h-12 items-center justify-between"><Skeleton className="h-8 w-36" /><Skeleton className="h-9 w-32" /></div>
        <div className={`py-16 ${table ? "w-full" : "mx-auto max-w-3xl"}`}>
          <Skeleton className="h-6 w-28" /><Skeleton className="mt-5 h-12 w-4/5" /><Skeleton className="mt-5 h-12 w-full" />
          <div className="mt-10 space-y-5">{[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} className={`${table ? "h-16" : "h-28"} w-full`} />)}</div>
        </div>
      </div>
    </main>
  );
}
