import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, GeminiModel } from '../types';
import { 
  Sparkles, Send, Bot, User, Trash2, 
  RefreshCw, Copy, Check, AlertCircle, Wifi 
} from 'lucide-react';
import { sendGeminiChatMessage } from '../services/geminiService';

interface AiChatViewProps {
  buildingName: string;
}

export const AiChatView: React.FC<AiChatViewProps> = ({ buildingName }) => {
  const model: GeminiModel = 'gemini-3.1-flash-lite';
  const [rolePersona, setRolePersona] = useState<string>('legal-finance');
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const personaInstructions: Record<string, { title: string; instruction: string }> = {
    'legal-finance': {
      title: 'مستشار مالي وقانوني لاتحادات الشاغلين',
      instruction: `أنت المستشار المالي والقانوني الرسمي لاتحاد شاغلي عمارة ${buildingName}. أنت خبير بالقانون المصري رقم 119 لسنة 2008 (قانون البناء الموحد - باب اتحادات الشاغلين)، واللوائح التنفيذية لحساب نسب الشقق في المصروفات المشتركة، غرامات التأخير، صندوق الطوارئ والاحتياطي، وإجراءات الجمعية العمومية. أجب بدقة مهنية، ونصوص قانونية عملية موجزة باللغة العربية.`,
    },
    'maintenance-engineer': {
      title: 'خبير الصيانة الوقائية والمرافق السكنية',
      instruction: `أنت مهندس استشاري وخبير صيانة مرافق ومباني سكنية في مصر. تخصصك هو صيانة المصاعد والكبائن، طلمبات ومضخات الرفع، عزل أسطح وخزانات المياه، كابلات الكهرباء، وإجراءات السلامة ومكافحة الحرائق. قدّم حلولاً فنية واضحة، متوسط التكاليف التقريبية في السوق المصري بالجنيه، ونصائح وقائية باللغة العربية.`,
    },
    'concierge-assistant': {
      title: 'مساعد إدارة العقار السريع',
      instruction: `أنت المساعد الإداري الذكي اليومي لعمارة ${buildingName}. تساعد في صياغة الإعلانات، الرد على استفسارات السكان، تنسيق مواعيد النظافة، وصياغة الرسائل الموجهة للملاك والشاغلين بلغة مهذبة وودية ومباشرة باللغة العربية.`,
    },
  };

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `أهلاً بك! أنا «مساعد العمارة الذكي» لإدارة ${buildingName}.
يمكنني مساعدتك فوراً في:
• الاستشارات القانونية لاتحادات الشاغلين وحساب نسب الصيانة طبقاً للقانون المصري.
• صياغة التنبيهات والإنذارات للمتأخرين عن سداد الاشتراكات.
• جداول الصيانة الوقائية للمصاعد ومضخات المياه وخزانات الأسطح.
• تخطيط الموازنات السنوية وتوزيع تكاليف الأعطال الطارئة.

اكتب استفسارك وسأجيبك مباشرة!`,
      timestamp: 'الآن',
    },
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    if (!textToSend) setInputMessage('');
    setIsLoading(true);

    try {
      const responseText = await sendGeminiChatMessage({
        messages: newMessages,
        model,
        systemInstruction: personaInstructions[rolePersona]?.instruction,
      });

      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, modelMsg]);
    } catch (error: any) {
      console.error('Chat error:', error);
      const isOffline = !navigator.onLine || error.message.includes('اتصال') || error.message.includes('fetch');

      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: isOffline
          ? 'تعذر الاتصال بالخادم. يرجى التأكد من اتصال جهازك بالإنترنت ثم إعادة المحاولة.'
          : `${error.message || 'حدث خطأ أثناء معالجة الطلب.'}`,
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const samplePrompts = [
    'كيف نحسب نصيب كل شقة في تكلفة تغيير وايرات المصعد؟',
    'صيغة تنبيه لساكن متأخر عن سداد اشتراك الصيانة شهرين',
    'ما هي شروط اكتمال النصاب في الجمعية العمومية لاتحاد الشاغلين؟',
    'جدول الصيانة الوقائية السنوية الموصى به لمضخات المياه',
  ];

  return (
    <div dir="rtl" className="fotouh-ai bg-white rounded-3xl border border-slate-200/80 shadow-sm flex flex-col h-[750px] overflow-hidden">
      {/* Top Controls Bar */}
      <div className="bg-[#0f2537] text-white p-3.5 sm:p-4 border-b border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-white">مساعد العمارة الذكي (Gemini)</h2>
              <span className="text-[10px] bg-teal-400/20 text-teal-300 px-2 py-0.5 rounded-full font-medium">
                النموذج المجاني: Gemini 3.1 Flash-Lite
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              الدور: {personaInstructions[rolePersona]?.title}
            </p>
          </div>
        </div>

        {/* Model & Persona Selectors */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Persona selector */}
          <select
            value={rolePersona}
            onChange={(e) => setRolePersona(e.target.value)}
            className="bg-white/10 hover:bg-white/15 text-white text-xs font-medium py-1.5 px-2.5 rounded-xl border border-white/20 focus:outline-none cursor-pointer"
          >
            <option value="legal-finance" className="text-slate-900 bg-white">⚖️ مستشار قانوني ومالي</option>
            <option value="maintenance-engineer" className="text-slate-900 bg-white">🔧 مهندس صيانة ومرافق</option>
            <option value="concierge-assistant" className="text-slate-900 bg-white">📝 مساعد إداري وإعلانات</option>
          </select>



          <button
            onClick={() => setMessages([messages[0]])}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 transition"
            title="مسح سجل المحادثة والبدء من جديد"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scrollable Thread */}
      <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 bg-slate-50/50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2.5 max-w-3xl ${
              msg.role === 'user' ? 'mr-auto flex-row-reverse' : 'ml-auto'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold shadow-sm ${
                msg.role === 'user'
                  ? 'bg-[#0f2537] text-white'
                  : 'bg-gradient-to-br from-teal-500 to-[#00668b] text-white'
              }`}
            >
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`p-3.5 sm:p-4 rounded-2xl shadow-xs text-xs sm:text-sm leading-relaxed relative group ${
                msg.role === 'user'
                  ? 'bg-[#0f2537] text-white rounded-tr-none'
                  : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-none'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>
              <div className="flex items-center justify-between gap-4 mt-2 pt-1.5 border-t border-slate-100/30 text-[10px] text-slate-400">
                <span>{msg.timestamp}</span>
                {msg.role === 'model' && (
                  <button
                    onClick={() => handleCopy(msg.id, msg.text)}
                    className="opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-slate-700 flex items-center gap-1"
                    title="نسخ النص"
                  >
                    {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId === msg.id ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-2.5 max-w-lg">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-500 to-[#00668b] text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 rounded-tl-none shadow-xs text-xs flex items-center gap-2 text-slate-600">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce [animation-delay:0.4s]" />
              </div>
              <span>جاري التفكير وصياغة الإجابة...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompt Chips */}
      <div className="px-3 sm:px-4 py-2 bg-white border-t border-slate-100 overflow-x-auto no-scrollbar flex items-center gap-2">
        <span className="text-[11px] text-slate-400 whitespace-nowrap">أسئلة شائعة:</span>
        {samplePrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(prompt)}
            disabled={isLoading}
            className="text-[11px] bg-slate-100 hover:bg-teal-50 hover:text-teal-800 hover:border-teal-300 text-slate-600 px-3 py-1 rounded-full border border-slate-200 whitespace-nowrap transition cursor-pointer"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Composer */}
      <div className="p-3 sm:p-4 bg-white border-t border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={isLoading}
            placeholder="اكتب استفسارك عن الصيانة، الموازنة، اللائحة، أو نسب كل شقة..."
            className="flex-1 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition"
          />

          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="bg-[#0f2537] hover:bg-[#1a3852] disabled:opacity-40 text-white p-3 rounded-xl shadow-md transition active:scale-95 flex items-center justify-center shrink-0"
          >
            <Send className="w-4 h-4 text-teal-300 rotate-180" />
          </button>
        </form>
      </div>
    </div>
  );
};
