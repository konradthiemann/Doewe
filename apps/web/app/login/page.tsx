"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const result = await signIn("credentials", {
      redirect: false,
      email,
      password
    });

    setLoading(false);

    if (result?.error) {
      setError("Login failed. Check email or password.");
      return;
    }

    setMessage("Logged in. Redirecting…");
    router.push("/");
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name })
      });

      if (!res.ok) {
        const details = await res.json().catch(() => null);
        const errMsg = details?.error ? JSON.stringify(details.error) : `Register failed (${res.status}).`;
        setError(errMsg);
        setLoading(false);
        return;
      }

      setMessage("Account created. Logging you in…");
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password
      });
      setLoading(false);
      if (result?.error) {
        setError("Registered but login failed. Try again.");
        return;
      }
      router.push("/");
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Unable to register.");
    }
  }

  const onSubmit = mode === "login" ? handleLogin : handleRegister;

  return (
    <main id="maincontent" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center space-y-2">
        <h1 className="text-3xl font-semibold">Doewe</h1>
        <p className="text-sm text-gray-600 dark:text-neutral-300">
          Sign in to manage your finances.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white/95 p-6 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
        <div className="mb-4 flex items-center gap-2" role="tablist" aria-label="Auth mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
              mode === "login" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-200"
            }`}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
              mode === "register" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-200"
            }`}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" aria-describedby={error ? "auth-error" : undefined}>
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="name">
                Name (optional)
              </label>
              <input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="email">
              Email <span className="text-red-600">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              autoComplete={mode === "login" ? "email" : "new-email"}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="password">
              Password <span className="text-red-600">*</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">Use at least 8 characters.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            {loading ? "Please wait…" : mode === "login" ? "Login" : "Create account"}
          </button>

          {error && (
            <p id="auth-error" role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm text-emerald-600">
              {message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
