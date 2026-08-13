"use client";

import { useCallback, useEffect, useState } from "react";

import { useI18n } from "../lib/i18n";

import { Button } from "./ui/Button";
import { useToast } from "./ui/Toast";

/**
 * Settings-Karte „Haushalt" (Teil D): zeigt den Haushalt samt Mitgliedern,
 * erlaubt Umbenennen + Einladungs-Links (OWNER) sowie das Verlassen (MEMBER).
 * Der Klartext-Token einer Einladung wird nur einmal zurückgegeben — die UI
 * baut daraus einen teilbaren Link (Copy / Web Share).
 */

type Member = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  joinedAt: string;
  isMe: boolean;
};

type Household = {
  id: string;
  name: string;
  role: string;
  members: Member[];
};

type PendingInvite = {
  id: string;
  email: string | null;
  role: string;
  expiresAt: string;
  createdAt: string;
};

const cardClass =
  "rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95";
const inputClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

export default function HouseholdCard() {
  const { t } = useI18n();
  const toast = useToast();

  const [household, setHousehold] = useState<Household | null>(null);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const isOwner = household?.role === "OWNER";

  const loadInvites = useCallback(async () => {
    const res = await fetch("/api/household/invites");
    if (res.ok) setInvites((await res.json()) as PendingInvite[]);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/household");
    if (!res.ok) return;
    const data = (await res.json()) as Household;
    setHousehold(data);
    setName(data.name);
    if (data.role === "OWNER") await loadInvites();
  }, [loadInvites]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRename() {
    if (!household || name.trim() === household.name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/household", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() })
      });
      if (!res.ok) throw new Error();
      setHousehold((h) => (h ? { ...h, name: name.trim() } : h));
      toast.success(t("household.renameSaved"));
    } catch {
      toast.error(t("household.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateInvite() {
    setBusy(true);
    try {
      const res = await fetch("/api/household/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { url: string | null };
      setInviteUrl(data.url);
      toast.success(t("household.inviteCreated"));
      await loadInvites();
    } catch {
      toast.error(t("household.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success(t("household.copied"));
    } catch {
      toast.error(t("household.error"));
    }
  }

  async function handleShare() {
    if (!inviteUrl || !navigator.share) return;
    try {
      await navigator.share({ title: t("household.title"), url: inviteUrl });
    } catch {
      // Nutzer hat den Teilen-Dialog abgebrochen — kein Fehler.
    }
  }

  async function handleRevoke(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/household/invites/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setInvites((list) => list.filter((i) => i.id !== id));
      toast.success(t("household.revoked"));
    } catch {
      toast.error(t("household.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveMember(member: Member) {
    if (!window.confirm(t("household.removeConfirm", { name: member.name ?? member.email ?? "" }))) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/household/members/${member.userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setHousehold((h) => (h ? { ...h, members: h.members.filter((m) => m.userId !== member.userId) } : h));
      toast.success(t("household.removed"));
    } catch {
      toast.error(t("household.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    if (!window.confirm(t("household.leaveConfirm"))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/household/leave", { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success(t("household.left"));
      window.location.assign("/");
    } catch {
      toast.error(t("household.error"));
      setBusy(false);
    }
  }

  function roleLabel(role: string): string {
    return role === "OWNER" ? t("household.roleOwner") : t("household.roleMember");
  }

  if (!household) return null;

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-medium">{t("household.title")}</h2>
      <p className="text-sm text-gray-600 dark:text-neutral-300">{t("household.description")}</p>

      <div className="mt-4 space-y-6">
        {/* Name */}
        <div>
          <label htmlFor="household-name" className="mb-1 block text-sm font-medium">
            {t("household.nameLabel")}
          </label>
          {isOwner ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="household-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`${inputClass} sm:max-w-xs`}
                maxLength={80}
              />
              <Button
                variant="secondary"
                onClick={handleRename}
                loading={busy}
                disabled={name.trim() === household.name || name.trim().length === 0}
              >
                {t("household.rename")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-gray-900 dark:text-neutral-100">{household.name}</p>
          )}
        </div>

        {/* Members */}
        <div className="border-t border-gray-100 pt-4 dark:border-neutral-800">
          <h3 className="text-sm font-medium">{t("household.membersTitle")}</h3>
          <ul className="mt-2 space-y-2">
            {household.members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-900 dark:text-neutral-100">
                    {m.name ?? m.email ?? "—"}
                    {m.isMe && <span className="ml-1 text-gray-500 dark:text-neutral-400">({t("household.you")})</span>}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-neutral-400">{roleLabel(m.role)}</p>
                </div>
                {isOwner && !m.isMe && (
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(m)} disabled={busy}>
                    {t("household.remove")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Invite (OWNER only) */}
        {isOwner && (
          <div className="border-t border-gray-100 pt-4 dark:border-neutral-800">
            <h3 className="text-sm font-medium">{t("household.inviteTitle")}</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">{t("household.inviteDescription")}</p>
            <div className="mt-3">
              <Button onClick={handleCreateInvite} loading={busy}>
                {t("household.createInvite")}
              </Button>
            </div>

            {inviteUrl && (
              <div className="mt-3 space-y-2">
                <p className="break-all rounded-md bg-gray-50 p-2 text-xs text-gray-700 dark:bg-neutral-800 dark:text-neutral-200">
                  {inviteUrl}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={handleCopy}>
                    {t("household.copyLink")}
                  </Button>
                  {typeof navigator !== "undefined" && "share" in navigator && (
                    <Button variant="secondary" size="sm" onClick={handleShare}>
                      {t("household.share")}
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4">
              <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-neutral-400">
                {t("household.pendingInvites")}
              </h4>
              {invites.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{t("household.noPendingInvites")}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {invites.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm text-gray-700 dark:text-neutral-200">
                        {inv.email ?? t("household.expiresAt", { date: new Date(inv.expiresAt).toLocaleDateString() })}
                      </p>
                      <Button variant="ghost" size="sm" onClick={() => handleRevoke(inv.id)} disabled={busy}>
                        {t("household.revoke")}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Leave (MEMBER only) */}
        {!isOwner && (
          <div className="border-t border-gray-100 pt-4 dark:border-neutral-800">
            <Button variant="danger" onClick={handleLeave} loading={busy}>
              {t("household.leave")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
