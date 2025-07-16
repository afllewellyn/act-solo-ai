import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface SessionTimerProps {
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
}

export const SessionTimer: React.FC<SessionTimerProps> = ({ isPlaying, onTimeUpdate }) => {
  const [sessionTime, setSessionTime] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isPlaying) {
      interval = setInterval(() => {
        setSessionTime(prev => {
          const newTime = prev + 1;
          onTimeUpdate(newTime);
          return newTime;
        });
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isPlaying, onTimeUpdate]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-lg">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-mono">{formatTime(sessionTime)}</span>
    </div>
  );
};