// 端末の読み上げ機能で発音する

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function guessLang(text) {
  const s = String(text);
  if (/[぀-ヿ]/.test(s)) return 'ja-JP';
  if (/[가-힯]/.test(s)) return 'ko-KR';
  if (/[一-鿿]/.test(s)) return 'ja-JP';
  if (/[äöüß]/i.test(s)) return 'de-DE';
  if (/[àâçéèêëîïôûùœ]/i.test(s)) return 'fr-FR';
  if (/[ñ¿¡]/i.test(s)) return 'es-ES';
  return 'en-US';
}

let voicesCache = null;
function voices() {
  if (!voicesCache || !voicesCache.length) voicesCache = window.speechSynthesis.getVoices();
  return voicesCache;
}

export function speak(text) {
  if (!canSpeak() || !text) return false;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    const lang = guessLang(text);
    u.lang = lang;
    u.rate = lang === 'en-US' ? 0.92 : 1;
    const base = lang.slice(0, 2);
    const voice = voices().find((v) => v.lang === lang && v.localService) || voices().find((v) => v.lang?.startsWith(base));
    if (voice) u.voice = voice;
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}
