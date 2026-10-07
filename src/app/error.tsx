"use client";

import { ErrorState, type RouteErrorProps } from "@/components/ui/error-state";

export default function Error({ retry }: RouteErrorProps) {
  return <ErrorState title="This page couldn’t load" description="Something interrupted this page. Try loading it again. Your original files on your device are unchanged." retry={retry} />;
}
