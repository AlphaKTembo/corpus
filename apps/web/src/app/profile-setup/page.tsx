'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'identity' | 'athletic' | 'health' | 'goals' | 'preview';

const STEPS: Step[] = ['identity', 'athletic', 'health', 'goals', 'preview'];
const STEP_LABELS = ['About you', 'Athletic background', 'Health & medical', 'Goals & events', 'Preview'];

const COMMON_SPORTS = [
  'Running', 'Cycling', 'Swimming', 'Triathlon', 'Rowing',
  'Mountain biking', 'Strength training', 'CrossFit', 'Walking',
  'Hiking', 'Yoga', 'Tennis', 'Football', 'Golf', 'Skiing', 'Paddling',
];

const ATHLETE_LEVELS = [
  { id: 'beginner',     label: 'Beginner',           desc: 'Just getting started' },
  { id: 'recreational', label: 'Recreational',        desc: 'Active for fun & health' },
  { id: 'hobbyist',     label: 'Hobbyist competitor', desc: 'Enter events occasionally' },
  { id: 'amateur',      label: 'Competitive amateur', desc: 'Race / compete regularly' },
  { id: 'elite',        label: 'Elite / semi-pro',    desc: 'Performance-focused' },
];

const COMMON_CONDITIONS = [
  'High blood pressure', 'Type 1 diabetes', 'Type 2 diabetes',
  'Asthma', 'Arthritis', 'Heart condition', 'Thyroid disorder',
  'Kidney disease', 'Autoimmune condition', 'Depression / anxiety',
];

const GOAL_OPTIONS = [
  { id: 'lose_weight',     emoji: '⚖️',  label: 'Lose weight' },
  { id: 'race_prep',       emoji: '🏁',  label: 'Train for a race / event' },
  { id: 'general_fitness', emoji: '💪',  label: 'General fitness & health' },
  { id: 'lower_bp',        emoji: '❤️',  label: 'Lower blood pressure' },
  { id: 'build_muscle',    emoji: '🏋️', label: 'Build muscle' },
  { id: 'improve_sleep',   emoji: '😴',  label: 'Improve sleep & recovery' },
  { id: 'mental_health',   emoji: '🧘',  label: 'Mental wellbeing & stress' },
  { id: 'longevity',       emoji: '🌿',  label: 'Long-term health & longevity' },
  { id: 'rehab',           emoji: '🩹',  label: 'Recover from injury / illness' },
];

interface UpcomingEvent {
  name: string;
  date: string;
  distance: string;
  description: string;
}

// ── Letter builder ─────────────────────────────────────────────────────────────

function buildLetter(data: {
  name: string; dob: string; gender: string; ethnicity: string;
  height: string; weight: string;
  athleteLevel: string; sports: string[]; athleteDesc: string;
  conditions: string[]; medications: string; injuries: string; medicalHistory: string;
  goals: string[]; events: UpcomingEvent[]; trainingNotes: string;
}): string {
  const parts: string[] = [];

  // Identity paragraph
  const identityParts: string[] = [];
  if (data.name) identityParts.push(`My name is ${data.name}.`);
  if (data.dob) {
    const age = Math.floor((Date.now() - new Date(data.dob).getTime()) / (365.25 * 24 * 3600 * 1000));
    if (!isNaN(age) && age > 0) identityParts.push(`I was born on ${new Date(data.dob).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} and am ${age} years old.`);
  }
  const demographic: string[] = [];
  if (data.ethnicity) demographic.push(data.ethnicity);
  if (data.gender) demographic.push(data.gender);
  if (demographic.length) identityParts.push(`I am a ${demographic.join(' ')}.`);
  const physical: string[] = [];
  if (data.height) physical.push(`height ${data.height}`);
  if (data.weight) physical.push(`weight ${data.weight}`);
  if (physical.length) identityParts.push(`Physical stats: ${physical.join(', ')}.`);
  if (identityParts.length) parts.push(identityParts.join(' '));

  // Athletic background paragraph
  const athleticParts: string[] = [];
  const levelObj = ATHLETE_LEVELS.find(l => l.id === data.athleteLevel);
  if (levelObj) athleticParts.push(`I am a ${levelObj.label.toLowerCase()} athlete.`);
  if (data.sports.length) athleticParts.push(`My main sports are ${data.sports.join(', ')}.`);
  if (data.athleteDesc.trim()) athleticParts.push(data.athleteDesc.trim());
  if (athleticParts.length) parts.push(athleticParts.join(' '));

  // Health paragraph
  const healthParts: string[] = [];
  if (data.conditions.length) healthParts.push(`Medical conditions: ${data.conditions.join(', ')}.`);
  if (data.medications.trim()) healthParts.push(`Current medications: ${data.medications.trim()}.`);
  if (data.injuries.trim()) healthParts.push(`Injuries / physical limitations: ${data.injuries.trim()}.`);
  if (data.medicalHistory.trim()) healthParts.push(data.medicalHistory.trim());
  if (healthParts.length) parts.push(healthParts.join(' '));

  // Goals paragraph
  const goalParts: string[] = [];
  if (data.goals.length) {
    const goalLabels = data.goals.map(id => GOAL_OPTIONS.find(g => g.id === id)?.label || id);
    goalParts.push(`My main health and training goals are: ${goalLabels.join(', ')}.`);
  }
  if (data.events.length) {
    const eventLines = data.events
      .filter(e => e.name)
      .map(e => {
        const parts2 = [e.name];
        if (e.date) parts2.push(`on ${e.date}`);
        if (e.distance) parts2.push(`(${e.distance})`);
        if (e.description) parts2.push(`— ${e.description}`);
        return parts2.join(' ');
      });
    if (eventLines.length) goalParts.push(`Upcoming events: ${eventLines.join('; ')}.`);
  }
  if (data.trainingNotes.trim()) goalParts.push(data.trainingNotes.trim());
  if (goalParts.length) parts.push(goalParts.join(' '));

  parts.push('I want Corpus to keep an eye on my progress and give me tailored advice based on my data, goals, and history.');

  return parts.filter(Boolean).join('\n\n');
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#fff', borderRadius: '20px', border: '1px solid #e5e7eb',
  boxShadow: '0 2px 16px rgba(0,0,0,0.07)', padding: '2rem',
};

const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.7rem 0.9rem', borderRadius: '10px',
  border: '1.5px solid #e2e8f0', fontSize: '0.875rem',
  fontFamily: 'inherit', outline: 'none', color: '#0f172a', background: '#fafafa',
};

const label: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 600,
  color: '#475569', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px',
};

const pill = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
  padding: '0.5rem 1rem', borderRadius: '999px', cursor: 'pointer',
  fontWeight: 500, fontSize: '0.82rem', transition: 'all 0.15s',
  border: active ? '2px solid #0f172a' : '2px solid #e2e8f0',
  background: active ? '#0f172a' : '#fff',
  color: active ? '#fff' : '#374151',
  userSelect: 'none' as const,
});

const btn = (variant: 'primary' | 'ghost' | 'danger', disabled = false): React.CSSProperties => ({
  padding: '0.7rem 1.5rem', borderRadius: '12px', border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.875rem',
  opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
  background: variant === 'primary' ? '#0f172a' : variant === 'danger' ? '#fee2e2' : '#f1f5f9',
  color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#dc2626' : '#374151',
  boxShadow: variant === 'primary' && !disabled ? '0 2px 10px rgba(0,0,0,0.18)' : 'none',
});

const row: React.CSSProperties = { display: 'flex', gap: '1rem' };
const col = (flex = 1): React.CSSProperties => ({ flex });
const sectionTitle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8',
  textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem', marginTop: '1.5rem',
};

// ── Step bar ──────────────────────────────────────────────────────────────────

function StepBar({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
      {STEPS.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: i <= idx ? '#0f172a' : '#e2e8f0',
              color: i <= idx ? '#fff' : '#94a3b8',
              fontSize: '11px', fontWeight: 700, transition: 'all 0.2s', flexShrink: 0,
            }}>
              {i < idx ? '✓' : i + 1}
            </div>
            <span style={{
              fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
              color: i === idx ? '#0f172a' : '#94a3b8',
            }}>{STEP_LABELS[i]}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{ flex: 1, height: 2, margin: '0 0.5rem', minWidth: 12, background: i < idx ? '#0f172a' : '#e2e8f0' }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfileSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('identity');
  const [saving, setSaving] = useState(false);
  const [existingLetter, setExistingLetter] = useState('');

  // Step 1 — Identity
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [ethnicity, setEthnicity] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');

  // Step 2 — Athletic background
  const [athleteLevel, setAthleteLevel] = useState('');
  const [sports, setSports] = useState<string[]>([]);
  const [customSport, setCustomSport] = useState('');
  const [athleteDesc, setAthleteDesc] = useState('');

  // Step 3 — Health & medical
  const [conditions, setConditions] = useState<string[]>([]);
  const [customCondition, setCustomCondition] = useState('');
  const [medications, setMedications] = useState('');
  const [injuries, setInjuries] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');

  // Step 4 — Goals & events
  const [goals, setGoals] = useState<string[]>([]);
  const [events, setEvents] = useState<UpcomingEvent[]>([{ name: '', date: '', distance: '', description: '' }]);
  const [trainingNotes, setTrainingNotes] = useState('');

  // Preview override
  const [previewText, setPreviewText] = useState('');
  const [previewEdited, setPreviewEdited] = useState(false);

  const STORAGE_KEY = 'corpus_profile_data';

  useEffect(() => {
    // Restore saved profile fields
    const saved = localStorage.getItem(STORAGE_KEY);
    let hasSavedSports = false;
    if (saved) {
      try {
        const d = JSON.parse(saved);
        if (d.name)           setName(d.name);
        if (d.dob)            setDob(d.dob);
        if (d.gender)         setGender(d.gender);
        if (d.ethnicity)      setEthnicity(d.ethnicity);
        if (d.height)         setHeight(d.height);
        if (d.weight)         setWeight(d.weight);
        if (d.athleteLevel)   setAthleteLevel(d.athleteLevel);
        if (d.sports?.length) { setSports(d.sports); hasSavedSports = true; }
        if (d.athleteDesc)    setAthleteDesc(d.athleteDesc);
        if (d.conditions?.length) setConditions(d.conditions);
        if (d.medications)    setMedications(d.medications);
        if (d.injuries)       setInjuries(d.injuries);
        if (d.medicalHistory) setMedicalHistory(d.medicalHistory);
        if (d.goals?.length)  setGoals(d.goals);
        if (d.events?.length) setEvents(d.events);
        if (d.trainingNotes)  setTrainingNotes(d.trainingNotes);
      } catch {}
    }

    apiClient.getMedicalCoverLetter()
      .then((r: any) => { if (r.data?.text) setExistingLetter(r.data.text); })
      .catch(() => {});

    // Only auto-detect sports from history if none were previously saved
    if (!hasSavedSports) {
      apiClient.getActivities({ limit: 200 } as any)
        .then((r: any) => {
          const activities: any[] = r.data?.activities ?? [];
          const seen = new Set<string>();
          activities.forEach((a: any) => {
            const s = a.sport?.trim();
            if (s) seen.add(s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
          });
          const detected = Array.from(seen).filter(s =>
            COMMON_SPORTS.some(c => c.toLowerCase() === s.toLowerCase())
          );
          if (detected.length) setSports(detected);
        })
        .catch(() => {});
    }
  }, []);

  const generatedLetter = buildLetter({
    name, dob, gender, ethnicity, height, weight,
    athleteLevel, sports, athleteDesc,
    conditions, medications, injuries, medicalHistory,
    goals, events, trainingNotes,
  });

  const letterToSave = previewEdited ? previewText : generatedLetter;

  const goToStep = (s: Step) => {
    persistFields();
    setStep(s);
  };

  const goToPreview = () => {
    persistFields();
    setPreviewText(generatedLetter);
    setPreviewEdited(false);
    setStep('preview');
  };

  const persistFields = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      name, dob, gender, ethnicity, height, weight,
      athleteLevel, sports, athleteDesc,
      conditions, medications, injuries, medicalHistory,
      goals, events, trainingNotes,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      persistFields();
      await apiClient.updateMedicalCoverLetter(letterToSave);
      localStorage.setItem('corpus_onboarded', '1');
      router.push('/dashboard');
    } catch { setSaving(false); }
  };

  const handleSkip = () => {
    localStorage.setItem('corpus_onboarded', '1');
    router.push('/dashboard');
  };

  const toggleSport = (s: string) =>
    setSports(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const addCustomSport = () => {
    const s = customSport.trim();
    if (s && !sports.includes(s)) setSports(prev => [...prev, s]);
    setCustomSport('');
  };

  const toggleCondition = (c: string) =>
    setConditions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const addCustomCondition = () => {
    const c = customCondition.trim();
    if (c && !conditions.includes(c)) setConditions(prev => [...prev, c]);
    setCustomCondition('');
  };

  const toggleGoal = (id: string) =>
    setGoals(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);

  const updateEvent = (i: number, key: keyof UpcomingEvent, val: string) =>
    setEvents(prev => prev.map((e, idx) => idx === i ? { ...e, [key]: val } : e));

  const addEvent = () =>
    setEvents(prev => [...prev, { name: '', date: '', distance: '', description: '' }]);

  const removeEvent = (i: number) =>
    setEvents(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '2.5rem 1rem 4rem' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontSize: '2.2rem', marginBottom: '0.4rem' }}>👋</div>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.4rem', letterSpacing: '-0.5px' }}>
          Welcome to Corpus
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 auto', maxWidth: '480px' }}>
          Before you dive in, let&apos;s build your profile. Corpus uses this to give you advice that&apos;s specific to <em>you</em> — not generic.
        </p>
        <p style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '0.4rem' }}>
          Takes about 3 minutes &nbsp;·&nbsp; You can edit it any time from <strong>My Profile</strong>
        </p>
      </div>

      <StepBar current={step} />

      {/* ── Step 1: Identity ────────────────────────────────────────────── */}
      {step === 'identity' && (
        <div style={card}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.3rem' }}>Who are you?</h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
            The basics — name, age, and a few physical stats to give Corpus context.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={label}>Full name *</label>
            <input style={field} value={name} onChange={e => setName(e.target.value)}
              placeholder="Your full name" />
          </div>

          <div style={{ ...row, marginBottom: '1rem' }}>
            <div style={col()}>
              <label style={label}>Date of birth *</label>
              <input style={field} type="date" value={dob} onChange={e => setDob(e.target.value)} />
            </div>
            <div style={col()}>
              <label style={label}>Gender</label>
              <select style={field} value={gender} onChange={e => setGender(e.target.value)}>
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non-binary">Non-binary</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={label}>Ethnicity <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — relevant for some health markers)</span></label>
            <input style={field} value={ethnicity} onChange={e => setEthnicity(e.target.value)}
              placeholder="e.g. Caucasian, South Asian, Mixed…" />
          </div>

          <div style={{ ...row, marginBottom: '0.5rem' }}>
            <div style={col()}>
              <label style={label}>Height (optional)</label>
              <input style={field} value={height} onChange={e => setHeight(e.target.value)}
                placeholder="e.g. 183 cm or 6ft" />
            </div>
            <div style={col()}>
              <label style={label}>Weight (optional)</label>
              <input style={field} value={weight} onChange={e => setWeight(e.target.value)}
                placeholder="e.g. 82 kg" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem' }}>
            <button onClick={handleSkip} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.82rem', color: '#94a3b8', padding: '0.5rem 0', textDecoration: 'underline',
            }}>
              Skip for now
            </button>
            <button style={btn('primary', !name || !dob)} disabled={!name || !dob}
              onClick={() => goToStep('athletic')}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Athletic background ──────────────────────────────────── */}
      {step === 'athletic' && (
        <div style={card}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.3rem' }}>Athletic background</h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
            How would you describe yourself as an athlete?
          </p>

          <p style={sectionTitle}>Experience level</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {ATHLETE_LEVELS.map(l => (
              <div key={l.id} onClick={() => setAthleteLevel(l.id)}
                style={{
                  ...pill(athleteLevel === l.id),
                  flexDirection: 'column' as const, alignItems: 'flex-start',
                  borderRadius: '12px', padding: '0.6rem 1rem',
                }}>
                <span style={{ fontWeight: 600 }}>{l.label}</span>
                <span style={{ fontSize: '11px', opacity: 0.75 }}>{l.desc}</span>
              </div>
            ))}
          </div>

          <p style={sectionTitle}>Sports & activities</p>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '-0.5rem 0 0.75rem' }}>
            Pre-filled from your activity history — adjust as needed.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {COMMON_SPORTS.map(s => (
              <div key={s} style={pill(sports.includes(s))} onClick={() => toggleSport(s)}>{s}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <input value={customSport} onChange={e => setCustomSport(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomSport()}
              placeholder="Add another sport…"
              style={{ ...field, flex: 1 }} />
            <button onClick={addCustomSport} style={btn('ghost')}>Add</button>
          </div>
          {sports.filter(s => !COMMON_SPORTS.includes(s)).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              {sports.filter(s => !COMMON_SPORTS.includes(s)).map(s => (
                <div key={s} style={pill(true)} onClick={() => toggleSport(s)}>{s} ×</div>
              ))}
            </div>
          )}

          <p style={sectionTitle}>In your own words</p>
          <textarea value={athleteDesc} onChange={e => setAthleteDesc(e.target.value)} rows={4}
            placeholder="e.g. I'm a hobbyist mountain bike racer — nothing spectacular, just love being out on trails. I've been riding for 10 years and enter a few events each year. Swimming and running are supplementary for me."
            style={{ ...field, resize: 'vertical', lineHeight: 1.7 }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
            <button style={btn('ghost')} onClick={() => goToStep('identity')}>← Back</button>
            <button style={btn('primary')} onClick={() => goToStep('health')}>Next →</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Health & medical ─────────────────────────────────────── */}
      {step === 'health' && (
        <div style={card}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.3rem' }}>Health & medical history</h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
            This helps Corpus give safe, personalised advice. Share only what you&apos;re comfortable with.
          </p>

          <p style={sectionTitle}>Existing conditions</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {COMMON_CONDITIONS.map(c => (
              <div key={c} style={pill(conditions.includes(c))} onClick={() => toggleCondition(c)}>{c}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <input value={customCondition} onChange={e => setCustomCondition(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomCondition()}
              placeholder="Add a condition not listed…"
              style={{ ...field, flex: 1 }} />
            <button onClick={addCustomCondition} style={btn('ghost')}>Add</button>
          </div>
          {conditions.filter(c => !COMMON_CONDITIONS.includes(c)).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              {conditions.filter(c => !COMMON_CONDITIONS.includes(c)).map(c => (
                <div key={c} style={pill(true)} onClick={() => toggleCondition(c)}>{c} ×</div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={label}>Current medications</label>
            <textarea value={medications} onChange={e => setMedications(e.target.value)} rows={2}
              placeholder="e.g. Lisinopril 10mg (blood pressure), Metformin 500mg…"
              style={{ ...field, resize: 'vertical', lineHeight: 1.6 }} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={label}>Injuries or physical limitations</label>
            <textarea value={injuries} onChange={e => setInjuries(e.target.value)} rows={2}
              placeholder="e.g. Left knee cartilage damage, lower back disc issue, right shoulder impingement…"
              style={{ ...field, resize: 'vertical', lineHeight: 1.6 }} />
          </div>

          <div>
            <label style={label}>Medical history & context</label>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0 0 0.5rem' }}>
              Anything significant — past surgeries, illnesses, recent test results, or patterns worth knowing about.
            </p>
            <textarea value={medicalHistory} onChange={e => setMedicalHistory(e.target.value)} rows={5}
              placeholder="e.g. In November 2024 I contracted Covid followed by suspected Covid-induced myositis. I spent several months recovering and recently returned to training. My CK levels were significantly elevated and are slowly normalising…"
              style={{ ...field, resize: 'vertical', lineHeight: 1.7 }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
            <button style={btn('ghost')} onClick={() => goToStep('athletic')}>← Back</button>
            <button style={btn('primary')} onClick={() => goToStep('goals')}>Next →</button>
          </div>
        </div>
      )}

      {/* ── Step 4: Goals & events ───────────────────────────────────────── */}
      {step === 'goals' && (
        <div style={card}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.3rem' }}>Goals & upcoming events</h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
            What are you working towards? Corpus uses this to frame all its recommendations.
          </p>

          <p style={sectionTitle}>What I&apos;m working towards</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {GOAL_OPTIONS.map(g => (
              <div key={g.id} style={pill(goals.includes(g.id))} onClick={() => toggleGoal(g.id)}>
                <span>{g.emoji}</span><span>{g.label}</span>
              </div>
            ))}
          </div>

          <p style={sectionTitle}>Upcoming events / races</p>
          <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '-0.5rem 0 0.75rem' }}>
            List any events you&apos;re training towards — Corpus will factor in timing and demands.
          </p>
          {events.map((ev, i) => (
            <div key={i} style={{
              background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0',
              padding: '1rem', marginBottom: '0.75rem',
            }}>
              <div style={{ ...row, marginBottom: '0.5rem' }}>
                <div style={col(2)}>
                  <label style={label}>Event name</label>
                  <input style={field} value={ev.name} onChange={e => updateEvent(i, 'name', e.target.value)}
                    placeholder="e.g. Cape Epic, local 10k…" />
                </div>
                <div style={col()}>
                  <label style={label}>Date</label>
                  <input style={field} type="date" value={ev.date} onChange={e => updateEvent(i, 'date', e.target.value)} />
                </div>
              </div>
              <div style={{ ...row, alignItems: 'flex-end' }}>
                <div style={col()}>
                  <label style={label}>Distance / duration</label>
                  <input style={field} value={ev.distance} onChange={e => updateEvent(i, 'distance', e.target.value)}
                    placeholder="e.g. 70 km/day x 3 days" />
                </div>
                <div style={col(2)}>
                  <label style={label}>Notes</label>
                  <input style={field} value={ev.description} onChange={e => updateEvent(i, 'description', e.target.value)}
                    placeholder="e.g. ~1500 m climbing per day, riding with friends" />
                </div>
                {events.length > 1 && (
                  <button onClick={() => removeEvent(i)} style={{ ...btn('danger'), padding: '0.7rem 0.75rem', flexShrink: 0 }}>✕</button>
                )}
              </div>
            </div>
          ))}
          <button onClick={addEvent} style={{ ...btn('ghost'), marginBottom: '1.5rem', fontSize: '0.82rem' }}>
            + Add another event
          </button>

          <div>
            <label style={label}>Training constraints & preferences</label>
            <textarea value={trainingNotes} onChange={e => setTrainingNotes(e.target.value)} rows={4}
              placeholder="e.g. I need to build quad strength without overloading them. I can train 5–6 days a week but need a full rest day. I prefer long slow efforts in zone 2…"
              style={{ ...field, resize: 'vertical', lineHeight: 1.7 }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
            <button style={btn('ghost')} onClick={() => goToStep('health')}>← Back</button>
            <button style={btn('primary')} onClick={goToPreview}>Preview letter →</button>
          </div>
        </div>
      )}

      {/* ── Step 5: Preview ─────────────────────────────────────────────── */}
      {step === 'preview' && (
        <div style={card}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.3rem' }}>
            Your Letter to Corpus
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>
            Corpus reads this every time you ask a question. Edit freely — add or remove anything.
          </p>

          {/* Side-by-side hint showing what a rich letter looks like */}
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px',
            padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.78rem', color: '#15803d',
          }}>
            💡 The more detail you include, the more tailored Corpus&apos;s advice will be. You can always come back and update this.
          </div>

          <textarea
            value={previewEdited ? previewText : generatedLetter}
            onChange={e => { setPreviewText(e.target.value); setPreviewEdited(true); }}
            rows={16}
            style={{ ...field, resize: 'vertical', lineHeight: 1.8, fontSize: '0.875rem' }}
          />

          {existingLetter && (
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
              You have a previous letter — saving this will replace it.
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
            <button style={btn('ghost')} onClick={() => goToStep('goals')}>← Back</button>
            <button
              style={btn('primary', saving || !(previewEdited ? previewText : generatedLetter).trim())}
              disabled={saving || !(previewEdited ? previewText : generatedLetter).trim()}
              onClick={handleSave}>
              {saving ? 'Saving…' : 'Save & go to dashboard →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
