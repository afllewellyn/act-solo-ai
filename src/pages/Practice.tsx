import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ActorLineDetector } from '@/components/ActorLineDetector';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useToast } from '@/hooks/use-toast';
import RehearsalSettingsDrawer from '@/components/practice/RehearsalSettingsDrawer';
import { TeleprompterDisplay } from '@/components/practice/TeleprompterDisplay';
import { StudioScriptEditor } from '@/components/scripts/StudioScriptEditor';
import { getScriptLines } from '@/components/practice/rehearsal/scriptParser';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowLeft, Settings, Pencil, Play, Pause, Square, RotateCcw, Volume2,
  ChevronRight, MoreHorizontal, Plus, Minus,
} from 'lucide-react';
import { RehearsalProvider, useRehearsal } from '@/contexts/RehearsalContext';
import { getNamedCharacters, getSavedVoice, withSavedVoice } from '@/lib/scriptVoice';
import { DEFAULT_VOICE_ID, resolveVoiceId } from '@/lib/voices';

interface Script {
  id: string;
  title: string;
  content: string;
  characters: unknown;
  created_at: string;
  updated_at: string;
  user_id: string;
}

import type { Character } from '@/services/ScriptRehearsalStateMachine';
import type { Json } from '@/integrations/supabase/types';

// Component that contains all rehearsal logic and UI - must be inside RehearsalProvider
const PracticeWithRehearsal = ({ script }: { script: Script }) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [fontSize, setFontSize] = useState(() => {
    const saved = Number(sessionStorage.getItem('actsolo-teleprompter-font'));
    return saved >= 20 && saved <= 64 ? saved : 32;
  });
  const [sessionTime, setSessionTime] = useState(0);
  const [take, setTake] = useState(1);
  const [manualIndex, setManualIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isEditingScript, setIsEditingScript] = useState(false);
  const [draft, setDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const {
    stateMachine,
    scriptContent,
    characters,
    rehearsalMode,
    setRehearsalMode,
    handleMasterStop: contextMasterStop,
    handleTTSPlay: contextTTSPlay,
    textFilter,
    selectedVoice,
    setSelectedVoice,
    currentParagraphIndex,
    showNames,
    goToParagraph,
    isUsingConversationEngine,
    conversationEngineStatus,
    isTTSPlaying,
    isManualTTSPlaying,
    isListening,
    isPaused,
    handlePause,
    handleResume,
    rehearsalState,
    handleActorLineDetected: contextHandleActorLineDetected,
    initialize,
    updateScript,
    updateCharacters,
  } = useRehearsal();

  const savedVoiceRef = useRef<string | undefined>(getSavedVoice(script.characters));

  useEffect(() => {
    if (script) {
      const charactersData = getNamedCharacters(script.characters) as Array<{ name?: string; voice?: string; isUserRole?: boolean }>;
      const parsedCharacters: Character[] = charactersData.map((char) => ({
        name: char?.name || '',
        voice: resolveVoiceId(char?.voice),
        isUserRole: char?.isUserRole || false,
      }));
      initialize(script.content, parsedCharacters);
      const savedVoice = getSavedVoice(script.characters);
      savedVoiceRef.current = savedVoice;
      if (savedVoice) setSelectedVoice(resolveVoiceId(savedVoice));
    }
  }, [script, initialize, setSelectedVoice]);

  // Persist the selected scene-partner voice in the existing characters JSON.
  useEffect(() => {
    if (savedVoiceRef.current === selectedVoice) return;
    if (savedVoiceRef.current === undefined && selectedVoice === DEFAULT_VOICE_ID) return;

    const timer = setTimeout(() => {
      const nextCharacters = withSavedVoice(characters, selectedVoice);
      supabase
        .from('scripts')
        .update({ characters: nextCharacters as unknown as Json })
        .eq('id', script.id)
        .then(({ error }) => {
          if (error) {
            console.error('Error saving scene-partner voice:', error);
            return;
          }
          savedVoiceRef.current = selectedVoice;
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [characters, script.id, selectedVoice]);

  useEffect(() => {
    sessionStorage.setItem('actsolo-teleprompter-font', String(fontSize));
  }, [fontSize]);

  // Session timer runs while rehearsing
  useEffect(() => {
    if (!rehearsalMode || isPaused) return;
    const timer = setInterval(() => setSessionTime((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [rehearsalMode, isPaused]);

  const lines = useMemo(() => getScriptLines(scriptContent, textFilter), [scriptContent, textFilter]);

  // Follow the state machine's position while rehearsing
  const machineIndex = rehearsalMode && stateMachine ? stateMachine.getCurrentLineIndex() : null;
  useEffect(() => {
    if (machineIndex !== null) setManualIndex(Math.min(machineIndex, Math.max(0, lines.length - 1)));
  }, [machineIndex, rehearsalState, lines.length]);
  const paragraphLineIndex = currentParagraphIndex === null
    ? -1
    : lines.findIndex((line) => line.paragraphIndex >= currentParagraphIndex);
  const trackedIndex = (rehearsalMode || isManualTTSPlaying) && paragraphLineIndex !== -1
    ? paragraphLineIndex
    : machineIndex;
  const activeIndex = Math.min(trackedIndex ?? manualIndex, Math.max(0, lines.length - 1));

  const status: 'idle' | 'connecting' | 'listening' | 'ai' | 'paused' | 'complete' =
    rehearsalState === 'COMPLETE' ? 'complete'
      : isPaused ? 'paused'
      : rehearsalMode && (conversationEngineStatus === 'connecting' || conversationEngineStatus === 'idle') && !isUsingConversationEngine && !stateMachine ? 'connecting'
      : isTTSPlaying || isManualTTSPlaying || rehearsalState === 'AI_SPEAKING' ? 'ai'
      : rehearsalMode && (isListening || rehearsalState === 'WAITING_FOR_ACTOR_CUE') ? 'listening'
      : 'idle';

  const handlePrimary = () => {
    if (!rehearsalMode) {
      if (isManualTTSPlaying) contextTTSPlay();
      setRehearsalMode(true);
    } else if (isPaused) {
      handleResume();
    } else {
      handlePause();
    }
  };

  const handleRestart = () => {
    contextMasterStop();
    setRehearsalMode(false);
    setManualIndex(0);
    setSessionTime(0);
    setTake((t) => t + 1);
  };

  const handleNextCue = () => {
    if (rehearsalMode && stateMachine) {
      if (rehearsalState === 'WAITING_FOR_ACTOR_CUE') stateMachine.handleActorCueDetected();
      return;
    }
    setManualIndex((i) => Math.min(i + 1, Math.max(0, lines.length - 1)));
  };

  const handleReadScript = () => {
    if (rehearsalMode) setRehearsalMode(false);
    contextTTSPlay();
  };

  const openEditor = () => {
    if (rehearsalMode && !isPaused) handlePause();
    if (isManualTTSPlaying) contextTTSPlay();
    setDraft(scriptContent);
    setIsEditingScript(true);
  };

  const saveEdit = async () => {
    setSavingEdit(true);
    const { error } = await supabase.from('scripts').update({ content: draft }).eq('id', script.id);
    setSavingEdit(false);
    if (error) {
      toast({ title: 'Could not save', description: 'Please try again.', variant: 'destructive' });
      return;
    }
    updateScript(draft);
    setIsEditingScript(false);
    if (rehearsalMode && isPaused) handleResume();
  };

  const handleRoleUpdate = (updatedCharacters: Character[]) => {
    updateCharacters(updatedCharacters);
    const charactersToSave = withSavedVoice(updatedCharacters, selectedVoice);
    supabase
      .from('scripts')
      .update({ characters: charactersToSave as unknown as Json })
      .eq('id', script.id)
      .then(({ error }) => {
        if (error) console.error('Error updating characters:', error);
        else savedVoiceRef.current = selectedVoice;
      });
  };

  // Keyboard shortcuts: Space = start/pause, E = edit, → = next cue
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = document.activeElement as HTMLElement | null;
      if (isEditingScript || settingsOpen || a?.closest('[data-tiptap-editor]') || a?.tagName === 'INPUT' || a?.tagName === 'TEXTAREA' || a?.isContentEditable) return;
      if (e.code === 'Space') { e.preventDefault(); handlePrimary(); }
      else if (e.code === 'KeyE') { e.preventDefault(); openEditor(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); handleNextCue(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const primaryLabel = !rehearsalMode ? 'Start rehearsal' : isPaused ? 'Resume' : 'Pause';
  const PrimaryIcon = rehearsalMode && !isPaused ? Pause : Play;
  const pill = 'h-11 rounded-full border border-studio-border px-4 text-sm font-medium inline-flex items-center gap-2 hover:bg-studio-surface disabled:opacity-40';
  const iconBtn = 'h-10 w-10 rounded-full border border-studio-border inline-flex items-center justify-center hover:bg-studio-surface';

  return (
    <div className="h-[100dvh] flex flex-col bg-studio text-studio-fg">
      {/* Top HUD */}
      <header className="flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-3 border-b border-studio-border">
        <button onClick={() => { contextMasterStop(); navigate('/manage-scripts'); }} className={iconBtn} aria-label="Back to scripts">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 min-w-0 truncate font-semibold">{script.title}</h1>
        <span className="font-mono text-sm text-studio-muted tabular-nums">{formatTime(sessionTime)}</span>
        <span className="hidden sm:inline text-sm text-studio-muted">Take <strong className="text-studio-fg">{take}</strong></span>
        <div className="hidden sm:flex items-center rounded-full border border-studio-border">
          <button onClick={() => setFontSize((f) => Math.max(20, f - 4))} className="h-10 px-3 text-sm font-semibold hover:bg-studio-surface rounded-l-full" aria-label="Smaller text">A−</button>
          <button onClick={() => setFontSize((f) => Math.min(64, f + 4))} className="h-10 px-3 text-base font-semibold hover:bg-studio-surface rounded-r-full" aria-label="Larger text">A+</button>
        </div>
        <button onClick={() => setSettingsOpen(true)} className={iconBtn} aria-label="Rehearsal settings">
          <Settings className="h-5 w-5" />
        </button>
      </header>

      <main className="flex-1 min-h-0 flex flex-col">
        <TeleprompterDisplay
          lines={lines}
          activeIndex={activeIndex}
          fontSize={fontSize}
          status={status}
          hideNames={!showNames}
          onSelectLine={(i) => {
            if (!rehearsalMode) setManualIndex(i);
            else if (isUsingConversationEngine) goToParagraph(lines[i].paragraphIndex);
          }}
        />
      </main>

      {/* Bottom control bar */}
      <footer className="border-t border-studio-border px-3 sm:px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={handleRestart} className={pill} aria-label="Restart">
              <RotateCcw className="h-4 w-4" /> <span className="hidden sm:inline">Restart</span>
            </button>
            <div className="hidden md:flex items-center gap-2">
              <button onClick={openEditor} className={pill}><Pencil className="h-4 w-4" /> Edit script</button>
              <button onClick={handleReadScript} className={pill}>
                {isManualTTSPlaying ? <Square className="h-4 w-4 fill-current" /> : <Volume2 className="h-4 w-4" />}
                {isManualTTSPlaying ? 'Stop reading' : 'Read script'}
              </button>
              <button onClick={handleNextCue} className={pill} disabled={rehearsalMode && rehearsalState !== 'WAITING_FOR_ACTOR_CUE'}>
                Next cue <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="relative md:hidden">
              <button onClick={() => setMoreOpen((o) => !o)} className={pill} aria-label="More controls" aria-expanded={moreOpen}>
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {moreOpen && (
                <div className="absolute bottom-14 left-0 z-30 w-52 rounded-2xl border border-studio-border bg-studio-surface p-2 shadow-xl">
                  {[
                    { label: 'Edit script', icon: Pencil, run: openEditor },
                    { label: isManualTTSPlaying ? 'Stop reading' : 'Read script', icon: Volume2, run: handleReadScript },
                    { label: 'Next cue', icon: ChevronRight, run: handleNextCue },
                    { label: 'Larger text', icon: Plus, run: () => setFontSize((f) => Math.min(64, f + 4)) },
                    { label: 'Smaller text', icon: Minus, run: () => setFontSize((f) => Math.max(20, f - 4)) },
                  ].map(({ label, icon: Icon, run }) => (
                    <button key={label} onClick={() => { run(); setMoreOpen(false); }} className="w-full h-11 rounded-xl px-3 text-left text-sm inline-flex items-center gap-3 hover:bg-studio-border">
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {rehearsalMode && (
              <button onClick={() => { contextMasterStop(); setRehearsalMode(false); }} className={pill} aria-label="Stop rehearsal">
                <Square className="h-4 w-4 fill-current" /> <span className="hidden sm:inline">Stop</span>
              </button>
            )}
          </div>
          <button
            onClick={handlePrimary}
            className="h-12 rounded-full bg-studio-fg text-studio px-6 font-semibold inline-flex items-center gap-2 hover:opacity-90"
          >
            <PrimaryIcon className="h-4 w-4 fill-current" /> {primaryLabel}
          </button>
        </div>
        <p className="hidden md:block text-center text-[11px] text-studio-muted mt-2">Space start / pause · E edit · → next cue</p>
      </footer>

      <RehearsalSettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onCharactersChange={handleRoleUpdate}
        onReadScript={handleReadScript}
      />

      <Dialog open={isEditingScript} onOpenChange={setIsEditingScript}>
        <DialogContent className="max-w-3xl bg-studio text-studio-fg border-studio-border max-h-[90dvh] overflow-y-auto [&>button]:text-studio-fg">
          <DialogHeader>
            <DialogTitle>Edit script</DialogTitle>
            <DialogDescription className="text-studio-muted">
              Rehearsal is paused. <strong>Bold</strong> = you, <em>italic</em> = AI. You'll pick up where you left off.
            </DialogDescription>
          </DialogHeader>
          <StudioScriptEditor tone="studio" content={draft} onChange={setDraft} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsEditingScript(false)} className={pill}>Cancel</button>
            <button onClick={saveEdit} disabled={savingEdit} className="h-11 rounded-full bg-studio-fg text-studio px-5 font-semibold disabled:opacity-50">
              {savingEdit ? 'Saving…' : 'Save & back to rehearsal'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ActorLineDetector
        scriptContent={scriptContent}
        characters={characters}
        voiceActivated={true}
        isSupported={true}
        onActorLineDetected={contextHandleActorLineDetected}
      />
    </div>
  );
};

const Practice = () => {
  const { scriptId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [script, setScript] = useState<Script | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (scriptId && user) {
      fetchScript();
    }
  }, [scriptId, user]);

  const fetchScript = async () => {
    try {
      const { data, error } = await supabase
        .from('scripts')
        .select('*')
        .eq('id', scriptId)
        .eq('user_id', user?.id)
        .single();

      if (error) throw error;
      setScript(data);
    } catch (error) {
      console.error('Error fetching script:', error);
      toast({
        title: "Error",
        description: "Failed to load script",
        variant: "destructive",
      });
      navigate('/manage-scripts');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Loading script...</p>
        </div>
      </div>
    );
  }

  if (!script) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Script not found</p>
          <Button onClick={() => navigate('/manage-scripts')} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <RehearsalProvider>
        <PracticeWithRehearsal script={script} />
      </RehearsalProvider>
    </ErrorBoundary>
  );
};

export default Practice;
