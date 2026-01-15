"use client";

import { signOut, useSession } from "next-auth/react";

export default function SettingsPage() {
  const { data } = useSession();

  return (
    <main id="maincontent" className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-gray-600 dark:text-neutral-300">Manage your account access.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95">
        <h2 className="text-lg font-medium">Account</h2>
        <p className="text-sm text-gray-600 dark:text-neutral-300">Signed in as {data?.user?.email ?? "unknown"}.</p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-3 inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 focus:outline-none focus-visible:ring focus-visible:ring-red-500 focus-visible:ring-offset-2"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
