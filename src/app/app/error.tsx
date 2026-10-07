"use client";

import { ErrorState, type RouteErrorProps } from "@/components/ui/error-state";

export default function Error({ retry }: RouteErrorProps) {
  return <ErrorState title="The workspace needs a restart" description="Your original images are safe on your device. Try again to reopen the workspace; you may need to select your images again." retry={retry} />;
}
