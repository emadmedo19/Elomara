import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseConfig } from './server/supabaseConfig';
import { aiSecurity } from './server/aiSecurity';

dotenv.config();
process.env.DISABLE_HMR = process.env.DISABLE_HMR || 'true';

const config = resolveSupabaseConfig(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const authClient = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://localhost').split(',').map(origin => origin.trim()).filter(Boolean);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use('/api/gemini', ...aiSecurity(authClient, allowedOrigins));
app.use(express.json({ limit: '20mb' }));

// Initialize Gemini SDK with telemetry header
const getAIClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// API: Multi-turn Chat Endpoint
app.post('/api/gemini/chat', async (req: Request, res: Response) => {
  try {
    const { messages, model, systemInstruction } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const ai = getAIClient();

    // Map allowed model names
    let selectedModel = 'gemini-3.1-flash-lite';
    if (model === 'gemini-4-argon' || model === 'gemini-3.1-flash-lite' || model === 'gemini-3.8-flash') {
      selectedModel = model;
    }

    // Prepare contents array for multi-turn chat
    const contents = messages.map((m: { role: string; text: string }) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }));

    const systemPrompt = systemInstruction || 'أنت «مساعد العمارة الذكي»، مساعد متخصص في إدارة العمارات السكنية، حسابات الخزينة والمصروفات، اتحادات الشاغلين في مصر، وحل مشكلات الصيانة والمرافق بأسلوب مهني وموجز وموثوق.';

    let responseText = '';
    try {
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 2048,
        },
      });
      responseText = response.text || '';
    } catch (primaryError: any) {
      console.warn(`Primary model ${selectedModel} failed (${primaryError.message}), retrying with fallback model...`);
      const fallbackModel = selectedModel === 'gemini-3.1-flash-lite' ? 'gemini-3.8-flash' : 'gemini-3.1-flash-lite';
      const fallbackResponse = await ai.models.generateContent({
        model: fallbackModel,
        contents,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 2048,
        },
      });
      responseText = fallbackResponse.text || '';
    }

    return res.json({ text: responseText });
  } catch (error: any) {
    console.error('Error in /api/gemini/chat:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate response from Gemini API',
    });
  }
});

// API: Generate Image Endpoint (for HOA notice boards, maintenance posters, etc.)
app.post('/api/gemini/generate-image', async (req: Request, res: Response) => {
  try {
    const { prompt, aspectRatio, model } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const ai = getAIClient();

    // Use requested model or fallback
    const selectedModel = model === 'gemini-nano-banana-2.1' ? 'gemini-nano-banana-2.1' : 'gemini-3.1-flash-lite-image';

    const validAspectRatios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
    const selectedRatio = validAspectRatios.includes(aspectRatio) ? aspectRatio : '1:1';

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: selectedRatio,
          ...(selectedModel === 'gemini-nano-banana-2.1' ? { imageSize: '1K' } : {}),
        },
      },
    });

    let imageUrl = '';
    let textOutput = '';

    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        const base64Data = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'image/png';
        imageUrl = `data:${mimeType};base64,${base64Data}`;
      } else if (part.text) {
        textOutput += part.text;
      }
    }

    if (!imageUrl) {
      return res.status(500).json({
        error: 'No image was generated by the model.',
        details: textOutput,
      });
    }

    return res.json({ imageUrl, text: textOutput });
  } catch (error: any) {
    console.error('Error in /api/gemini/generate-image:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate image',
    });
  }
});

// API: Edit Image Endpoint
app.post('/api/gemini/edit-image', async (req: Request, res: Response) => {
  try {
    const { prompt, base64Image, mimeType } = req.body;

    if (!prompt || !base64Image) {
      return res.status(400).json({ error: 'Both prompt and base64Image are required.' });
    }

    const ai = getAIClient();

    // Clean base64 string if it contains data URI prefix
    const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType || 'image/png',
            },
          },
          { text: prompt },
        ],
      },
    });

    let imageUrl = '';
    let textOutput = '';

    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        const data = part.inlineData.data;
        const outMime = part.inlineData.mimeType || 'image/png';
        imageUrl = `data:${outMime};base64,${data}`;
      } else if (part.text) {
        textOutput += part.text;
      }
    }

    if (!imageUrl) {
      return res.status(500).json({
        error: 'No edited image was returned by the model.',
        details: textOutput,
      });
    }

    return res.json({ imageUrl, text: textOutput });
  } catch (error: any) {
    console.error('Error in /api/gemini/edit-image:', error);
    return res.status(500).json({
      error: error.message || 'Failed to edit image',
    });
  }
});

// API: OCR / Receipt Analysis
app.post('/api/gemini/analyze-receipt', async (req: Request, res: Response) => {
  try {
    const { base64Image, mimeType } = req.body;
    if (!base64Image) {
      return res.status(400).json({ error: 'base64Image is required.' });
    }

    const ai = getAIClient();
    const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');

    let rawText = '';
    const ocrContents = {
      parts: [
        {
          inlineData: {
            data: cleanBase64,
            mimeType: mimeType || 'image/jpeg',
          },
        },
        {
          text: `حلل صورة إيصال أو فاتورة الصيانة هذه الخاصة بالعمارة. استخرج البيانات التالية بصيغة JSON حصراً:
{
  "vendor": "اسم المورد أو المحل أو الفني",
  "amount": رقم المبلغ بالجنيه المصري (رقم فقط),
  "category": "كهرباء" أو "مياه ومضخات" أو "مصاعد" أو "نظافة" أو "أمن وبوابين" أو "صيانة عامة",
  "date": "YYYY-MM-DD",
  "notes": "وصف مقتضب للبند المالي"
}`,
        },
      ],
    };

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: ocrContents,
        config: {
          responseMimeType: 'application/json',
        },
      });
      rawText = response.text || '{}';
    } catch (primaryErr: any) {
      console.warn(`OCR primary model failed (${primaryErr.message}), falling back to gemini-3.1-flash-lite...`);
      const fallbackResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: ocrContents,
        config: {
          responseMimeType: 'application/json',
        },
      });
      rawText = fallbackResponse.text || '{}';
    }

    const parsed = JSON.parse(rawText || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in /api/gemini/analyze-receipt:', error);
    return res.status(500).json({
      error: error.message || 'Failed to analyze receipt',
    });
  }
});

// Serve Bunyan standalone zip archive
app.get('/bunyan-source-code.zip', (_req: Request, res: Response) => {
  const filePath = path.join(__dirname, 'public', 'bunyan-source-code.zip');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="bunyan-source-code.zip"');
    return res.sendFile(filePath);
  }
  return res.status(404).send('ZIP file not found');
});

// Serve frontend in dev via Vite middlewares, or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      // Don't intercept API routes
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Elomara Server running at http://localhost:${PORT}`);
  });
}

startServer();
