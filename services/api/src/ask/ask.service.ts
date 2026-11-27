import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { ActivitiesService, Activity } from '../activities/activities.service';
import { MedicalsService } from '../medicals/medicals.service';
import { MetricsService, BodyMetrics, SleepDaily, VitalsDaily } from '../metrics/metrics.service';
import { SummaryService } from '../summary/summary.service';
import { UsersService } from '../users/users.service';
import { anthropicErrorFields, anthropicUsage, recordAiUsage } from '../common/ai-usage';

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
    options?: {
      days?: number;
      activityLimit?: number;
      includeContext?: boolean;
      timeZone?: string;
      latencyProfile?: 'default' | 'mobile';
    },
    userId = 'default',
    userName = 'the user',
  ): Promise<{
    question: string;
    answer: string;
    chart?: any;
    context?: any;
  }> {
    const runtimeProfile = this.getAnthropicRuntimeProfile(options?.latencyProfile);
    const maxChars = runtimeProfile.contextCharLimit;
    const days = options?.days && options.days > 0 ? options.days : 60;
    const activityLimit = options?.activityLimit && options.activityLimit > 0 ? options.activityLimit : 100;
    const includeContext = options?.includeContext === true;
    const timeZone = options?.timeZone;

    const to = this.normalizeDateOnly(dateRange?.to) || this.todayString(timeZone);
    const from = this.normalizeDateOnly(dateRange?.from) || this.daysAgoString(days, to);

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
      `RESPONSE STYLE (default):`,
      `• Provide a high-quality answer, similar to a premium assistant: clear, insightful, and practical.`,
      `• Start with a direct answer in 1-2 lines.`,
      `• Then include a brief "Evidence from your data" section with dated metrics.`,
      `• Then include "Interpretation" (what the pattern means) and "Recommended next steps".`,
      `• Use markdown headings and bullets for readability; avoid long unbroken paragraphs.`,
      `• If the user asks a quick/simple question, keep it concise (3-6 bullets). If complex, go deeper.`,
      `• For analytical questions, target a richer response (roughly 250-500 words) with concrete numbers and dates.`,
      `• Prefer practical coaching language over generic advice. Explain trade-offs and why each recommendation matters.`,
      `• When comparing periods/sports/metrics, include a compact markdown table when it improves clarity.`,
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
      `9. Explicitly connect related systems when relevant (e.g. sleep + HRV + training load + performance).`,
      `10. State confidence briefly when data is sparse or conflicting.`,
    ].join('\n');

    const chartTool = {
      name: 'generate_chart',
      description: 'Render a chart from the user\'s health data. Call this whenever the user asks for a graph, chart, plot or trend visualisation.',
      input_schema: {
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
    };
    const shouldOfferChartTool = this.userAskedForChart(question);

    const messages: any[] = [
      { role: 'user', content: `Question: ${question}\n\nContext:\n${contextText}` },
    ];

    const firstData = await this.callAnthropicMessages({
      system: systemContent,
      messages,
      tools: shouldOfferChartTool ? [chartTool] : undefined,
      tool_choice: shouldOfferChartTool ? { type: 'auto' } : undefined,
      runtimeProfile,
    });
    const assistantContent = Array.isArray(firstData?.content) ? firstData.content : [];

    let answer = '';
    let chart: any = null;

    const toolCall = assistantContent.find(
      (block: any) => block?.type === 'tool_use' && block?.name === 'generate_chart',
    );
    if (toolCall) {
      if (toolCall.input && typeof toolCall.input === 'object') {
        chart = toolCall.input;
      } else if (typeof toolCall.input === 'string') {
        try { chart = JSON.parse(toolCall.input); } catch { chart = null; }
      }

      const followUpMessages = [
        ...messages,
        { role: 'assistant', content: assistantContent },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: 'Chart generated.',
            },
          ],
        },
      ];
      const secondData = await this.callAnthropicMessages({
        system: systemContent,
        messages: followUpMessages,
        runtimeProfile,
      });
      answer = this.extractAnthropicText(secondData?.content) || this.extractAnthropicText(assistantContent) || 'No response.';
    } else {
      answer = this.extractAnthropicText(assistantContent) || 'No response.';
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

  private todayString(timeZone?: string): string {
    try {
      if (timeZone) {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(new Date());
        const year = parts.find((p) => p.type === 'year')?.value;
        const month = parts.find((p) => p.type === 'month')?.value;
        const day = parts.find((p) => p.type === 'day')?.value;
        if (year && month && day) return `${year}-${month}-${day}`;
      }
    } catch {
      // Fall back to UTC date if timezone string is invalid.
    }
    return new Date().toISOString().slice(0, 10);
  }

  private daysAgoString(days: number, toDateIso: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toDateIso);
    if (!match) {
      const fallback = new Date();
      fallback.setUTCDate(fallback.getUTCDate() - days);
      return fallback.toISOString().slice(0, 10);
    }
    const end = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (Number.isNaN(end.getTime())) {
      const fallback = new Date();
      fallback.setUTCDate(fallback.getUTCDate() - days);
      return fallback.toISOString().slice(0, 10);
    }
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days);
    return start.toISOString().slice(0, 10);
  }

  private normalizeDateOnly(value?: string): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const direct = /^(\d{4}-\d{2}-\d{2})$/.exec(trimmed);
    if (direct) return direct[1];
    const fromIso = /^(\d{4}-\d{2}-\d{2})T/.exec(trimmed);
    if (fromIso) return fromIso[1];
    return undefined;
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
    let userContent: any;

    if (imageMime) {
      const b64 = fileBuffer.toString('base64');
      userContent = [
          { type: 'text', text: question },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageMime,
              data: b64,
            },
          },
        ];
    } else {
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
      userContent = `Question: ${question}\n\nFile content (${originalname}):\n\`\`\`\n${snippet}\n\`\`\``;
    }

    const data = await this.callAnthropicMessages({
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });
    const answer = this.extractAnthropicText(data?.content) || 'No response.';
    const safeAnswer = await this.enforceResponseIsolation(answer, userId);

    if (mode === 'fuel-plan-image') {
      try {
        const rendered = await this.generateIdeogramFuelImage(safeAnswer);
        if (rendered) {
          return {
            question,
            answer: safeAnswer,
            filename: originalname,
            imageBase64: rendered.imageBase64,
            imageMimeType: rendered.imageMimeType,
          };
        }
      } catch (error: any) {
        // Graceful fallback to text-only answer if Ideogram generation fails.
        console.warn('[AskService] Ideogram image generation failed:', error?.message || error);
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

  private getAnthropicApiKey(): string {
    const apiKey =
      this.configService.get<string>('ANTHROPIC_API_KEY') ||
      this.configService.get<string>('CLAUDE_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY (or CLAUDE_API_KEY) is not configured.');
    }
    return apiKey;
  }

  private getAnthropicModel(): string {
    return (
      this.configService.get<string>('ANTHROPIC_MODEL') ||
      this.configService.get<string>('CLAUDE_MODEL') ||
      'claude-3-5-sonnet-latest'
    );
  }

  private getContextCharLimit(): number {
    const raw =
      this.configService.get<string>('ANTHROPIC_MAX_CONTEXT_CHARS') ||
      this.configService.get<string>('OPENAI_MAX_CONTEXT_CHARS') ||
      '24000';
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 24000;
  }

  private getAnthropicMaxTokens(): number {
    const raw = this.configService.get<string>('ANTHROPIC_MAX_TOKENS', '4096');
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 4096;
  }

  private getAnthropicThinkingBudget(maxTokens: number): number {
    const raw = this.configService.get<string>('ANTHROPIC_THINKING_BUDGET', '2048');
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    const capped = Math.min(parsed, Math.max(0, maxTokens - 512));
    return capped >= 256 ? capped : 0;
  }

  private getAnthropicMobileModel(): string {
    return this.configService.get<string>('ANTHROPIC_MOBILE_MODEL') || this.getAnthropicModel();
  }

  private getAnthropicMobileMaxTokens(defaultMaxTokens: number): number {
    const fallback = Math.min(defaultMaxTokens, 1400);
    const raw = this.configService.get<string>('ANTHROPIC_MOBILE_MAX_TOKENS', String(fallback));
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, defaultMaxTokens);
  }

  private getAnthropicMobileContextCharLimit(defaultContextChars: number): number {
    const fallback = Math.min(defaultContextChars, 30000);
    const raw = this.configService.get<string>('ANTHROPIC_MOBILE_MAX_CONTEXT_CHARS', String(fallback));
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, defaultContextChars);
  }

  private getAnthropicMobileThinkingBudget(maxTokens: number): number {
    const raw = this.configService.get<string>('ANTHROPIC_MOBILE_THINKING_BUDGET', '0');
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    const capped = Math.min(parsed, Math.max(0, maxTokens - 512));
    return capped >= 256 ? capped : 0;
  }

  private getAnthropicRuntimeProfile(profile?: 'default' | 'mobile'): {
    model: string;
    maxTokens: number;
    thinkingBudget: number;
    contextCharLimit: number;
  } {
    const defaultMaxTokens = this.getAnthropicMaxTokens();
    const defaultContextChars = this.getContextCharLimit();
    if (profile === 'mobile') {
      const maxTokens = this.getAnthropicMobileMaxTokens(defaultMaxTokens);
      return {
        model: this.getAnthropicMobileModel(),
        maxTokens,
        thinkingBudget: this.getAnthropicMobileThinkingBudget(maxTokens),
        contextCharLimit: this.getAnthropicMobileContextCharLimit(defaultContextChars),
      };
    }
    return {
      model: this.getAnthropicModel(),
      maxTokens: defaultMaxTokens,
      thinkingBudget: this.getAnthropicThinkingBudget(defaultMaxTokens),
      contextCharLimit: defaultContextChars,
    };
  }

  private userAskedForChart(question: string): boolean {
    const q = (question || '').toLowerCase();
    return /\b(chart|graph|plot|visuali[sz]e|visual|trend|timeline|compare)\b/.test(q);
  }

  /** Per-process memo of models that rejected budget-based thinking. */
  private static readonly modelsWithoutBudgetThinking = new Set<string>();

  private shouldRetryWithoutThinking(status: number, errorText: string): boolean {
    if (status !== 400) return false;
    const lower = (errorText || '').toLowerCase();
    return lower.includes('thinking') && (
      lower.includes('unsupported') ||
      lower.includes('invalid_request_error') ||
      lower.includes('not available')
    );
  }

  private shouldRetryWithDefaultModel(status: number, errorText: string): boolean {
    if (status !== 404) return false;
    const lower = (errorText || '').toLowerCase();
    return lower.includes('model') && (
      lower.includes('not_found_error') ||
      lower.includes('not found') ||
      lower.includes('model:')
    );
  }

  private extractAnthropicText(content: unknown): string {
    if (!Array.isArray(content)) return '';
    return content
      .filter((block) => block && (block as any).type === 'text' && typeof (block as any).text === 'string')
      .map((block) => (block as any).text.trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private getIdeogramApiKey(): string | null {
    const key = this.configService.get<string>('IDEOGRAM_API_KEY');
    return key && key.trim() ? key.trim() : null;
  }

  private getIdeogramAspectRatio(): string {
    return this.configService.get<string>('IDEOGRAM_ASPECT_RATIO', '2x3');
  }

  private getIdeogramRenderingSpeed(): string {
    return this.configService.get<string>('IDEOGRAM_RENDERING_SPEED', 'QUALITY');
  }

  private getIdeogramStyleType(): string {
    return this.configService.get<string>('IDEOGRAM_STYLE_TYPE', 'DESIGN');
  }

  private buildFuelPlanPosterPrompt(planText: string): string {
    const trimmedPlan = planText.trim();
    const cappedPlan = trimmedPlan.length > 3500 ? `${trimmedPlan.slice(0, 3500)}…` : trimmedPlan;
    return [
      'Create a high-quality sports nutrition infographic poster.',
      'The visual must look like a polished fitness coaching graphic with sharp typography and clear hierarchy.',
      'Use a portrait layout suitable for mobile (sectioned cards/strips).',
      'Include clear sections: PRE-WORKOUT, DURING, LAST 10-15 MIN, POST-WORKOUT, HYDRATION.',
      'Use only the plan details provided below. Do not invent foods or claims.',
      'Text must be clean and readable at phone size.',
      'Use bold headers, concise bullets, directional flow arrows, and realistic food elements.',
      'Avoid gibberish text. Keep wording faithful to the source plan.',
      '',
      'SOURCE PLAN:',
      cappedPlan,
    ].join('\n');
  }

  private async generateIdeogramFuelImage(planText: string): Promise<{ imageBase64: string; imageMimeType: string } | null> {
    const apiKey = this.getIdeogramApiKey();
    if (!apiKey) return null;

    const formData = new FormData();
    formData.append('prompt', this.buildFuelPlanPosterPrompt(planText));
    formData.append('aspect_ratio', this.getIdeogramAspectRatio());
    formData.append('rendering_speed', this.getIdeogramRenderingSpeed());
    formData.append('style_type', this.getIdeogramStyleType());
    formData.append('num_images', '1');
    formData.append('magic_prompt', 'AUTO');

    const ideogramRes = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
      },
      body: formData,
    });

    if (!ideogramRes.ok) {
      const errText = await ideogramRes.text();
      throw new Error(`Ideogram request failed: ${ideogramRes.status} ${errText}`);
    }

    const ideogramJson = await ideogramRes.json() as any;
    const imageUrl = ideogramJson?.data?.[0]?.url as string | undefined;
    if (!imageUrl) return null;

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      const errText = await imageRes.text();
      throw new Error(`Ideogram image download failed: ${imageRes.status} ${errText}`);
    }

    const contentType = imageRes.headers.get('content-type') || 'image/png';
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    return {
      imageBase64: imageBuffer.toString('base64'),
      imageMimeType: contentType,
    };
  }

  /**
   * Every chat/coach Anthropic call goes through here so usage and failures
   * are recorded (see common/ai-usage.ts).
   */
  private async callAnthropicMessages(payload: Parameters<AskService['callAnthropicMessagesRaw']>[0]): Promise<any> {
    const startedAt = Date.now();
    const requestedModel = payload.runtimeProfile?.model || this.getAnthropicModel();
    const corpusRoot = this.configService.get<string>('CORPUS_ROOT', '/data/corpus');
    try {
      const data = await this.callAnthropicMessagesRaw(payload);
      recordAiUsage(corpusRoot, {
        ok: true, feature: 'ask', model: data?.model || requestedModel,
        ...anthropicUsage(data), ms: Date.now() - startedAt,
      });
      return data;
    } catch (err) {
      recordAiUsage(corpusRoot, {
        ok: false, feature: 'ask', model: requestedModel,
        ...anthropicErrorFields(err), ms: Date.now() - startedAt,
      });
      throw err;
    }
  }

  private async callAnthropicMessagesRaw(payload: {
    system: string;
    messages: Array<{ role: 'user' | 'assistant'; content: any }>;
    tools?: any[];
    tool_choice?: any;
    runtimeProfile?: {
      model: string;
      maxTokens: number;
      thinkingBudget: number;
    };
  }): Promise<any> {
    const apiKey = this.getAnthropicApiKey();
    const defaultModel = this.getAnthropicModel();
    const requestedModel = payload.runtimeProfile?.model || defaultModel;
    const maxTokens = payload.runtimeProfile?.maxTokens || this.getAnthropicMaxTokens();
    const thinkingBudget = payload.runtimeProfile
      ? Math.max(0, Math.min(payload.runtimeProfile.thinkingBudget, Math.max(0, maxTokens - 512)))
      : this.getAnthropicThinkingBudget(maxTokens);
    const endpoint = 'https://api.anthropic.com/v1/messages';
    const headers = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
    const baseBody: Record<string, unknown> = {
      max_tokens: maxTokens,
      system: payload.system,
      messages: payload.messages,
      tools: payload.tools,
      tool_choice: payload.tool_choice,
    };

    const requestBody = (withThinking: boolean, modelName: string): Record<string, unknown> =>
      withThinking && thinkingBudget >= 256
        ? {
            ...baseBody,
            model: modelName,
            thinking: {
              type: 'enabled',
              budget_tokens: thinkingBudget,
            },
          }
        : {
            ...baseBody,
            model: modelName,
          };

    const runRequest = (withThinking: boolean, modelName: string) =>
      fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody(withThinking, modelName)),
      });

    // Models that rejected `thinking.budget_tokens` (e.g. Opus 4.7+, which only
    // accept adaptive thinking). Once seen, skip the doomed first request.
    const wantsThinking = (modelName: string) =>
      thinkingBudget >= 256 && !AskService.modelsWithoutBudgetThinking.has(modelName);

    let activeModel = requestedModel;
    let response = await runRequest(wantsThinking(activeModel), activeModel);

    if (!response.ok) {
      let errorText = await response.text();

      if (
        activeModel !== defaultModel &&
        this.shouldRetryWithDefaultModel(response.status, errorText)
      ) {
        activeModel = defaultModel;
        response = await runRequest(wantsThinking(activeModel), activeModel);
        if (!response.ok) {
          errorText = await response.text();
        } else {
          return response.json();
        }
      }

      if (wantsThinking(activeModel) && this.shouldRetryWithoutThinking(response.status, errorText)) {
        AskService.modelsWithoutBudgetThinking.add(activeModel);
        response = await runRequest(false, activeModel);
        if (!response.ok) {
          const retryErrorText = await response.text();
          throw new Error(`Anthropic request failed: ${response.status} ${retryErrorText}`);
        }
      } else {
        throw new Error(`Anthropic request failed: ${response.status} ${errorText}`);
      }
    }

    return response.json();
  }

  async transcribeAudio(buffer: Buffer, originalname: string): Promise<string> {
    if (!buffer?.length) {
      throw new Error('No audio file provided.');
    }

    const filename = originalname?.trim() || 'recording.webm';
    const ext = path.extname(filename).toLowerCase();
    const mimeType =
      ext === '.mp4' || ext === '.m4a'
        ? 'audio/mp4'
        : ext === '.ogg'
          ? 'audio/ogg'
          : ext === '.wav'
            ? 'audio/wav'
            : ext === '.mp3'
              ? 'audio/mpeg'
              : 'audio/webm';

    const groqKey = this.configService.get<string>('GROQ_API_KEY')?.trim();
    if (groqKey) {
      return this.transcribeWithWhisperCompatibleApi({
        endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
        apiKey: groqKey,
        model: this.configService.get<string>('GROQ_WHISPER_MODEL')?.trim() || 'whisper-large-v3',
        filename,
        mimeType,
        buffer,
        providerLabel: 'Groq',
      });
    }

    const openAiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
    if (openAiKey) {
      return this.transcribeWithWhisperCompatibleApi({
        endpoint: 'https://api.openai.com/v1/audio/transcriptions',
        apiKey: openAiKey,
        model: 'whisper-1',
        filename,
        mimeType,
        buffer,
        providerLabel: 'OpenAI',
      });
    }

    throw new Error(
      'Audio transcription is unavailable. Set GROQ_API_KEY or OPENAI_API_KEY for Whisper speech-to-text.',
    );
  }

  private async transcribeWithWhisperCompatibleApi(opts: {
    endpoint: string;
    apiKey: string;
    model: string;
    filename: string;
    mimeType: string;
    buffer: Buffer;
    providerLabel: string;
  }): Promise<string> {
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(opts.buffer)], { type: opts.mimeType }),
      opts.filename,
    );
    formData.append('model', opts.model);

    const response = await fetch(opts.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429 || /insufficient_quota|rate_limit/i.test(errText)) {
        throw new Error(
          `${opts.providerLabel} speech-to-text quota exceeded. Add billing credits or set GROQ_API_KEY.`,
        );
      }
      throw new Error(
        `Whisper transcription failed (${opts.providerLabel}): ${response.status} ${errText}`,
      );
    }

    const json = (await response.json()) as { text?: string };
    return (json.text || '').trim();
  }
}

