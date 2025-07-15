import { useState, useRef, useCallback, useEffect } from 'react';

interface SpeechRecognitionOptions {
  onWordMatch?: (matchedWord: string) => void;
  onError?: (error: string) => void;
  language?: string;
  onCueDetected?: (detectedCue: string) => void;
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
        
        console.log(`Listening for: "${targetWords.join('", "')}" | Heard: "${transcript}"`);
        
        if (transcript && targetWords.length > 0) {
          // Use fuzzy matching for better detection
          const found = targetWords.some(targetWord => {
            const target = targetWord.toLowerCase().trim();
            
            // Exact match
            if (transcript.includes(target)) {
              console.log(`✅ Exact match found: "${target}"`);
              return true;
            }
            
            // Check if the last words in transcript match
            const transcriptWords = transcript.split(' ').filter(w => w.length > 0);
            const targetWords = target.split(' ').filter(w => w.length > 0);
            
            if (transcriptWords.length >= targetWords.length) {
              const lastNWords = transcriptWords.slice(-targetWords.length).join(' ');
              if (lastNWords === target) {
                console.log(`✅ Last words match: "${lastNWords}"`);
                return true;
              }
            }
            
            // Phonetic similarity check for single words
            if (targetWords.length === 1 && transcriptWords.length > 0) {
              const lastWord = transcriptWords[transcriptWords.length - 1];
              if (soundsLike(lastWord, targetWords[0])) {
                console.log(`✅ Phonetic match: "${lastWord}" sounds like "${targetWords[0]}"`);
                return true;
              }
            }
            
            return false;
          });
          
          if (found) {
            const matchedWord = targetWords.find(word => 
              transcript.includes(word.toLowerCase())
            );
            const detectedCue = matchedWord || targetWords[0];
            console.log(`✅ Cue detected: "${detectedCue}" — triggering AI response`);
            stopListening();
            
            // Use the enhanced callback for cue detection
            if (options.onCueDetected) {
              console.log(`🎯 Calling onCueDetected with: "${detectedCue}"`);
              options.onCueDetected(detectedCue);
            } else if (options.onWordMatch) {
              console.log(`🎯 Calling onWordMatch with: "${detectedCue}"`);
              options.onWordMatch(detectedCue);
            }
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
    
    // Return last 2 words for better matching
    if (words.length >= 2) {
      return [
        words.slice(-2).join(' '), // Last 2 words (primary target)
        words[words.length - 1]    // Last word (fallback)
      ];
    } else {
      return words; // Single word or empty
    }
  };

  // Enhanced cue word extraction for rehearsal mode
  const extractCueWords = (text: string): string[] => {
    if (!text) return [];
    
    // Remove HTML tags, character names, and normalize text
    const cleanText = text
      .replace(/<[^>]*>/g, ' ')
      .replace(/^[A-Z][A-Z\s\-\'\.]+:\s*/, '') // Remove character names
      .replace(/\s+/g, ' ')
      .trim();
    
    const words = cleanText.split(' ').filter(word => word.length > 1);
    
    // Filter out common filler words for better cue detection
    const fillerWords = ['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'as'];
    const meaningfulWords = words.filter(word => 
      !fillerWords.includes(word.toLowerCase()) && word.length > 2
    );
    
    if (meaningfulWords.length >= 2) {
      return [
        meaningfulWords.slice(-2).join(' '), // Last 2 meaningful words
        meaningfulWords[meaningfulWords.length - 1], // Last meaningful word
        words.slice(-2).join(' '), // Last 2 words (including fillers as fallback)
      ];
    } else if (meaningfulWords.length === 1) {
      return [
        meaningfulWords[0],
        words[words.length - 1], // Fallback to actual last word
      ];
    } else {
      return words.slice(-2); // Fallback to last words even if they're fillers
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

  // Enhanced function specifically for cue word detection
  const startListeningForCue = useCallback((textToMatch: string) => {
    if (!isSupported || !recognitionRef.current) {
      options.onError?.('Speech recognition not supported');
      return;
    }

    const cueWords = extractCueWords(textToMatch);
    setTargetWords(cueWords);
    
    try {
      recognitionRef.current.start();
      setIsListening(true);
      console.log(`🎤 Started listening for cue words: ${cueWords.join(', ')}`);
      
      // Set 15-second timeout for cue detection
      timeoutRef.current = setTimeout(() => {
        console.log('⏰ Cue detection timeout');
        stopListening();
      }, 15000);
    } catch (error) {
      console.error('Failed to start cue detection:', error);
      options.onError?.('Failed to start listening for cue');
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

  // Simple phonetic similarity function
  const soundsLike = (word1: string, word2: string): boolean => {
    if (Math.abs(word1.length - word2.length) > 2) return false;
    
    // Simple character similarity
    const similarity = calculateSimilarity(word1, word2);
    return similarity > 0.7; // 70% similarity threshold
  };

  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  };

  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  };

  return {
    isListening,
    isSupported,
    startListening,
    startListeningForCue,
    stopListening,
    targetWords
  };
};