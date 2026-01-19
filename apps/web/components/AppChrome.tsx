"use client";

import { usePathname } from "next/navigation";

import BackToTopButton from "./BackToTopButton";
import Header from "./Header";

export default function AppChrome() {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return null;
  }

  return (
    <>
      <BackToTopButton />
      <Header />
    </>
  );
}
