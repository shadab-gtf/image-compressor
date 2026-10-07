"use client";
import { ErrorState, type RouteErrorProps } from "@/components/ui/error-state";
export default function Error({ retry }: RouteErrorProps) {
  return (
    <ErrorState
      title="This guide couldn’t load"
      description="Try opening the guide again."
      retry={retry}
    />
  );
}
