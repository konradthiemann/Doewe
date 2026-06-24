"use client";

import LegalContent, { type LegalSection } from "../../components/LegalContent";
import { useI18n } from "../../lib/i18n";

const EMAIL = "konrad.thiemann@gmail.com";
const PHONE_DISPLAY = "0161 67325218";
const PHONE_HREF = "tel:+4916167325218";

function link(href: string, label: string) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-600 hover:underline dark:text-indigo-400"
    >
      {label}
    </a>
  );
}

const controllerBlock = (
  <>
    Konrad Thiemann
    <br />
    Olfermannstr. 7
    <br />
    38102 Braunschweig
    <br />
    Deutschland
    <br />
    Telefon:{" "}
    <a href={PHONE_HREF} className="text-indigo-600 hover:underline dark:text-indigo-400">
      {PHONE_DISPLAY}
    </a>
    <br />
    E-Mail:{" "}
    <a href={`mailto:${EMAIL}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
      {EMAIL}
    </a>
  </>
);

const authorityBlockDe = (
  <>
    Die Landesbeauftragte für den Datenschutz Niedersachsen
    <br />
    Prinzenstraße 5, 30159 Hannover
    <br />
    Postfach 221, 30002 Hannover
    <br />
    Telefon: 0511 120-4500
    <br />
    E-Mail:{" "}
    <a
      href="mailto:poststelle@lfd.niedersachsen.de"
      className="text-indigo-600 hover:underline dark:text-indigo-400"
    >
      poststelle@lfd.niedersachsen.de
    </a>
    <br />
    {link("https://www.lfd.niedersachsen.de", "www.lfd.niedersachsen.de")}
  </>
);

const sectionsDe: LegalSection[] = [
  {
    heading: "1. Verantwortlicher",
    paragraphs: [
      "Verantwortlich für die Verarbeitung personenbezogener Daten in dieser Anwendung im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:",
      controllerBlock
    ]
  },
  {
    heading: "2. Überblick",
    paragraphs: [
      "Doewe ist eine private Anwendung zur persönlichen Finanzverwaltung. Personenbezogene Daten werden ausschließlich verarbeitet, um den Betrieb der Anwendung, dein Nutzerkonto und die von dir eingegebenen Inhalte bereitzustellen. Deine Daten werden nicht verkauft und nicht zu Werbezwecken an Dritte weitergegeben."
    ]
  },
  {
    heading: "3. Hosting und Speicherort",
    paragraphs: [
      "Diese Anwendung wird bei Railway gehostet (Railway Corp., USA). Die Server und die Datenbank, in der deine Daten gespeichert werden, befinden sich in der Region Europe West (europe-west4) in den Niederlanden. Deine personenbezogenen Daten werden somit innerhalb der Europäischen Union gespeichert und verarbeitet.",
      "Railway verarbeitet die anfallenden Daten – insbesondere Server-Logfiles und die in der Datenbank gespeicherten Inhalte – in meinem Auftrag auf Grundlage eines Vertrags über Auftragsverarbeitung gemäß Art. 28 DSGVO. Rechtsgrundlage für den Einsatz ist mein berechtigtes Interesse an einem stabilen und sicheren Betrieb der Anwendung (Art. 6 Abs. 1 lit. f DSGVO).",
      "Da der Anbieter Railway Corp. ein US-Unternehmen ist, kann ein Zugriff aus den USA nicht vollständig ausgeschlossen werden. Soweit personenbezogene Daten in ein Drittland übermittelt werden, erfolgt dies auf Grundlage der Standardvertragsklauseln der EU-Kommission bzw. eines geeigneten Angemessenheitsbeschlusses (EU-US Data Privacy Framework)."
    ]
  },
  {
    heading: "4. Server-Logfiles",
    paragraphs: [
      "Beim Aufruf der Anwendung werden automatisch Informationen in sogenannten Server-Logfiles erfasst, die dein Browser übermittelt: Browsertyp und -version, verwendetes Betriebssystem, Referrer-URL, Zeitpunkt der Serveranfrage sowie die IP-Adresse. Diese Daten werden nicht mit anderen Datenquellen zusammengeführt und dienen dem störungsfreien und sicheren Betrieb der Anwendung. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO."
    ]
  },
  {
    heading: "5. Cookies",
    paragraphs: [
      "Diese Anwendung verwendet ausschließlich technisch notwendige Cookies. Für die Anmeldung wird ein Session-Cookie gesetzt (next-auth), das deinen Login-Status speichert. Ohne dieses Cookie ist eine Anmeldung nicht möglich; eine Einwilligung ist hierfür nicht erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Rechtsgrundlage für die Verarbeitung ist Art. 6 Abs. 1 lit. b und lit. f DSGVO. Cookies zu Analyse- oder Werbezwecken werden nicht eingesetzt."
    ]
  },
  {
    heading: "6. Registrierung und Nutzerkonto",
    paragraphs: [
      "Zur Nutzung der Anwendung legst du ein Nutzerkonto an. Dabei werden folgende Daten verarbeitet: E-Mail-Adresse, Passwort (ausschließlich verschlüsselt/gehasht gespeichert und im Klartext nicht einsehbar) sowie optional ein Name. Diese Daten sind erforderlich, um dir Zugang zu deinem Konto zu gewähren und die Anwendung bereitzustellen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des Nutzungsverhältnisses)."
    ]
  },
  {
    heading: "7. Deine Finanzdaten",
    paragraphs: [
      "Im Rahmen der Nutzung speicherst du selbst Inhalte in der Anwendung, insbesondere Konten, Transaktionen, Kategorien, Budgets, Sparpläne und wiederkehrende Buchungen. Diese Daten werden ausschließlich verarbeitet, um dir die Funktionen der Anwendung bereitzustellen. Sie sind nur für dich in deinem Konto sichtbar, werden nicht an Dritte weitergegeben und nicht zu Profiling- oder Werbezwecken ausgewertet. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO."
    ]
  },
  {
    heading: "8. Webanalyse (Vercel)",
    paragraphs: [
      "Diese Anwendung nutzt Vercel Web Analytics und Vercel Speed Insights, Dienste der Vercel Inc., USA. Damit wird anonymisiert die Nutzung der Anwendung ausgewertet (z. B. Seitenaufrufe und Performance-Kennzahlen wie Ladezeiten), um die Anwendung technisch zu verbessern. Vercel Web Analytics arbeitet nach Angaben des Anbieters cookielos und ohne eindeutig identifizierende Merkmale; es werden keine personenbezogenen Nutzerprofile gebildet. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Analyse und Verbesserung der Anwendung).",
      <>
        Dabei können Daten an Server in den USA übermittelt werden; die Übermittlung erfolgt auf Grundlage der Standardvertragsklauseln bzw. des EU-US Data Privacy Framework. Weitere Informationen findest du in der{" "}
        {link("https://vercel.com/legal/privacy-policy", "Datenschutzerklärung von Vercel")}.
      </>
    ]
  },
  {
    heading: "9. Empfänger der Daten",
    paragraphs: [
      "Empfänger bzw. Kategorien von Empfängern personenbezogener Daten sind der Hosting-Anbieter (Railway) als Auftragsverarbeiter sowie der Anbieter der Webanalyse (Vercel). Eine darüber hinausgehende Weitergabe an Dritte findet nicht statt, es sei denn, ich bin gesetzlich dazu verpflichtet."
    ]
  },
  {
    heading: "10. Speicherdauer",
    paragraphs: [
      "Personenbezogene Daten werden nur so lange gespeichert, wie es für die genannten Zwecke erforderlich ist. Die Daten deines Nutzerkontos und die von dir eingegebenen Inhalte werden gespeichert, bis du dein Konto löschst bzw. die Löschung verlangst. Server-Logfiles werden nur für einen kurzen Zeitraum gespeichert und anschließend gelöscht. Gesetzliche Aufbewahrungspflichten bleiben unberührt."
    ]
  },
  {
    heading: "11. Deine Rechte",
    paragraphs: [
      "Du hast jederzeit das Recht auf Auskunft über die zu deiner Person gespeicherten Daten (Art. 15 DSGVO), Berichtigung unrichtiger Daten (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO) sowie Widerspruch gegen die Verarbeitung (Art. 21 DSGVO). Soweit eine Verarbeitung auf einer Einwilligung beruht, kannst du diese jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO). Zur Ausübung deiner Rechte genügt eine Nachricht an die oben genannte Kontaktadresse."
    ]
  },
  {
    heading: "12. Beschwerderecht bei der Aufsichtsbehörde",
    paragraphs: [
      "Unbeschadet anderweitiger Rechtsbehelfe steht dir das Recht zu, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO). Die zuständige Aufsichtsbehörde ist:",
      authorityBlockDe
    ]
  },
  {
    heading: "13. SSL-/TLS-Verschlüsselung",
    paragraphs: [
      "Diese Anwendung nutzt aus Sicherheitsgründen eine SSL- bzw. TLS-Verschlüsselung. Eine verschlüsselte Verbindung erkennst du daran, dass die Adresszeile des Browsers mit „https://“ beginnt. Bei aktiver Verschlüsselung können die Daten, die du an die Anwendung übermittelst, nicht von Dritten mitgelesen werden."
    ]
  },
  {
    heading: "14. Pflicht zur Bereitstellung",
    paragraphs: [
      "Die Bereitstellung von E-Mail-Adresse und Passwort ist für die Erstellung eines Nutzerkontos erforderlich. Ohne diese Angaben kannst du kein Konto anlegen und die Anwendung nicht nutzen. Die Angabe eines Namens ist freiwillig."
    ]
  }
];

const authorityBlockEn = (
  <>
    Die Landesbeauftragte für den Datenschutz Niedersachsen
    <br />
    Prinzenstraße 5, 30159 Hannover, Germany
    <br />
    Phone: +49 511 120-4500
    <br />
    Email:{" "}
    <a
      href="mailto:poststelle@lfd.niedersachsen.de"
      className="text-indigo-600 hover:underline dark:text-indigo-400"
    >
      poststelle@lfd.niedersachsen.de
    </a>
    <br />
    {link("https://www.lfd.niedersachsen.de", "www.lfd.niedersachsen.de")}
  </>
);

const sectionsEn: LegalSection[] = [
  {
    heading: "1. Controller",
    paragraphs: [
      "The controller responsible for the processing of personal data in this application within the meaning of the General Data Protection Regulation (GDPR) is:",
      controllerBlock
    ]
  },
  {
    heading: "2. Overview",
    paragraphs: [
      "Doewe is a private application for personal finance management. Personal data is processed solely to operate the application, manage your user account and store the content you enter. Your data is not sold and is not passed on to third parties for advertising purposes."
    ]
  },
  {
    heading: "3. Hosting and storage location",
    paragraphs: [
      "This application is hosted by Railway (Railway Corp., USA). The servers and the database in which your data is stored are located in the Europe West region (europe-west4) in the Netherlands. Your personal data is therefore stored and processed within the European Union.",
      "On my behalf, Railway processes the resulting data — in particular server log files and the content stored in the database — on the basis of a data processing agreement pursuant to Art. 28 GDPR. The legal basis is my legitimate interest in a stable and secure operation of the application (Art. 6 (1) (f) GDPR).",
      "As the provider Railway Corp. is a US company, access from the USA cannot be entirely ruled out. Where personal data is transferred to a third country, this is done on the basis of the EU Commission's standard contractual clauses or an applicable adequacy decision (EU-US Data Privacy Framework)."
    ]
  },
  {
    heading: "4. Server log files",
    paragraphs: [
      "When the application is accessed, information is automatically collected in server log files transmitted by your browser: browser type and version, operating system, referrer URL, time of the server request and the IP address. This data is not merged with other data sources and serves the trouble-free and secure operation of the application. The legal basis is Art. 6 (1) (f) GDPR."
    ]
  },
  {
    heading: "5. Cookies",
    paragraphs: [
      "This application uses strictly necessary cookies only. A session cookie (next-auth) is set for login to store your authentication status. Without this cookie, logging in is not possible; consent is not required (§ 25 (2) no. 2 TDDDG). The legal basis is Art. 6 (1) (b) and (f) GDPR. No cookies are used for analytics or advertising purposes."
    ]
  },
  {
    heading: "6. Registration and user account",
    paragraphs: [
      "To use the application you create a user account. The following data is processed: email address, password (stored exclusively in encrypted/hashed form and not readable in plain text) and, optionally, a name. This data is required to grant you access to your account and to provide the application. The legal basis is Art. 6 (1) (b) GDPR (performance of the usage relationship)."
    ]
  },
  {
    heading: "7. Your financial data",
    paragraphs: [
      "As part of using the application, you store content yourself — in particular accounts, transactions, categories, budgets, savings plans and recurring entries. This data is processed solely to provide you with the features of the application. It is visible only to you within your account, is not passed on to third parties and is not evaluated for profiling or advertising purposes. The legal basis is Art. 6 (1) (b) GDPR."
    ]
  },
  {
    heading: "8. Web analytics (Vercel)",
    paragraphs: [
      "This application uses Vercel Web Analytics and Vercel Speed Insights, services of Vercel Inc., USA. They are used to analyse the use of the application in anonymised form (e.g. page views and performance metrics such as loading times) in order to improve the application technically. According to the provider, Vercel Web Analytics works without cookies and without uniquely identifying attributes; no personal user profiles are created. The legal basis is Art. 6 (1) (f) GDPR (legitimate interest in analysing and improving the application).",
      <>
        Data may be transferred to servers in the USA; the transfer is based on the standard contractual clauses or the EU-US Data Privacy Framework. For more information, see{" "}
        {link("https://vercel.com/legal/privacy-policy", "Vercel's privacy policy")}.
      </>
    ]
  },
  {
    heading: "9. Recipients of the data",
    paragraphs: [
      "Recipients or categories of recipients of personal data are the hosting provider (Railway) as a processor and the web analytics provider (Vercel). No further disclosure to third parties takes place unless I am legally obliged to do so."
    ]
  },
  {
    heading: "10. Storage period",
    paragraphs: [
      "Personal data is stored only for as long as is necessary for the stated purposes. The data of your user account and the content you enter are stored until you delete your account or request deletion. Server log files are stored only for a short period and then deleted. Statutory retention obligations remain unaffected."
    ]
  },
  {
    heading: "11. Your rights",
    paragraphs: [
      "At any time you have the right to access the data stored about you (Art. 15 GDPR), to rectification of inaccurate data (Art. 16 GDPR), to erasure (Art. 17 GDPR), to restriction of processing (Art. 18 GDPR), to data portability (Art. 20 GDPR) and to object to processing (Art. 21 GDPR). Where processing is based on consent, you may withdraw it at any time with effect for the future (Art. 7 (3) GDPR). To exercise your rights, a message to the contact address above is sufficient."
    ]
  },
  {
    heading: "12. Right to lodge a complaint with a supervisory authority",
    paragraphs: [
      "Without prejudice to any other remedy, you have the right to lodge a complaint with a data protection supervisory authority (Art. 77 GDPR). The competent supervisory authority is:",
      authorityBlockEn
    ]
  },
  {
    heading: "13. SSL/TLS encryption",
    paragraphs: [
      "For security reasons, this application uses SSL/TLS encryption. You can recognise an encrypted connection by the fact that the browser's address bar begins with “https://”. When encryption is active, the data you transmit to the application cannot be read by third parties."
    ]
  },
  {
    heading: "14. Obligation to provide data",
    paragraphs: [
      "Providing an email address and password is required to create a user account. Without this information you cannot create an account or use the application. Providing a name is optional."
    ]
  }
];

export default function DatenschutzPage() {
  const { locale } = useI18n();
  const isDe = locale === "de";

  return (
    <LegalContent
      title={isDe ? "Datenschutzerklärung" : "Privacy Policy"}
      updated={isDe ? "Stand: 24. Juni 2026" : "Last updated: 24 June 2026"}
      sections={isDe ? sectionsDe : sectionsEn}
    />
  );
}
