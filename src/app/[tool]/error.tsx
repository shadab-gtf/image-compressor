"use client";

import { ErrorState, type RouteErrorProps } from "@/components/ui/error-state";

export default function Error({ retry }: RouteErrorProps) {
  return <ErrorState title="This tool couldn’t load" description="Try loading the tool again. Your original images stay on your device and are not modified." retry={retry} />;
}
