import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Mic, Send, StopCircle } from 'lucide-react';
import './App.css';
import VoiceVisualizer from './VoiceVisualizer';

type Message = {
  sender: 'user' | 'ai';
  text: string;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // --- NEW: State for the loading animation ---
  const [loadingDots, setLoadingDots] = useState('.');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const chatWindowRef = useRef<HTMLDivElement | null>(null);
  const currentlyPlayingAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    chatWindowRef.current?.scrollTo(0, chatWindowRef.current.scrollHeight);
  }, [messages]);

  // --- NEW: useEffect to animate the loading dots ---
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      // Start an interval to cycle through 1, 2, and 3 dots
      interval = setInterval(() => {
        setLoadingDots(dots => {
          if (dots.length >= 3) {
            return '.';
          }
          return dots + '.';
        });
      }, 400); // Change the speed of the animation here
    }

    // This is a cleanup function that runs when the component unmounts
    // or when the isLoading state changes. It stops the interval.
    return () => clearInterval(interval);
  }, [isLoading]); // This effect only runs when isLoading changes


  const sendPromptToAI = async (promptText: string) => {
    const newUserMessage: Message = { sender: 'user', text: promptText };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    setIsLoading(true);
    const currentHistory = [...messages, newUserMessage];
    const historyForAPI = currentHistory.map(msg => ({
      role: msg.sender === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }));

    try {
      const chatResponse = await fetch(`${process.env.REACT_APP_API_URL}api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: historyForAPI, prompt: promptText }),
      });
      if (!chatResponse.ok) throw new Error(`Chat API failed with status ${chatResponse.status}`);
      const chatData = await chatResponse.json();
      const aiTextMessage: Message = { sender: 'ai', text: chatData.message };
      setMessages(prevMessages => [...prevMessages, aiTextMessage]);

      const ttsResponse = await fetch(`${process.env.REACT_APP_API_URL}api/text-to-speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chatData.message }),
      });
      if (!ttsResponse.ok) throw new Error(`TTS API failed with status ${ttsResponse.status}`);
      const ttsData = await ttsResponse.json();
      const audio = new Audio(`data:audio/mp3;base64,${ttsData.audioContent}`);
      currentlyPlayingAudioRef.current = audio;
      await audio.play();
      audio.onended = () => {
        currentlyPlayingAudioRef.current = null;
      };

    } catch (error) {
      console.error("API call failed:", error);
      const errorMessage: Message = { sender: 'ai', text: 'Sorry, I ran into an error. Please try again.' };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    if (currentlyPlayingAudioRef.current) {
      currentlyPlayingAudioRef.current.pause();
      currentlyPlayingAudioRef.current = null;
    }
    sendPromptToAI(userInput);
    setUserInput('');
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      if (currentlyPlayingAudioRef.current) {
        currentlyPlayingAudioRef.current.pause();
        currentlyPlayingAudioRef.current = null;
      }
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          audioStreamRef.current = stream;
          audioChunksRef.current = [];
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;
          mediaRecorder.addEventListener("dataavailable", event => audioChunksRef.current.push(event.data));
          mediaRecorder.addEventListener("stop", async () => {
            stream.getTracks().forEach(track => track.stop());
            setIsLoading(true);
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append("audio", audioBlob);

            try {
              const sttResponse = await fetch(`${process.env.REACT_APP_API_URL}api/speech-to-text`, {
                method: 'POST',
                body: formData,
              });
              if (!sttResponse.ok) throw new Error(`STT API failed with status ${sttResponse.status}`);
              const sttData = await sttResponse.json();
              if (sttData.text) {
                sendPromptToAI(sttData.text);
              } else {
                throw new Error("Transcription result was empty.");
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
        .catch(err => {
          console.error("Error accessing microphone:", err);
          alert("Microphone access was denied. Please allow microphone access in your browser settings.");
        });
    }
  };

  return (
    <div className="App">
      <div className="chat-window" ref={chatWindowRef}>
        {messages.length === 0 && !isLoading && (
          <div className="welcome-message">
             <h2>Hello <span style={{ color: '#8ab4f8' }}>Machan</span>,</h2>
             <p>I'm your personal AI assistant. Start typing, or tap the mic button to talk!</p>
          </div>
        )}
        
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            <ReactMarkdown>{msg.text}</ReactMarkdown>
          </div>
        ))}

        {/* --- MODIFIED: The loading message now uses the animated dots --- */}
        {isLoading && !isRecording && (
          <div className="message ai">
            {/* We use a span with a fixed width to prevent the layout from shifting as the dots change */}
            <p><i>Just a sec, Analyzing<span style={{ minWidth: '15px', display: 'inline-block', textAlign: 'left' }}>{loadingDots}</span></i></p>
          </div>
        )}
      </div>

      {isRecording && <VoiceVisualizer audioStream={audioStreamRef.current} isRecording={isRecording} />}
      
      <form className="chat-input-form" onSubmit={handleTextSubmit}>
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Type or tap the mic to talk..."
          disabled={isLoading}
          autoFocus
        />
         {userInput.trim() ? (
          <button
            type="submit"
            disabled={isLoading || !userInput.trim()}
            className="send-button"
          >
            <Send  size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleToggleRecording}
            className={`mic-button ${isRecording ? 'recording' : ''}`}
            disabled={isLoading}
          >
            {isRecording ? <StopCircle size={18} /> : <Mic size={18} />}
          </button>
        )}      
      </form>
    </div>
  );
}

export default App;