import os
from flask import Flask, request, jsonify
from openai import OpenAI
from dotenv import load_dotenv
from flask_cors import CORS

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
# Enable CORS to allow requests from your React frontend
CORS(app) 

# Initialize the OpenAI client
# The API key is read automatically from the OPENAI_API_KEY environment variable
try:
    client = OpenAI()
except Exception as e:
    # Handle case where API key is not set
    print(f"Error initializing OpenAI client: {e}")
    print("Please make sure your OPENAI_API_KEY is set in your .env file.")
    client = None

@app.route('/api/generate-image', methods=['POST'])
def generate_image_endpoint():
    if not client:
        return jsonify({"error": "OpenAI client not initialized. Check server logs."}), 500

    data = request.get_json()
    if not data or 'prompt' not in data:
        return jsonify({"error": "Prompt is required"}), 400

    prompt = data['prompt']
    print(f"🎨 Received request to generate image for: '{prompt}'")

    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1024x1024",
            quality="standard",
            n=1,
        )

        image_url = response.data[0].url
        print(f"✅ Image generated successfully: {image_url}")
        return jsonify({"imageUrl": image_url})

    except Exception as e:
        print(f"❌ Error generating image: {str(e)}")
        return jsonify({"error": f"Failed to generate image. {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=8000)