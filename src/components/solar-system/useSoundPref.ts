'use client';

import { useEffect, useState } from 'react';
import { onSoundChange, setSoundOn, soundOn } from '@/lib/solar-system/sound-prefs';

/** The sound switch as React state: reads the device's setting after mount
 *  (so the server and the first client paint agree), follows the M key. */
export function useSoundPref(): [boolean, () => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(soundOn());
    return onSoundChange(setOn);
  }, []);
  return [on, () => setSoundOn(!soundOn())];
}
