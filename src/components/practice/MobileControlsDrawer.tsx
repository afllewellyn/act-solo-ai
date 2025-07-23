
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { 
  Settings,
  Play,
  Pause,
  RotateCcw,
  Maximize,
  Minimize,
  Users
} from 'lucide-react';


interface Character {
  name: string;
  voice: string;
  isUserRole: boolean;
}

interface MobileControlsDrawerProps {
  isRehearsalActive: boolean;
  scrollSpeed: number[];
  fontSize: number[];
  isFullscreen: boolean;
  onStartStopRehearsal: () => void;
  onReset: () => void;
  onScrollSpeedChange: (value: number[]) => void;
  onFontSizeChange: (value: number[]) => void;
  onToggleFullscreen: () => void;
  characters?: Character[];
  onRoleUpdate?: (characters: Character[]) => void;
  scriptContent?: string;
}

export function MobileControlsDrawer({
  isRehearsalActive,
  scrollSpeed,
  fontSize,
  isFullscreen,
  onStartStopRehearsal,
  onReset,
  onScrollSpeedChange,
  onFontSizeChange,
  onToggleFullscreen,
  characters = [],
  onRoleUpdate,
  scriptContent = ''
}: MobileControlsDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild>
          <Button 
            size={isFullscreen ? "default" : "lg"} 
            className={`rounded-full shadow-lg transition-all duration-300 ${
              isFullscreen ? 'bg-background/70 backdrop-blur-md' : ''
            }`}
          >
            <Settings className={isFullscreen ? "h-4 w-4" : "h-5 w-5"} />
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[80vh]">
          <div className="p-6 space-y-6">
            <h3 className="text-lg font-semibold">Practice Controls</h3>
            
            {/* Rehearsal Controls */}
            <div className="space-y-4">
              <Label className="text-base font-medium">Script Controls</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={onStartStopRehearsal}
                  variant={isRehearsalActive ? "destructive" : "default"}
                  className="flex-1"
                >
                  {isRehearsalActive ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Stop
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Start
                    </>
                  )}
                </Button>
                
                <Button onClick={onReset} variant="outline" className="flex-1">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
                
                <Button onClick={onToggleFullscreen} variant="outline" className="flex-1">
                  {isFullscreen ? (
                    <>
                      <Minimize className="h-4 w-4 mr-2" />
                      Exit
                    </>
                  ) : (
                    <>
                      <Maximize className="h-4 w-4 mr-2" />
                      Full
                    </>
                  )}
                </Button>
              </div>
            </div>


            {/* Scroll Speed */}
            <div className="space-y-4">
              <Label className="text-base font-medium">Scroll Speed: {scrollSpeed[0]}x</Label>
              <Slider
                value={scrollSpeed}
                onValueChange={onScrollSpeedChange}
                max={5}
                min={0.5}
                step={0.5}
                className="w-full"
              />
            </div>

            {/* Font Size */}
            <div className="space-y-4">
              <Label className="text-base font-medium">Font Size: {fontSize[0]}px</Label>
              <Slider
                value={fontSize}
                onValueChange={onFontSizeChange}
                max={24}
                min={12}
                step={1}
                className="w-full"
              />
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
