"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/auth/auth-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      {/* Auth sits inside React Query so session-aware queries can reuse the client. */}
      <AuthProvider>{children}</AuthProvider>
      <SonnerToaster
        theme="dark"
        position="bottom-right"
        closeButton
        toastOptions={{
          style: {
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
            fontFamily:
              "var(--font-inter), ui-sans-serif, system-ui, -apple-system, sans-serif",
          },
        }}
      />
    </QueryClientProvider>
  );
}
