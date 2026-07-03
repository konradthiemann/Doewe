"use client";

import { usePathname } from "next/navigation";

import { isAuthRoute } from "../lib/authRoutes";

/**
 * Wraps the page content. On normal routes it reserves space for the fixed
 * mobile top bar / bottom nav and the desktop sidebar. On auth routes (where
 * AppChrome renders nothing) it drops that padding so the centered auth cards
 * are not pushed off-center or forced to scroll.
 */
export default function MainContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isAuthRoute(pathname)) {
    return <div className="flex-1 w-full">{children}</div>;
  }

  return (
    <div className="flex-1 w-full pt-12 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pl-56 md:pt-0 md:pb-10 lg:pl-64">
      {children}
    </div>
  );
}
