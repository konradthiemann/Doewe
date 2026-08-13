"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

import LegalFooter from "../../components/LegalFooter";
import { Spinner } from "../../components/ui/Spinner";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../../lib/demoConstants";

// Only render the Google button when the server has Google OAuth configured.
// Mirrored from the server via a NEXT_PUBLIC_ flag (see env.ts / authOptions.ts).
const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "1";

/** Inline Google "G" logo in official brand colors — no extra icon dependency. */
function GoogleLogo() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Nach erfolgreichem Login/Registrierung dorthin zurück, woher man kam
  // (z. B. der Haushalts-Einladungs-Link). Nur relative Pfade zulassen, damit
  // der Parameter kein offener Redirect zu fremden Hosts wird.
  function resolveCallbackUrl(): string {
    if (typeof window === "undefined") return "/";
    const raw = new URLSearchParams(window.location.search).get("callbackUrl");
    if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
    return "/";
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
      callbackUrl: resolveCallbackUrl()
    });

    setLoading(false);

    if (result?.error) {
      setError("Login failed. Check email or password.");
      return;
    }

    setMessage("Logged in. Redirecting…");
    window.location.assign(result?.url ?? "/");
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
      router.push(resolveCallbackUrl());
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Unable to register.");
    }
  }

  function handleGoogle() {
    setError(null);
    setMessage(null);
    setLoading(true);
    // Full-page redirect to Google, then back to where we came from on success.
    void signIn("google", { callbackUrl: resolveCallbackUrl() });
  }

  async function handleDemo() {
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/demo/seed", { method: "POST" });
      if (!res.ok) {
        setError("Demo-Modus konnte nicht vorbereitet werden. Bitte später erneut versuchen.");
        setLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        redirect: false,
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        callbackUrl: "/"
      });

      setLoading(false);
      if (result?.error) {
        setError("Demo-Login fehlgeschlagen. Bitte später erneut versuchen.");
        return;
      }

      setMessage("Demo-Modus wird geladen…");
      window.location.assign(result?.url ?? "/");
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Demo-Modus konnte nicht gestartet werden.");
    }
  }

  const onSubmit = mode === "login" ? handleLogin : handleRegister;

  return (
    <main id="maincontent" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Doewe</h1>
        <p className="text-sm text-ink-muted">
          Eure Finanzen. Gemeinsam im Blick.
        </p>
      </div>

      <div className="rounded-card border border-line bg-surface/95 p-6 shadow-raised backdrop-blur">
        <div className="mb-4 flex items-center gap-2" role="tablist" aria-label="Auth mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`flex-1 rounded-field px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2 ${
              mode === "login" ? "bg-brand text-brand-on" : "bg-surface-2 text-ink"
            }`}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`flex-1 rounded-field px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2 ${
              mode === "register" ? "bg-brand text-brand-on" : "bg-surface-2 text-ink"
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
                className="w-full rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="email">
              Email <span className="text-danger">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
              autoComplete={mode === "login" ? "email" : "new-email"}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="password">
              Password <span className="text-danger">*</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            <p className="mt-1 text-xs text-ink-muted">Use at least 8 characters.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-field bg-brand px-4 py-2 text-sm font-semibold text-brand-on shadow-card transition hover:bg-brand-hover disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {loading && <Spinner size="sm" className="mr-2" />}
            {loading ? "Please wait…" : mode === "login" ? "Login" : "Create account"}
          </button>

          {mode === "login" && (
            <p className="text-center text-sm">
              <Link
                href="/forgot-password"
                className="font-medium text-brand hover:text-brand-hover focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Passwort vergessen?
              </Link>
            </p>
          )}

          {error && (
            <p id="auth-error" role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm text-success">
              {message}
            </p>
          )}
        </form>

        <div className="mt-6 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            oder
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>

        {googleEnabled && (
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-field border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <GoogleLogo />
            Mit Google anmelden
          </button>
        )}

        <button
          type="button"
          onClick={handleDemo}
          disabled={loading}
          className="mt-4 flex w-full items-center justify-center rounded-field border border-brand px-4 py-2 text-sm font-semibold text-brand transition hover:bg-brand-soft disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {loading && <Spinner size="sm" className="mr-2" />}
          {loading ? "Bitte warten…" : "Im Demo-Modus testen"}
        </button>
        <p className="mt-2 text-center text-xs text-ink-muted">
          Ohne Anmeldung mit Beispieldaten der letzten 3 Jahre.
        </p>
      </div>

      <LegalFooter className="mt-8" />
    </main>
  );
}
