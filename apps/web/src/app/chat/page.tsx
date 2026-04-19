'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, RadialLinearScale,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line, Bar, Pie, Doughnut, Radar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, RadialLinearScale,
  Title, Tooltip, Legend, Filler,
);

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  loading?: boolean;
  filename?: string;
  imageUrl?: string;
  chart?: {
    type: 'line' | 'bar' | 'pie' | 'doughnut' | 'radar';
    title: string;
    labels: string[];
    datasets: Array<{ label: string; data: number[]; color?: string }>;
    yAxisLabel?: string;
  };
}

const PALETTE = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];

function ChartBubble({ chart }: { chart: NonNullable<Message['chart']> }) {
  const datasets = chart.datasets.map((ds, i) => {
    const color = ds.color || PALETTE[i % PALETTE.length];
    const isLine = chart.type === 'line';
    return {
      label: ds.label,
      data: ds.data,
      backgroundColor: isLine ? color + '22' : color,
      borderColor: color,
      borderWidth: 2,
      pointRadius: isLine ? 3 : undefined,
      fill: isLine,
      tension: isLine ? 0.4 : undefined,
    };
  });

  const data = { labels: chart.labels, datasets };
  const options: any = {
    responsive: true,
    plugins: {
      legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } },
      title: { display: !!chart.title, text: chart.title, font: { size: 13, weight: '600' } },
    },
    scales: ['pie', 'doughnut', 'radar'].includes(chart.type) ? undefined : {
      y: {
        title: chart.yAxisLabel ? { display: true, text: chart.yAxisLabel, font: { size: 11 } } : undefined,
        grid: { color: '#f1f5f9' },
      },
      x: { grid: { color: '#f1f5f9' } },
    },
  };

  const ChartComponent: any = { line: Line, bar: Bar, pie: Pie, doughnut: Doughnut, radar: Radar }[chart.type] ?? Bar;

  return (
    <div style={{
      marginTop: '0.75rem', padding: '1rem',
      background: '#f8fafc', borderRadius: '12px',
      border: '1px solid #e2e8f0', maxWidth: '100%',
    }}>
      <ChartComponent data={data} options={options} />
    </div>
  );
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  savedAt: number;
}

const LEGACY_HISTORY_KEY = 'corpus_chat_history';
const HISTORY_KEY_ASSISTANT = 'corpus_chat_history_assistant';
const HISTORY_KEY_FUEL = 'corpus_chat_history_fuel';
const MAX_HISTORY = 10;
const SESSION_KEY_ASSISTANT = 'corpus_current_session_id_assistant';
const SESSION_KEY_FUEL = 'corpus_current_session_id_fuel';

function getHistoryKey(mode: ChatMode): string {
  return mode === 'fuel' ? HISTORY_KEY_FUEL : HISTORY_KEY_ASSISTANT;
}

function getSessionKey(mode: ChatMode): string {
  return mode === 'fuel' ? SESSION_KEY_FUEL : SESSION_KEY_ASSISTANT;
}

function loadHistory(mode: ChatMode): ChatSession[] {
  try {
    const key = getHistoryKey(mode);
    let raw = localStorage.getItem(key);

    // One-time migration of existing history into Assistant mode.
    if (!raw && mode === 'assistant') {
      const legacy = localStorage.getItem(LEGACY_HISTORY_KEY);
      if (legacy) {
        localStorage.setItem(HISTORY_KEY_ASSISTANT, legacy);
        raw = legacy;
      }
    }

    if (!raw) return [];
    const parsed: ChatSession[] = JSON.parse(raw);
    return parsed.map(s => ({
      ...s,
      messages: s.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch { return []; }
}

function saveToHistory(session: ChatSession, mode: ChatMode) {
  const key = getHistoryKey(mode);
  const history = loadHistory(mode).filter(s => s.id !== session.id);
  history.unshift(session);
  localStorage.setItem(key, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

const SUGGESTED = [
  'What workouts can I do today?',
  'How is my recovery looking?',
  'Summarise my last 7 days of training',
  'Am I overtraining?',
  'What does my blood pressure trend look like?',
  'How is my sleep quality?',
  'What sport did I train most this month?',
  'Give me a weekly training load summary',
];

function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', padding: '2px 0' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#94a3b8',
            display: 'inline-block',
            animation: `corpusBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes corpusBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </span>
  );
}

function formatMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.startsWith('### ')) {
      nodes.push(<h3 key={key++} style={{ margin: '0.75rem 0 0.25rem', fontSize: '15px', fontWeight: 700 }}>{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      nodes.push(<h2 key={key++} style={{ margin: '0.75rem 0 0.25rem', fontSize: '16px', fontWeight: 700 }}>{line.slice(3)}</h2>);
    } else if (line.startsWith('**') && line.endsWith('**')) {
      nodes.push(<p key={key++} style={{ margin: '0.25rem 0', fontWeight: 700 }}>{line.slice(2, -2)}</p>);
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      nodes.push(
        <div key={key++} style={{ display: 'flex', gap: '0.5rem', margin: '0.15rem 0' }}>
          <span style={{ color: '#64748b', flexShrink: 0 }}>•</span>
          <span>{inlineFormat(line.slice(2))}</span>
        </div>,
      );
    } else if (line.trim() === '') {
      nodes.push(<div key={key++} style={{ height: '0.4rem' }} />);
    } else {
      nodes.push(<p key={key++} style={{ margin: '0.2rem 0', lineHeight: 1.6 }}>{inlineFormat(line)}</p>);
    }
  }
  return <>{nodes}</>;
}

function inlineFormat(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <React.Fragment key={i}>{part}</React.Fragment>,
      )}
    </>
  );
}

type VoiceState = 'idle' | 'recording' | 'transcribing';

// ── Waveform visualizer ───────────────────────────────────────────────────────
function WaveformVisualizer({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ── Retina / high-DPI scaling ──────────────────────────────
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.offsetWidth || 560;
    const cssH = 80;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.scale(dpr, dpr);

    const BAR_COUNT = 60;
    const GAP = 2.5;
    const smoothed = new Float32Array(BAR_COUNT).fill(0);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const W = cssW;
      const H = cssH;
      ctx.clearRect(0, 0, W, H);

      const barW = (W - GAP * (BAR_COUNT - 1)) / BAR_COUNT;
      const step = Math.max(1, Math.floor(dataArray.length / BAR_COUNT));

      for (let i = 0; i < BAR_COUNT; i++) {
        // Average a window of bins for smoother response
        let sum = 0;
        const start = i * step;
        for (let j = 0; j < step; j++) sum += dataArray[start + j] || 0;
        const raw = (sum / step) / 255;

        // Smooth over time (attack fast, decay slow)
        smoothed[i] = raw > smoothed[i]
          ? smoothed[i] * 0.3 + raw * 0.7
          : smoothed[i] * 0.82 + raw * 0.18;

        const norm = smoothed[i];
        // Enforce a lively minimum + boost low values so silence still shows a pulse
        const barH = Math.max(3, norm * H * 0.90);
        const x = i * (barW + GAP);
        const y = (H - barH) / 2;

        // Per-bar vertical gradient: bright cyan core fading to teal edges
        const grad = ctx.createLinearGradient(x, y, x, y + barH);
        const alpha = 0.35 + norm * 0.65;
        grad.addColorStop(0,   `rgba(130,230,255,${alpha * 0.6})`);
        grad.addColorStop(0.3, `rgba(200,245,255,${alpha})`);
        grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
        grad.addColorStop(0.7, `rgba(200,245,255,${alpha})`);
        grad.addColorStop(1,   `rgba(130,230,255,${alpha * 0.6})`);
        ctx.fillStyle = grad;

        const radius = Math.min(barW / 2, barH / 2, 3);
        ctx.beginPath();
        // @ts-ignore
        ctx.roundRect(x, y, barW, barH, radius);
        ctx.fill();

        // Glow on active bars
        if (norm > 0.25) {
          ctx.shadowColor = `rgba(150,235,255,${norm * 0.55})`;
          ctx.shadowBlur = 6 * norm;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '80px', display: 'block' }}
    />
  );
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi! I'm Corpus — your personal health and training AI. I have access to your activities, sleep, vitals, recovery metrics, and medical records. What would you like to know?",
  timestamp: new Date(),
};

type ChatMode = 'assistant' | 'fuel';

const FUEL_WELCOME: Message = {
  id: 'welcome-fuel',
  role: 'assistant',
  content: [
    "Let's build your fuel plan.",
    '',
    'Upload your food photo, then answer these quick questions:',
    '- What workout are you doing?',
    '- How long is it?',
    '- When does it start?',
    '- What have you already eaten or drunk?',
    '- Any gut sensitivity, heat, or pacing notes?',
  ].join('\n'),
  timestamp: new Date(),
};

function getOrCreateSessionId(mode: ChatMode): string {
  // Reuse session within the same tab; new tab = new session
  const key = getSessionKey(mode);
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = Date.now().toString();
    sessionStorage.setItem(key, id);
  }
  return id;
}

function newSessionId(mode: ChatMode): string {
  const key = getSessionKey(mode);
  const id = Date.now().toString();
  sessionStorage.setItem(key, id);
  return id;
}

export default function ChatPage() {
  const [chatMode, setChatMode] = useState<ChatMode>('assistant');
  const [isMobile, setIsMobile] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [showMobileSuggestions, setShowMobileSuggestions] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceError, setVoiceError] = useState('');
  const [recordSecs, setRecordSecs] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [fuelError, setFuelError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [history, setHistory] = useState<ChatSession[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mimeTypeRef = useRef<string>('');
  const dragCounterRef = useRef(0);

  // Initialise per-mode session/history so Fuel planner is isolated from Assistant chat.
  useEffect(() => {
    const sid = getOrCreateSessionId(chatMode);
    setSessionId(sid);
    const modeHistory = loadHistory(chatMode);
    const existing = modeHistory.find(s => s.id === sid);
    const welcome = chatMode === 'fuel' ? FUEL_WELCOME : WELCOME;
    setMessages(existing ? existing.messages : [{ ...welcome, timestamp: new Date() }]);
    setHistory(modeHistory);
    setInput('');
    setAttachedFile(null);
    setFuelError('');
  }, [chatMode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 900);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafariLike = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
    setIsIosSafari(isIOS && isSafariLike);
  }, []);

  useEffect(() => {
    // Close drawer when mode changes or when moving to desktop layout.
    setHistoryDrawerOpen(false);
  }, [chatMode, isMobile]);

  useEffect(() => {
    if (!isMobile || chatMode !== 'assistant') {
      setShowMobileSuggestions(false);
      return;
    }
    // Show suggestions only when starting a new/empty assistant chat.
    const hasOnlyWelcome = messages.length <= 1;
    setShowMobileSuggestions(hasOnlyWelcome);
  }, [isMobile, chatMode, messages.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopRecording(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistSession = useCallback((msgs: Message[], sid: string) => {
    const userMsgs = msgs.filter(m => m.role === 'user');
    if (!userMsgs.length) return;
    const title = userMsgs[0].content.slice(0, 60) + (userMsgs[0].content.length > 60 ? '…' : '');
    const session: ChatSession = { id: sid, title, messages: msgs, savedAt: Date.now() };
    saveToHistory(session, chatMode);
    setHistory(loadHistory(chatMode));
  }, [chatMode]);

  const loadSession = (session: ChatSession) => {
    sessionStorage.setItem(getSessionKey(chatMode), session.id);
    setSessionId(session.id);
    setMessages(session.messages);
    if (isMobile) setHistoryDrawerOpen(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const startNewChat = () => {
    const sid = newSessionId(chatMode);
    setSessionId(sid);
    const welcome = chatMode === 'fuel' ? FUEL_WELCOME : WELCOME;
    setMessages([{ ...welcome, timestamp: new Date() }]);
    setInput('');
    setAttachedFile(null);
    setFuelError('');
    if (isMobile) setHistoryDrawerOpen(false);
  };

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setAttachedFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const clipboard = e.clipboardData;
    if (!clipboard) return;

    // Finder copy/paste and screenshot paste can surface through clipboard files/items.
    const fileFromFiles = clipboard.files?.[0];
    if (fileFromFiles) {
      e.preventDefault();
      setAttachedFile(fileFromFiles);
      setFuelError('');
      return;
    }

    const imageItem = Array.from(clipboard.items || []).find((item) => item.type.startsWith('image/'));
    if (imageItem) {
      const pastedImage = imageItem.getAsFile();
      if (pastedImage) {
        e.preventDefault();
        const safeName = pastedImage.name && pastedImage.name !== 'image.png'
          ? pastedImage.name
          : `pasted-image-${Date.now()}.png`;
        const named = new File([pastedImage], safeName, { type: pastedImage.type || 'image/png' });
        setAttachedFile(named);
        setFuelError('');
      }
    }
  };

  const teardownAudio = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setAnalyser(null);
    setRecordSecs(0);
  };

  const stopRecording = (sendAudio = true) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (!sendAudio) {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
      }
      mediaRecorderRef.current.stop();
    }
    teardownAudio();
    if (!sendAudio) {
      mediaRecorderRef.current = null;
      chunksRef.current = [];
      setVoiceState('idle');
    }
  };

  const send = useCallback(async (question: string, fileOverride?: File | null) => {
    if (!question.trim() || loading) return;
    const file = fileOverride !== undefined ? fileOverride : attachedFile;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question.trim(),
      timestamp: new Date(),
      filename: file?.name,
    };
    const loadingMsg: Message = {
      id: 'loading',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setShowMobileSuggestions(false);
    setInput('');
    setAttachedFile(null);
    setLoading(true);

    try {
      let answer: string;
      let chart: Message['chart'] | undefined;
      let imageUrl: string | undefined;
      if (file) {
        const res = await apiClient.askWithFile(
          question.trim(),
          file,
          chatMode === 'fuel' ? 'fuel-plan-image' : undefined,
        );
        answer = res.data?.answer || 'Sorry, I could not generate a response.';
        if (res.data?.imageBase64) {
          const mime = res.data?.imageMimeType || 'image/png';
          imageUrl = `data:${mime};base64,${res.data.imageBase64}`;
        }
      } else {
        const res = await apiClient.askCorpus(question.trim(), { days: 60 });
        answer = res.data?.answer || 'Sorry, I could not generate a response.';
        chart = res.data?.chart ?? undefined;
      }
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === 'loading'
            ? { ...m, id: Date.now().toString(), content: answer, loading: false, chart, imageUrl }
            : m,
        );
        const sid = sessionStorage.getItem(getSessionKey(chatMode)) || sessionId;
        persistSession(updated, sid);
        return updated;
      });
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === 'loading'
            ? { ...m, id: Date.now().toString(), content: `⚠️ ${errMsg}`, loading: false }
            : m,
        ),
      );
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, attachedFile, persistSession, sessionId, chatMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatMode === 'fuel') {
      if (!attachedFile) {
        setFuelError('Attach a photo of your available food first.');
        return;
      }
      if (!input.trim()) {
        setFuelError('Answer the quick fuel questions in the message box first.');
        return;
      }
      setFuelError('');
      const question = [
        'You are a sports nutrition coach for endurance training.',
        'I uploaded a photo of food I have available.',
        'First identify what foods/products are visible in the image.',
        'My answers to your quick fuel questions are:',
        input.trim(),
        '',
        'Use only foods visible in the image (plus the already-consumed items above, water and electrolytes).',
        'Do not add random foods not shown in the image.',
        'If any critical detail is missing, ask up to 4 concise follow-up questions and stop.',
        'If details are sufficient, provide a practical fueling plan.',
        'Then provide a practical fueling plan with exact timings and portions in this format:',
        '- Detected foods from image',
        '- Pre-workout (now until start)',
        '- During workout (if needed)',
        '- Post-workout (0-2h)',
        '- Hydration and sodium guidance',
        '- What to avoid right now',
        '',
        'Keep it concise and actionable. Use simple bullet points.',
      ].join('\n');
      send(question);
      return;
    }
    send(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleVoiceClick = async () => {
    if (voiceState === 'recording') {
      stopRecording(true);
      return;
    }
    if (voiceState === 'transcribing') return;

    setVoiceError('');
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setVoiceError('Microphone permission denied.');
      return;
    }
    streamRef.current = stream;

    // Set up Web Audio analyser for waveform visualisation
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.75;
    audioCtx.createMediaStreamSource(stream).connect(analyserNode);
    setAnalyser(analyserNode);

    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      .find(t => MediaRecorder.isTypeSupported(t)) ?? '';
    mimeTypeRef.current = mimeType;

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    recorder.onstop = async () => {
      mediaRecorderRef.current = null;
      const mt = mimeTypeRef.current;
      const chunks = chunksRef.current;
      chunksRef.current = [];
      if (!chunks.length) { setVoiceState('idle'); return; }

      setVoiceState('transcribing');
      const blob = new Blob(chunks, { type: mt || 'audio/webm' });
      const ext = mt.includes('mp4') ? '.mp4' : mt.includes('ogg') ? '.ogg' : '.webm';
      try {
        const res = await apiClient.transcribeAudio(blob, `recording${ext}`);
        const transcript = res.data?.transcript?.trim();
        if (transcript) {
          setInput(transcript);
          setTimeout(() => send(transcript), 80);
        } else {
          setVoiceError('No speech detected. Please try speaking a bit louder.');
        }
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Transcription failed. Please try again.';
        setVoiceError(msg);
      } finally {
        setVoiceState('idle');
      }
    };

    recorder.start(250);
    setVoiceState('recording');
    setRecordSecs(0);
    timerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const getInfographicFileName = (d: Date) => {
    const ts = d.toISOString().replace(/[:.]/g, '-');
    return `corpus-fuel-plan-${ts}.png`;
  };
  const hasUserMessages = messages.some((m) => m.role === 'user');

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      gap: isMobile ? '0.9rem' : '1.25rem',
      // Keep composer close to the fixed mobile bottom nav without large dead space.
      height: isMobile ? 'calc(100dvh - 5.9rem)' : 'calc(100vh - 5rem)',
      maxWidth: '1140px',
      margin: '0 auto',
      overflow: 'hidden',
    }}>

      {/* ── Main chat column ─────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 50,
            background: 'rgba(14,165,233,0.08)',
            border: '2.5px dashed #0ea5e9',
            borderRadius: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📎</div>
              <p style={{ fontWeight: 600, color: '#0369a1', fontSize: '1rem', margin: 0 }}>Drop file to attach</p>
              <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.25rem' }}>PDF, CSV, TXT, JSON, PNG, JPG…</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
          <h1 style={{ fontSize: isMobile ? '1.6rem' : '2rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', margin: 0 }}>
            Chat with Corpus
          </h1>
          <p style={{ color: '#64748b', marginTop: '0.35rem', fontSize: '0.9rem' }}>
            {chatMode === 'assistant'
              ? 'Ask anything about your health, training, recovery, or medical data.'
              : 'Upload your food photo, answer quick prompts, and get a workout fueling plan.'}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
            <button
              type="button"
              onClick={() => setChatMode('assistant')}
              style={{
                padding: '0.42rem 0.8rem',
                borderRadius: '999px',
                border: chatMode === 'assistant' ? '1.5px solid #0f172a' : '1.5px solid #e2e8f0',
                background: chatMode === 'assistant' ? '#0f172a' : '#fff',
                color: chatMode === 'assistant' ? '#fff' : '#475569',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Assistant
            </button>
            <button
              type="button"
              onClick={() => setChatMode('fuel')}
              style={{
                padding: '0.42rem 0.8rem',
                borderRadius: '999px',
                border: chatMode === 'fuel' ? '1.5px solid #0f172a' : '1.5px solid #e2e8f0',
                background: chatMode === 'fuel' ? '#0f172a' : '#fff',
                color: chatMode === 'fuel' ? '#fff' : '#475569',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Fuel planner
            </button>
            {isMobile && (
              <button
                type="button"
                onClick={() => setHistoryDrawerOpen(true)}
                style={{
                  marginLeft: 'auto',
                  padding: '0.42rem 0.8rem',
                  borderRadius: '999px',
                  border: '1.5px solid #e2e8f0',
                  background: '#fff',
                  color: '#475569',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                History
              </button>
            )}
          </div>
        </div>

      {/* Suggested questions */}
      {chatMode === 'assistant' && !hasUserMessages && (
        <div style={{ flexShrink: 0, marginBottom: '1rem' }}>
          {isMobile && (
            <button
              type="button"
              onClick={() => setShowMobileSuggestions(v => !v)}
              style={{
                marginBottom: showMobileSuggestions ? '0.55rem' : 0,
                padding: '0.35rem 0.65rem',
                borderRadius: '999px',
                border: '1px solid #dbe3ee',
                background: '#fff',
                color: '#475569',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {showMobileSuggestions ? 'Hide suggestions' : 'Show suggestions'}
            </button>
          )}

          {(!isMobile || showMobileSuggestions) && (
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              flexWrap: isMobile ? 'nowrap' : 'wrap',
              overflowX: isMobile ? 'auto' : 'visible',
              paddingBottom: isMobile ? '0.2rem' : 0,
            }}>
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={loading}
                  style={{
                    padding: '0.45rem 0.9rem',
                    borderRadius: '999px',
                    border: '1.5px solid #e2e8f0',
                    background: '#fff',
                    color: '#334155',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.5 : 1,
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.borderColor = '#94a3b8'; }}}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {chatMode === 'fuel' && (
        <div style={{
          flexShrink: 0,
          marginBottom: '1rem',
          padding: '0.9rem',
          border: '1.5px solid #e2e8f0',
          borderRadius: '14px',
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
            Fuel Planner questions (answer in message box)
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>1) Workout type</p>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>2) Duration</p>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>3) Start time</p>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>4) What you already had</p>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>5) Sensitivity/heat/goal notes</p>
        </div>
      )}

      {/* Message list */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        paddingRight: '0.25rem',
        paddingBottom: '0.5rem',
      }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              alignItems: 'flex-end',
              gap: '0.6rem',
            }}
          >
            {/* Avatar */}
            {msg.role === 'user' ? (
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: '#0f172a', display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0,
                fontSize: '11px', fontWeight: 700, color: '#fff',
              }}>
                You
              </div>
            ) : (
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: '#ffffff', border: '1px solid #e2e8f0',
                overflow: 'hidden', flexShrink: 0,
                boxShadow: '0 1px 4px rgba(15,23,42,0.10)',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="Corpus"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
                />
              </div>
            )}

            {/* Bubble */}
            <div style={{
              maxWidth: isMobile ? '90%' : '78%',
              padding: '0.75rem 1rem',
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: msg.role === 'user' ? '#0f172a' : '#ffffff',
              color: msg.role === 'user' ? '#f8fafc' : '#0f172a',
              boxShadow: '0 2px 8px rgba(15,23,42,0.07)',
              border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
              fontSize: '14px',
              lineHeight: 1.6,
            }}>
              {msg.loading ? (
                <TypingDots />
              ) : msg.role === 'assistant' ? (
                <>
                  {msg.imageUrl && (
                    <div style={{ marginBottom: '0.65rem' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={msg.imageUrl}
                        alt="Generated plan infographic"
                        style={{
                          width: '100%',
                          maxWidth: 460,
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          display: 'block',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.45rem' }}>
                        <a
                          href={msg.imageUrl}
                          download={getInfographicFileName(msg.timestamp)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.32rem 0.62rem',
                            borderRadius: '10px',
                            background: '#f1f5f9',
                            color: '#0f172a',
                            border: '1px solid #e2e8f0',
                            fontSize: '11px',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          Download image
                        </a>
                      </div>
                    </div>
                  )}
                  {formatMarkdown(msg.content)}
                  {msg.chart && <ChartBubble chart={msg.chart} />}
                </>
              ) : (
                <>
                  {msg.filename && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                      marginBottom: '0.4rem', padding: '0.25rem 0.55rem',
                      background: 'rgba(255,255,255,0.12)', borderRadius: '12px',
                      fontSize: '11px', fontWeight: 500,
                    }}>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 1.5h5l3 3V10.5a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5v-9a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.1" fill="none"/>
                      </svg>
                      {msg.filename}
                    </div>
                  )}
                  <div>{msg.content}</div>
                </>
              )}
              <div style={{
                marginTop: '0.4rem',
                fontSize: '11px',
                opacity: 0.45,
                textAlign: msg.role === 'user' ? 'right' : 'left',
              }}>
                {formatTime(msg.timestamp)}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Waveform recording overlay ───────────────────────────── */}
      {voiceState === 'recording' && (
        <div style={{
          flexShrink: 0,
          marginTop: '1rem',
          background: '#111118',
          borderRadius: '20px',
          padding: '1rem 1.1rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}>
          {/* Timer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: '#ef4444',
              animation: 'recDot 1.2s ease-in-out infinite',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em' }}>
              {String(Math.floor(recordSecs / 60)).padStart(2, '0')}:{String(recordSecs % 60).padStart(2, '0')}
            </span>
            <style>{`@keyframes recDot{0%,100%{opacity:1}50%{opacity:0.25}}`}</style>
          </div>

          {/* Live waveform */}
          <WaveformVisualizer analyser={analyser} />

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
            {/* Cancel */}
            <button
              type="button"
              onClick={() => stopRecording(false)}
              title="Cancel recording"
              style={{
                width: 38, height: 38, borderRadius: '50%',
                border: '1.5px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M1.5 1.5L11.5 11.5M11.5 1.5L1.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
            {/* Send */}
            <button
              type="button"
              onClick={() => stopRecording(true)}
              title="Send recording"
              style={{
                width: 38, height: 38, borderRadius: '50%',
                border: 'none',
                background: '#ffffff',
                color: '#111118',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 12V3M7.5 3L3 7.5M7.5 3L12 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Transcribing overlay ─────────────────────────────────── */}
      {voiceState === 'transcribing' && (
        <div style={{
          flexShrink: 0,
          marginTop: '1rem',
          background: '#111118',
          borderRadius: '20px',
          padding: '1.1rem 1.2rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
            <circle cx="9" cy="9" r="7" stroke="rgba(255,255,255,0.18)" strokeWidth="2"/>
            <path d="M9 2A7 7 0 0 1 16 9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </svg>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
            Transcribing with Whisper…
          </span>
        </div>
      )}

      {/* ── Normal input area (hidden while recording/transcribing) ── */}
      {voiceState === 'idle' && (
        <div style={{
          flexShrink: 0,
          marginTop: '1rem',
          background: '#ffffff',
          borderRadius: '16px',
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 4px 16px rgba(15,23,42,0.06)',
          padding: '0.75rem',
        }}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv,.txt,.json,.xml,.md,.jpg,.jpeg,.png,.gif,.webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setAttachedFile(f);
              if (f) setFuelError('');
              e.target.value = '';
            }}
          />

          {/* Attached file pill */}
          {attachedFile && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              marginBottom: '0.5rem', padding: '0.3rem 0.65rem',
              background: '#f0f9ff', border: '1px solid #bae6fd',
              borderRadius: '20px', fontSize: '12px', color: '#0369a1', fontWeight: 500,
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 1.5h5l3 3V10.5a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5v-9a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.1" fill="none"/>
                <path d="M7 1.5V4.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
              {attachedFile.name}
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0369a1', padding: 0, lineHeight: 1, marginLeft: '0.1rem' }}
              >×</button>
            </div>
          )}

          {voiceError && (
            <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '0.5rem', paddingLeft: '0.25rem' }}>
              {voiceError}
            </div>
          )}
          {fuelError && (
            <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '0.5rem', paddingLeft: '0.25rem' }}>
              {fuelError}
            </div>
          )}
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (chatMode === 'fuel') setFuelError('');
              }}
              onKeyDown={handleKeyDown}
              autoCapitalize="sentences"
              autoCorrect="on"
              spellCheck
              placeholder={
                chatMode === 'fuel'
                  ? 'Answer the fuel questions here...'
                  : attachedFile
                    ? `Ask about ${attachedFile.name}…`
                    : 'Message'
              }
              rows={1}
              style={{
                flex: 1, border: 'none', outline: 'none', resize: 'none',
                fontSize: '14px', lineHeight: '1.5', color: '#0f172a',
                caretColor: '#0f172a',
                WebkitUserSelect: 'text',
                background: 'transparent', fontFamily: 'inherit',
                maxHeight: '120px', overflowY: 'auto', padding: '0.25rem 0.25rem',
              }}
              onInput={(e) => {
                if (isIosSafari) return;
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />

            {/* Attach file button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach a file (PDF, CSV, TXT…)"
              style={{
                width: 38, height: 38, borderRadius: '50%',
                border: attachedFile ? '1.5px solid #0369a1' : '1.5px solid #e2e8f0',
                background: attachedFile ? '#e0f2fe' : '#f8fafc',
                color: attachedFile ? '#0369a1' : '#64748b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M13.5 7.5l-6 6a4 4 0 01-5.656-5.656l6-6a2.5 2.5 0 013.536 3.536l-6 6a1 1 0 01-1.414-1.414l5.5-5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>

            {/* Voice button */}
            <button
              type="button"
              onClick={handleVoiceClick}
              title="Speak your question"
              disabled={chatMode === 'fuel'}
              style={{
                width: 38, height: 38, borderRadius: '50%',
                border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#64748b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: chatMode === 'fuel' ? 'not-allowed' : 'pointer', flexShrink: 0, transition: 'all 0.15s',
                opacity: chatMode === 'fuel' ? 0.45 : 1,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M2.5 8.5A5.5 5.5 0 0 0 13.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <line x1="8" y1="14" x2="8" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>

            {/* Send button */}
            <button
              type="submit"
              disabled={loading || (!input.trim() && !attachedFile)}
              title={chatMode === 'fuel' ? 'Generate fuel plan from photo' : 'Send message'}
              style={{
                width: 38, height: 38, borderRadius: '50%', border: 'none',
                background: loading || (!input.trim() && !attachedFile) ? '#e2e8f0' : '#0f172a',
                color: loading || (!input.trim() && !attachedFile) ? '#94a3b8' : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: loading || (!input.trim() && !attachedFile) ? 'not-allowed' : 'pointer',
                flexShrink: 0, transition: 'all 0.15s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M13.5 2.5L7 9M13.5 2.5L9 13.5L7 9M13.5 2.5L2.5 6L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </form>
        </div>
      )}
      </div>{/* end main chat column */}

      {/* ── History sidebar (desktop) ─────────────────────────────── */}
      {!isMobile && (
      <div style={{
        width: '248px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#fff',
        borderRadius: '16px',
        border: '1.5px solid #e2e8f0',
        overflow: 'hidden',
      }}>
        {/* Sidebar header */}
        <div style={{ padding: '1rem 1rem 0.75rem', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', margin: '0 0 0.65rem' }}>Recent chats</p>
          <button onClick={startNewChat} style={{
            width: '100%', padding: '0.5rem 0.75rem',
            background: '#0f172a', color: '#fff', border: 'none',
            borderRadius: '10px', fontWeight: 600, fontSize: '0.8rem',
            cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            New chat
          </button>
        </div>

        {/* Session list */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0.4rem 0' }}>
          {history.length === 0 ? (
            <p style={{ color: '#cbd5e1', fontSize: '0.78rem', padding: '0.75rem 1rem', textAlign: 'center' }}>
              No history yet
            </p>
          ) : (
            history.map(s => (
              <button
                key={s.id}
                onClick={() => loadSession(s)}
                style={{
                  width: '100%', textAlign: 'left', background: s.id === sessionId ? '#f1f5f9' : 'none',
                  border: 'none', padding: '0.6rem 1rem',
                  cursor: 'pointer', display: 'block',
                  borderLeft: s.id === sessionId ? '3px solid #0f172a' : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (s.id !== sessionId) e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={e => { if (s.id !== sessionId) e.currentTarget.style.background = 'none'; }}
              >
                <div style={{
                  fontWeight: 500, fontSize: '0.78rem', color: '#0f172a',
                  marginBottom: '0.2rem',
                  display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  lineHeight: 1.4,
                }}>{s.title}</div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                  {new Date(s.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {' · '}{s.messages.filter(m => m.role === 'user').length} msgs
                </div>
              </button>
            ))
          )}
        </div>
      </div>
      )}

      {/* ── History drawer (mobile) ───────────────────────────────── */}
      {isMobile && historyDrawerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 140 }}>
          <button
            type="button"
            aria-label="Close history"
            onClick={() => setHistoryDrawerOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'rgba(15,23,42,0.45)',
              cursor: 'pointer',
            }}
          />
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '88%',
            maxWidth: '360px',
            height: '100%',
            background: '#fff',
            boxShadow: '-12px 0 30px rgba(15,23,42,0.18)',
            borderLeft: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                <p style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', margin: 0 }}>Recent chats</p>
                <button
                  type="button"
                  onClick={() => setHistoryDrawerOpen(false)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', fontSize: '20px', lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
              <button onClick={startNewChat} style={{
                width: '100%', padding: '0.58rem 0.75rem',
                background: '#0f172a', color: '#fff', border: 'none',
                borderRadius: '10px', fontWeight: 600, fontSize: '0.82rem',
                cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.4rem',
              }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                New chat
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '0.4rem 0' }}>
              {history.length === 0 ? (
                <p style={{ color: '#cbd5e1', fontSize: '0.78rem', padding: '0.75rem 1rem', textAlign: 'center' }}>
                  No history yet
                </p>
              ) : (
                history.map(s => (
                  <button
                    key={s.id}
                    onClick={() => loadSession(s)}
                    style={{
                      width: '100%', textAlign: 'left', background: s.id === sessionId ? '#f1f5f9' : 'none',
                      border: 'none', padding: '0.6rem 1rem',
                      cursor: 'pointer', display: 'block',
                      borderLeft: s.id === sessionId ? '3px solid #0f172a' : '3px solid transparent',
                    }}
                  >
                    <div style={{
                      fontWeight: 500, fontSize: '0.78rem', color: '#0f172a',
                      marginBottom: '0.2rem',
                      display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      lineHeight: 1.4,
                    }}>{s.title}</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      {new Date(s.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {' · '}{s.messages.filter(m => m.role === 'user').length} msgs
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
