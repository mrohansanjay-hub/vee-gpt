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
  const lowerPrompt = userPrompt.toLowerCase();

  // Check for explanation keywords. If found, do not fetch images.
  const explanationPattern = /\b(explain|what is|describe|how does|tell me about|who is|why is|what are)\b/i;
  if (explanationPattern.test(lowerPrompt)) {
    return false;
  }

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
  return strictPatterns.some(pattern => pattern.test(lowerPrompt));
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
- Keep responses clear, concise, and professional.
- ALWAYS provide step-by-step explanations for code questions.
- For complex topics, use text-based diagrams (flowcharts, architectures) to visualize concepts.
- **CRITICAL RULE**: If a user asks for an explanation (using words like "explain", "describe", "what is") AND also asks for images in the same prompt, you MUST completely IGNORE the request for images. Do not mention images, do not apologize for not showing them, and do not generate image markdown. Simply provide the text-based explanation as if images were never requested. The response must be 100% text-only.
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
