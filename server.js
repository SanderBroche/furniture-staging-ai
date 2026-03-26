require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = `https://api.groq.com/openai/v1/chat/completions`;

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: serve index.html from root if public/ doesn't have it
app.get('/', (req, res) => {
  const rootHtml = path.join(__dirname, 'public', 'index.html');
  const fallbackHtml = path.join(__dirname, 'index.html');
  res.sendFile(require('fs').existsSync(rootHtml) ? rootHtml : fallbackHtml);
});

// ── ANALYZE IMAGE ──────────────────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { imageBase64, mimeType } = req.body;

  if (!imageBase64) return res.status(400).json({ error: 'No image provided.' });
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'API key not configured.' });

  const prompt = `Je bent een expert art director voor luxe meubelstyling en architecturale fotografie. Analyseer deze afbeelding voor een high-end meubelcampagne. Wees zo concreet en visueel specifiek als mogelijk.

Geef ALLEEN pure JSON terug — geen markdown, geen backticks, geen uitleg.

"paragraphs": een array van PRECIES 7 rijke Nederlandse alinea's, elk 2-4 zinnen, in deze volgorde:
1. Het type setting en algehele karakter — interieur of exterieur, historisch of modern, de sfeer, gebruikscontext, warm of koel, formeel of casual. Beschrijf wat je direct voelt als je naar deze plek kijkt.
2. De vloer — exact materiaal (steen, hout, beton, terracotta, parket…), textuur, kleurschakeringen met specifieke termen zoals 'verweerde zandkleur', 'gebroken wit' of 'diepe oker', onregelmatigheden, slijtage of patina die karakter geven.
3. De wanden, gevels of omringende architectuur — exacte materialen met precieze kleurbenamingen, zichtbare imperfecties, scheurtjes, veroudering of verkleuringen die authenticiteit toevoegen.
4. Architectonische details — ramen en hun formaat, deuren, plafondstructuur, balken, nissen, zuilen, balustrades, hekwerken of andere karakteristieke elementen en hun proporties.
5. Het licht — volledig naturlijk of kunstmatig, exacte richting en invalshoek, kleurtemperatuur ('warm amberkleurig avondlicht', 'koel diffuus noorderlicht', 'zachte middagzon'), hoe het valt op oppervlakken, de kwaliteit van highlights en schaduwen, en welke sfeer het creëert.
6. Decoratieve elementen, planten, keramiek, kunst, textiel of accessoires aanwezig in de scène, en hun bijdrage aan de algehele sfeer en stijl.
7. De algehele stijlcategorie en waarom deze setting werkt als backdrop voor een luxe meubel — wat maakt deze omgeving bijzonder en visueel sterk.

"cameraAngles": een array van PRECIES 9 camerahoeken.
De eerste 5 zijn ALTIJD deze standaard titels, maar met een beschrijving volledig afgestemd op DÉZE specifieke afbeelding:
1. "Elevated Three-Quarter Shot" — camera iets hoger, licht naar beneden, voor- en bovenkant meubel zichtbaar
2. "Side Profile Composition Shot" — recht van opzij, volle zijkant en strakke lijn centraal
3. "Wide Spatial Context Shot" — verder teruggetrokken, volledig ruimtelijk overzicht
4. "Low Perspective Foreground Shot" — lager dan het meubel, opwaartse kijkhoek, imposant effect
5. "Terrace / Room Landscape Shot" — camera op niveau van de setting gericht naar het landschap of de ruimte
Items 6 t/m 9 zijn UNIEKE AI-aanbevelingen specifiek voor deze setting — gebaseerd op de architectuur, het licht en de compositiemogelijkheden die je IN DEZE AFBEELDING ziet. Geef ze creatieve, beschrijvende namen.
De hoek die het beste overeenkomt met hoe de originele foto gemaakt lijkt te zijn krijgt "recommended": true. Items 6-9 krijgen "isAiSpecific": true.
Elke beschrijving: 2-3 zinnen, precies en visueel specifiek, verwijzend naar elementen uit déze afbeelding.

"placements": een array van PRECIES 4 setting-specifieke plaatsingsopties, gebaseerd op de unieke kenmerken van déze ruimte. Geen generieke opties — elke plaatsing verwijst naar specifieke architecturale elementen, lichtbronnen of compositiemogelijkheden in deze afbeelding. De plaatsing die het meest logisch is voor deze setting krijgt "recommended": true.
Elke beschrijving: 2-3 zinnen met exacte positie, relatie tot licht en architectuur, en het compositie-effect.

JSON formaat (geen afwijkingen):
{
  "paragraphs": ["alinea1","alinea2","alinea3","alinea4","alinea5","alinea6","alinea7"],
  "cameraAngles": [
    {"name":"...","description":"...","recommended":false,"isAiSpecific":false}
  ],
  "placements": [
    {"name":"...","description":"...","recommended":false}
  ]
}`;

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.choices[0].message.content;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Build combined description text for prompt generation
    parsed.description = parsed.paragraphs.join('\n\n');

    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GENERATE PROMPT ───────────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const { imageBase64, mimeType, analysisDescription, selectedAngle, selectedPlacement } = req.body;

  if (!imageBase64) return res.status(400).json({ error: 'No image provided.' });
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'API key not configured.' });

  const prompt = `You are a world-class AI image generation prompt specialist for ultra-realistic luxury furniture staging and architectural lifestyle photography. Your prompts are used in Midjourney, FLUX, and Stable Diffusion to produce photorealistic, editorial-quality results.

Generate a complete MASTER PROMPT. Write ONLY the prompt — no intro, no explanation, no markdown. Use these EXACT section headers in ALL CAPS followed by a colon, each on its own line. Leave one blank line between sections.

SCENE TYPE:
One rich, evocative line: the space type, dominant mood, and defining visual quality. Format exactly like: "Luxury Mediterranean rooftop terrace — golden hour urban overlook with historic cityscape"

SETTING:
Write 6-7 flowing paragraphs in English (220-260 words total). Each paragraph covers one aspect:

Paragraph 1 — The overall atmosphere and character of the space: what kind of setting it is, the mood it evokes, whether it feels warm or cool, formal or casual, historic or contemporary, intimate or expansive.

Paragraph 2 — The floor and ground plane: exact material with specific finish description (lightly worn natural stone tiles, aged terracotta, honed limestone, polished concrete, worn oak parquet), its texture and tonal variation, any patina, worn edges or surface irregularities that add realism.

Paragraph 3 — The walls and architectural envelope: materials with precise descriptors (plastered facades in sand, ochre, faded terracotta; raw concrete; bare brick), visible aging, hairline cracks, tonal discolouration, surface erosion. Specific architectural features: mouldings, arches, window reveals, exposed beams, niches.

Paragraph 4 — The lighting in full detail: entirely natural or artificial, exact direction and low/high angle, colour temperature (warm amber late afternoon, cool north-facing diffused daylight, soft cinematic golden hour), how it falls across surfaces creating gradients, the character of highlights on materials, the softness and depth of shadows.

Paragraph 5 — Decorative elements, vegetation, textiles, ceramics or art objects present in the scene, and how they contribute to the editorial mood and luxury feel.

Paragraph 6 — The broader context or view visible beyond the immediate setting — the urban landscape, garden, interior depth or architectural surroundings — and the atmospheric quality of the distance.

Paragraph 7 — Minimal, refined styling: understated accessories, ceramics, textiles or trays that elevate the scene without adding clutter. The overall editorial feeling.

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
Write 3 paragraphs:
Paragraph 1 — Exact furniture placement: where it sits in this specific environment, which architectural element it relates to (in front of the window, adjacent to the terrace edge, near the far wall), the placement logic and how it anchors the composition.
Paragraph 2 — Camera position and depth structure: the camera angle and height, the precise depth layering (what occupies foreground, midground and background in this specific scene), how the furniture integrates naturally and feels lived-in rather than staged.
Paragraph 3 — How foreground framing elements (plants, architectural details, textures) and background context (skyline, landscape, interior depth) work together to create a balanced, editorial composition.

CAMERA & VISUAL STYLE:
${selectedAngle.name} camera position
${selectedAngle.description}
Wide composition capturing furniture and full environment
Strong depth layering: foreground — midground — background
Natural lighting with warm cinematic quality
Editorial lifestyle and architectural photography style
Ultra-realistic rendering with physically accurate materials
Precise light and shadow behaviour
Natural atmospheric depth of field
High-end surface detail and texture fidelity
Subtle, natural depth of field

NEGATIVE PROMPT:
No distortion, no warped geometry, no unrealistic lighting, no CGI look, no artificial symmetry, no floating objects, no incorrect perspective, no overexposed highlights, no harsh shadows, no clutter, no low-detail surfaces, no furniture modifications, no altered proportions, no colour shifts on furniture, no added or removed furniture elements

---
Use this environment analysis for the SETTING section:
${analysisDescription}

Selected camera angle: ${selectedAngle.name} — ${selectedAngle.description}
Selected furniture placement: ${selectedPlacement.name} — ${selectedPlacement.description}`;

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 2500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.choices[0].message.content;
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
