import React from 'react';
import { Settings, LogOut } from 'lucide-react';
import { SettingsList, SettingsPage, type SettingsListItem } from './SettingsList';
import { AccountDeletionButton } from './AccountDeletionButton';
export function MoreView({ items, onBack, onOpenAppSettings, onSignOut }: { items: SettingsListItem[]; onBack: () => void; onOpenAppSettings: () => void; onSignOut: () => void }) {
  return <SettingsPage title="المزيد" onBack={onBack}><SettingsList items={[
    ...items,
    { id: 'app-settings', label: 'إعدادات التطبيق', icon: Settings, onClick: onOpenAppSettings },
    { id: 'logout', label: 'تسجيل الخروج', icon: LogOut, tone: 'rose', onClick: onSignOut },
  ]}/><AccountDeletionButton/></SettingsPage>;
}
