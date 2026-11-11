import React from 'react';
import {createRoot} from 'react-dom/client';
import {AiStudioView} from '../../src/components/AiStudioView';
createRoot(document.getElementById('root')!).render(<AiStudioView buildingName="عمارة الاختبار" onPinAnnouncement={async announcement=>{(window as unknown as {pinnedAnnouncement:unknown}).pinnedAnnouncement=announcement;return true;}}/>);
