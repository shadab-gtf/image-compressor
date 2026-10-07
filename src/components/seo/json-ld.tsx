type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface JsonLdProps {
  data: { [key: string]: JsonValue };
}

export function JsonLd({ data }: JsonLdProps) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
