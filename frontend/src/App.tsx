import React, { useState, useRef } from 'react';
import './App.css';
import ReactMarkdown from 'react-markdown';

// Define a type for our message object for better type-safety
type Message = {
  sender: 'user' | 'ai';
  text: string;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // --- NEW: State and refs for voice recording ---
  const [isRecording, setIsRecording] = useState(false);
  // useRef is used to hold a reference to the MediaRecorder instance
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // useRef to hold the audio chunks
  const audioChunksRef = useRef<Blob[]>([]);

  // This function now handles sending text to the AI, whether from text input or voice
  const sendPromptToAI = async (promptText: string) => {
    // Add the user's message to the chat display first
    const userMessage: Message = { sender: 'user', text: promptText };
    // We use a functional update to get the most recent state
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setIsLoading(true);

    // --- NEW: Format our message history for the Gemini API ---
    // The Gemini API expects roles of "user" and "model". Our state uses "user" and "ai".
    // It also expects the content to be in a `parts` array.
    const historyForAPI = messages.map(msg => ({
      role: msg.sender === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }));

    try {
      // --- MODIFIED: The fetch call now sends the history and the new prompt ---
      const chatResponse = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          history: historyForAPI,
          prompt: promptText 
        }),
      });

      if (!chatResponse.ok) throw new Error('Chat API failed');
      const chatData = await chatResponse.json();
      const aiTextMessage: Message = { sender: 'ai', text: chatData.message };
      // Add the new AI message to our state
      setMessages(prevMessages => [...prevMessages, aiTextMessage]);

      // Get AI audio response (this part remains the same)
      const ttsResponse = await fetch('http://localhost:5000/api/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chatData.message }),
      });
      if (!ttsResponse.ok) throw new Error('Text-to-Speech API failed');
      const ttsData = await ttsResponse.json();
      const audio = new Audio(`data:audio/mp3;base64,${ttsData.audioContent}`);
      audio.play();

    } catch (error) {
      console.error("API call failed:", error);
      const errorMessage: Message = { sender: 'ai', text: 'Sorry, I ran into an error. Please try again.' };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- MODIFIED: This function now only handles the form submission for text input ---
  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    sendPromptToAI(userInput);
    setUserInput('');
  };

  // --- NEW: Function to handle starting and stopping the recording ---
  const handleRecordButtonClick = () => {
    if (isRecording) {
      // Stop the recording
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      // Start a new recording
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          audioChunksRef.current = []; // Clear previous audio chunks
          const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
          mediaRecorderRef.current = mediaRecorder;

          // When data is available, push it to our chunks array
          mediaRecorder.addEventListener("dataavailable", event => {
            audioChunksRef.current.push(event.data);
          });

          // When the recording is stopped, process the audio
          mediaRecorder.addEventListener("stop", async () => {
            setIsLoading(true);
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            
            // Use FormData to send the file to the backend
            const formData = new FormData();
            formData.append("audio", audioBlob);

            try {
              // Send the audio file to the speech-to-text API
              const sttResponse = await fetch('http://localhost:5000/api/speech-to-text', {
                method: 'POST',
                body: formData,
              });
              if (!sttResponse.ok) throw new Error('Speech-to-Text API failed');
              const sttData = await sttResponse.json();
              
              // If transcription is successful, send it to the AI
              if (sttData.text) {
                sendPromptToAI(sttData.text);
              }
            } catch (error) {
              console.error("Speech-to-Text failed:", error);
              const errorMessage: Message = { sender: 'ai', text: 'Sorry, I could not understand your speech.' };
              setMessages(prevMessages => [...prevMessages, errorMessage]);
            } finally {
              setIsLoading(false);
            }
          });

          mediaRecorder.start();
          setIsRecording(true);
        })
        .catch(err => console.error("Error accessing microphone:", err));
    }
  };

  return (
    <div className="App">
      <div className="chat-window">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            <ReactMarkdown>{msg.text}</ReactMarkdown>
          </div>
        ))}
        {isLoading && !isRecording && (
          <div className="message ai">
            <p><i>Thinking...</i></p>
          </div>
        )}
      </div>
      <form className="chat-input-form" onSubmit={handleTextSubmit}>
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Type or click the mic to talk..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>Send</button>
        {/* NEW: Microphone Button */}
        <button 
          type="button" 
          onClick={handleRecordButtonClick} 
          className={`mic-button ${isRecording ? 'recording' : ''}`}
          disabled={isLoading && !isRecording}
        >
          🎤
        </button>
      </form>
    </div>
  );
}

export default App;