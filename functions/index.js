const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

// Gemini-API-Key liegt als Secret in Google Cloud Secret Manager, nie im
// Quellcode oder im Browser. Setzen/Ändern über:
//   firebase functions:secrets:set GEMINI_API_KEY
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Nur diese Modelle sind erlaubt (entspricht MODEL_ATTEMPTS in index.html) -
// verhindert, dass über die Callable-Function beliebige Gemini-Modelle
// (inkl. teurerer) angefragt werden.
const ALLOWED_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
]);

// Ersetzt die frühere direkte Client->Gemini-Verbindung (erst per API-Key im
// Browser, dann per Firebase AI Logic + App Check). Der Browser ruft jetzt
// nur noch diese Firebase Callable Function auf; der eigentliche
// Gemini-Aufruf inkl. Key passiert ausschließlich hier server-seitig.
// Firebase prüft den mitgeschickten Auth-Token automatisch, bevor der
// Handler überhaupt läuft - `request.auth` ist nur bei gültigem, eingeloggtem
// Nutzer gesetzt.
exports.generateWithGemini = onCall(
  { secrets: [geminiApiKey], region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Bitte zuerst mit Google anmelden.");
    }

    const { model, parts } = request.data || {};
    if (!ALLOWED_MODELS.has(model)) {
      throw new HttpsError("invalid-argument", "Unbekanntes oder nicht erlaubtes Modell.");
    }
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new HttpsError("invalid-argument", "Fehlende Inhalte für die Anfrage.");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey.value()}`;

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }] }),
      });
    } catch (e) {
      throw new HttpsError("unavailable", "Netzwerkfehler bei der Kommunikation mit Gemini.");
    }

    if (response.status === 429) {
      throw new HttpsError("resource-exhausted", "Gemini-Kontingent aktuell ausgeschöpft.");
    }
    if (response.status === 503) {
      throw new HttpsError("unavailable", "Gemini ist gerade überlastet.");
    }
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new HttpsError("internal", errBody.error?.message || `Gemini-Fehler (${response.status})`);
    }

    const data = await response.json();
    const text = data.candidates
      ?.flatMap((c) => c.content?.parts || [])
      ?.filter((p) => p.text)
      ?.map((p) => p.text)
      ?.join("\n");

    if (!text) {
      throw new HttpsError("internal", "Keine gültige Textantwort von Gemini erhalten.");
    }

    return { text };
  }
);
