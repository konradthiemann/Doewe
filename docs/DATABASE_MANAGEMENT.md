# Database Management Guide

Dieses Dokument beschreibt den Workflow für Datenbankänderungen zwischen lokaler Entwicklung und Production.

## Übersicht

| Umgebung | Datenbank | Migrations-Befehl |
|----------|-----------|-------------------|
| Lokal (dev) | PostgreSQL localhost | `prisma db push` oder `prisma migrate dev` |
| CI Tests | PostgreSQL (GitHub Actions Service) | `prisma db push` |
| Production | Production PostgreSQL | `prisma migrate deploy` |

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

1. **CI Job** (ci.yml): Führt Tests mit `db push` aus (temporäre Test-DB)
2. **Deploy Job** (deploy.yml): Führt `prisma migrate deploy` auf Production aus
3. **Deployment**: Anwendung wird mit neuem Schema deployed

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

Oder: Manuell den Deploy-Workflow in GitHub Actions triggern.

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

## GitHub Actions Secrets

Erforderliche Secrets für Production-Migrationen:

| Secret | Beschreibung |
|--------|--------------|
| `DATABASE_URL` | **PUBLIC** PostgreSQL Connection String für Production |

**⚠️ WICHTIG für Railway/Supabase/etc.:**
- Verwende die **PUBLIC/EXTERNAL** Database URL, nicht die interne!
- Interne URLs (z.B. `postgres.railway.internal`) funktionieren nur innerhalb des Hosting-Netzwerks
- GitHub Actions benötigt die öffentliche URL

**Railway Beispiel:**
- ❌ Falsch: `postgresql://...@postgres.railway.internal:5432/railway`
- ✅ Richtig: `postgresql://...@roundhouse.proxy.rlwy.net:12345/railway`

In Railway findest du die öffentliche URL unter:
- Project → PostgreSQL → Connect → `DATABASE_PUBLIC_URL`

---

## Checkliste: Neue Schema-Änderung

- [ ] Schema in `prisma/schema.prisma` geändert
- [ ] `npx prisma migrate dev --name <name>` lokal ausgeführt
- [ ] Neue Migration in `prisma/migrations/` vorhanden
- [ ] Migration-Datei committed
- [ ] Code auf `develop` getestet
- [ ] PR nach `main` erstellt
- [ ] Nach Merge: Deploy-Workflow prüfen (Migrationen erfolgreich?)
- [ ] Production-App testen

---

## Für KI-Agenten

Wenn du Schema-Änderungen machst:

1. **IMMER** `prisma migrate dev` verwenden, nicht `db push`
2. **IMMER** die Migration-Dateien committen
3. **PRÜFEN** ob `.github/workflows/deploy.yml` existiert und `prisma migrate deploy` ausführt
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

Oder über GitHub Actions:
1. Gehe zu Actions → Deploy
2. Klicke "Run workflow"
3. Wähle `main` Branch
4. Prüfe Logs für Erfolg/Fehler
