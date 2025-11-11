import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Doewe",
  description: "Family management: track finances, set goals, detect patterns."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased flex flex-col">
        <a href="#maincontent" className="sr-only">
          Skip to main
        </a>
        <header className="w-full border-b border-gray-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-neutral-900/60">
          <nav aria-label="Primary" className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
            <div className="text-lg font-semibold tracking-tight">Doewe</div>
            <ul className="flex items-center gap-6 text-sm" role="list">
              <li>
                <a href="/" className="text-gray-700 dark:text-neutral-200 hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 rounded">
                  Dashboard
                </a>
              </li>
              <li>
                <a href="/transactions" className="text-gray-700 dark:text-neutral-200 hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 rounded">
                  Transactions
                </a>
              </li>
              <li>
                <a href="/budgets" className="text-gray-700 dark:text-neutral-200 hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 rounded">
                  Budgets
                </a>
              </li>
            </ul>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}