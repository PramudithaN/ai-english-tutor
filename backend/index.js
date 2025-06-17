// At the very top, require and configure the dotenv package
require('dotenv').config();

// Require Google Cloud client libraries
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const { SpeechClient } = require('@google-cloud/speech');

// Require Express and other middleware
const express = require('express');
// --- THIS IS THE MISSING LINE ---
const cors = require('cors'); 
const multer = require('multer');

// Configure Multer
const upload = multer({ storage: multer.memoryStorage() });

const app = express();

// Use a more specific CORS configuration
const corsOptions = {
  origin: 'http://localhost:3000', // Allow only your frontend to connect
  optionsSuccessStatus: 200 
}
app.use(cors(corsOptions));

// Use the Express.json() middleware to parse JSON request bodies
app.use(express.json());

const PORT = 5000;

// Initialize the clients
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const textToSpeechClient = new TextToSpeechClient({ keyFilename: 'service-account-key.json' });
const speechClient = new SpeechClient({ keyFilename: 'service-account-key.json' });


// --- API Endpoints ---

// Healthcheck endpoint
app.get('/api/healthcheck', (req, res) => {
  res.json({
    message: "Server is healthy and responding!",
    status: "OK"
  });
});

// Chat endpoint
// Chat endpoint - UPGRADED WITH CONVERSATIONAL MEMORY
app.post('/api/chat', async (req, res) => {
  console.log("Chat endpoint has been hit with history!");

  try {
    // We now expect 'history' and a 'prompt' from the request body
    const { history, prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }
    
    // The history is optional, so we provide a default empty array if it's not sent
    const chatHistory = history || [];

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    // Start a chat session with the provided history
    const chat = model.startChat({
      history: chatHistory,
    });

    // Send the new user prompt to the chat session
    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({
      message: text
    });

  } catch (error) {
    console.error("Error in chat endpoint:", error);
    res.status(500).json({ error: "Failed to generate response from AI" });
  }
});

// Text-to-Speech endpoint
app.post('/api/text-to-speech', async (req, res) => {
    // ... (This endpoint remains the same)
    try {
        const { text } = req.body;
        if (!text) {
          return res.status(400).json({ error: "Text is required" });
        }
        const request = {
          input: { text: text },
          voice: { languageCode: 'en-US', name: 'en-US-Wavenet-F' },
          audioConfig: { audioEncoding: 'MP3' },
        };
        const [response] = await textToSpeechClient.synthesizeSpeech(request);
        res.json({ audioContent: response.audioContent.toString('base64') });
    
      } catch (error) {
        console.error("Error in text-to-speech:", error);
        res.status(500).json({ error: "Failed to convert text to speech" });
      }
});

// Speech-to-Text endpoint
app.post('/api/speech-to-text', upload.single('audio'), async (req, res) => {
    // ... (This endpoint remains the same)
    try {
        if (!req.file) {
          return res.status(400).json({ error: "No audio file uploaded." });
        }
        const audioBytes = req.file.buffer.toString('base64');
        const audio = {
          content: audioBytes,
        };
        const config = {
          encoding: 'MP3',
          sampleRateHertz: 44100,
          languageCode: 'en-US',
        };
        const request = {
          audio: audio,
          config: config,
        };
        const [response] = await speechClient.recognize(request);
        const transcription = response.results
          .map(result => result.alternatives[0].transcript)
          .join('\n');
        res.json({ text: transcription });
    
      } catch (error) {
        console.error("Error in speech-to-text:", error);
        res.status(500).json({ error: "Failed to transcribe audio" });
      }
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server is running successfully on port ${PORT}`);
});