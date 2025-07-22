import { XMLParser } from 'fast-xml-parser';

export interface Aya {
  index: number;
  text: string;
  bismillah?: string;
}

export interface Sura {
  index: number;
  name: string;
  ayas: Aya[];
}

export interface QuranData {
  suras: Sura[];
}

export async function loadQuran(): Promise<QuranData> {
  const response = await fetch('/quran.xml'); // fetch from public directory
  const xmlText = await response.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const parsed = parser.parse(xmlText);
  const surasRaw = parsed.quran.sura;
  const suras: Sura[] = surasRaw.map((sura: any) => ({
    index: Number(sura.index),
    name: sura.name,
    ayas: (Array.isArray(sura.aya) ? sura.aya : [sura.aya]).map((aya: any) => ({
      index: Number(aya.index),
      text: aya.text,
      bismillah: aya.bismillah,
    })),
  }));
  return { suras };
} 