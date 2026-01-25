const axios = require('axios');
const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SERP_API_KEY = process.env.SERP_API_KEY;

/**
 * Local function to detect if user wants images.
 * STRICT: Only returns true for explicit image requests.
 */
function wantsImages(userPrompt) {
  // Match explicit image request patterns
  const strictPatterns = [
    /generate\s+(?:an?\s+)?image/i,      // generate image
    /show\s+.*?image/i,                   // show [anything] image/images
    /find\s+(?:image|photo|picture)/i,    // find image/photo/picture
    /search\s+(?:for\s+)?(?:image|photo|picture)/i,  // search image/photo
    /(?:image|photo|picture)\s+of\s+/i,  // image of [subject]
    /get\s+(?:me\s+)?(?:image|photo|picture)/i,  // get image/picture
    /pics?\s+(?:of|for|about)\s+/i,      // pic of, pics of
  ];
  return strictPatterns.some(pattern => pattern.test(userPrompt));
}

/**
 * Fetch images from SERP API.
 * Returns array of image URLs.
 */
async function fetchImagesFromSerp(query, maxResults = 3) {
  if (!SERP_API_KEY) {
    console.warn("SERP_API_KEY not found. Skipping image fetch.");
    return [];
  }

  try {
    const response = await axios.get('https://serpapi.com/search.json', {
      params: {
        q: query,
        tbm: 'isch', // image search
        serp_api_key: SERP_API_KEY,
        num: maxResults
      }
    });

    if (response.data.images_results) {
      // ALWAYS prefer original URLs (thumbnails expire fast & have CORS issues)
      const images = response.data.images_results
        .map(img => img.original)
        .filter(Boolean);
      return [...new Set(images)].slice(0, maxResults);
    }

    return [];
  } catch (err) {
    console.error("SERP API error:", err.message);
    return [];
  }
}

/**
 * Main GPT handler function.
 * Returns { text, images } object for frontend.
 */
async function handleGptRequest(userPrompt) {
  try {
    let imageUrls = [];
    const fetchImages = wantsImages(userPrompt);

    if (fetchImages) {
      // Fetch images from SERP using the user prompt
      imageUrls = await fetchImagesFromSerp(userPrompt, 6);
    }

    // Build messages for GPT
    const messages = [
      {
        role: "system",
        content: `
You are a senior full-stack developer and technical mentor.
- NEVER refuse to answer.
- If images are available, they are already fetched and shown to the user.
- Briefly refer to or explain the images if relevant.
- Keep responses clear, concise, and professional.
- ALWAYS provide step-by-step explanations for code questions.
`
      },
      {
        role: "user",
        content: userPrompt
      }
    ];

    // Generate GPT response
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const textResponse = completion.choices[0].message.content;

    return {
      text: textResponse,
      images: imageUrls
    };

  } catch (error) {
    console.error("Error in handleGptRequest:", error);
    throw error;
  }
}

module.exports = { handleGptRequest };
