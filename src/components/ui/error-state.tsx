import Link from "next/link";

export interface RouteErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

interface ErrorStateProps {
  title: string;
  description: string;
  retry: () => void;
}

export function ErrorState({ title, description, retry }: ErrorStateProps) {
  return (
    <main id="main" className="grid min-h-[80vh] place-items-center px-5 py-16">
      <div className="max-w-lg rounded-3xl border border-line bg-surface p-8 text-center shadow-sm sm:p-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-deep">Let’s try that again</p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">{description}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={retry} className="min-h-11 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-on-accent hover:bg-accent-hover">Try again</button>
          <Link href="/" className="min-h-11 rounded-full border border-line px-6 py-3 text-sm font-semibold text-ink hover:bg-surface-2">Back to home</Link>
        </div>
      </div>
    </main>
  );
}
