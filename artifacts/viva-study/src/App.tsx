import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import {
  ArrowLeft, ArrowRight, BarChart3, BookOpen, Check, ChevronRight, CircleHelp, Download,
  Filter, Home as HomeIcon, KeyRound, Library, Pencil, Plus, RotateCcw,
  Search, Settings as SettingsIcon, Sparkles, Target, Trash2, Upload, X, Zap,
} from 'lucide-react';
import { db, ensureSeed, type AIAccount, type AnswerType, type FollowUpAnswer, type Question, type ReviewStatus, type StudyTarget, type DailyStudyTime } from '@/lib/db';
import { detectProviderFromKey, generateFollowUpAnswers, generateKnowledgeCard, regenerateKnowledgeSection, testAIAccount, type KnowledgeSection } from '@/lib/ai';
import { useAppStore } from '@/lib/store';

const statusLabel: Record<ReviewStatus, string> = { new: 'নতুন', learning: 'শেখা হচ্ছে', weak: 'দুর্বল', known: 'জানা', mastered: 'আয়ত্তে' };
const statusTone: Record<ReviewStatus, string> = { new: 'hsl(195 45% 49%)', learning: 'hsl(25 74% 65%)', weak: 'hsl(4 63% 50%)', known: 'hsl(169 42% 32%)', mastered: 'hsl(43 75% 48%)' };
const today = () => new Date().toISOString().slice(0, 10);
const localDateKey = (date = new Date()) => {
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const formatStudyTime = (seconds: number) => {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return hrs ? `${hrs} ঘ ${rem} মি` : `${rem} মিনিট`;
};

async function addStudySeconds(startMs: number, endMs: number) {
  if (endMs <= startMs) return;
  let cursor = startMs;
  while (cursor < endMs) {
    const current = new Date(cursor);
    const nextMidnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1).getTime();
    const chunkEnd = Math.min(endMs, nextMidnight);
    const date = localDateKey(current);
    const seconds = Math.max(0, Math.round((chunkEnd - cursor) / 1000));
    if (seconds) {
      const existing = await db.studyTime.get(date);
      if (existing) await db.studyTime.put({ ...existing, seconds: existing.seconds + seconds, updatedAt: new Date().toISOString() });
      else await db.studyTime.put({ date, seconds, updatedAt: new Date().toISOString() });
    }
    cursor = chunkEnd;
  }
}

function useStudyTimeTracker() {
  const lastMark = useRef<number>(Date.now());
  const active = useRef<boolean>(document.visibilityState === 'visible');
  const flushing = useRef(false);
  useEffect(() => {
    const flush = async () => {
      if (!active.current || flushing.current) { lastMark.current = Date.now(); return; }
      const now = Date.now(); const from = lastMark.current; lastMark.current = now;
      if (now - from < 250) return;
      flushing.current = true;
      try { await addStudySeconds(from, now); } finally { flushing.current = false; }
    };
    const timer = window.setInterval(() => { void flush(); }, 10000);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { void flush(); active.current = false; }
      else { active.current = true; lastMark.current = Date.now(); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const onPageHide = () => { void flush(); };
    window.addEventListener('pagehide', onPageHide);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', onPageHide); void flush(); };
  }, []);
}

// Bump this string on every meaningful change so it's easy to eyeball, after
// a deploy, whether the live site is actually running the new build.
const BUILD_TAG = 'v2026-09-22-manual-answer-save-read-on-add';
const isDue = (q: Question) => q.nextReview.slice(0, 10) <= today();
const formatDate = (date: string) => new Intl.DateTimeFormat('bn-BD', { day: 'numeric', month: 'short' }).format(new Date(date));

async function reload() {
  const questions = await db.questions.toArray();
  const target = (await db.targets.where('active').equals(1).first()) ?? (await db.targets.toCollection().first());
  const accounts = await db.accounts.toArray();
  useAppStore.getState().setData({ questions, target, accounts });
}

function IconButton({ label, children, onClick, className = '' }: { label: string; children: ReactNode; onClick?: () => void; className?: string }) {
  return <button type="button" aria-label={label} title={label} data-testid={`button-${label.replace(/\s/g, '-')}`} onClick={onClick} className={`btn btn-ghost ${className}`}>{children}</button>;
}

function Badge({ status }: { status: ReviewStatus }) {
  return <span className="pill" style={{ color: statusTone[status], background: `${statusTone[status]}18` }} data-testid={`status-${status}`}>{statusLabel[status]}</span>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const nav = [
    { href: '/', label: 'আজকের পড়া', icon: HomeIcon },
    { href: '/questions', label: 'প্রশ্নভাণ্ডার', icon: Library },
    { href: '/review', label: 'রিভিশন', icon: RotateCcw },
    { href: '/progress', label: 'অগ্রগতি', icon: BarChart3 },
    { href: '/settings', label: 'সেটিংস', icon: SettingsIcon },
  ];
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="flex items-center gap-3 mb-10 px-2" data-testid="link-logo">
        <span className="logo-mark">ভি</span><span className="display text-lg font-bold">Viva Study</span>
      </Link>
      <div className="eyebrow mb-3 px-3" style={{ color: 'hsl(var(--sidebar-foreground)/.45)' }}>আপনার workspace</div>
      <nav className="flex flex-col gap-1">
        {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${location === href || (href !== '/' && location.startsWith(href)) ? 'active' : ''}`} data-testid={`link-nav-${label}`}><Icon size={18} /><span>{label}</span></Link>)}
      </nav>
      <div className="mt-auto p-3 rounded-xl" style={{ background: 'hsl(var(--sidebar-accent))' }}>
        <div className="flex items-center gap-2 text-sm font-semibold"><Target size={16} /> আজকের লক্ষ্য</div>
        <p className="text-xs mt-2" style={{ color: 'hsl(var(--sidebar-foreground)/.6)' }}>অল্প অল্প করে, প্রতিদিন।</p>
      </div>
      <div className="text-[10px] mt-3 px-1 opacity-40" data-testid="text-sidebar-build-tag">{BUILD_TAG}</div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="mobile-only flex items-center gap-2"><span className="logo-mark">ভি</span><span className="display font-bold">Viva Study</span></div>
        <div className="hidden md:block text-sm muted">{location === '/' ? 'ফোকাসড প্রস্তুতি' : nav.find(n => location.startsWith(n.href) && n.href !== '/')?.label}</div>
        <Link href="/add" className="btn btn-primary" data-testid="link-add-top"><Plus size={17} /><span className="hidden sm:inline">নতুন প্রশ্ন</span><span className="sm:hidden">যোগ করুন</span></Link>
      </header>
      {children}
    </main>
    <nav className="mobile-nav">
      {nav.slice(0, 4).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={location === href || (href !== '/' && location.startsWith(href)) ? 'active' : ''} data-testid={`mobile-nav-${label}`}><Icon size={19} /><span>{label.replace('আজকের পড়া', 'হোম')}</span></Link>)}
      <Link href="/settings" className={location.startsWith('/settings') ? 'active' : ''} data-testid="mobile-nav-settings"><SettingsIcon size={19} /><span>সেটিংস</span></Link>
    </nav>
  </div>;
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex items-end justify-between gap-4 mb-7 reveal"><div>{eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}<h1 className="display text-3xl md:text-4xl font-bold tracking-tight">{title}</h1>{description && <p className="muted mt-2 max-w-xl">{description}</p>}</div>{action}</div>;
}

function Home() {
  const { questions, target } = useAppStore();
  const due = questions.filter(isDue);
  const weak = questions.filter(q => q.reviewStatus === 'weak');
  const newQ = questions.filter(q => q.reviewStatus === 'new');
  // প্রশ্ন Add/Save করার সময় সেটি পড়া হিসেবে ধরা হবে।
  // একই প্রশ্ন আজ Add করে আবার Review করলেও একবারই count হবে।
  const todayKey = new Date().toDateString();
  const readTodayIds = new Set<number>();
  questions.forEach(q => {
    if (q.id && new Date(q.createdAt).toDateString() === todayKey) readTodayIds.add(q.id);
    if (q.id && q.reviewCount > 0 && new Date(q.updatedAt).toDateString() === todayKey) readTodayIds.add(q.id);
  });
  const readToday = readTodayIds.size;
  const goalQuestions = target?.dailyQuestions ?? 5;
  const goalMinutes = target?.dailyMinutes ?? 25;
  const revisionPct = target?.revisionPercent ?? 60;
  const newPct = 100 - revisionPct;
  const revisionMinutes = Math.round(goalMinutes * revisionPct / 100);
  const newMinutes = goalMinutes - revisionMinutes;
  const progressPct = Math.min(100, Math.round((readToday / (goalQuestions || 1)) * 100));
  const topics = [...new Set(questions.map(q => q.topic))].slice(0, 4);
  return <div className="workspace">
    <PageTitle eyebrow="ড্যাশবোর্ড" title="আজ কী বুঝে নেবেন?" description="মুখস্থ নয়—উত্তরের ভেতরের যুক্তিটা ধরুন। আপনার পড়ার জায়গা থেকেই শুরু করি।" action={<Link href="/settings" className="btn btn-secondary" data-testid="link-customize-goal"><Target size={16} /> লক্ষ্য কাস্টমাইজ</Link>} />

    <section className="card shadow-soft p-5 md:p-7 mb-5 reveal" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div><div className="eyebrow mb-2" style={{ color: 'hsl(var(--accent))' }}>আজকের লক্ষ্য</div><div className="display text-3xl font-bold">{readToday} / {goalQuestions} প্রশ্ন</div><p className="mt-2 opacity-75">আরও একটু এগোলেই আজকের ছন্দ তৈরি হবে।</p></div>
        <div className="flex items-center gap-3"><Link href="/review" className="btn" style={{ background: 'hsl(var(--accent))', color: 'hsl(var(--foreground))' }} data-testid="link-start-review"><Zap size={17} /> রিভিশন শুরু</Link><Link href="/add" className="btn" style={{ background: 'hsl(var(--sidebar-accent))', color: 'hsl(var(--sidebar-foreground))' }} data-testid="link-add-question"><Plus size={17} /> প্রশ্ন যোগ</Link></div>
      </div>
      <div className="progress-track mt-6" style={{ background: 'hsl(var(--primary-foreground)/.18)' }}><div className="progress-fill" style={{ width: `${progressPct}%`, background: 'hsl(var(--accent))' }} /></div>
    </section>

    <section className="card p-5 md:p-7 mb-5 reveal">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div><div className="eyebrow">প্র্যাকটিস টাইম বণ্টন</div><h2 className="display text-xl font-bold mt-1">আজকের {goalMinutes} মিনিট কীভাবে ভাগ হবে</h2></div>
        <Link href="/settings" className="text-sm font-semibold shrink-0" style={{ color: 'hsl(var(--primary))' }} data-testid="link-adjust-split">বদলাতে চান? <ChevronRight size={15} className="inline" /></Link>
      </div>
      <div className="h-4 rounded-full overflow-hidden flex" style={{ background: 'hsl(var(--secondary))' }}>
        <div style={{ width: `${revisionPct}%`, background: 'hsl(var(--primary))' }} />
        <div style={{ width: `${newPct}%`, background: 'hsl(var(--accent))' }} />
      </div>
      <div className="grid grid-cols-2 gap-4 mt-5">
        <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: 'hsl(var(--primary))' }} /><div><div className="font-bold">রিভিশন — {revisionPct}%</div><div className="muted text-sm">≈ {revisionMinutes} মিনিট</div></div></div>
        <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: 'hsl(var(--accent))' }} /><div><div className="font-bold">নতুন প্রশ্ন — {newPct}%</div><div className="muted text-sm">≈ {newMinutes} মিনিট</div></div></div>
      </div>
    </section>

    <div className="grid-auto mb-5">
      <StatCard icon={<RotateCcw size={18} />} label="আজ রিভিশন বাকি" value={due.length} tone="accent" href="/review" />
      <StatCard icon={<CircleHelp size={18} />} label="আরও একবার দেখুন" value={weak.length} tone="danger" href="/questions?status=weak" />
      <StatCard icon={<Sparkles size={18} />} label="নতুন প্রশ্ন" value={newQ.length} tone="accent" href="/questions?status=new" />
      <StatCard icon={<BookOpen size={18} />} label="মোট জ্ঞান কার্ড" value={questions.length} tone="teal" href="/questions" />
    </div>

    <div className="grid md:grid-cols-[1.25fr_.75fr] gap-5">
      <section className="card p-5 md:p-6 reveal">
        <div className="flex items-center justify-between mb-5"><div><div className="eyebrow">দুর্বল জায়গা</div><h2 className="display text-xl font-bold mt-1">আরেকবার ভাবুন</h2></div><Link href="/questions?status=weak" className="text-sm font-semibold" style={{ color: 'hsl(var(--primary))' }} data-testid="link-see-weak">সব দেখুন <ChevronRight size={15} className="inline" /></Link></div>
        {weak.length ? weak.slice(0, 3).map(q => <QuestionRow key={q.id} q={q} />) : <Empty compact title="এখন দুর্বল প্রশ্ন নেই" text="রিভিশন করতে থাকুন—এখানেই আপনার নজর রাখার জায়গাগুলো দেখা যাবে।" />}
      </section>
      <section className="card p-5 md:p-6 reveal" style={{ animationDelay: '.06s' }}>
        <div className="eyebrow">বিষয় ধরে</div><h2 className="display text-xl font-bold mt-1 mb-5">সাম্প্রতিক টপিক</h2>
        <div className="flex flex-col gap-3">{topics.map(topic => <Link href={`/questions?topic=${encodeURIComponent(topic)}`} key={topic} className="flex items-center justify-between py-2 group" data-testid={`link-topic-${topic}`}><span className="font-medium">{topic}</span><span className="muted text-sm">{questions.filter(q => q.topic === topic).length}টি <ChevronRight size={15} className="inline transition-transform group-hover:translate-x-1" /></span></Link>)}</div>
      </section>
    </div>
  </div>;
}

function StatCard({ icon, label, value, tone, href }: { icon: ReactNode; label: string; value: number; tone: string; href: string }) {
  const colorVar = tone === 'teal' ? 'primary' : tone === 'danger' ? 'destructive' : tone;
  return <Link href={href} className="card p-4 flex items-center gap-3 hover-elevate" data-testid={`stat-${label}`}><div className="w-10 h-10 rounded-xl grid place-items-center" style={{ color: `hsl(var(--${colorVar}))`, background: `hsl(var(--${colorVar}) / .1)` }}>{icon}</div><div><div className="stat-number">{value}</div><div className="muted text-xs mt-1">{label}</div></div></Link>;
}

function QuestionRow({ q, onDelete }: { q: Question; onDelete?: (q: Question) => void }) {
  return <div className="flex items-start gap-3 py-4 border-b last:border-0" style={{ borderColor: 'hsl(var(--border))' }}>
    <div className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: statusTone[q.reviewStatus] }} />
    <div className="min-w-0 flex-1"><Link href={`/questions/${q.id}`} className="font-semibold leading-snug hover:underline" data-testid={`link-question-${q.id}`}>{q.question}</Link><div className="flex items-center gap-2 mt-2 flex-wrap">{(q.subject || q.topic) && <span className="text-xs muted">{[q.subject, q.topic].filter(Boolean).join(' · ')}</span>}<Badge status={q.reviewStatus} /></div></div>
    {onDelete && <div className="flex"><Link href={`/questions/${q.id}/edit`} className="btn btn-ghost p-2 min-h-0" data-testid={`edit-question-${q.id}`}><Pencil size={16} /></Link><IconButton label={`মুছুন ${q.id}`} onClick={() => onDelete(q)} className="p-2 min-h-0"><Trash2 size={16} /></IconButton></div>}
  </div>;
}

function Empty({ title, text, action, compact = false }: { title: string; text: string; action?: ReactNode; compact?: boolean }) {
  return <div className={compact ? 'py-8 text-center' : 'empty-state'}><div className="mx-auto mb-3 w-11 h-11 rounded-full grid place-items-center" style={{ background: 'hsl(var(--secondary))', color: 'hsl(var(--primary))' }}><BookOpen size={19} /></div><h3 className="font-bold">{title}</h3><p className="muted text-sm mt-1 max-w-sm mx-auto">{text}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

function Questions() {
  const { questions } = useAppStore();
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [subject, setSubject] = useState('all'); const [sort, setSort] = useState('updated'); const [confirm, setConfirm] = useState<Question>();
  const params = new URLSearchParams(location.search); const topicParam = params.get('topic') ?? ''; const statusParam = params.get('status') ?? '';
  useEffect(() => { if (statusParam) setStatus(statusParam); }, [statusParam]);
  const filtered = useMemo(() => questions.filter(q => {
    const hay = [q.question, q.shortAnswer, q.detailedAnswer, q.subject, q.topic, ...q.tags].join(' ').toLowerCase();
    return (!search || hay.includes(search.toLowerCase())) && (status === 'all' || q.reviewStatus === status) && (subject === 'all' || q.subject === subject) && (!topicParam || q.topic === topicParam);
  }).sort((a, b) => sort === 'question' ? a.question.localeCompare(b.question) : sort === 'due' ? a.nextReview.localeCompare(b.nextReview) : b.updatedAt.localeCompare(a.updatedAt)), [questions, search, status, subject, sort, topicParam]);
  const subjects = [...new Set(questions.map(q => q.subject))];
  async function remove() { if (!confirm?.id) return; await db.questions.delete(confirm.id); setConfirm(undefined); await reload(); }
  return <div className="workspace">
    <PageTitle eyebrow="আপনার লাইব্রেরি" title="প্রশ্নভাণ্ডার" description="প্রশ্ন খুঁজুন, খুলে দেখুন, আর প্রয়োজনমতো আপনার ভাষায় ঠিক করে নিন।" action={<Link href="/add" className="btn btn-primary" data-testid="link-add-library"><Plus size={17} /> নতুন কার্ড</Link>} />
    <div className="card p-4 mb-5">
      <div className="relative mb-3"><Search size={18} className="absolute left-3 top-3 muted" /><input className="input pl-10" value={search} onChange={e => setSearch(e.target.value)} placeholder="প্রশ্ন, উত্তর, বিষয় বা ট্যাগ দিয়ে খুঁজুন" aria-label="প্রশ্ন খুঁজুন" data-testid="input-question-search" /></div>
      <div className="flex flex-wrap gap-2"><Filter size={17} className="muted mt-2 mr-1" /><select className="input w-auto py-2" value={subject} onChange={e => setSubject(e.target.value)} aria-label="বিষয় ফিল্টার" data-testid="select-subject"><option value="all">সব বিষয়</option>{subjects.map(s => <option key={s}>{s}</option>)}</select><select className="input w-auto py-2" value={status} onChange={e => setStatus(e.target.value)} aria-label="স্ট্যাটাস ফিল্টার" data-testid="select-status"><option value="all">সব স্ট্যাটাস</option>{Object.entries(statusLabel).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select><select className="input w-auto py-2" value={sort} onChange={e => setSort(e.target.value)} aria-label="সাজান" data-testid="select-sort"><option value="updated">সাম্প্রতিক</option><option value="due">রিভিশন আগে</option><option value="question">বর্ণানুক্রমে</option></select><span className="muted text-sm self-center ml-auto">{filtered.length}টি কার্ড</span></div>
    </div>
    <section className="card px-5 md:px-6">{filtered.length ? filtered.map(q => <QuestionRow key={q.id} q={q} onDelete={setConfirm} />) : <Empty title="কোনো কার্ড পাওয়া যায়নি" text="অন্য শব্দ বা ফিল্টার দিয়ে চেষ্টা করুন।" action={<Link href="/add" className="btn btn-secondary" data-testid="link-empty-add"><Plus size={16} /> প্রশ্ন যোগ করুন</Link>} />}</section>
    {confirm && <ConfirmDialog q={confirm} onCancel={() => setConfirm(undefined)} onConfirm={remove} />}
  </div>;
}

function ConfirmDialog({ q, onCancel, onConfirm }: { q: Question; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'hsl(var(--foreground)/.35)' }} role="dialog" aria-modal="true"><div className="card p-6 w-full max-w-md shadow-soft"><div className="flex justify-between gap-3"><h2 className="display text-xl font-bold">কার্ডটি মুছবেন?</h2><IconButton label="বন্ধ করুন" onClick={onCancel}><X size={18} /></IconButton></div><p className="muted text-sm mt-3">“{q.question}” স্থায়ীভাবে মুছে যাবে। এই কাজটি ফিরিয়ে আনা যাবে না।</p><div className="flex justify-end gap-2 mt-6"><button className="btn btn-secondary" onClick={onCancel} data-testid="button-cancel-delete">থাক</button><button className="btn btn-danger" onClick={onConfirm} data-testid="button-confirm-delete"><Trash2 size={16} /> মুছে ফেলুন</button></div></div></div>;
}

function Detail() {
  const { id } = useParams<{ id: string }>(); const q = useAppStore(s => s.questions.find(item => item.id === Number(id))); const [show, setShow] = useState(false);
  if (!q) return <div className="workspace"><Empty title="কার্ডটি পাওয়া যায়নি" text="হয়তো এটি মুছে ফেলা হয়েছে।" action={<Link href="/questions" className="btn btn-secondary" data-testid="link-back-library">প্রশ্নভাণ্ডারে ফিরুন</Link>} /></div>;
  return <div className="workspace">
    <Link href="/questions" className="inline-flex items-center gap-2 text-sm muted mb-6" data-testid="link-back-questions"><ArrowLeft size={16} /> প্রশ্নভাণ্ডার</Link>
    <div className="flex items-center justify-between gap-3 mb-5"><div className="flex items-center gap-2 flex-wrap"><Badge status={q.reviewStatus} /><span className="muted text-sm">{q.subject} · {q.topic}</span></div><div className="flex gap-1"><Link href={`/questions/${q.id}/edit`} className="btn btn-secondary" data-testid="link-edit-detail"><Pencil size={16} /> সম্পাদনা</Link></div></div>
    <article className="card shadow-soft p-5 md:p-9">
      <h1 className="display text-2xl md:text-4xl font-bold leading-tight max-w-3xl">{q.question}</h1>
      <div className="flex flex-wrap gap-2 mt-5">{q.tags.map(tag => <span className="pill" key={tag}>#{tag}</span>)}</div>
      {!show ? <div className="mt-10 rounded-xl p-8 text-center" style={{ background: 'hsl(var(--secondary)/.6)' }}><Sparkles size={21} className="mx-auto mb-3" style={{ color: 'hsl(var(--accent-foreground))' }} /><p className="font-semibold">আগে নিজের মতো করে উত্তর দিন</p><p className="muted text-sm mt-1">মনে মনে বলুন—তারপর উত্তর মিলিয়ে নিন।</p><button className="btn btn-primary mt-5" onClick={() => setShow(true)} data-testid="button-show-answer">উত্তর দেখুন <ArrowRight size={16} /></button></div> :
        <div className="mt-9 space-y-7 reveal">
          {q.shortAnswer && <AnswerSection title="সংক্ষিপ্ত উত্তর" text={q.shortAnswer} />}
          {q.simpleExplanation && <AnswerSection title="সহজ করে" text={q.simpleExplanation} />}
          {q.keyPoints.length > 0 && <AnswerSection title="মূল পয়েন্ট" text={q.keyPoints.map(x => `• ${x}`).join('\n')} />}
          {q.vivaAnswer && <AnswerSection title="ভাইভায় বলতে পারেন" text={q.vivaAnswer} />}
          {q.detailedAnswer && <AnswerSection title={q.answerType === 'pasted' ? 'নিজের উত্তর' : 'বিস্তারিত নোট'} text={q.detailedAnswer} />}
          {q.followUps.length > 0 && <section><div className="eyebrow mb-3">সম্ভাব্য পাল্টা প্রশ্ন ও উত্তর</div><div className="space-y-6">{q.followUps.map((f, i) => { const answer = q.followUpAnswers?.find(x => x.question === f)?.answer || q.followUpAnswers?.[i]?.answer || ''; return <div key={`${f}-${i}`} className="space-y-2"><div className="font-semibold">প্রশ্ন: {f}</div><AnswerSection title="উত্তর" text={answer || 'এই পাল্টা প্রশ্নের উত্তর এখনও তৈরি হয়নি।'} /></div>; })}</div></section>}
        </div>}
      <div className="mt-9 pt-5 border-t flex flex-wrap items-center justify-between gap-3"><span className="muted text-xs">শেষ রিভিশন: {q.reviewCount ? formatDate(q.updatedAt) : 'এখনও হয়নি'} · পরেরটি: {formatDate(q.nextReview)}</span>{q.sourceName && <span className="muted text-xs">উৎস: {q.sourceName}</span>}</div>
    </article>
  </div>;
}
function AnswerSection({ title, text }: { title: string; text: string }) { return <section><div className="eyebrow mb-2">{title}</div><div className="answer-block text-[15px]">{text}</div></section>; }

function EditableAnswerSection({ title, text, onChange }: { title: string; text: string; onChange: (value: string) => void }) {
  return <section>
    <div className="eyebrow mb-2">{title}</div>
    <div
      className="answer-block editable-answer"
      contentEditable
      suppressContentEditableWarning
      onBlur={e => onChange(e.currentTarget.innerText.trim())}
      data-testid={`editable-answer-${title}`}
    >{text}</div>
  </section>;
}

const blankQuestion = (): Question => ({ question: '', subject: '', topic: '', tags: [], shortAnswer: '', detailedAnswer: '', keyPoints: [], simpleExplanation: '', vivaAnswer: '', followUps: [], followUpAnswers: [], personalNote: '', sourceUrl: '', sourceName: '', answerType: 'manual', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), reviewStatus: 'new', nextReview: new Date().toISOString(), interval: 0, ease: 2.5, reviewCount: 0 });
function Editor({ edit = false }: { edit?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const existing = useAppStore(s => s.questions.find(q => q.id === Number(id)));
  const accounts = useAppStore(s => s.accounts);
  const [form, setForm] = useState<Question>(existing ?? blankQuestion());
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiNotice, setAiNotice] = useState('');
  const [, navigate] = useLocation();
  useEffect(() => { if (existing) setForm(existing); }, [existing]);

  const update = (key: keyof Question, value: string | string[] | FollowUpAnswer[]) => setForm(f => ({ ...f, [key]: value }));
  const hasDraft = Boolean(form.shortAnswer || form.simpleExplanation || form.keyPoints.length || form.vivaAnswer || form.detailedAnswer || form.followUps.length || form.followUpAnswers?.length);
  const updateListFromText = (key: 'keyPoints' | 'followUps', value: string) => {
    const list = value.split('\n').map(s => s.trim()).filter(Boolean);
    if (key === 'followUps') {
      const old = form.followUpAnswers ?? [];
      const next = list.map(question => old.find(item => item.question === question) ?? ({ question, answer: '' }));
      setForm(f => ({ ...f, followUps: list, followUpAnswers: next }));
      return;
    }
    update(key, list);
  };
  const updateFollowUpAnswer = (question: string, answer: string) => setForm(f => ({ ...f, followUpAnswers: (f.followUpAnswers ?? []).map(item => item.question === question ? { ...item, answer } : item) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.question.trim()) return;
    const pasted = form.detailedAnswer.trim();
    const item = {
      ...form,
      detailedAnswer: pasted,
      shortAnswer: form.answerType === 'pasted' ? '' : form.shortAnswer,
      simpleExplanation: form.answerType === 'pasted' ? '' : form.simpleExplanation,
      keyPoints: form.answerType === 'pasted' ? [] : form.keyPoints,
      vivaAnswer: form.answerType === 'pasted' ? '' : form.vivaAnswer,
      followUps: form.answerType === 'pasted' ? [] : form.followUps,
      followUpAnswers: form.answerType === 'pasted' ? [] : form.followUpAnswers,
      updatedAt: new Date().toISOString()
    };
    if (edit && form.id) await db.questions.put(item); else await db.questions.add(item);
    await reload();
    setSaved(true);
    setTimeout(() => navigate(edit ? `/questions/${form.id}` : '/questions'), 350);
  }

  async function generate() {
    if (!form.question.trim()) {
      setAiNotice('আগে প্রশ্নটি লিখুন, তারপর AI দিয়ে উত্তর তৈরি করুন।');
      return;
    }
    setGenerating(true);
    setAiNotice('AI উত্তর তৈরি হচ্ছে…');
    try {
      const result = await generateKnowledgeCard(accounts, form.question, form.subject, form.topic);
      let followUpAnswers: FollowUpAnswer[] = result.card.followUps.map(question => ({ question, answer: '' }));
      let followUpNotice = '';
      if (result.card.followUps.length) {
        setAiNotice('মূল উত্তর তৈরি হয়েছে। এখন পাল্টা প্রশ্নগুলোর উত্তর তৈরি হচ্ছে…');
        const followResult = await generateFollowUpAnswers(accounts, result.account, form.question, result.card.followUps, form.subject, form.topic);
        followUpAnswers = followResult.answers.length ? followResult.answers : followUpAnswers;
        if (followResult.failures.length) followUpNotice = ` ${followResult.answers.length}/${result.card.followUps.length}টি পাল্টা প্রশ্নের উত্তর তৈরি হয়েছে।`;
        for (const account of followResult.accountsUsed) {
          if (account.id) await db.accounts.update(account.id, { status: 'ready', totalRequests: account.totalRequests + 1, lastUsed: new Date().toISOString(), lastError: undefined });
        }
      }
      setForm(current => ({ ...current, ...result.card, followUpAnswers, answerType: 'ai' }));
      if (result.account.id) await db.accounts.update(result.account.id, { status: 'ready', totalRequests: result.account.totalRequests + 1, lastUsed: new Date().toISOString(), lastError: undefined });
      await reload();
      setAiNotice(`AI উত্তর ও পাল্টা প্রশ্নের উত্তর তৈরি হয়েছে।${followUpNotice} প্রয়োজন হলে লেখার ওপর ট্যাপ করে সম্পাদনা করুন, তারপর সেভ করুন।`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setAiNotice(`AI উত্তর তৈরি হয়নি। আসল error:\n${detail}`);
    } finally {
      setGenerating(false);
    }
  }

  return <div className="workspace max-w-4xl">
    <Link href={edit ? `/questions/${id}` : '/questions'} className="inline-flex items-center gap-2 text-sm muted mb-6" data-testid="link-editor-back"><ArrowLeft size={16} /> ফিরে যান</Link>
    <PageTitle eyebrow={edit ? 'কার্ড ঠিক করুন' : 'নতুন প্রশ্ন'} title={edit ? 'উত্তরটি আরও নিজের করুন' : 'একটি প্রশ্ন তৈরি করুন'} description="শুধু প্রশ্নটি লিখুন। AI প্রয়োজনীয় উত্তর তৈরি করে দেবে—অতিরিক্ত তথ্যের বাক্স পূরণ করার দরকার নেই।" />
    <form onSubmit={submit} className="space-y-7">
      <section>
        <div className="eyebrow mb-3">প্রশ্ন</div>
        <textarea
          id="field-question"
          className="input question-editor"
          value={form.question}
          onChange={e => update('question', e.target.value)}
          placeholder="যে প্রশ্নটি ভাইভায় আসতে পারে…"
          data-testid="input-question"
          autoFocus
        />
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button type="button" className="btn btn-primary" onClick={generate} disabled={generating} data-testid="button-generate-ai">
            <Sparkles size={16} />{generating ? 'উত্তর তৈরি হচ্ছে…' : 'AI দিয়ে উত্তর তৈরি'}
          </button>
          {hasDraft && <span className="pill">উত্তর প্রস্তুত</span>}
        </div>
        <div className="mt-5">
          <div className="eyebrow mb-2">নিজের উত্তর</div>
          <textarea
            className="input min-h-[170px] resize-y"
            value={form.detailedAnswer}
            onChange={e => setForm(f => ({ ...f, detailedAnswer: e.target.value, answerType: 'pasted' }))}
            placeholder="নিজের উত্তর এখানে লিখুন বা কপি করে পেস্ট করুন…"
            data-testid="textarea-pasted-answer"
          />
          <p className="muted text-xs mt-2">AI ব্যবহার না করেও এই উত্তরটি সরাসরি সেভ করতে পারবেন।</p>
        </div>
        {aiNotice && <div className="ai-diagnostic mt-3" role="status">{aiNotice}</div>}
      </section>

      {hasDraft && <section className="generated-answer">
        <div className="eyebrow mb-1">উত্তর</div>
        <p className="muted text-sm mb-7">বক্সের বদলে পুরো জায়গায় উত্তর দেখানো হচ্ছে। লেখার ওপর ট্যাপ করে প্রয়োজন হলে সরাসরি সম্পাদনা করুন।</p>
        <div className="space-y-8">
          <EditableAnswerSection title="এক লাইনের উত্তর" text={form.shortAnswer} onChange={value => update('shortAnswer', value)} />
          <EditableAnswerSection title="সহজ করে বুঝলে" text={form.simpleExplanation} onChange={value => update('simpleExplanation', value)} />
          {form.keyPoints.length > 0 && <EditableAnswerSection title="মূল পয়েন্ট" text={form.keyPoints.join('\n')} onChange={value => updateListFromText('keyPoints', value)} />}
          <EditableAnswerSection title="ভাইভায় বলতে পারেন" text={form.vivaAnswer} onChange={value => update('vivaAnswer', value)} />
          <EditableAnswerSection title="বিস্তারিত নোট" text={form.detailedAnswer} onChange={value => update('detailedAnswer', value)} />
          {form.followUps.length > 0 && <EditableAnswerSection title="সম্ভাব্য পাল্টা প্রশ্ন" text={form.followUps.join('\n')} onChange={value => updateListFromText('followUps', value)} />}
          {(form.followUpAnswers ?? []).some(item => item.answer) && <section><div className="eyebrow mb-3">পাল্টা প্রশ্নের উত্তর</div><div className="space-y-6">{(form.followUpAnswers ?? []).map((item, index) => <div key={`${item.question}-${index}`}><div className="font-semibold mb-2">প্রশ্ন: {item.question}</div><EditableAnswerSection title="উত্তর" text={item.answer} onChange={value => updateFollowUpAnswer(item.question, value)} /></div>)}</div></section>}
        </div>
      </section>}

      <div className="flex justify-end pt-2">
        <button type="submit" className="btn btn-primary" disabled={!form.question.trim() || generating} data-testid="button-save-question">
          <Check size={16} /> {saved ? 'সেভ হয়েছে' : edit ? 'পরিবর্তন সেভ করুন' : 'প্রশ্ন সেভ করুন'}
        </button>
      </div>
    </form>
  </div>;
}

function Review() {
  const { questions } = useAppStore(); const queue = useMemo(() => questions.filter(isDue).sort((a, b) => (a.reviewStatus === 'weak' ? -1 : 1) - (b.reviewStatus === 'weak' ? -1 : 1)), [questions]); const [index, setIndex] = useState(0); const [show, setShow] = useState(false); const [done, setDone] = useState(0); const q = queue[index];
  async function rate(rating: 'forgot' | 'hard' | 'good' | 'easy') { if (!q?.id) return; const days = rating === 'forgot' ? 1 : rating === 'hard' ? 2 : rating === 'good' ? 5 : 10; const interval = rating === 'forgot' ? 1 : Math.max(days, Math.round((q.interval || 1) * (rating === 'easy' ? 2.1 : rating === 'good' ? 1.6 : 1.15))); const status: ReviewStatus = rating === 'forgot' ? 'weak' : interval >= 30 ? 'mastered' : rating === 'hard' ? 'learning' : 'known'; await db.questions.update(q.id, { reviewStatus: status, nextReview: new Date(Date.now() + interval * 86400000).toISOString(), interval, ease: Math.max(1.3, q.ease + (rating === 'easy' ? .15 : rating === 'forgot' ? -.2 : 0)), reviewCount: q.reviewCount + 1, updatedAt: new Date().toISOString() }); await db.events.add({ questionId: q.id, rating, reviewedAt: new Date().toISOString() }); await reload(); setDone(d => d + 1); setShow(false); }
  if (!q) return <div className="workspace"><PageTitle eyebrow="রিভিশন" title="আজকের কাজ শেষ।" description="এখন একটু বিরতি নিন। শেখা জিনিসকে সময় দিতে হয়।" /><Empty title="কোনো কার্ড বাকি নেই" text="নতুন প্রশ্ন যোগ করুন, অথবা আগামী রিভিশনের জন্য ফিরে আসুন।" action={<Link href="/add" className="btn btn-primary" data-testid="link-review-add"><Plus size={16} /> নতুন প্রশ্ন যোগ</Link>} /></div>;
  return <div className="workspace max-w-3xl"><div className="flex items-center justify-between mb-7"><div><div className="eyebrow">আজকের রিভিশন</div><h1 className="display text-3xl font-bold mt-1">কার্ড {done + 1} <span className="muted text-lg font-normal">/ {queue.length}</span></h1></div>{q.subject && <span className="pill">{q.subject}</span>}</div><div className="progress-track mb-5"><div className="progress-fill" style={{ width: `${(done / (queue.length || 1)) * 100}%` }} /></div><article className="card shadow-soft p-6 md:p-10"><div className="flex items-center justify-between mb-8"><Badge status={q.reviewStatus} /><span className="muted text-xs">ভাবার সময় নিন</span></div><h2 className="display text-2xl md:text-3xl font-bold leading-snug">{q.question}</h2>{!show ? <div className="text-center mt-12"><p className="muted text-sm">মনে মনে উত্তরটি সাজিয়ে নিন।</p><button className="btn btn-primary mt-4" onClick={() => setShow(true)} data-testid="button-review-show">উত্তর দেখুন <ArrowRight size={16} /></button></div> : <div className="mt-9 reveal"><div className="border-t pt-6 space-y-8" style={{ borderColor: 'hsl(var(--border))' }}><AnswerSection title="সংক্ষিপ্ত উত্তর" text={q.shortAnswer} /><AnswerSection title="সহজ করে বুঝলে" text={q.simpleExplanation} /><AnswerSection title="মূল পয়েন্ট" text={q.keyPoints.map(x => `• ${x}`).join('\n')} /><AnswerSection title="ভাইভায় বলতে পারেন" text={q.vivaAnswer} /><AnswerSection title="বিস্তারিত নোট" text={q.detailedAnswer} />{q.followUps.length > 0 && <section><div className="eyebrow mb-3">সম্ভাব্য পাল্টা প্রশ্ন ও উত্তর</div><div className="space-y-6">{q.followUps.map((f, i) => { const answer = q.followUpAnswers?.find(x => x.question === f)?.answer || q.followUpAnswers?.[i]?.answer || ''; return <div key={`${f}-${i}`} className="space-y-2"><div className="font-semibold">প্রশ্ন: {f}</div><AnswerSection title="উত্তর" text={answer || 'এই পাল্টা প্রশ্নের উত্তর এখনও তৈরি হয়নি।'} /></div>; })}</div></section>}<div className="mt-9"><div className="eyebrow mb-3">কেমন গেল?</div><div className="grid grid-cols-2 md:grid-cols-4 gap-2"><RateButton label="ভুলে গেছি" sub="আগামীকাল" tone="danger" onClick={() => rate('forgot')} /><RateButton label="কঠিন ছিল" sub="২ দিন পর" onClick={() => rate('hard')} /><RateButton label="ভালো হয়েছে" sub="৫ দিন পর" tone="primary" onClick={() => rate('good')} /><RateButton label="সহজ ছিল" sub="১০ দিন পর" tone="accent" onClick={() => rate('easy')} /></div></div></div></div>}</article></div>;
}
function RateButton({ label, sub, tone = 'secondary', onClick }: { label: string; sub: string; tone?: string; onClick: () => void }) { const colorVar = tone === 'danger' ? 'destructive' : tone; return <button className="btn flex-col h-auto py-3" style={{ background: `hsl(var(--${colorVar}) / .12)`, color: tone === 'secondary' ? 'hsl(var(--foreground))' : `hsl(var(--${colorVar}))` }} onClick={onClick} data-testid={`button-rate-${label}`}>{label}<small className="opacity-70 font-normal">{sub}</small></button>; }

function Progress() {
  const { questions } = useAppStore();
  const [usage, setUsage] = useState<DailyStudyTime[]>([]);
  const counts = Object.keys(statusLabel).map(status => ({ status: status as ReviewStatus, count: questions.filter(q => q.reviewStatus === status).length }));
  const topics = [...new Set(questions.map(q => q.topic))];
  useEffect(() => {
    const refresh = () => db.studyTime.orderBy('date').reverse().limit(31).toArray().then(setUsage);
    void refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => window.clearInterval(timer);
  }, []);
  const usageMap = new Map(usage.map(x => [x.date, x.seconds]));
  const recentDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - i));
    const date = localDateKey(d);
    return { date, label: new Intl.DateTimeFormat('bn-BD', { day: 'numeric', month: 'short' }).format(d), seconds: usageMap.get(date) ?? 0 };
  });
  const totalSeconds = usage.reduce((sum, x) => sum + x.seconds, 0);
  const maxSeconds = Math.max(...recentDays.map(x => x.seconds), 60);
  return <div className="workspace"><PageTitle eyebrow="আপনার ছন্দ" title="অগ্রগতি" description="কতগুলো জানেন তার চেয়ে—কতটা নিয়মিত ফিরে আসছেন, সেটাই এখানে দেখা যায়।" />
    <div className="grid-auto mb-5">{counts.slice(0, 4).map(x => <div className="card p-5" key={x.status}><div className="flex justify-between"><span className="muted text-sm">{statusLabel[x.status]}</span><span className="w-2 h-2 rounded-full mt-1" style={{ background: statusTone[x.status] }} /></div><div className="stat-number mt-4">{x.count}</div></div>)}</div>
    <section className="card p-5 md:p-7 mb-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="eyebrow">অ্যাপ ব্যবহারের সময়</div><h2 className="display text-xl font-bold mt-1">প্রতিদিন কতক্ষণ পড়েছেন</h2><p className="muted text-sm mt-1">শুধু অ্যাপ সামনে খোলা ও সক্রিয় থাকা সময় গণনা হয়। অন্য app-এ গেলে সময় থেমে যায়।</p></div><div className="text-right"><div className="muted text-xs">সঞ্চিত সময়</div><div className="display text-2xl font-bold">{formatStudyTime(totalSeconds)}</div></div></div>
      <div className="mt-7 overflow-x-auto"><div className="min-w-[560px]"><div className="h-48 flex items-end gap-2">{recentDays.map(x => <div className="flex-1 h-full flex flex-col items-center justify-end gap-2" key={x.date} title={`${x.label}: ${formatStudyTime(x.seconds)}`}><div className="w-full rounded-t-md transition-all" style={{ height: `${Math.max(x.seconds ? 7 : 2, x.seconds / maxSeconds * 100)}%`, background: x.date === localDateKey() ? 'hsl(var(--accent))' : 'hsl(var(--primary)/.72)' }} /><span className="muted text-[10px] whitespace-nowrap">{x.label}</span></div>)}</div></div></div>
      <div className="mt-7 pt-5 border-t" style={{ borderColor: 'hsl(var(--border))' }}><div className="eyebrow mb-3">তারিখ অনুযায়ী</div><div className="space-y-2 max-h-80 overflow-auto">{[...usage].sort((a,b) => b.date.localeCompare(a.date)).map(x => <div key={x.date} className="flex items-center justify-between gap-4 rounded-lg px-3 py-2" style={{ background: 'hsl(var(--secondary)/.45)' }}><span className="font-semibold text-sm">{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(`${x.date}T12:00:00`))}</span><span className="pill">{formatStudyTime(x.seconds)}</span></div>)}{usage.length === 0 && <p className="muted text-sm">এখনও ব্যবহারের সময় জমা হয়নি।</p>}</div></div>
    </section>
    <div className="grid md:grid-cols-[1fr_.9fr] gap-5"><section className="card p-5 md:p-7"><div className="eyebrow">রিভিশন</div><h2 className="display text-xl font-bold mt-1">ফিরে আসার দিনগুলো</h2><p className="muted text-sm mt-2">কার্ড রিভিশনের activity আপনার progress-এ থাকে।</p></section><section className="card p-5 md:p-7"><div className="eyebrow">বিষয় ধরে</div><h2 className="display text-xl font-bold mt-1 mb-5">বোঝার মানচিত্র</h2><div className="space-y-5">{topics.map(topic => { const set = questions.filter(q => q.topic === topic); const known = set.filter(q => q.reviewStatus === 'known' || q.reviewStatus === 'mastered').length; return <div key={topic}><div className="flex justify-between text-sm mb-2"><span className="font-semibold">{topic}</span><span className="muted">{known}/{set.length}</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${known / set.length * 100}%` }} /></div></div>; })}</div></section></div>
  </div>;
}

function Settings() {
  const { target, questions } = useAppStore(); const [form, setForm] = useState<StudyTarget>(target ?? { name: 'প্রতিদিনের প্রস্তুতি', dailyQuestions: 5, dailyReviews: 10, dailyMinutes: 25, revisionPercent: 60, subjects: [], topics: [], includeNew: true, includeReview: true, includeWeak: true, priority: 'weak-first', active: true }); const [message, setMessage] = useState('');
  useEffect(() => { if (target) setForm(target); }, [target]);
  async function save() { await db.targets.put({ ...form, id: target?.id }); await reload(); setMessage('লক্ষ্য সেভ হয়েছে'); setTimeout(() => setMessage(''), 2200); }
  async function exportData() {
    // Full backup: সব local Dexie data একসাথে নেওয়া হবে। শুধু questions নয়।
    const [allQuestions, targets, accounts, events, studyTime] = await Promise.all([
      db.questions.toArray(),
      db.targets.toArray(),
      db.accounts.toArray(),
      db.events.toArray(),
      db.studyTime.toArray(),
    ]);
    const safe = {
      exportedAt: new Date().toISOString(),
      version: 3,
      questions: allQuestions,
      targets,
      accounts,
      events,
      studyTime,
    };
    const json = JSON.stringify(safe, null, 2);
    const filename = `viva-study-backup-${today()}.json`;
    const android = (window as any).Android;
    if (android?.saveBackup) {
      try {
        const base64 = btoa(unescape(encodeURIComponent(json)));
        android.saveBackup(base64, filename);
        setMessage('ব্যাকআপ সেভ করার জায়গা নির্বাচন করুন');
        return;
      } catch {
        // Fall through to the normal browser download.
      }
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('ব্যাকআপ ডাউনলোড হয়েছে');
  }
  const inputRef = useRef<HTMLInputElement>(null);
  async function importData(file?: File) {
    if (!file) return;
    try {
      setMessage('ব্যাকআপ ইমপোর্ট হচ্ছে…');
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.questions)) throw new Error('invalid-backup');

      // Questions: একই প্রশ্ন থাকলে update, না থাকলে add।
      const existingQuestions = await db.questions.toArray();
      const byQuestion = new Map(existingQuestions.map(q => [q.question.trim().toLowerCase(), q]));
      const questionIdMap = new Map<number, number>();
      for (const raw of parsed.questions) {
        if (!raw?.question || !raw?.subject) continue;
        const data = { ...blankQuestion(), ...raw, id: undefined, updatedAt: String(raw.updatedAt || new Date().toISOString()) } as Question;
        const key = data.question.trim().toLowerCase();
        const match = byQuestion.get(key);
        if (match?.id) {
          await db.questions.put({ ...data, id: match.id });
          if (Number.isFinite(raw.id)) questionIdMap.set(Number(raw.id), match.id);
        } else {
          const id = await db.questions.add(data);
          byQuestion.set(key, { ...data, id });
          if (Number.isFinite(raw.id)) questionIdMap.set(Number(raw.id), id);
        }
      }

      // Study target restore.
      if (Array.isArray(parsed.targets)) {
        for (const raw of parsed.targets) {
          if (!raw?.name) continue;
          const data = { ...raw, id: undefined } as StudyTarget;
          const existing = raw.id ? await db.targets.get(raw.id) : undefined;
          if (existing?.id) await db.targets.put({ ...data, id: existing.id });
          else {
            const active = await db.targets.where('active').equals(1).toArray();
            const same = active.find(x => x.name === data.name);
            if (same?.id) await db.targets.put({ ...data, id: same.id });
            else await db.targets.add(data);
          }
        }
      }

      // AI accounts restore — API key-সহ local account settings backup-এ রাখা হয়।
      if (Array.isArray(parsed.accounts)) {
        const existingAccounts = await db.accounts.toArray();
        for (const raw of parsed.accounts) {
          if (!raw?.provider) continue;
          const data = { ...raw, id: undefined } as AIAccount;
          const match = existingAccounts.find(a => a.provider === data.provider && a.baseUrl === data.baseUrl && a.model === data.model);
          if (match?.id) await db.accounts.put({ ...data, id: match.id });
          else { const id = await db.accounts.add(data); existingAccounts.push({ ...data, id }); }
        }
      }

      // Study history restore without colliding with existing event IDs.
      if (Array.isArray(parsed.events)) {
        const existingEvents = await db.events.toArray();
        const eventKeys = new Set(existingEvents.map(e => `${e.questionId}|${e.rating}|${e.reviewedAt}`));
        for (const raw of parsed.events) {
          if (!raw?.questionId || !raw?.reviewedAt) continue;
          const questionId = questionIdMap.get(Number(raw.questionId)) ?? Number(raw.questionId);
          if (!questionId) continue;
          const key = `${questionId}|${raw.rating}|${raw.reviewedAt}`;
          if (eventKeys.has(key)) continue;
          await db.events.add({ questionId, rating: String(raw.rating || ''), reviewedAt: String(raw.reviewedAt) });
          eventKeys.add(key);
        }
      }

      if (Array.isArray(parsed.studyTime)) {
        for (const raw of parsed.studyTime) {
          if (raw?.date && Number.isFinite(raw?.seconds)) {
            const existing = await db.studyTime.get(String(raw.date));
            const importedSeconds = Math.max(0, Number(raw.seconds));
            // Backup restore-এ পুরনো সময় হারাবে না; বেশি/নতুন value রাখা হবে।
            if (!existing || importedSeconds > existing.seconds) {
              await db.studyTime.put({
                date: String(raw.date),
                seconds: importedSeconds,
                updatedAt: String(raw.updatedAt || new Date().toISOString()),
              });
            }
          }
        }
      }

      await reload();
      setMessage('পুরোনো সব ডেটা ইমপোর্ট হয়েছে ✓');
    } catch (error) {
      console.error('Backup import failed', error);
      setMessage('ব্যাকআপ ইমপোর্ট করা যায়নি — সঠিক Viva Study backup ফাইল দিন');
    }
  }
  return <div className="workspace"><PageTitle eyebrow="আপনার পছন্দ" title="সেটিংস" description="পড়ার লক্ষ্য আর আপনার স্থানীয় ডেটার নিয়ন্ত্রণ সবসময় আপনার হাতেই।" /><div className="grid md:grid-cols-[1fr_.8fr] gap-5"><section className="card p-5 md:p-7"><div className="eyebrow mb-5">স্টাডি টার্গেট</div><div className="space-y-5"><div><label className="label">টার্গেটের নাম</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="input-target-name" /></div><div className="grid grid-cols-3 gap-3"><div><label className="label">প্রশ্ন / দিন</label><input type="number" className="input" value={form.dailyQuestions} onChange={e => setForm({ ...form, dailyQuestions: Number(e.target.value) })} data-testid="input-daily-questions" /></div><div><label className="label">রিভিশন</label><input type="number" className="input" value={form.dailyReviews} onChange={e => setForm({ ...form, dailyReviews: Number(e.target.value) })} data-testid="input-daily-reviews" /></div><div><label className="label">মিনিট</label><input type="number" className="input" value={form.dailyMinutes} onChange={e => setForm({ ...form, dailyMinutes: Number(e.target.value) })} data-testid="input-daily-minutes" /></div></div><div><div className="flex items-center justify-between mb-2"><label className="label mb-0">রিভিশন বনাম নতুন প্রশ্ন — সময় বণ্টন</label><span className="pill">রিভিশন {form.revisionPercent}% · নতুন {100 - form.revisionPercent}%</span></div><input type="range" min={0} max={100} step={5} className="w-full" value={form.revisionPercent} onChange={e => setForm({ ...form, revisionPercent: Number(e.target.value) })} data-testid="input-revision-percent" /><div className="h-3 rounded-full overflow-hidden flex mt-3" style={{ background: 'hsl(var(--secondary))' }}><div style={{ width: `${form.revisionPercent}%`, background: 'hsl(var(--primary))' }} /><div style={{ width: `${100 - form.revisionPercent}%`, background: 'hsl(var(--accent))' }} /></div><p className="muted text-xs mt-2">আজকের {form.dailyMinutes} মিনিটের মধ্যে ≈ {Math.round(form.dailyMinutes * form.revisionPercent / 100)} মিনিট রিভিশনে, ≈ {form.dailyMinutes - Math.round(form.dailyMinutes * form.revisionPercent / 100)} মিনিট নতুন প্রশ্নে।</p></div><div><label className="label">আগে দেখাবেন</label><select className="input" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} data-testid="select-priority"><option value="weak-first">দুর্বল প্রশ্ন</option><option value="due-first">যেগুলো আজ বাকি</option><option value="new-first">নতুন প্রশ্ন</option></select></div><div className="space-y-3 text-sm">{[['includeNew', 'নতুন প্রশ্ন'], ['includeReview', 'নিয়মিত রিভিশন'], ['includeWeak', 'দুর্বল প্রশ্ন']].map(([key, label]) => <label className="flex items-center gap-3 cursor-pointer" key={key}><input type="checkbox" checked={Boolean(form[key as keyof StudyTarget])} onChange={e => setForm({ ...form, [key]: e.target.checked })} data-testid={`checkbox-${key}`} /><span>{label}</span></label>)}</div><button className="btn btn-primary" onClick={save} data-testid="button-save-settings"><Check size={16} /> লক্ষ্য সেভ করুন</button>{message && <span className="text-sm ml-2" style={{ color: 'hsl(var(--primary))' }}>{message}</span>}</div></section><section className="space-y-5"><div className="card p-5 md:p-7"><div className="eyebrow mb-1">ডেটা সঙ্গে রাখুন</div><h2 className="display text-xl font-bold">ব্যাকআপ</h2><p className="muted text-sm mt-2">প্রশ্ন, উত্তর ও লক্ষ্য JSON হিসেবে রাখুন। API keys ইচ্ছাকৃতভাবে বাদ থাকে।</p><div className="flex flex-wrap gap-2 mt-5"><button className="btn btn-secondary" onClick={exportData} data-testid="button-export"><Download size={16} /> এক্সপোর্ট</button><button className="btn btn-secondary" onClick={() => inputRef.current?.click()} data-testid="button-import"><Upload size={16} /> ইমপোর্ট</button><input ref={inputRef} type="file" accept=".json,application/json,text/plain,text/json,application/octet-stream" className="hidden" onChange={e => { importData(e.target.files?.[0]); e.target.value = ''; }} data-testid="input-import-file" /></div></div><div className="card p-5 md:p-7"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: 'hsl(var(--accent)/.2)' }}><Sparkles size={17} /></div><div><h2 className="font-bold">লোকাল AI সহায়তা</h2><p className="muted text-sm">আপনার provider ও key আপনার ডিভাইসেই থাকবে।</p></div></div><Link href="/settings/ai" className="btn btn-secondary w-full mt-5" data-testid="link-ai-settings">AI account settings <ChevronRight size={16} /></Link></div></section></div></div>;
}

function AISettings() {
  const { accounts } = useAppStore();
  const [provider, setProvider] = useState<AIAccount['provider']>('Gemini');
  const [key, setKey] = useState('');
  const [bulkKeys, setBulkKeys] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [baseUrl, setBaseUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [testing, setTesting] = useState<number>();
  async function addAccount(e: FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    await db.accounts.add({ provider, apiKey: key.trim(), model, baseUrl, enabled: true, priority: accounts.length + 1, status: 'untested', failureCount: 0, totalRequests: 0 });
    setKey('');
    setNotice('অ্যাকাউন্ট যোগ হয়েছে—এখন টেস্ট করতে পারেন।');
    await reload();
  }
  async function addBulkAccounts() {
    const keys = bulkKeys.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
    if (!keys.length) return;
    let base = accounts.length;
    const detected: Record<string, number> = {};
    for (const apiKey of keys) {
      const guess = detectProviderFromKey(apiKey);
      detected[guess.provider] = (detected[guess.provider] ?? 0) + 1;
      base += 1;
      await db.accounts.add({ provider: guess.provider, apiKey, model: guess.model, baseUrl: guess.baseUrl, enabled: true, priority: base, status: 'untested', failureCount: 0, totalRequests: 0 });
    }
    setBulkKeys('');
    const summary = Object.entries(detected).map(([p, n]) => `${p} ${n}টি`).join(', ');
    setNotice(`${keys.length}টি account যোগ হয়েছে—key দেখে provider সনাক্ত করা হয়েছে: ${summary}।`);
    await reload();
  }
  async function testAccount(account: AIAccount) {
    if (!account.id) return;
    setTesting(account.id);
    try {
      const ok = await testAIAccount(account);
      await db.accounts.update(account.id, { status: ok ? 'ready' : 'error', lastTested: new Date().toISOString(), lastError: ok ? undefined : 'Provider returned an unexpected response', totalRequests: account.totalRequests + 1 });
      setNotice(ok ? `${account.provider} account কাজ করছে।` : 'Provider-এর response বোঝা যায়নি।');
    } catch (error) {
      await db.accounts.update(account.id, { status: 'error', lastTested: new Date().toISOString(), lastError: error instanceof Error ? error.message.slice(0, 160) : 'Test failed', failureCount: account.failureCount + 1 });
      setNotice('এই account দিয়ে test করা যায়নি। অন্য account বা provider চেষ্টা করুন।');
    } finally {
      setTesting(undefined);
      await reload();
    }
  }
  async function change(id: number, changes: Partial<AIAccount>) { await db.accounts.update(id, changes); await reload(); }
  async function remove(id: number) { await db.accounts.delete(id); await reload(); }
  return <div className="workspace">
    <Link href="/settings" className="inline-flex items-center gap-2 text-sm muted mb-6" data-testid="link-back-settings"><ArrowLeft size={16} /> সেটিংসে ফিরুন</Link>
    <PageTitle eyebrow="লোকাল AI" title="AI account settings" description="কোনো key সার্ভারে যায় না। এখানে রাখা credentials শুধু আপনার browser-এর IndexedDB-তে থাকে।" /> <div className="pill mb-6 inline-flex items-center gap-1" style={{ background: 'hsl(var(--accent)/.18)' }} data-testid="text-build-tag">Build: {BUILD_TAG}</div>
    <div className="grid md:grid-cols-[.85fr_1.15fr] gap-5">
      <section className="card p-5 md:p-7">
        <div className="eyebrow mb-5">নতুন provider</div>
        <form className="space-y-4" onSubmit={addAccount}>
          <div><label className="label">Provider</label><select className="input" value={provider} onChange={e => { const p = e.target.value as AIAccount['provider']; setProvider(p); setModel(p === 'Gemini' ? 'gemini-2.5-flash' : p === 'Groq' ? 'openai/gpt-oss-20b' : p === 'OpenRouter' ? 'openrouter/free' : p === 'Grok' ? 'grok-2-latest' : 'gpt-4o-mini'); }} data-testid="select-ai-provider"><option>Gemini</option><option>Groq</option><option>OpenAI</option><option>OpenRouter</option><option>Grok</option><option>OpenAI-compatible</option></select></div>
          {provider === 'OpenAI-compatible' && <div><label className="label">Base URL</label><input className="input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://your-endpoint/v1" data-testid="input-base-url" /></div>}
          <div><label className="label">Model</label><input className="input" value={model} onChange={e => setModel(e.target.value)} data-testid="input-model" /></div>
          <div><label className="label flex items-center gap-2">API key <KeyRound size={14} className="muted" /></label><input className="input" type="password" autoComplete="new-password" value={key} onChange={e => setKey(e.target.value)} placeholder="ডিভাইসেই রাখা হবে" data-testid="input-api-key" /></div>
          <button className="btn btn-primary w-full" type="submit" data-testid="button-add-ai"><Plus size={16} /> account যোগ করুন</button>
        </form>
        <div className="mt-6 pt-5 border-t space-y-3">
          <div><div className="eyebrow">Bulk import</div><p className="muted text-xs mt-1">প্রতি লাইনে বা comma দিয়ে একাধিক key দিন। Mixed providers auto-detected from key format.</p></div>
          <textarea className="input min-h-24" value={bulkKeys} onChange={e => setBulkKeys(e.target.value)} placeholder={'key-1\nkey-2\nkey-3'} aria-label="একাধিক API key" data-testid="input-bulk-keys" />
          <button type="button" className="btn btn-secondary" onClick={addBulkAccounts} data-testid="button-bulk-add"><Plus size={16} /> একসঙ্গে যোগ করুন</button>
        </div>
        {(notice || accounts.length === 0) && <p className="text-sm mt-5" style={{ color: 'hsl(var(--primary))' }}>{notice || 'AI ঐচ্ছিক—account না থাকলেও পুরো study workflow কাজ করবে।'}</p>}
      </section>
      <section>
        <div className="flex items-center justify-between mb-3"><div><div className="eyebrow">আপনার providers</div><h2 className="display text-xl font-bold mt-1">{accounts.length ? `${accounts.length}টি account` : 'এখনও কোনো account নেই'}</h2></div><span className="pill"><KeyRound size={13} className="inline mr-1" /> local only</span></div>
        {accounts.length ? <div className="space-y-3">{accounts.map((account, i) => <div className="card p-4" key={account.id}>
          <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: 'hsl(var(--secondary))' }}><Sparkles size={17} /></div><div><div className="font-bold">{account.provider}</div><div className="muted text-xs">{account.model} · key ••••••••{account.apiKey.slice(-4)}</div></div></div><span className="pill" style={{ color: account.status === 'ready' ? 'hsl(var(--primary))' : account.status === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))' }}>{account.status === 'ready' ? 'কাজ করছে' : account.status === 'error' ? 'সমস্যা' : account.enabled ? 'পরীক্ষা হয়নি' : 'বন্ধ'}</span></div>
          {account.lastError && <p className="text-xs mt-3" style={{ color: 'hsl(var(--destructive))' }}>{account.lastError}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t"><span className="muted text-xs">priority {i + 1} · {account.totalRequests} requests {account.lastTested ? `· test ${formatDate(account.lastTested)}` : ''}</span><div className="flex gap-1"><button className="btn btn-secondary py-1.5 min-h-0 text-xs" onClick={() => testAccount(account)} disabled={testing === account.id} data-testid={`button-test-ai-${account.id}`}>{testing === account.id ? 'Test হচ্ছে…' : 'Test'}</button><button className="btn btn-ghost py-1.5 min-h-0 text-xs" onClick={() => change(account.id!, { enabled: !account.enabled, status: account.enabled ? 'disabled' : 'untested' })} data-testid={`button-toggle-ai-${account.id}`}>{account.enabled ? 'বন্ধ করুন' : 'চালু করুন'}</button><IconButton label={`AI account মুছুন ${account.id}`} onClick={() => remove(account.id!)} className="py-1.5 min-h-0 text-xs"><Trash2 size={14} /></IconButton></div></div>
        </div>)}</div> : <Empty title="AI এখনও সেটআপ হয়নি" text="AI generation ব্যবহার করতে চাইলে এখানে একটি local account যোগ করুন।" />}
      </section>
    </div>
  </div>;
}

function NotFoundPage() { return <div className="workspace"><Empty title="এই পৃষ্ঠাটি নেই" text="ঠিকানা মিলিয়ে আবার চেষ্টা করুন।" action={<Link href="/" className="btn btn-primary" data-testid="link-not-found-home">হোমে ফিরুন</Link>} /></div>; }

function Router() {
  return <Shell><Switch><Route path="/" component={Home} /><Route path="/questions" component={Questions} /><Route path="/questions/new" component={() => <Editor />} /><Route path="/questions/:id/edit" component={() => <Editor edit />} /><Route path="/questions/:id" component={Detail} /><Route path="/add" component={() => <Editor />} /><Route path="/review" component={Review} /><Route path="/progress" component={Progress} /><Route path="/settings/ai" component={AISettings} /><Route path="/settings" component={Settings} /><Route component={NotFoundPage} /></Switch></Shell>;
}

function App() {
  useStudyTimeTracker();
  const hydrated = useAppStore(s => s.hydrated);
  useEffect(() => { ensureSeed().then(reload).then(() => useAppStore.getState().setHydrated(true)); }, []);
  if (!hydrated) return <div className="min-h-[100dvh] grid place-items-center"><div className="text-center"><div className="logo-mark mx-auto mb-4">ভি</div><div className="display font-bold text-lg">Viva Study</div><p className="muted text-sm mt-2">আপনার পড়ার জায়গা তৈরি হচ্ছে…</p></div></div>;
  return <Router />;
}

export default App;