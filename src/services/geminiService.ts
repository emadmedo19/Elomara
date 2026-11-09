import { ChatMessage, GeminiModel } from '../types';
import { getStoredSettings } from './storage';
import { supabase } from '../lib/supabase';

export interface GeminiChatOptions {
  messages: ChatMessage[];
  model?: GeminiModel;
  systemInstruction?: string;
}

export interface GeminiReceiptOcrResult {
  vendor: string;
  amount: number;
  category: 'مصاعد' | 'كهرباء' | 'مياه ومضخات' | 'نظافة' | 'أمن وبوابين' | 'صيانة عامة' | 'أخرى';
  date: string;
  notes: string;
}

// Map models to valid model aliases
const FREE_GEMINI_MODEL: GeminiModel = 'gemini-3.1-flash-lite';

// Fallback hosted URL for standalone Android APK if relative path is unreachable
const HOSTED_BACKEND_FALLBACK = 'https://ais-dev-yoelyzafiuxqmyed6eui2x-191911353146.europe-west1.run.app';

/**
 * Determine the backend base URL.
 * In browser: uses relative '' (same origin).
 * In Android Capacitor WebView: uses configured backendUrl or the hosted server.
 */
function getBackendBaseUrl(): string {
  const settings = getStoredSettings();
  if (settings.backendUrl && settings.backendUrl.trim()) {
    return settings.backendUrl.trim().replace(/\/+$/, '');
  }

  // If in web browser, relative path works
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    // If running in development or hosted domain
    if (window.location.hostname !== 'localhost' || window.location.port === '3000') {
      return '';
    }
  }

  return HOSTED_BACKEND_FALLBACK;
}

/** Build an absolute Gemini API URL that works in browser and Capacitor Android. */
export function getGeminiApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getBackendBaseUrl()}${normalizedPath}`;
}

/**
 * Send chat messages directly and securely to the backend Gemini service.
 * The server securely holds the GEMINI_API_KEY without exposing it to the client.
 */
export async function sendGeminiChatMessage(options: GeminiChatOptions): Promise<string> {
  const { messages, systemInstruction } = options;
  const { data, error } = await supabase.functions.invoke('gemini-chat', {
    body: {
      messages: messages.map((message) => ({ role: message.role, text: message.text })),
      systemInstruction,
    },
  });

  if (error) {
    let detail = error.message || 'تعذر الاتصال بخدمة المساعد.';
    // Supabase wraps non-2xx Edge Function responses; read the actual JSON
    // body so the user sees whether the API key, model, quota, or auth failed.
    try {
      const context = (error as any).context;
      if (context && typeof context.json === 'function') {
        const payload = await context.json();
        if (typeof payload?.error === 'string' && payload.error.trim()) {
          detail = payload.error;
        } else if (typeof payload?.message === 'string' && payload.message.trim()) {
          detail = payload.message;
        }
      }
    } catch {
      // Keep the original Supabase error if the response body is unavailable.
    }
    throw new Error(detail);
  }
  if (!data?.text || typeof data.text !== 'string') {
    throw new Error(data?.error || 'لم تصل إجابة من Gemini. حاول مرة أخرى.');
  }
  return data.text;
}

/**
 * Scan receipt via Gemini OCR through the secure backend
 */
export async function analyzeReceiptWithGemini(
  base64Image: string,
  mimeType: string = 'image/jpeg'
): Promise<GeminiReceiptOcrResult> {
  const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');
  const base = getBackendBaseUrl();
  const endpoint = `${base}/api/gemini/analyze-receipt`;

  const body = JSON.stringify({ base64Image: cleanBase64, mimeType });

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (res.ok) {
      const data = await res.json();
      return {
        vendor: data.vendor || 'مورد محلي',
        amount: Number(data.amount) || 0,
        category: data.category || 'صيانة عامة',
        date: data.date || new Date().toISOString().split('T')[0],
        notes: data.notes || 'فاتورة صيانة',
      };
    }

    throw new Error('تعذر قراءة الفاتورة عبر الخادم');
  } catch (err: any) {
    // Try hosted fallback if relative failed
    if (base !== HOSTED_BACKEND_FALLBACK) {
      const fbRes = await fetch(`${HOSTED_BACKEND_FALLBACK}/api/gemini/analyze-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).catch(() => null);

      if (fbRes && fbRes.ok) {
        const data = await fbRes.json();
        return {
          vendor: data.vendor || 'مورد محلي',
          amount: Number(data.amount) || 0,
          category: data.category || 'صيانة عامة',
          date: data.date || new Date().toISOString().split('T')[0],
          notes: data.notes || 'فاتورة صيانة',
        };
      }
    }

    throw new Error('تعذر استخراج بيانات الفاتورة حالياً. يرجى إدخال البيانات يدوياً.');
  }
}
