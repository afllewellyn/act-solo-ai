import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Mic, Volume2, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRehearsal } from '@/contexts/RehearsalContext';

export const RehearsalStateBanner = () => {
  const { 
    rehearsalState, 
    rehearsalMode, 
    currentCueWords, 
    isListening, 
    noMatchesBanner,
    textFilter,
    reset 
  } = useRehearsal();

  // Show no matches banner if there's no content for the selected filter
  if (noMatchesBanner?.show) {
    return (
      <Alert className="border-destructive bg-destructive/10 text-destructive">
        <Info className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>
            No {noMatchesBanner.filter} text found in script. Please update your script or switch filters.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            className="h-auto p-1 text-destructive hover:bg-destructive/20"
          >
            <X className="h-4 w-4" />
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Show rehearsal state banner only when rehearsal is active
  if (!rehearsalMode || rehearsalState === 'IDLE') {
    return null;
  }

  const getStateInfo = () => {
    switch (rehearsalState) {
      case 'WAITING_FOR_ACTOR_CUE':
        return {
          variant: 'destructive' as const,
          icon: <Mic className="h-4 w-4" />,
          title: 'Listening for your line...',
          description: currentCueWords.length > 0 ? `Say: "${currentCueWords.join(' ')}"` : 'Waiting for your cue'
        };
      case 'AI_SPEAKING':
        return {
          variant: 'default' as const,
          icon: <Volume2 className="h-4 w-4" />,
          title: 'AI Speaking',
          description: 'AI is currently delivering their lines'
        };
      case 'TRANSITIONING':
        return {
          variant: 'secondary' as const,
          icon: <RotateCcw className="h-4 w-4" />,
          title: 'Transitioning',
          description: 'Moving to next line...'
        };
      case 'COMPLETE':
        return {
          variant: 'outline' as const,
          icon: <Info className="h-4 w-4" />,
          title: 'Rehearsal Complete',
          description: 'You\'ve reached the end of the script'
        };
      default:
        return null;
    }
  };

  const stateInfo = getStateInfo();
  if (!stateInfo) return null;

  return (
    <Alert className="border-primary bg-primary/10 text-primary">
      {stateInfo.icon}
      <AlertDescription className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={stateInfo.variant} className="text-xs">
            {stateInfo.title}
          </Badge>
          <span className="text-sm">{stateInfo.description}</span>
        </div>
        
        {isListening && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs">Listening...</span>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
};