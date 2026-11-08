import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export function PushNotificationManager() {
  const { user, userProfile } = useAuth();
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android' || !user?.id || userProfile?.status !== 'active' || !userProfile.buildingId) return;
    let cancelled = false;
    const listeners: PluginListenerHandle[] = [];
    let registeredToken: string | null = null;
    const registerDevice = async () => {
      try {
        listeners.push(await PushNotifications.addListener('registration', async ({ value }) => {
          if (cancelled || !value) return;
          registeredToken = value;
          const { error } = await supabase.from('push_devices').upsert({
            user_id: user.id, token: value, platform: 'android', updated_at: new Date().toISOString(),
          }, { onConflict: 'token' });
          if (error) console.warn('[Bunyan Push] Device token could not be saved:', error.message);
        }));
        listeners.push(await PushNotifications.addListener('registrationError', error => {
          console.warn('[Bunyan Push] FCM registration failed:', error);
        }));
        listeners.push(await PushNotifications.addListener('pushNotificationReceived', notification => {
          console.info('[Bunyan Push] Notification received:', notification.title || 'New notification');
          window.dispatchEvent(new Event('elomara-notifications-refresh'));
        }));
        listeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', action => {
          console.info('[Bunyan Push] Notification opened:', action.notification.title || 'Notification');
          window.dispatchEvent(new Event('elomara-open-notifications'));
        }));
        const permission = await PushNotifications.checkPermissions();
        const result = permission.receive === 'granted' ? permission : await PushNotifications.requestPermissions();
        if (cancelled || result.receive !== 'granted') return;
        await PushNotifications.createChannel({
          id: 'default', name: 'إشعارات العمارة',
          description: 'التحديثات والتحصيل والمصروفات والإعلانات والصيانة',
          importance: 4, visibility: 1, vibration: true,
        });
        await PushNotifications.register();
      } catch (error) {
        console.warn('[Bunyan Push] Push setup unavailable:', error);
      }
    };
    void registerDevice();
    return () => {
      cancelled = true;
      for (const listener of listeners) void listener.remove();
      if (registeredToken) {
        void supabase.from('push_devices').delete().eq('token', registeredToken).eq('user_id', user.id)
          .then(({ error }) => { if (error) console.warn('[Bunyan Push] Could not unlink signed-out device:', error.message); });
      }
    };
  }, [user?.id, userProfile?.status, userProfile?.buildingId, userProfile?.apartmentId]);
  return null;
}
