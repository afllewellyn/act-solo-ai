import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import ScriptInput from '@/components/ScriptInput';
import ScriptList from '@/components/ScriptList';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
const Index = () => {
  const {
    user,
    loading,
    signOut
  } = useAuth();
  const navigate = useNavigate();
  const [refreshScripts, setRefreshScripts] = useState(0);
  const [selectedScript, setSelectedScript] = useState(null);
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>;
  }
  if (!user) {
    return null;
  }
  const handleScriptSaved = () => {
    setRefreshScripts(prev => prev + 1);
  };
  const handleSelectScript = (script: any) => {
    setSelectedScript(script);
    // TODO: Navigate to teleprompter view
    console.log('Selected script for practice:', script);
  };
  return <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold">Rehearse with AI Teleprompter</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              Welcome, {user.email}
            </span>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Sign Out</span>
              <span className="sm:hidden">Exit</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 sm:py-8">
        <Tabs defaultValue="scripts" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto sm:max-w-none">
            <TabsTrigger value="scripts" className="text-sm">My Scripts</TabsTrigger>
            <TabsTrigger value="create" className="text-sm">Create Script</TabsTrigger>
          </TabsList>
          
          <TabsContent value="scripts" className="space-y-4 mt-6">
            <h2 className="text-lg sm:text-xl font-semibold">Your Scripts</h2>
            <ScriptList refresh={refreshScripts} onSelectScript={handleSelectScript} />
          </TabsContent>
          
          <TabsContent value="create" className="space-y-4 mt-6">
            <h2 className="text-lg sm:text-xl font-semibold">Create New Script</h2>
            <ScriptInput onScriptSaved={handleScriptSaved} />
          </TabsContent>
        </Tabs>
      </main>
    </div>;
};
export default Index;