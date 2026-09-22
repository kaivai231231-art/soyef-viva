import Dexie, { type Table } from 'dexie';

export type ReviewStatus = 'new' | 'learning' | 'weak' | 'known' | 'mastered';
export type AnswerType = 'manual' | 'pasted' | 'ai';
export interface FollowUpAnswer { question: string; answer: string; }
export type AIProvider = 'Gemini' | 'OpenAI' | 'OpenRouter' | 'Groq' | 'Grok' | 'OpenAI-compatible';

export interface Question {
  id?: number;
  question: string; subject: string; topic: string; tags: string[];
  shortAnswer: string; detailedAnswer: string; keyPoints: string[];
  simpleExplanation: string; vivaAnswer: string; followUps: string[]; followUpAnswers: FollowUpAnswer[];
  personalNote: string; sourceUrl: string; sourceName: string;
  answerType: AnswerType; createdAt: string; updatedAt: string;
  reviewStatus: ReviewStatus; nextReview: string; interval: number; ease: number; reviewCount: number;
}
export interface StudyTarget {
  id?: number; name: string; dailyQuestions: number; dailyReviews: number; dailyMinutes: number;
  revisionPercent: number;
  subjects: string[]; topics: string[]; includeNew: boolean; includeReview: boolean; includeWeak: boolean; priority: string; active: boolean;
}
export interface AIAccount {
  id?: number; provider: AIProvider; apiKey: string; baseUrl: string; model: string; enabled: boolean; priority: number;
  status: 'untested' | 'ready' | 'error' | 'disabled'; lastUsed?: string; failureCount: number; lastError?: string; lastTested?: string; totalRequests: number;
}
export interface StudyEvent { id?: number; questionId: number; rating: string; reviewedAt: string; }
export interface DailyStudyTime { date: string; seconds: number; updatedAt: string; }

class VivaDB extends Dexie {
  questions!: Table<Question, number>;
  targets!: Table<StudyTarget, number>;
  accounts!: Table<AIAccount, number>;
  events!: Table<StudyEvent, number>;
  studyTime!: Table<DailyStudyTime, string>;
  constructor() {
    super('viva-study');
    this.version(1).stores({
      questions: '++id, subject, topic, reviewStatus, nextReview, updatedAt',
      targets: '++id, active',
      accounts: '++id, provider, enabled, priority',
      events: '++id, questionId, reviewedAt',
    });
    this.version(2).stores({
      questions: '++id, subject, topic, reviewStatus, nextReview, updatedAt',
      targets: '++id, active',
      accounts: '++id, provider, enabled, priority',
      events: '++id, questionId, reviewedAt',
      studyTime: '&date, updatedAt',
    });
  }
}
export const db = new VivaDB();

const now = new Date().toISOString();
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString();
export const seedQuestions: Question[] = [
  {
    question: 'বাংলাদেশের সংবিধানের মৌলিক নীতিগুলো কী কী?', subject: 'বাংলাদেশ বিষয়াবলি', topic: 'সংবিধান',
    tags: ['প্রিলিমিনারি', 'মৌলিক নীতি'], shortAnswer: 'জাতীয়তাবাদ, সমাজতন্ত্র, গণতন্ত্র ও ধর্মনিরপেক্ষতা।',
    detailedAnswer: 'সংবিধানের ৮ অনুচ্ছেদে রাষ্ট্র পরিচালনার চার মূলনীতি বলা হয়েছে। এগুলো রাষ্ট্রের আইন, নীতি ও প্রশাসনের দিকনির্দেশনা দেয়।',
    keyPoints: ['জাতীয়তাবাদ', 'সমাজতন্ত্র', 'গণতন্ত্র', 'ধর্মনিরপেক্ষতা'], simpleExplanation: 'রাষ্ট্র কী মূল্যবোধে চলবে—তার চারটি বড় উত্তর।',
    followUpAnswers: [
      { question: 'রাষ্ট্র পরিচালনার মূলনীতি কোথায় আছে?', answer: 'রাষ্ট্র পরিচালনার মূলনীতি সংবিধানের দ্বিতীয় ভাগে, বিশেষ করে ৮ থেকে ২৫ অনুচ্ছেদে বর্ণিত হয়েছে।' },
      { question: 'মূলনীতির সঙ্গে মৌলিক অধিকারের পার্থক্য কী?', answer: 'মূলনীতি রাষ্ট্র পরিচালনার জন্য দিকনির্দেশনা দেয়, আর মৌলিক অধিকার নাগরিকের সাংবিধানিকভাবে স্বীকৃত অধিকার নিশ্চিত করে।' },
    ],
    vivaAnswer: 'স্যার, চারটি মূলনীতি হলো জাতীয়তাবাদ, সমাজতন্ত্র, গণতন্ত্র এবং ধর্মনিরপেক্ষতা।',
    followUps: ['রাষ্ট্র পরিচালনার মূলনীতি কোথায় আছে?', 'মূলনীতির সঙ্গে মৌলিক অধিকারের পার্থক্য কী?'],
    personalNote: 'অনুচ্ছেদ ৮ মনে রাখব।', sourceUrl: '', sourceName: 'নিজের নোট', answerType: 'manual',
    createdAt: now, updatedAt: now, reviewStatus: 'weak', nextReview: day(0), interval: 1, ease: 2.5, reviewCount: 0,
  },
  {
    question: 'রবীন্দ্রনাথের ছোটগল্পের বৈশিষ্ট্য আলোচনা করুন।', subject: 'বাংলা সাহিত্য', topic: 'রবীন্দ্রনাথ',
    tags: ['সাহিত্য', 'ছোটগল্প'], shortAnswer: 'জীবনঘনিষ্ঠতা, মনস্তাত্ত্বিক বিশ্লেষণ, মানবিকতা ও সূক্ষ্ম পর্যবেক্ষণ।',
    detailedAnswer: 'রবীন্দ্রনাথের ছোটগল্পে গ্রামীণ ও নাগরিক জীবনের বাস্তবতা, চরিত্রের অন্তর্জগৎ এবং মানবিক সম্পর্কের টানাপোড়েন গভীরভাবে ফুটে ওঠে।',
    keyPoints: ['জীবনঘনিষ্ঠতা', 'মনস্তত্ত্ব', 'প্রকৃতি', 'মানবিকতা'], simpleExplanation: 'ছোট পরিসরে মানুষের বড় অনুভূতির গল্প।',
    followUpAnswers: [
      { question: 'একটি গল্পের নাম বলুন।', answer: 'রবীন্দ্রনাথের একটি উল্লেখযোগ্য ছোটগল্প হলো কাবুলিওয়ালা।' },
      { question: 'কাবুলিওয়ালা গল্পের মূল বক্তব্য কী?', answer: 'গল্পটি মানবিক সম্পর্ক, পিতৃত্বের অনুভূতি এবং মানুষের সার্বজনীন আবেগকে তুলে ধরে।' },
    ],
    vivaAnswer: 'রবীন্দ্রনাথের গল্পের প্রধান শক্তি হলো সংযত ভাষায় মানবমনের সূক্ষ্ম প্রকাশ।',
    followUps: ['একটি গল্পের নাম বলুন।', 'কাবুলিওয়ালা গল্পের মূল বক্তব্য কী?'],
    personalNote: '', sourceUrl: '', sourceName: 'নিজের নোট', answerType: 'manual',
    createdAt: now, updatedAt: now, reviewStatus: 'known', nextReview: day(3), interval: 3, ease: 2.6, reviewCount: 1,
  },
  {
    question: 'What is the difference between TCP and UDP?', subject: 'কম্পিউটার', topic: 'নেটওয়ার্কিং',
    tags: ['টেকনিক্যাল', 'নেটওয়ার্ক'], shortAnswer: 'TCP is reliable and connection-oriented; UDP is faster and connectionless.',
    detailedAnswer: 'TCP establishes a connection, guarantees ordered delivery and retransmits lost packets. UDP sends datagrams without those guarantees, making it useful for real-time applications.',
    keyPoints: ['Reliability', 'Connection', 'Ordering', 'Speed'], simpleExplanation: 'TCP আগে সম্পর্ক তৈরি করে নিশ্চিতভাবে পাঠায়, UDP দ্রুত পাঠিয়ে এগিয়ে যায়।',
    followUpAnswers: [
      { question: 'ভিডিও কলের জন্য কোনটি পছন্দ করবেন?', answer: 'সাধারণত UDP বেশি উপযোগী, কারণ ভিডিও কলে কম latency গুরুত্বপূর্ণ এবং কিছু packet loss সহ্য করা যায়।' },
      { question: 'Three-way handshake কী?', answer: 'TCP connection স্থাপনের আগে SYN, SYN-ACK এবং ACK—এই তিন ধাপের মাধ্যমে client ও server-এর মধ্যে connection তৈরি করার প্রক্রিয়াকে three-way handshake বলে।' },
    ],
    vivaAnswer: 'TCP reliability-এর জন্য, UDP low-latency communication-এর জন্য বেশি উপযোগী।',
    followUps: ['ভিডিও কলের জন্য কোনটি পছন্দ করবেন?', 'Three-way handshake কী?'],
    personalNote: 'Use cases দিয়ে উত্তর শুরু করব।', sourceUrl: '', sourceName: 'নিজের নোট', answerType: 'manual',
    createdAt: now, updatedAt: now, reviewStatus: 'learning', nextReview: day(0), interval: 1, ease: 2.5, reviewCount: 0,
  },
];

export async function ensureSeed() {
  if (await db.questions.count() === 0) await db.questions.bulkAdd(seedQuestions);
  if (await db.targets.count() === 0) await db.targets.add({
    name: 'প্রতিদিনের প্রস্তুতি', dailyQuestions: 5, dailyReviews: 10, dailyMinutes: 25, revisionPercent: 60,
    subjects: [], topics: [], includeNew: true, includeReview: true, includeWeak: true, priority: 'weak-first', active: true,
  });
}