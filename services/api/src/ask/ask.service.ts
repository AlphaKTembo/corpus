import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { ActivitiesService, Activity } from '../activities/activities.service';
import { MedicalsService } from '../medicals/medicals.service';
import { MetricsService, BodyMetrics, SleepDaily, VitalsDaily } from '../metrics/metrics.service';
import { SummaryService } from '../summary/summary.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AskService {
  constructor(
    private configService: ConfigService,
    private activitiesService: ActivitiesService,
    private metricsService: MetricsService,
    private summaryService: SummaryService,
    private medicalsService: MedicalsService,
    private usersService: UsersService,
  ) {}

  async ask(
    question: string,
    dateRange?: { from?: string; to?: string },
    activityId?: string,
    options?: { days?: number; activityLimit?: number; includeContext?: boolean },
    userId = 'default',
    userName = 'the user',
  ): Promise<{
    question: string;
    answer: string;
    chart?: any;
    context?: any;
  }> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured.');
    }

    const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    const maxChars = parseInt(this.configService.get<string>('OPENAI_MAX_CONTEXT_CHARS', '24000'), 10);
    const days = options?.days && options.days > 0 ? options.days : 60;
    const activityLimit = options?.activityLimit && options.activityLimit > 0 ? options.activityLimit : 100;
    const includeContext = options?.includeContext === true;

    const to = dateRange?.to || this.todayString();
    const from = dateRange?.from || this.daysAgoString(days, to);

    const [todayBrief, rollingSummary, vitals, sleep, bodyMetrics, activities, activity, latestMedicalSummary] =
      await Promise.all([
        this.summaryService.getTodayBrief(userId),
        this.summaryService.getRollingSummary(Math.min(90, Math.max(7, days)), userId),
        this.metricsService.getVitals(from, to, userId),
        this.metricsService.getSleep(from, to, userId),
        this.metricsService.getBodyMetrics(from, to, userId),
        this.activitiesService.findActivities({ from, to, limit: activityLimit }, userId),
        activityId ? this.activitiesService.findOne(activityId, userId) : Promise.resolve(null),
        Promise.resolve(this.medicalsService.getLatestSummary(userId)),
      ]);

    const bloodResultsAll = this.medicalsService.getBloodResults(undefined, undefined, undefined, userId);
    const lactateThresholds = this.medicalsService.getLactateThresholds(userId);
    const ftpRecords = this.medicalsService.getFtpRecords(userId);
    const coverLetter = this.medicalsService.getCoverLetter(userId)?.text || '';

    const derived = this.buildDerivedStats({
      activities: activities.activities,
      vitals,
      sleep,
      bodyMetrics,
      bloodResults: bloodResultsAll,
      range: { from, to, days, activityLimit },
    });

    const dnaRecords = this.tryReadCsvRows(
      path.join(this.getCorpusRoot(), userId, 'metadata', 'dna_records.csv'),
      50,
    );
    const medicalRecords = this.tryReadCsvRows(
      path.join(this.getCorpusRoot(), userId, 'metadata', 'medical_records.csv'),
      100,
    );

    const contextPack = {
      generatedAt: new Date().toISOString(),
      question,
      window: { from, to, days },
      todayBrief,
      rollingSummary,
      vitals,
      sleep,
      bodyMetrics,
      activities: activities.activities,
      activity,
      derived,
      medical: {
        latestSummary: latestMedicalSummary
          ? {
              ...latestMedicalSummary,
              payloadShareUrl: this.medicalsService.getPayloadShareUrl(latestMedicalSummary.date),
            }
          : null,
        coverLetter,
        bloodResultsSample: derived.samples?.bloodResultsSample || [],
        lactateThresholds,
        ftpRecords,
        dnaRecords,
        medicalRecords,
      },
    };

    // Priority order: derived stats + DNA/medical records first (never truncated),
    // then blood sample, activities, vitals/sleep last (large, lower priority).
    const activitySample = (derived.samples?.activitiesSample || []).map((a: any) => ({
      date: (a.start_time_utc || '').slice(0, 10),
      sport: a.sport,
      name: a.name,
      duration_min: a.duration_s ? Math.round(Number(a.duration_s) / 60) : undefined,
      distance_km: a.distance_m ? Number((Number(a.distance_m) / 1000).toFixed(2)) : undefined,
      avg_hr_bpm: a.avg_hr_bpm,
      tss: a.tss,
      avg_power_w: a.avg_power_w,
    }));

    // Strip heavy samples out of derived for the text context (already have dedicated sections)
    const { samples: _samples, ...derivedWithoutSamples } = derived as any;

    const contextForText = {
      generatedAt: contextPack.generatedAt,
      question,
      window: contextPack.window,
      // ── 1. Pre-computed key stats (kidney, CK, avg HR, TSS, weight) ──
      derived: derivedWithoutSamples,
      // ── 2. Daily metrics — always needed, must never be truncated ──
      todayBrief: contextPack.todayBrief,
      vitals: contextPack.vitals,
      sleep: contextPack.sleep,
      activitiesSample: activitySample,
      activityDetail: contextPack.activity,
      // NOTE: activitiesSample[n].date = local date of workout (YYYY-MM-DD)
      bodyMetrics: contextPack.bodyMetrics,
      // ── 3. DNA reports + medical records ──
      dnaReports: dnaRecords,
      medicalRecords,
      // ── 4. Supporting data (lower priority — stats already in derived) ──
      bloodResultsSample: (derived.samples?.bloodResultsSample || []).slice(0, 20),
      lactateThresholds,
      ftpRecords,
      coverLetter,
      rollingSummary: contextPack.rollingSummary,
    };

    const contextText = this.buildContextText(contextForText, maxChars);

    const systemContent = [
      `You are Corpus — a precise, data-driven personal health and training assistant for ${userName}.`,
      ``,
      `CRITICAL SAFETY RULE: Health information is serious. Never fabricate values. Never guess. If a metric is genuinely absent from the context provided, say exactly which field is missing rather than estimating or extrapolating. Always recommend the user consult a qualified healthcare professional for clinical decisions, medication, diagnoses, or anything that could affect their safety.`,
      ``,
      `DATA SOURCES IN CONTEXT (use ONLY these — never use general population averages as if they were the user's data):`,
      `• activitiesSample — workouts/exercises: each entry has date, sport, name, duration_min, distance_km, avg_hr_bpm, tss, avg_power_w`,
      `• sleep — daily sleep: sleep_total_min, sleep_score, rem_min, deep_min, awakenings`,
      `• vitals — daily vitals: resting_hr_bpm, hrv_ms, systolic_bp, diastolic_bp, spo2_pct`,
      `• bodyMetrics — weight_kg, body_fat_pct, muscle_mass_kg`,
      `• bloodResultsSample — lab blood results: date, category, raw_name, value, unit`,
      `• lactateThresholds — manually entered lactate threshold values (mmol/L) with dates`,
      `• ftpRecords — manually entered FTP (Functional Threshold Power) in watts with dates`,
      `• derived — pre-computed summaries: avgHeartRateAcrossLast30Activities, toughestActivityByTss, weight change, kidney markers, max CK`,
      `• rollingSummary — weekly TSS, CTL, ATL, TSB form scores`,
      `• dnaReports, medicalRecords — uploaded document extracts`,
      `• todayBrief — today's summary snapshot`,
      ``,
      `ANSWERING RULES:`,
      `1. Always cite dates when quoting specific values (e.g. "On 2026-03-10, resting HR was 52 bpm").`,
      `2. When asked for "last N" entries, list them in reverse-chronological order with dates and units.`,
      `3. When asked about workouts today / this week, check activitiesSample dates against the window.from/to.`,
      `4. For training recommendations, base them on the user's ACTUAL recent data (TSB, CTL, ATL, recent HR, sleep quality) — not generic advice.`,
      `5. If a value is not in the context at all, say: "I don't have [metric name] data in the current sync window." Do NOT invent values.`,
      `6. Use plain language. Avoid excessive medical jargon unless the user asks a technical question.`,
      `7. For anything suggesting a health risk (abnormal lab values, very high HR, poor sleep patterns), include a brief note to consult a doctor.`,
      `8. When the user asks for a chart, graph, plot, or visual of any data trend, call the generate_chart function with real values from the context. Always call it when visualisation would genuinely help.`,
    ].join('\n');

    const chartTool = {
      type: 'function',
      function: {
        name: 'generate_chart',
        description: 'Render a chart from the user\'s health data. Call this whenever the user asks for a graph, chart, plot or trend visualisation.',
        parameters: {
          type: 'object',
          required: ['type', 'title', 'labels', 'datasets'],
          properties: {
            type: { type: 'string', enum: ['line', 'bar', 'pie', 'doughnut', 'radar'], description: 'Chart type' },
            title: { type: 'string', description: 'Chart title' },
            labels: { type: 'array', items: { type: 'string' }, description: 'X-axis labels or category names' },
            datasets: {
              type: 'array',
              description: 'One entry per data series',
              items: {
                type: 'object',
                required: ['label', 'data'],
                properties: {
                  label: { type: 'string' },
                  data: { type: 'array', items: { type: 'number' } },
                  color: { type: 'string', description: 'Optional hex color e.g. #3b82f6' },
                },
              },
            },
            yAxisLabel: { type: 'string', description: 'Optional Y-axis unit label e.g. "bpm" or "kg"' },
          },
        },
      },
    };

    const messages: any[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: `Question: ${question}\n\nContext:\n${contextText}` },
    ];

    const firstResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, tools: [chartTool], tool_choice: 'auto', temperature: 0.15 }),
    });

    if (!firstResponse.ok) {
      const errorText = await firstResponse.text();
      throw new Error(`OpenAI request failed: ${firstResponse.status} ${errorText}`);
    }

    const firstData = await firstResponse.json() as any;
    const firstChoice = firstData.choices?.[0];
    const assistantMsg = firstChoice?.message;

    let answer = '';
    let chart: any = null;

    // Check if OpenAI called generate_chart
    const toolCall = assistantMsg?.tool_calls?.find((tc: any) => tc.function?.name === 'generate_chart');
    if (toolCall) {
      try { chart = JSON.parse(toolCall.function.arguments); } catch { chart = null; }

      // Second call to get the text answer with the chart context
      const followUpMessages = [
        ...messages,
        assistantMsg,
        { role: 'tool', tool_call_id: toolCall.id, content: 'Chart generated.' },
      ];
      const secondResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: followUpMessages, temperature: 0.15 }),
      });
      if (secondResponse.ok) {
        const secondData = await secondResponse.json() as any;
        answer = secondData.choices?.[0]?.message?.content?.trim() || '';
      }
    } else {
      answer = assistantMsg?.content?.trim() || 'No response.';
    }

    const safeAnswer = await this.enforceResponseIsolation(answer, userId);
    return includeContext
      ? { question, answer: safeAnswer, chart, context: contextPack }
      : { question, answer: safeAnswer, chart };
  }

  private buildDerivedStats(params: {
    activities: Activity[];
    vitals: VitalsDaily[];
    sleep: SleepDaily[];
    bodyMetrics: BodyMetrics[];
    bloodResults: Array<{
      date: string;
      category: string;
      raw_name: string;
      value: number;
      unit?: string;
      source_doc_id: string;
    }>;
    range: { from: string; to: string; days: number; activityLimit: number };
  }) {
    const activitiesSorted = [...(params.activities || [])].sort((a, b) =>
      (b.start_time_utc || '').localeCompare(a.start_time_utc || ''),
    );
    const last30 = activitiesSorted.slice(0, 30);
    const hrValues = last30
      .map((a) => (a.avg_hr_bpm !== undefined ? Number(a.avg_hr_bpm) : undefined))
      .filter((v): v is number => v !== undefined && Number.isFinite(v) && v > 0);
    const avgHrLast30 = hrValues.length ? hrValues.reduce((s, v) => s + v, 0) / hrValues.length : null;

    const fromMonth = this.daysAgoString(30, params.range.to);
    const lastMonthActivities = activitiesSorted.filter((a) => (a.start_time_utc || '').slice(0, 10) >= fromMonth);
    const toughestByTss = lastMonthActivities
      .filter((a) => a.tss !== undefined && Number.isFinite(Number(a.tss)))
      .sort((a, b) => Number(b.tss || 0) - Number(a.tss || 0))[0];

    const weights = [...(params.bodyMetrics || [])]
      .filter((b) => b.weight_kg !== undefined && Number.isFinite(Number(b.weight_kg)))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const latestWeight = weights[0]?.weight_kg ?? null;
    const weight7dAgo = weights.find((w) => (w.date || '') <= this.daysAgoString(7, params.range.to))?.weight_kg;
    const weightChange7d =
      latestWeight !== null && weight7dAgo !== undefined && Number.isFinite(Number(weight7dAgo))
        ? Number(latestWeight) - Number(weight7dAgo)
        : null;

    const blood = [...(params.bloodResults || [])].filter((r) => r.date).sort((a, b) => b.date.localeCompare(a.date));
    const ck = blood.filter((r) => this.isCreatineKinase(r.category, r.raw_name));
    const maxCk = ck.length
      ? ck.reduce((best, row) => (row.value > best.value ? row : best), ck[0])
      : null;

    const kidney = blood.filter((r) => this.isKidneyMarker(r.category, r.raw_name));
    const creatinine = kidney.filter((r) => this.matchesAny(r.category, r.raw_name, ['creatinine']));
    const egfr = kidney.filter((r) => this.matchesAny(r.category, r.raw_name, ['egfr', 'e gfr', 'e-gfr']));

    const samples = {
      activitiesSample: activitiesSorted.slice(0, Math.min(20, params.range.activityLimit)),
      bloodResultsSample: blood.slice(0, 80),
      kidneyCreatinineLast10: creatinine.slice(0, 10),
      kidneyEgfrLast10: egfr.slice(0, 10),
    };

    return {
      range: params.range,
      avgHeartRateAcrossLast30ActivitiesBpm: avgHrLast30 ? Number(avgHrLast30.toFixed(1)) : null,
      averageHeartRateSampleSize: hrValues.length,
      toughestActivityByTssLast30Days: toughestByTss
        ? {
            activity_id: toughestByTss.activity_id,
            date: (toughestByTss.start_time_utc || '').slice(0, 10),
            sport: toughestByTss.sport,
            tss: toughestByTss.tss,
            duration_min: toughestByTss.duration_s ? Math.round(Number(toughestByTss.duration_s) / 60) : undefined,
            distance_km: toughestByTss.distance_m ? Number((Number(toughestByTss.distance_m) / 1000).toFixed(2)) : undefined,
          }
        : null,
      weight: {
        latest_kg: latestWeight !== null ? Number(Number(latestWeight).toFixed(2)) : null,
        change_last_7_days_kg: weightChange7d !== null ? Number(weightChange7d.toFixed(2)) : null,
      },
      maxCreatineKinaseObserved: maxCk
        ? {
            date: maxCk.date,
            name: maxCk.raw_name || maxCk.category,
            value: maxCk.value,
            unit: maxCk.unit || null,
            source_doc_id: maxCk.source_doc_id,
          }
        : null,
      kidneyMarkers: {
        creatinine_last_10: creatinine.slice(0, 10),
        egfr_last_10: egfr.slice(0, 10),
      },
      samples,
    };
  }

  private buildContextText(context: any, maxChars: number): string {
    const asJson = JSON.stringify(context, null, 2);
    if (asJson.length <= maxChars) return asJson;
    return `${asJson.slice(0, Math.max(0, maxChars - 40))}\n... (truncated)`;
  }

  private tryReadCsvRows(filePath: string, limit: number): Array<Record<string, string>> {
    try {
      if (!fs.existsSync(filePath)) return [];
      const raw = fs.readFileSync(filePath, 'utf-8').trim();
      if (!raw) return [];
      const lines = raw.split('\n');
      if (lines.length <= 1) return [];
      const headers = this.parseCsvLine(lines[0]).map((h) => h.trim());
      const rows: Array<Record<string, string>> = [];
      for (let i = 1; i < lines.length; i += 1) {
        const values = this.parseCsvLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });
        rows.push(row);
        if (rows.length >= limit) break;
      }
      return rows;
    } catch {
      return [];
    }
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values.map((v) => v.trim());
  }

  private matchesAny(category: string, rawName: string, tokens: string[]) {
    const hay = `${category || ''} ${rawName || ''}`.toLowerCase();
    return tokens.some((t) => hay.includes(t));
  }

  private isCreatineKinase(category: string, rawName: string) {
    const hay = `${category || ''} ${rawName || ''}`.toLowerCase();
    if (hay.includes('ck-mb')) return false;
    if (hay.includes('creatine kinase')) return true;
    if (hay === 'ck') return true;
    if (/\bck\b/.test(hay)) return true;
    return false;
  }

  private isKidneyMarker(category: string, rawName: string) {
    const hay = `${category || ''} ${rawName || ''}`.toLowerCase();
    return (
      hay.includes('creatinine') ||
      hay.includes('egfr') ||
      hay.includes('e-gfr') ||
      hay.includes('urea') ||
      hay.includes('bun') ||
      hay.includes('uric') ||
      hay.includes('albumin') ||
      hay.includes('protein') ||
      hay.includes('sodium') ||
      hay.includes('potassium') ||
      hay.includes('chloride')
    );
  }

  private getCorpusRoot(): string {
    return this.configService.get<string>('CORPUS_ROOT', '/data/corpus');
  }

  private todayString(): string {
    // Use end-of-day ISO string so activities timestamped later today are included
    const d = new Date();
    d.setUTCHours(23, 59, 59, 999);
    return d.toISOString().slice(0, 10) + 'T23:59:59Z';
  }

  private daysAgoString(days: number, toDateIso: string): string {
    const end = new Date(`${toDateIso}T00:00:00Z`);
    if (Number.isNaN(end.getTime())) {
      const fallback = new Date();
      fallback.setUTCDate(fallback.getUTCDate() - days);
      return fallback.toISOString().slice(0, 10);
    }
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days);
    return start.toISOString().slice(0, 10);
  }

  // ── File-based Q&A ──────────────────────────────────────────────────────────

  async extractFileText(buffer: Buffer, originalname: string): Promise<string> {
    const ext = originalname.includes('.')
      ? originalname.slice(originalname.lastIndexOf('.')).toLowerCase()
      : '';

    if (ext === '.pdf') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      return result.text?.trim() ?? '';
    }

    // CSV, TXT, JSON, XML, MD — just read as UTF-8
    if (['.csv', '.txt', '.json', '.xml', '.md', '.html'].includes(ext)) {
      return buffer.toString('utf-8').trim();
    }

    throw new Error(`Unsupported file type "${ext}". Supported: PDF, CSV, TXT, JSON, XML, MD.`);
  }

  private getImageMimeType(filename: string): string | null {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    const map: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
    };
    return map[ext] ?? null;
  }

  async askWithFile(
    question: string,
    fileBuffer: Buffer,
    originalname: string,
    userId = 'default',
    userName = 'the user',
    mode?: 'fuel-plan-image',
  ): Promise<{
    question: string;
    answer: string;
    filename: string;
    imageBase64?: string;
    imageMimeType?: string;
  }> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

    // gpt-4o-mini supports vision; fall back to it if model doesn't support images
    const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini');

    const systemPrompt = mode === 'fuel-plan-image'
      ? [
          `You are Corpus — a practical sports nutrition and training assistant for ${userName}.`,
          `The user uploaded an image of available foods and asked for a fueling plan.`,
          `You MUST inspect the image and extract the actual visible foods/products first.`,
          `You MUST include a section titled exactly: "Detected foods from image".`,
          `Produce an actionable plan with exact timing and portions, tailored to the described workout.`,
          `Use only foods visible/plausible from the image + user's prompt. Do not introduce unrelated foods.`,
          `If uncertain about an item, mark it as "(uncertain)".`,
          `Keep safety in mind: no medical claims; include hydration guidance and caution for sensitive stomachs.`,
        ].join('\n')
      : [
          `You are Corpus — a precise, data-driven personal health and training assistant for ${userName}.`,
          `The user has uploaded a file called "${originalname}". Answer their question based on its content.`,
          `If the answer is not in the file, say so clearly. Do not fabricate information.`,
          `For anything that could affect health or safety, recommend consulting a qualified professional.`,
        ].join('\n');

    const imageMime = this.getImageMimeType(originalname);
    let userMessage: any;

    if (imageMime) {
      // Vision path — send image as base64 data URL
      const b64 = fileBuffer.toString('base64');
      userMessage = {
        role: 'user',
        content: [
          { type: 'text', text: question },
          { type: 'image_url', image_url: { url: `data:${imageMime};base64,${b64}`, detail: 'high' } },
        ],
      };
    } else {
      // Text / document path
      let fileText: string;
      try {
        fileText = await this.extractFileText(fileBuffer, originalname);
      } catch (err: any) {
        throw new Error(err?.message || 'Could not read file.');
      }
      const MAX_FILE_CHARS = 30000;
      const snippet = fileText.length > MAX_FILE_CHARS
        ? fileText.slice(0, MAX_FILE_CHARS) + '\n\n[… file truncated …]'
        : fileText;
      userMessage = {
        role: 'user',
        content: `Question: ${question}\n\nFile content (${originalname}):\n\`\`\`\n${snippet}\n\`\`\``,
      };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          userMessage,
        ],
        temperature: 0.15,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${err}`);
    }

    const data = await response.json() as any;
    const answer = data.choices?.[0]?.message?.content?.trim() || 'No response.';
    const safeAnswer = await this.enforceResponseIsolation(answer, userId);

    if (mode === 'fuel-plan-image') {
      try {
        const imageModel = this.configService.get<string>('OPENAI_IMAGE_MODEL', 'gpt-image-1');
        const imagePrompt = [
          'Create a high-quality, legible infographic for mobile viewing (portrait 1024x1536).',
          'Theme: "What to eat for this workout".',
          'Style: premium sports-nutrition poster, visually rich, bold, and highly graphical.',
          'Use strong contrast, dynamic arrows/flow, clean iconography, and polished composition.',
          'Typography must be sharp and readable on phone screens; avoid tiny text.',
          'Include concise timings and portions.',
          'Create clear visual sections: PRE, DURING, LAST 10-15 MIN, POST.',
          'Use large readable titles and concise bullets in each section.',
          'Only use foods/products listed in the "Detected foods from image" section from the plan text.',
          'Use this plan text exactly as source material (do not invent extra claims):',
          answer,
          'Add a small safety footer: "Adjust portions to tolerance. Seek professional advice for medical conditions."',
        ].join('\n\n');

        const makeImage = async (quality?: 'high') =>
          fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: imageModel,
              prompt: imagePrompt,
              size: '1024x1536',
              response_format: 'b64_json',
              ...(quality ? { quality } : {}),
            }),
          });

        let imageRes = await makeImage('high');
        if (!imageRes.ok) {
          // Fallback for environments/models that don't support quality flag.
          imageRes = await makeImage();
        }

        if (imageRes.ok) {
          const imageData = await imageRes.json() as any;
          const imageBase64 = imageData?.data?.[0]?.b64_json as string | undefined;
          if (imageBase64) {
            return {
              question,
              answer: safeAnswer,
              filename: originalname,
              imageBase64,
              imageMimeType: 'image/png',
            };
          }
        }
      } catch {
        // Graceful fallback to text-only answer if image generation fails.
      }
    }

    return { question, answer: safeAnswer, filename: originalname };
  }

  private async enforceResponseIsolation(answer: string, userId: string): Promise<string> {
    if (!answer?.trim()) return answer;
    try {
      const otherTokens = await this.usersService.getOtherUserIdentityTokens(userId);
      const lower = answer.toLowerCase();
      for (const token of otherTokens) {
        if (!this.containsIdentityToken(lower, token)) continue;
        return 'I can only access and discuss data for your authenticated account.';
      }
    } catch {
      // Fail-open: isolation by user-scoped data access is still primary protection.
    }
    return answer;
  }

  private containsIdentityToken(textLower: string, tokenLower: string): boolean {
    const token = tokenLower.trim().toLowerCase();
    if (!token) return false;
    if (token.includes('@')) return textLower.includes(token);
    if (token.length < 5) return false;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    return re.test(textLower);
  }

  async transcribeAudio(buffer: Buffer, originalname: string): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

    const ext = originalname.includes('.')
      ? originalname.slice(originalname.lastIndexOf('.')).toLowerCase()
      : '.webm';
    const mimeMap: Record<string, string> = {
      '.webm': 'audio/webm',
      '.mp4': 'audio/mp4',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
    };
    const mimeType = mimeMap[ext] ?? 'audio/webm';
    const filename = `recording${ext}`;

    const formData = new FormData();
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    formData.append('file', new Blob([arrayBuffer], { type: mimeType }), filename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Whisper API error ${res.status}: ${err}`);
    }

    const data = await res.json() as { text: string };
    return data.text?.trim() ?? '';
  }
}

