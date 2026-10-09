// The app's one icon component, backed by Lucide (lucide.dev, ISC licence).
//
//   <I n="send" s={16} c="var(--t2)" w={1.75} />
//
// `n` is the app's own short name, mapped below to a Lucide icon, so call
// sites never import Lucide directly and an icon can be swapped in one place.
// No emoji anywhere in the UI: a glyph that needs a picture comes from here.
import {
  Activity, AppWindow, ArrowLeft, ArrowRight, BadgeCheck, Ban, BarChart3, Bell, BookOpen, BookUser,
  Bot, Brain, Briefcase, Building2, Calendar, Camera, Check, CheckCheck, Circle, CircleAlert,
  CircleCheck, CircleHelp, CirclePlay, Clock, Code, Columns2, Copy, CreditCard, Database, Download,
  ExternalLink, Eye, EyeOff, FileText, Filter, Fingerprint, Frown, Gift, Globe, House, IdCard, Inbox,
  Info, Instagram, KeyRound, Layers, LayoutDashboard, LayoutTemplate, LifeBuoy, ChartLine, LoaderCircle,
  Lock, LogOut, Mail, Megaphone, MessageSquare, Monitor, Package, PartyPopper, Pencil, Phone, Plug,
  Plus, Receipt, RefreshCw, RotateCcw, ScanSearch, Search, Send, Settings, Shield, ShieldCheck,
  SlidersHorizontal, Smartphone, Sparkle, Sparkles, SquareCheckBig, Star, StickyNote, Tag, Target,
  Trash2, TrendingUp, TriangleAlert, Truck, Undo2, User, Users, Wallet, Webhook, Workflow, Wrench, X,
  Zap,
} from 'lucide-react';

const ICONS = {
  // Original names used across the app
  home: House, file: FileText, send: Send, users: Users, msg: MessageSquare, zap: Zap,
  chart: BarChart3, phone: Phone, key: KeyRound, cog: Settings, db: Database, check: Check,
  arrow: ArrowRight, arrowLeft: ArrowLeft, play: CirclePlay, globe: Globe, brain: Brain,
  wflow: Workflow, bot: Bot, spark: Sparkle, sparkl: Sparkles, logout: LogOut, eye: Eye,
  eyeoff: EyeOff, insta: Instagram, search: Search, bell: Bell, mail: Mail, x: X, filter: Filter,
  download: Download, copy: Copy, trash: Trash2, pencil: Pencil, plus: Plus, rotate: RotateCcw,
  shield: Shield, credit: CreditCard, ban: Ban, plug: Plug, refresh: RefreshCw, note: StickyNote,
  checkc: CircleCheck, alertc: CircleAlert, alertt: TriangleAlert, smartphone: Smartphone,
  columns: Columns2, wh: Webhook, user: User, briefcase: Briefcase, building: Building2,
  clock: Clock, lock: Lock, idcard: IdCard, monitor: Monitor, target: Target,
  'check-square': SquareCheckBig, activity: Activity, sliders: SlidersHorizontal,
  layout: LayoutDashboard, layers: Layers, tag: Tag, info: Info, loader: LoaderCircle,
  circle: Circle, 'check-circle-fill': CircleCheck,

  // Replacements for what used to be emoji
  inbox: Inbox, megaphone: Megaphone, template: LayoutTemplate, contacts: BookUser,
  fingerprint: Fingerprint, scan: ScanSearch, trending: TrendingUp, analytics: ChartLine,
  widget: AppWindow, wallet: Wallet, support: LifeBuoy, book: BookOpen, verified: BadgeCheck,
  'shield-check': ShieldCheck, party: PartyPopper, camera: Camera, star: Star,
  external: ExternalLink, checks: CheckCheck, code: Code,
  // Intent icons (Automation → AI Intent Matching)
  package: Package, money: Wallet, truck: Truck, undo: Undo2, frown: Frown, calendar: Calendar,
  receipt: Receipt, help: CircleHelp, gift: Gift, wrench: Wrench,
};

// Names used around the app for glyphs that already exist under another key.
const ALIASES = {
  edit: 'pencil',
  messageSquare: 'msg',
  barChart: 'chart',
  'check-circle': 'checkc',
};

export const ICON_NAMES = Object.keys(ICONS);

// Icons drawn in a neutral text colour or the accent sit on white or grey
// surfaces, and are painted green. Status colours (red, amber, violet), dark
// ink on bright buttons and inherited currentColor keep their own colour.
const GREEN_ON_NEUTRAL = new Set([
  'var(--t1)', 'var(--t2)', 'var(--t3)', 'var(--t3-faint)',
  'var(--green)', 'var(--accent)', 'var(--accent, #0d9488)', '#0d9488',
]);

export const I = ({ n, s = 16, c = 'currentColor', w = 1.75 }) => {
  if (GREEN_ON_NEUTRAL.has(c)) c = 'var(--icon)';
  const Glyph = ICONS[n] ?? ICONS[ALIASES[n]];
  if (!Glyph) {
    if (import.meta.env?.DEV) console.warn(`Icons: no glyph named "${n}"`);
    return <svg width={s} height={s} aria-hidden="true" focusable="false" />;
  }
  // The vertical offset sits an icon on the text baseline when it is used
  // inline in a sentence ("Saved ✓"); inside flex rows it has no effect.
  return <Glyph size={s} color={c} strokeWidth={w} aria-hidden="true" focusable="false" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} />;
};
