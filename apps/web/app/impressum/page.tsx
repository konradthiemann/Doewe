"use client";

import LegalContent, { type LegalSection } from "../../components/LegalContent";
import { useI18n } from "../../lib/i18n";

const EMAIL = "konrad.thiemann@gmail.com";
const PHONE_DISPLAY = "0161 67325218";
const PHONE_HREF = "tel:+4916167325218";

function contactBlock() {
  return (
    <>
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
}

const addressBlock = (
  <>
    Konrad Thiemann
    <br />
    Olfermannstr. 7
    <br />
    38102 Braunschweig
    <br />
    Deutschland
  </>
);

const sectionsDe: LegalSection[] = [
  {
    heading: "Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz)",
    paragraphs: [addressBlock]
  },
  {
    heading: "Kontakt",
    paragraphs: [contactBlock()]
  },
  {
    heading: "Verantwortlich für den Inhalt",
    paragraphs: ["Konrad Thiemann (Anschrift wie oben)"]
  },
  {
    heading: "Art des Angebots",
    paragraphs: [
      "Doewe ist ein privates, nicht-kommerzielles Projekt zur persönlichen Finanzverwaltung. Es werden keine Waren oder Dienstleistungen entgeltlich angeboten."
    ]
  },
  {
    heading: "Verbraucherstreitbeilegung",
    paragraphs: [
      "Es besteht keine Verpflichtung und keine Bereitschaft zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle."
    ]
  },
  {
    heading: "Haftung für Inhalte",
    paragraphs: [
      "Die Inhalte dieser Anwendung wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte kann jedoch keine Gewähr übernommen werden. Als Diensteanbieter bin ich gemäß § 7 Abs. 1 DDG für eigene Inhalte nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG bin ich als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen."
    ]
  },
  {
    heading: "Haftung für Links",
    paragraphs: [
      "Diese Anwendung kann Links zu externen Websites Dritter enthalten, auf deren Inhalte ich keinen Einfluss habe. Für diese fremden Inhalte kann keine Gewähr übernommen werden. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich."
    ]
  },
  {
    heading: "Urheberrecht",
    paragraphs: [
      "Die durch den Betreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers."
    ]
  }
];

const sectionsEn: LegalSection[] = [
  {
    heading: "Information pursuant to § 5 DDG (German Digital Services Act)",
    paragraphs: [addressBlock]
  },
  {
    heading: "Contact",
    paragraphs: [contactBlock()]
  },
  {
    heading: "Responsible for the content",
    paragraphs: ["Konrad Thiemann (address as above)"]
  },
  {
    heading: "Nature of this service",
    paragraphs: [
      "Doewe is a private, non-commercial project for personal finance management. No goods or services are offered for payment."
    ]
  },
  {
    heading: "Consumer dispute resolution",
    paragraphs: [
      "I am neither obliged nor willing to participate in dispute resolution proceedings before a consumer arbitration board."
    ]
  },
  {
    heading: "Liability for content",
    paragraphs: [
      "The content of this application was created with the greatest possible care. However, no guarantee can be given for the accuracy, completeness and timeliness of the content. As a service provider, I am responsible for my own content in accordance with § 7 (1) DDG and the general laws. Pursuant to §§ 8 to 10 DDG, however, I am not obliged as a service provider to monitor transmitted or stored third-party information or to investigate circumstances that indicate illegal activity."
    ]
  },
  {
    heading: "Liability for links",
    paragraphs: [
      "This application may contain links to external third-party websites over whose content I have no influence. No guarantee can be given for this third-party content. The respective provider or operator of the linked pages is always responsible for their content."
    ]
  },
  {
    heading: "Copyright",
    paragraphs: [
      "The content and works created by the operator on these pages are subject to German copyright law. Reproduction, processing, distribution and any kind of exploitation outside the limits of copyright require the written consent of the respective author or creator."
    ]
  }
];

export default function ImpressumPage() {
  const { locale } = useI18n();
  const isDe = locale === "de";

  return (
    <LegalContent
      title={isDe ? "Impressum" : "Imprint"}
      updated={isDe ? "Stand: 24. Juni 2026" : "Last updated: 24 June 2026"}
      sections={isDe ? sectionsDe : sectionsEn}
    />
  );
}
