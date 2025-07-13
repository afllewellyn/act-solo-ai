import { useState, useRef, useCallback, useEffect } from 'react';

interface SpeechRecognitionOptions {
  onWordMatch?: (matchedWord: string) => void;
  onError?: (error: string) => void;
  language?: string;
}

// Extend the Window interface for TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
  
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }
  
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: (event: SpeechRecognitionEvent) => void;
    onerror: (event: any) => void;
    onend: () => void;
    start(): void;
    stop(): void;
    abort(): void;
  }
  
  var SpeechRecognition: {
    prototype: SpeechRecognition;
    new(): SpeechRecognition;
  };
  
  var webkitSpeechRecognition: {
    prototype: SpeechRecognition;
    new(): SpeechRecognition;
  };
}

export const useSpeechRecognition = (options: SpeechRecognitionOptions = {}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [targetWords, setTargetWords] = useState<string[]>([]);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check for browser support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
    
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      const recognition = recognitionRef.current;
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = options.language || 'en-US';
      
      recognition.onresult = (event) => {
        const results = Array.from(event.results);
        const transcript = results
          .map(result => result[0].transcript)
          .join(' ')
          .toLowerCase()
          .trim();
        
        if (transcript && targetWords.length > 0) {
          // Check if any target word is found in the transcript
          const found = targetWords.some(word => 
            transcript.includes(word.toLowerCase())
          );
          
          if (found) {
            const matchedWord = targetWords.find(word => 
              transcript.includes(word.toLowerCase())
            );
            stopListening();
            options.onWordMatch?.(matchedWord || '');
          }
        }
      };
      
      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        options.onError?.(event.error);
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [options.language]);

  const extractLastWords = (text: string): string[] => {
    if (!text) return [];
    
    // Remove HTML tags and normalize text
    const cleanText = text
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const words = cleanText.split(' ').filter(word => word.length > 0);
    
    // Return last 1-3 words for better matching
    if (words.length >= 3) {
      return [
        words[words.length - 1], // Last word
        words.slice(-2).join(' '), // Last 2 words
        words.slice(-3).join(' ')  // Last 3 words
      ];
    } else if (words.length >= 2) {
      return [
        words[words.length - 1],
        words.slice(-2).join(' ')
      ];
    } else {
      return words;
    }
  };

  const startListening = useCallback((textToMatch: string) => {
    if (!isSupported || !recognitionRef.current) {
      options.onError?.('Speech recognition not supported');
      return;
    }

    const lastWords = extractLastWords(textToMatch);
    setTargetWords(lastWords);
    
    try {
      recognitionRef.current.start();
      setIsListening(true);
      
      // Set 10-second timeout for silent fail
      timeoutRef.current = setTimeout(() => {
        stopListening();
      }, 10000);
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      options.onError?.('Failed to start listening');
    }
  }, [isSupported, options]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
    setTargetWords([]);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [isListening]);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
    targetWords
  };
};