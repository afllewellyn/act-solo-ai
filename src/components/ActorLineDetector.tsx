import { useEffect, useRef } from 'react';
import { matchCharacterLine } from '@/components/practice/rehearsal/textUtils';
interface ActorLineDetectorProps {
  scriptContent: string;
  characters: Array<{ name: string; voice: string; isUserRole: boolean }>;
  voiceActivated: boolean;
  isSupported: boolean;
  onActorLineDetected: (line: string) => void;
}

export function ActorLineDetector({ 
  scriptContent, 
  characters, 
  voiceActivated, 
  isSupported,
  onActorLineDetected 
}: ActorLineDetectorProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const currentActorLineRef = useRef<string | null>(null);

  useEffect(() => {
    if (!voiceActivated || !isSupported) return;

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Create new intersection observer to detect when actor lines come into view
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const element = entry.target as HTMLElement;
            const textContent = element.textContent || '';
            
            // Check if this is an actor line
            const cleanText = textContent.trim();
            const characterMatch = matchCharacterLine(cleanText);
            
            if (characterMatch) {
              const characterName = characterMatch[1].trim();
              const dialogue = characterMatch[2].trim();
              
              // Check if this character is assigned to the actor (user role)
              const character = characters.find(c => c.name.toLowerCase() === characterName.toLowerCase());
              if (character && character.isUserRole) {
                console.log(`Actor line detected: ${characterName}: ${dialogue}`);
                currentActorLineRef.current = cleanText;
                onActorLineDetected(cleanText);
              }
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '-20% 0px -20% 0px', // Trigger when line is in the middle 60% of viewport
        threshold: 0.5
      }
    );

    // Observe all paragraphs in the script editor
    const scriptEditor = document.querySelector('[data-tiptap-editor]');
    if (scriptEditor) {
      const paragraphs = scriptEditor.querySelectorAll('p');
      paragraphs.forEach(p => {
        if (observerRef.current) {
          observerRef.current.observe(p);
        }
      });
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [scriptContent, characters, voiceActivated, isSupported, onActorLineDetected]);

  return null; // This is a logic-only component
}