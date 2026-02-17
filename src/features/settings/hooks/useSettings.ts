
import { useState, useEffect, useCallback } from 'react';
import type { Settings } from '@/shared/types/domain';
import { loadSettings as loadLocalSettings, saveSettings as saveLocalSettings } from '@/lib/storage';
import { useEngine } from '@/providers/EngineProvider';
import { db, auth } from '@/firebase/client';
import { writeCloudSettings, subscribeCloudSettings, ensureCloudSettings } from '@/lib/cloud-settings';
import { useToast } from '@/hooks/use-toast';
import { onAuthStateChanged, type User } from 'firebase/auth';


export function useSettings() {
    const { engine } = useEngine();
    const { toast } = useToast();
    const [settings, setSettings] = useState<Settings>(loadLocalSettings());
    const [user, setUser] = useState<User | null>(null);
    const [authReady, setAuthReady] = useState(false);
useEffect(() => {
        const localSettings = loadLocalSettings();
        setSettings(localSettings);

        {
            const companyId = localSettings.companyId?.trim() || process.env.NEXT_PUBLIC_COMPANY_ID || "amazing-grace-cleaners";
            
            // ✅ Only READ when logged in
            const unsub = subscribeCloudSettings(db, companyId, (cloudSettings) => {
                setSettings(currentSettings => ({ ...currentSettings, ...cloudSettings }));
                saveLocalSettings({ ...loadLocalSettings(), ...cloudSettings });
            });

            // ✅ Only WRITE after auth is confirmed
           ensureCloudSettings(db, companyId, localSettings, user?.uid);


            return () => unsub();
        }
    }, [engine, authReady, user]);
    if (
          engine === "cloud" &&
          authReady === true &&
          user !== null &&
            auth.currentUser !== null
        ) 

if (
          engine === "cloud" &&
          authReady === true &&
          user !== null &&
          auth.currentUser !== null
        )

   useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setAuthReady(true);
        });
        return () => unsub();
    }, []);


    

    const updateSettings = useCallback((updater: (s: Settings) => Settings) => {
        const newSettings = updater(settings);
        setSettings(newSettings);
        saveLocalSettings(newSettings);

        {
            const companyId = newSettings.companyId || process.env.NEXT_PUBLIC_COMPANY_ID || "amazing-grace-cleaners";
            writeCloudSettings(db, companyId, newSettings)
                .catch(error => {
                    if (error?.code === 'permission-denied') {
                        console.warn('[Settings] Cloud save blocked by Firestore rules', error);
                        // Optionally show a softer message or nothing
                        return;
                    }
                    toast({ 
                        variant: 'destructive', 
                        title: 'Failed to save settings to cloud', 
                        description: error.message 
                    });
                });
        }
    }, [settings, engine, toast, authReady, user]);

    return { settings, updateSettings };
}
