import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
// NEW: Import the microphone icon
import { FaMicrophone, FaPaperPlane } from 'react-icons/fa';
import './App.css';


type Message = {
  sender: 'user' | 'ai';
  text: string;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Ref for the chat window to auto-scroll
  const chatWindowRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the bottom whenever messages change
  React.useEffect(() => {
    chatWindowRef.current?.scrollTo(0, chatWindowRef.current.scrollHeight);
  }, [messages]);


  const sendPromptToAI = async (promptText: string) => {
    const userMessage: Message = { sender: 'user', text: promptText };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setIsLoading(true);

    const historyForAPI = messages.map(msg => ({
      role: msg.sender === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }));

    try {
      const chatResponse = await fetch(`${process.env.REACT_APP_API_URL}api/chat`, {
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
      setMessages(prevMessages => [...prevMessages, aiTextMessage]);

      const ttsResponse = await fetch(`${process.env.REACT_APP_API_URL}api/text-to-speech`, {
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

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    sendPromptToAI(userInput);
    setUserInput('');
  };

  // --- NEW: Separate functions for starting and stopping recording ---
  const startRecording = () => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        setIsRecording(true);
        audioChunksRef.current = [];
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.addEventListener("dataavailable", event => {
          audioChunksRef.current.push(event.data);
        });

        mediaRecorder.addEventListener("stop", async () => {
          setIsLoading(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append("audio", audioBlob);

          try {
            const sttResponse = await fetch(`${process.env.REACT_APP_API_URL}api/speech-to-text`, {
              method: 'POST',
              body: formData,
            });
            if (!sttResponse.ok) throw new Error('Speech-to-Text API failed');
            const sttData = await sttResponse.json();
            
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
      })
      .catch(err => console.error("Error accessing microphone:", err));
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    // Get the browser to release the microphone
    mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
    setIsRecording(false);
  };


  return (
    <div className="App">
      {/* We pass the ref to this div */}
      <div className="chat-window" ref={chatWindowRef}>
        {messages.length === 0 && !isRecording && !isLoading && (
          <div className="message ai">
        <h2>
          Hellow <span style={{ color: 'rgb(66,133,244)' }}>Machan</span>,
          <br />
        </h2>
          your personal AI assistant start typing or press and hold the mic button to talk!
          </div>
        )}
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
        <button type="submit" disabled={isLoading || !userInput.trim()}>
          Send
          {/* <FaPaperPlane />  */}
        </button>
        {/* MODIFIED: Microphone Button with new events */}
        <button 
          type="button" 
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          className={`mic-button ${isRecording ? 'recording' : ''}`}
          disabled={isLoading && !isRecording}
        >
          🎙️
          {/* <FaMicrophone />  */}
        </button>
      </form>
    </div>
  );
}

export default App;