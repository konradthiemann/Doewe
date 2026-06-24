/**
 * Feste Zugangsdaten und IDs für den geteilten Demo-Account.
 *
 * Bewusst als reines CommonJS-Modul OHNE schwere Imports gehalten, damit es
 * gleichermaßen vom Client (Login-Seite), den TS-API-Routen und dem
 * Node-Seed-Skript (`prisma/seed.js`) verwendet werden kann.
 *
 * Die Zugangsdaten sind absichtlich öffentlich — es handelt sich um einen
 * Wegwerf-Demo-Account mit ausschließlich generierten Beispieldaten.
 */
const DEMO_EMAIL = "demo@doewe.test";
const DEMO_PASSWORD = "demo1234";
const DEMO_NAME = "Demo User";
const DEMO_ACCOUNT_ID = "acc_demo";

module.exports = { DEMO_EMAIL, DEMO_PASSWORD, DEMO_NAME, DEMO_ACCOUNT_ID };
