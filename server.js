require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── ANALYZE IMAGE ──────────────────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { imageBase64, mimeType } = req.body;

  if (!imageBase64) return res.status(400).json({ error: 'No image provided.' });
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    return res.status(500).json({ error: 'API key not configured. Add your Gemini key to the .env file.' });
  }

  const prompt = `Je bent een expert art director voor luxe meubelstyling en architecturale fotografie. Analyseer deze afbeelding alsof je de setting beschrijft voor een high-end meubelcampagne. Wees zo concreet en visueel specifiek als mogelijk voor PRECIES DEZE omgeving.

Geef ALLEEN een JSON response. Geen markdown, geen backticks, geen uitleg buiten de JSON.

De "description" moet 280-350 woorden zijn in lopende alineatekst in het Nederlands, en beschrijft in deze volgorde: (1) Het type setting en algehele karakter — interieur of exterieur, historisch of modern, de sfeer en gebruikscontext, warm of koel, formeel of casual. (2) De vloer — exact materiaal, textuur, kleurschakeringen, onregelmatigheden, slijtage of patina. (3) De wanden, gevels of omringende architectuur — materialen met precieze kleurbenamingen zoals 'verweerde zandkleur', 'gebroken wit', 'diepe oker', zichtbare imperfecties, scheurtjes, veroudering die authenticiteit toevoegen. (4) Architectonische details — ramen hun formaat en profilering, deuren, plafondstructuur, balken, nissen, zuilen, balustrades of andere karakteristieke elementen. (5) Het licht — natuurlijk of kunstmatig, richting en invalshoek, kleurtemperatuur zoals 'warm amberkleurig avondlicht' of 'koel diffuus noorderlicht', hoe het valt op oppervlakken, de kwaliteit van highlights en schaduwen. (6) Decoratieve elementen, planten, keramiek, kunst, textiel of accessoires en hun bijdrage aan de sfeer. (7) De algehele stijlcategorie en waarom deze setting werkt als backdrop voor een luxe meubel.

De cameraAngles en placements moeten verwijzen naar SPECIFIEKE ELEMENTEN UIT DEZE AFBEELDING — geen generieke beschrijvingen.

Gebruik exact dit JSON formaat zonder enige afwijking:
{"description":"[280-350 woorden lopende tekst]","cameraAngles":[{"name":"[naam 3-5 woorden]","description":"[2-3 zinnen: exacte camerapositie en hoogte, kijkrichting, welke specifieke elementen van DEZE omgeving op voor-midden-achtergrond komen, waarom deze hoek de ruimte optimaal toont]","recommended":true},{"name":"[naam]","description":"[zelfde specificiteit, verwijzend naar elementen in de afbeelding]","recommended":false},{"name":"[naam]","description":"[zelfde specificiteit]","recommended":false},{"name":"[naam]","description":"[zelfde specificiteit]","recommended":false}],"placements":[{"name":"[naam 3-5 woorden]","description":"[2-3 zinnen: exacte positie bij welk specifiek architecturaal element, afstand van wanden of ramen, relatie tot de lichtbron, compositieeffect]","recommended":true},{"name":"[naam]","description":"[zelfde specificiteit]","recommended":false},{"name":"[naam]","description":"[zelfde specificiteit]","recommended":false},{"name":"[naam]","description":"[zelfde specificiteit]","recommended":false}]}`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
            { text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();

    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.candidates[0].content.parts.map(p => p.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const analysisData = JSON.parse(clean);

    res.json({ success: true, data: analysisData });
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GENERATE PROMPT ───────────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const { imageBase64, mimeType, analysisDescription, selectedAngle, selectedPlacement } = req.body;

  if (!imageBase64) return res.status(400).json({ error: 'No image provided.' });
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    return res.status(500).json({ error: 'API key not configured.' });
  }

  const prompt = `You are a world-class AI image prompt engineer specialising in luxury furniture staging and high-end architectural visualisation. Your prompts are used directly in AI image generation tools (Midjourney, FLUX, Stable Diffusion) and must be detailed enough to produce photorealistic, editorial-quality results.

Generate a MASTER PROMPT based on:
ENVIRONMENT ANALYSIS: ${analysisDescription}
SELECTED CAMERA ANGLE: ${selectedAngle.name} — ${selectedAngle.description}
SELECTED FURNITURE PLACEMENT: ${selectedPlacement.name} — ${selectedPlacement.description}

Write ONLY the prompt itself. No intro sentence, no explanation, no markdown formatting, no backticks. Use these EXACT section headers in CAPS followed by a colon, each on its own line. Leave one blank line between sections.

SCENE TYPE:
[One precise line: the space type, its dominant mood, and defining visual quality.]

SETTING:
[Write 200-240 words in flowing prose across 4-5 paragraphs describing: floor and ground plane, walls and architectural envelope, atmosphere and spatial quality, lighting in full detail, decorative elements and broader context.]

FURNITURE INTEGRATION (CRITICAL — DO NOT ALTER):
Place the furniture from the attached image exactly as is into this environment.
The furniture must remain 100% identical to the original image
Absolutely no modifications are allowed
Do not change shape, proportions, scale, or structure
Do not alter materials, textures, finishes, or colors
Do not reinterpret or redesign any element
Every single detail must remain exactly the same (millimeter-accurate)
Preserve all craftsmanship details, seams, edges, and surface nuances
Maintain the original studio lighting on the furniture
Maintain the exact camera perspective and lens characteristics

COMPOSITION:
[3-4 sentences describing exactly where the furniture sits in this specific environment, the camera position and angle, the precise depth structure of the shot, and how the furniture integrates naturally with the surrounding environment.]

CAMERA & VISUAL STYLE:
Elevated / eye-level / low camera position
Angle direction and degree of tilt
Wide / medium / tight composition
Foreground — midground — background depth description
Natural / artificial lighting style and quality
Editorial lifestyle and architectural photography style
Ultra-realistic rendering with physically accurate materials
Precise light and shadow behaviour
Atmospheric depth and natural depth of field
High-end surface detail and texture fidelity

NEGATIVE PROMPT:
No distortion, no warped geometry, no unrealistic lighting, no CGI look, no artificial symmetry, no floating objects, no incorrect perspective, no overexposed highlights, no harsh shadows, no clutter, no low-detail surfaces, no furniture modifications, no altered proportions, no colour shifts on furniture, no added or removed furniture elements`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
            { text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();

    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.candidates[0].content.parts.map(p => p.text || '').join('');
    res.json({ success: true, prompt: text });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Local dev
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n✦ Furniture Staging AI running at http://localhost:${PORT}\n`);
  });
}

// Vercel
module.exports = app;
