# Database Management Guide

Dieses Dokument beschreibt den Workflow für Datenbankänderungen zwischen lokaler Entwicklung und Production.

## Übersicht

| Umgebung | Datenbank | Migrations-Befehl |
|----------|-----------|-------------------|
| Lokal (dev) | PostgreSQL localhost | `prisma db push` oder `prisma migrate dev` |
| CI Tests | PostgreSQL (GitHub Actions Service) | `prisma db push` |
| Production | Production PostgreSQL | `prisma migrate deploy` (Railway **Pre-Deploy Command**) |

## Wichtige Befehle

```bash
# Schema ändern und Migration erstellen (lokal)
npx prisma migrate dev --name <migration_name>

# Schema ohne Migration anwenden (nur für dev/test)
npx prisma db push

# Migrationen auf Production anwenden (NIEMALS migrate dev!)
npx prisma migrate deploy

# Prisma Client generieren
npx prisma generate

# Migration-Status prüfen
npx prisma migrate status
```

---

## Workflow: Schema-Änderungen

### 1. Lokale Entwicklung

```bash
# 1. Schema in prisma/schema.prisma ändern
# 2. Migration erstellen
cd apps/web
npx prisma migrate dev --name beschreibende_name

# Beispiel: Neue Spalte hinzufügen
npx prisma migrate dev --name add_dayofmonth_to_recurring
```

Dies erstellt:
- Eine neue Migration in `prisma/migrations/<timestamp>_<name>/migration.sql`
- Aktualisiert die lokale Datenbank
- Generiert den Prisma Client neu

### 2. Code committen

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add dayOfMonth column to RecurringTransaction"
```

**WICHTIG**: Die Migrations-Ordner MÜSSEN committed werden!

### 3. CI/CD Pipeline

Wenn Code auf `main` gepusht wird:

1. **CI Job** (`ci.yml`): Führt Tests mit `db push` aus (temporäre Test-DB)
2. **Railway Build & Deploy**: Railway baut das Image und führt vor dem Start das
   **Pre-Deploy Command** aus:
   ```
   npm --workspace @doewe/web run prisma:migrate:deploy
   ```
   Der Befehl läuft zwischen Build und Start im privaten Railway-Netz und nutzt die
   interne `DATABASE_URL`-Referenz (`postgres.railway.internal`). Schlägt die
   Migration fehl, wird **nicht deployt** (der alte Container bleibt aktiv).
3. **Deployment**: Anwendung wird mit neuem Schema gestartet.

> Es gibt **keinen** GitHub-Actions-Deploy-Job mehr. Der frühere `deploy.yml`-Job
> (mit `DATABASE_URL`-Secret über den Public-Proxy) wurde entfernt, weil er bei jeder
> Passwort-Rotation brach. Migrationen laufen jetzt ausschließlich als Railway
> Pre-Deploy Command. Details: [Deployment](deployment).

---

## Unterschied: db push vs. migrate deploy

| Aspekt | `db push` | `migrate deploy` |
|--------|-----------|------------------|
| Zweck | Entwicklung, Prototyping | Production |
| Migrations-History | ❌ Ignoriert | ✅ Verwendet |
| Datenverlust möglich | ⚠️ Ja (kann Tabellen droppen) | ❌ Nein |
| Verwendung | Lokal, CI Tests | Production Only |

**⚠️ NIEMALS `prisma migrate dev` auf Production ausführen!**

---

## Fehlerbehebung

### Problem: "column X does not exist" auf Production

**Ursache**: Migration wurde nicht auf Production ausgeführt.

**Lösung**:
```bash
# 1. Prüfen welche Migrationen fehlen
DATABASE_URL="<production_url>" npx prisma migrate status

# 2. Fehlende Migrationen anwenden
DATABASE_URL="<production_url>" npx prisma migrate deploy
```

Oder: In Railway einen **Redeploy** des Service `@doewe/web` auslösen — das
Pre-Deploy Command führt die ausstehenden Migrationen erneut aus.

### Problem: Migration schlägt auf Production fehl

**Mögliche Ursachen**:
- Migration ist nicht kompatibel mit bestehenden Daten
- SQL-Syntax-Fehler

**Lösung**:
1. Migration lokal mit Production-ähnlichen Daten testen
2. Bei Datenmigration: Custom SQL in migration.sql schreiben
3. Bei Fehlern: Migration manuell korrigieren BEVOR sie auf Production läuft

### Problem: Lokale DB und Production sind unterschiedlich

```bash
# 1. Migration-Status prüfen
npx prisma migrate status

# 2. Lokale DB zurücksetzen (⚠️ LÖSCHT ALLE DATEN)
npx prisma migrate reset

# 3. Alle Migrationen anwenden
npx prisma migrate deploy
```

---

## Migrations-Konfiguration (Railway)

Die Production-Migration läuft als **Pre-Deploy Command** im Railway-Service
`@doewe/web` (*Settings → Deploy → Pre-Deploy Command*):

```
npm --workspace @doewe/web run prisma:migrate:deploy
```

**Verbindung:**
- Das Pre-Deploy Command läuft **im privaten Railway-Netz** und nutzt die interne
  `DATABASE_URL`-Referenz (`postgres.railway.internal`) — kein Public-Proxy, kein
  GitHub-Secret nötig.
- Die **öffentliche** URL (`DATABASE_PUBLIC_URL`, z.B. `…proxy.rlwy.net:PORT`) wird nur
  noch für **manuelle** Migrationen/Diagnose von außerhalb Railways gebraucht
  (Project → PostgreSQL → Variables → `DATABASE_PUBLIC_URL`).

> Früher lief die Migration über einen GitHub-Actions-Job mit einem
> `DATABASE_URL`-Secret (Public-Proxy). Dieser Job wurde entfernt — bei jeder
> Passwort-Rotation der DB brach das Secret. Nichts committen, was die reale URL
> enthält.

---

## Checkliste: Neue Schema-Änderung

- [ ] Schema in `prisma/schema.prisma` geändert
- [ ] `npx prisma migrate dev --name <name>` lokal ausgeführt
- [ ] Neue Migration in `prisma/migrations/` vorhanden
- [ ] Migration-Datei committed
- [ ] Code auf `develop` getestet
- [ ] PR nach `main` erstellt
- [ ] Nach Merge: Railway-Deploy-Log prüfen (Pre-Deploy Migration erfolgreich?)
- [ ] Production-App testen

---

## Für KI-Agenten

Wenn du Schema-Änderungen machst:

1. **IMMER** `prisma migrate dev` verwenden, nicht `db push`
2. **IMMER** die Migration-Dateien committen
3. **NICHT** auf einen GitHub-Actions-Deploy-Job vertrauen — die Migration läuft als
   Railway **Pre-Deploy Command** (`prisma migrate deploy`); nach dem Merge den
   Railway-Deploy-Log prüfen
4. **DOKUMENTIEREN** Schema-Änderungen in der Commit-Message

Beispiel-Workflow:
```bash
# 1. Schema ändern
# 2. Migration erstellen
cd apps/web && npx prisma migrate dev --name add_new_column

# 3. Testen
npm run test

# 4. Committen
git add -A
git commit -m "feat(db): add newColumn to Table

- Migration: add_new_column
- Adds column for feature XYZ"

# 5. Push (auf develop zuerst, dann main)
git push
```

---

## Production-Migration manuell ausführen

Falls die automatische Migration fehlschlägt:

```bash
# Mit Production DATABASE_URL
export DATABASE_URL="postgresql://..."

# Status prüfen
npx prisma migrate status

# Migrationen anwenden
npx prisma migrate deploy
```

Oder über Railway:
1. Service `@doewe/web` → **Redeploy** auslösen
2. Das Pre-Deploy Command führt `prisma migrate deploy` aus
3. Deploy-Log auf Erfolg/Fehler prüfen (bei Fehler bleibt der alte Container aktiv)
