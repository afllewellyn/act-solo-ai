import { useState, useRef, useCallback, useEffect } from 'react';
import { useIsMobile } from './use-mobile';

interface SpeechRecognitionOptions {
  onWordMatch?: (matchedWord: string) => void;
  onError?: (error: string) => void;
  language?: string;
  onCueDetected?: (detectedCue: string) => void;
  onMobileListenRequest?: () => void; // Called when mobile needs manual listen trigger
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
    onstart?: () => void;
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
  const isMobile = useIsMobile();
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [targetWords, setTargetWords] = useState<string[]>([]);
  const [shouldBeListening, setShouldBeListening] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [waitingForUserTrigger, setWaitingForUserTrigger] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const browserInfo = useRef<{ name: string; version: string }>({ name: 'unknown', version: 'unknown' });

  // Browser detection utility
  const detectBrowser = useCallback(() => {
    const userAgent = navigator.userAgent;
    let name = 'unknown';
    let version = 'unknown';
    
    if (userAgent.includes('Chrome') && !userAgent.includes('Edge')) {
      name = 'chrome';
      const match = userAgent.match(/Chrome\/([0-9.]+)/);
      version = match ? match[1] : 'unknown';
    } else if (userAgent.includes('Firefox')) {
      name = 'firefox';
      const match = userAgent.match(/Firefox\/([0-9.]+)/);
      version = match ? match[1] : 'unknown';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      name = 'safari';
      const match = userAgent.match(/Version\/([0-9.]+)/);
      version = match ? match[1] : 'unknown';
    } else if (userAgent.includes('Edge')) {
      name = 'edge';
      const match = userAgent.match(/Edge\/([0-9.]+)/);
      version = match ? match[1] : 'unknown';
    }
    
    browserInfo.current = { name, version };
    return { name, version };
  }, []);

  // Enhanced logging utility
  const logEvent = useCallback((event: string, data: any) => {
    console.log(`🎤 [Speech Recognition] [${event}]`, data);
  }, []);

  // Internal function to start recognition
  const startRecognition = useCallback(() => {
    if (!isSupported || !recognitionRef.current || isListening) {
      console.log('🎤 Cannot start recognition - not supported, no ref, or already listening');
      return;
    }

    try {
      console.log(`🎤 Starting speech recognition (${browserInfo.current.name} ${browserInfo.current.version})`);
      logEvent('start_attempt', { target_words: targetWords });
      
      recognitionRef.current.start();
      setIsListening(true);
      
      // Reset retry count on successful start
      setRetryCount(0);
      
      // Set timeout for recognition session
      const timeoutDuration = 15000; // 15 seconds
      timeoutRef.current = setTimeout(() => {
        console.log('⏰ Recognition timeout - restarting if needed');
        logEvent('timeout', { target_words: targetWords, retry_count: retryCount });
        
        if (shouldBeListening && isListening) {
          console.log('🎤 Timeout restart triggered');
          stopRecognition();
          // Schedule restart after a short delay
          setTimeout(() => {
            if (shouldBeListening && !isListening) {
              attemptRestart();
            }
          }, 100);
        }
      }, timeoutDuration);
      
    } catch (error) {
      console.error('🎤 Failed to start recognition:', error);
      setIsListening(false);
      logEvent('start_error', { error: error instanceof Error ? error.message : 'Unknown error' });
      
      // Handle specific errors
      if (error instanceof Error) {
        if (error.name === 'InvalidStateError') {
          console.log('🎤 InvalidStateError - recognition already started, stopping first');
          stopRecognition();
          setTimeout(() => attemptRestart(), 100);
        } else if (error.name === 'NotAllowedError') {
          setShouldBeListening(false);
          options.onError?.('Microphone permission denied');
        } else {
          setTimeout(() => attemptRestart(), 100);
        }
      } else {
        setTimeout(() => attemptRestart(), 100);
      }
    }
  }, [isSupported, isListening, shouldBeListening, targetWords, retryCount, logEvent, options]);

  // Auto-restart logic with retry mechanism
  const attemptRestart = useCallback(() => {
    if (!shouldBeListening || !isSupported || !recognitionRef.current) {
      console.log('🎤 Skip restart - not needed or not supported');
      return;
    }

    const maxRetries = 3;
    const currentRetry = retryCount;

    if (currentRetry >= maxRetries) {
      console.error('🎤 Max retries exceeded, stopping auto-restart');
      logEvent('max_retries_exceeded', { retry_count: currentRetry });
      setShouldBeListening(false);
      setRetryCount(0);
      options.onError?.('Speech recognition failed after multiple attempts');
      return;
    }

    // Exponential backoff: 500ms, 1000ms, 2000ms
    const delay = Math.min(500 * Math.pow(2, currentRetry), 2000);
    console.log(`🎤 Scheduling restart attempt ${currentRetry + 1}/${maxRetries} in ${delay}ms`);
    
    restartTimeoutRef.current = setTimeout(() => {
      if (shouldBeListening && !isListening) {
        console.log(`🎤 Auto-restart attempt ${currentRetry + 1}/${maxRetries}`);
        setRetryCount(currentRetry + 1);
        startRecognition();
      }
    }, delay);
  }, [shouldBeListening, isSupported, isListening, retryCount, startRecognition, logEvent, options]);

  // Internal function to stop recognition
  const stopRecognition = useCallback(() => {
    if (recognitionRef.current && isListening) {
      console.log('🎤 Stopping speech recognition');
      recognitionRef.current.stop();
    }
    setIsListening(false);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [isListening]);

  // Initialize recognition and set up event handlers
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
    
    // Detect browser for compatibility handling
    detectBrowser();
    console.log(`🎤 Browser detected: ${browserInfo.current.name} ${browserInfo.current.version}`);
    
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      const recognition = recognitionRef.current;
      
      // Configure recognition - Mobile-aware settings
      recognition.continuous = !isMobile; // Mobile devices work better with single-shot
      recognition.interimResults = !isMobile; // Mobile devices prefer final results only
      recognition.lang = options.language || 'en-US';
      
      console.log(`🎤 [${isMobile ? 'Mobile' : 'Desktop'}] Speech recognition configured - continuous: ${recognition.continuous}, interimResults: ${recognition.interimResults}`);
      
      // Enhanced result handler
      recognition.onresult = (event) => {
        const results = Array.from(event.results);
        const transcript = results
          .map(result => result[0].transcript)
          .join(' ')
          .toLowerCase()
          .trim();
        
        console.log(`🎤 [${browserInfo.current.name}] Listening for: "${targetWords.join('", "')}" | Heard: "${transcript}"`);
        
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
            console.log(`✅ [onresult] Cue detected: "${detectedCue}" — triggering AI response`);
            logEvent('cue_detected', { detectedCue, transcript, targetWords });
            
            // Stop listening and clear should-be-listening state
            setShouldBeListening(false);
            stopRecognition();
            
            // Use the enhanced callback for cue detection
            if (options.onCueDetected) {
              console.log(`🎯 [onresult] Calling onCueDetected with: "${detectedCue}"`);
              options.onCueDetected(detectedCue);
            } else if (options.onWordMatch) {
              console.log(`🎯 [onresult] Calling onWordMatch with: "${detectedCue}"`);
              options.onWordMatch(detectedCue);
            }
          }
        }
      };
      
      // Enhanced error handler with auto-restart
      recognition.onerror = (event) => {
        console.error(`🎤 [onerror] Speech recognition error [${browserInfo.current.name}]:`, event.error);
        console.log(`🎤 [onerror] shouldBeListening: ${shouldBeListening}, targetWords: [${targetWords.join(', ')}]`);
        logEvent('recognition_error', { 
          error: event.error, 
          browser: browserInfo.current, 
          shouldBeListening,
          targetWords,
          isListening 
        });
        setIsListening(false);
        
        // Handle specific errors
        if (event.error === 'not-allowed') {
          console.error('🎤 [onerror] ❌ Microphone permission denied - stopping');
          setShouldBeListening(false);
          options.onError?.('Microphone permission denied');
        } else if (event.error === 'network') {
          console.error('🎤 [onerror] ⚠️ Network error - will retry if needed');
          if (shouldBeListening) {
            console.log('🎤 [onerror] ✅ Attempting restart after network error');
            attemptRestart();
          }
        } else if (event.error === 'aborted') {
          console.log('🎤 [onerror] ℹ️ Recognition aborted - normal stop, no restart');
          // Don't restart on abort
        } else {
          console.error(`🎤 [onerror] ⚠️ Other error (${event.error}) - will retry if needed`);
          if (shouldBeListening) {
            console.log('🎤 [onerror] ✅ Attempting restart after error');
            attemptRestart();
          }
        }
      };
      
  // Enhanced end handler with auto-restart
  recognition.onend = () => {
    console.log(`🎤 [onend] Speech recognition ended [${browserInfo.current.name}]`);
    console.log(`🎤 [onend] shouldBeListening: ${shouldBeListening}, targetWords: [${targetWords.join(', ')}]`);
    logEvent('recognition_ended', { 
      browser: browserInfo.current, 
      shouldBeListening,
      targetWords,
      isListening 
    });
    setIsListening(false);
    
      // Mobile-aware auto-restart logic
      if (shouldBeListening) {
        if (isMobile) {
          console.log('🎤 [onend] 📱 Mobile device - waiting for user trigger instead of auto-restart');
          setWaitingForUserTrigger(true);
          options.onMobileListenRequest?.();
        } else {
          console.log('🎤 [onend] 🖥️ Desktop device - auto-restart triggered');
          attemptRestart();
        }
      } else {
        console.log('🎤 [onend] ❌ No auto-restart needed - shouldBeListening is false');
      }
  };
      
      // Start handler for logging
      if (recognition.onstart !== undefined) {
        recognition.onstart = () => {
          console.log(`🎤 [onstart] Speech recognition started [${browserInfo.current.name}]`);
          logEvent('recognition_started', { browser: browserInfo.current });
        };
      }
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
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

    console.log('🎤 [API] Starting to listen for:', textToMatch);
    const lastWords = extractLastWords(textToMatch);
    setTargetWords(lastWords);
    setShouldBeListening(true);
    setRetryCount(0);
    
    startRecognition();
  }, [isSupported, options, startRecognition]);

  // Enhanced function specifically for cue word detection with mobile-aware logic
  const startListeningForCue = useCallback((textToMatch: string) => {
    if (!isSupported || !recognitionRef.current) {
      console.error('🎤 [startListeningForCue] ❌ Speech recognition not supported');
      options.onError?.('Speech recognition not supported');
      return;
    }

    console.log(`🎤 [startListeningForCue] 🚀 [${isMobile ? 'Mobile' : 'Desktop'}] Starting to listen for cue:`, textToMatch);
    console.log('🎤 [startListeningForCue] Previous state - shouldBeListening:', shouldBeListening, 'isListening:', isListening);
    logEvent('start_listening_for_cue_called', { textToMatch, previousShouldBeListening: shouldBeListening, previousIsListening: isListening, isMobile });
    
    const cueWords = extractCueWords(textToMatch);
    setTargetWords(cueWords);
    setShouldBeListening(true);
    setRetryCount(0);
    setWaitingForUserTrigger(false);
    
    console.log(`🎤 [startListeningForCue] ✅ Extracted cue words: [${cueWords.join(', ')}]`);
    console.log('🎤 [startListeningForCue] Updated state - shouldBeListening: true');
    logEvent('cue_words_extracted', { cueWords, shouldBeListening: true, isMobile });
    
    if (isMobile) {
      console.log('🎤 [startListeningForCue] 📱 Mobile device - setting up for manual trigger');
      setWaitingForUserTrigger(true);
      options.onMobileListenRequest?.();
    } else {
      console.log('🎤 [startListeningForCue] 🖥️ Desktop device - starting recognition immediately');
      startRecognition();
    }
  }, [isSupported, options, startRecognition, logEvent, shouldBeListening, isListening, isMobile]);

  // Mobile-specific manual trigger function
  const manualTriggerListen = useCallback(() => {
    if (!isMobile || !waitingForUserTrigger) return;
    
    console.log('🎤 [manualTriggerListen] 📱 Manual trigger activated');
    setWaitingForUserTrigger(false);
    startRecognition();
  }, [isMobile, waitingForUserTrigger, startRecognition]);

  const stopListening = useCallback(() => {
    console.log('🎤 [stopListening] 🛑 Stopping listening');
    console.log('🎤 [stopListening] Previous state - shouldBeListening:', shouldBeListening, 'isListening:', isListening);
    logEvent('stop_listening_called', { previousShouldBeListening: shouldBeListening, previousIsListening: isListening });
    
    setShouldBeListening(false);
    setRetryCount(0);
    setTargetWords([]);
    setWaitingForUserTrigger(false);
    
    console.log('🎤 [stopListening] ✅ Updated state - shouldBeListening: false, targetWords: []');
    
    stopRecognition();
    
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, [stopRecognition, logEvent, shouldBeListening, isListening]);

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
    targetWords,
    isMobile,
    waitingForUserTrigger,
    manualTriggerListen,
  };
};