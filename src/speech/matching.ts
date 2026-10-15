/** Recognition is a transcript check, never a phoneme/pronunciation score. */
export function normalizeSpeech(text: string, language: string) {
  const numerals: Record<string, string[]> = {
    es: [
      'cero',
      'uno',
      'dos',
      'tres',
      'cuatro',
      'cinco',
      'seis',
      'siete',
      'ocho',
      'nueve',
      'diez',
      'once',
      'doce',
      'trece',
      'catorce',
      'quince',
      'dieciseis',
      'diecisiete',
      'dieciocho',
      'diecinueve',
      'veinte',
    ],
    en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
    fr: ['zero', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'],
  };
  return text
    .normalize('NFC')
    .toLocaleLowerCase(language)
    .replace(/[’‘]/g, "'")
    .replace(/[áàâäéèêëíìîïóòôöúùûüç]/g, (c) => c.normalize('NFD').replace(/\p{M}/gu, ''))
    .replace(/\b\d+\b/g, (n) => numerals[language]?.[Number(n)] ?? n)
    .replace(/[^\p{L}\p{N}' ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function speechMatches(transcript: string, answers: string[], language: string) {
  const normalized = normalizeSpeech(transcript, language);
  return !!normalized && answers.some((a) => normalizeSpeech(a, language) === normalized);
}
export function comparedWords(transcript: string, expected: string, language: string) {
  const heard = normalizeSpeech(transcript, language).split(' '),
    wanted = normalizeSpeech(expected, language).split(' ');
  let j = 0;
  return expected.split(/\s+/).map((word, i) => {
    const match = heard.indexOf(wanted[i], j);
    if (match >= 0) j = match + 1;
    return { word, matched: match >= 0 };
  });
}
