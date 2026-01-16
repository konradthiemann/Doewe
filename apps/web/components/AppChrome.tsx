"use client";

import { usePathname } from "next/navigation";

import BackToTopButton from "./BackToTopButton";
import Header from "./Header";
import LogoutButton from "./LogoutButton";

export default function AppChrome() {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return null;
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-50">
        <LogoutButton />
      </div>
      <BackToTopButton />
      <Header />
    </>
  );
}
