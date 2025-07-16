import React, { useEffect, useRef } from 'react';
import { RichTextEditor } from '@/components/RichTextEditor';
import { ActorLineDetector } from '@/components/ActorLineDetector';
import { useRehearsal } from '@/contexts/RehearsalContext';

interface ScriptDisplayProps {
  fontSize: number;
  currentPosition: number;
  currentLine: number;
  currentActorLine: string | null;
  isPlaying: boolean;
  isFullscreen: boolean;
  onScriptUpdate: (content: string) => void;
  onActorLineDetected: (line: string) => void;
  onPositionChange: (position: number) => void;
  onCurrentLineChange: (line: number) => void;
  onActorLineChange: (line: string | null) => void;
}

export const ScriptDisplay: React.FC<ScriptDisplayProps> = ({
  fontSize,
  currentPosition,
  currentLine,
  currentActorLine,
  isPlaying,
  isFullscreen,
  onScriptUpdate,
  onActorLineDetected,
  onPositionChange,
  onCurrentLineChange,
  onActorLineChange,
}) => {
  const { scriptContent, characters, rehearsalMode } = useRehearsal();
  const editorRef = useRef<HTMLDivElement>(null);

  // Auto-scroll functionality
  useEffect(() => {
    if (isPlaying && editorRef.current) {
      const container = editorRef.current.querySelector('.ProseMirror');
      if (container) {
        const targetScroll = currentPosition * container.scrollHeight;
        container.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        });
      }
    }
  }, [isPlaying, currentPosition]);

  return (
    <div 
      className={`relative ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : 'flex-1'}`}
      style={{ fontSize: `${fontSize}px` }}
    >
      <div ref={editorRef} className="h-full">
        <RichTextEditor
          content={scriptContent}
          onChange={onScriptUpdate}
          placeholder="Write your script here..."
        />
      </div>

      {/* Actor Line Detector for Rehearsal Mode */}
      {rehearsalMode && (
        <ActorLineDetector
          scriptContent={scriptContent}
          characters={characters}
          voiceActivated={true}
          isSupported={true}
          onActorLineDetected={onActorLineDetected}
        />
      )}
    </div>
  );
};