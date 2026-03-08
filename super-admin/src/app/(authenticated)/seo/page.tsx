"use client";

import { useState } from "react";
import {
  Search,
  BarChart3,
  Globe,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  FileText,
  Shield,
  Zap,
  Eye,
  Target,
  Bot,
  Clock,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────

interface AuditResult {
  category: string;
  checks: {
    name: string;
    status: "pass" | "warn" | "fail";
    detail: string;
    fix?: string;
  }[];
}

interface KeywordRank {
  keyword: string;
  position: number;
  change: number;
  volume: number;
  url: string;
}

interface ContentIdea {
  title: string;
  keyword: string;
  volume: number;
  difficulty: "easy" | "medium" | "hard";
  type: "blog" | "pillar" | "comparison";
}

// ── Mock Data ─────────────────────────────────────────

const mockAuditResults: AuditResult[] = [
  {
    category: "Technical SEO",
    checks: [
      { name: "SSL Certificate", status: "pass", detail: "Valid until 2027-02-28 (Let's Encrypt)" },
      { name: "robots.txt", status: "pass", detail: "Properly configured, sitemap referenced" },
      { name: "sitemap.xml", status: "pass", detail: "8 URLs, last updated today" },
      { name: "Mobile Responsive", status: "pass", detail: "All pages pass mobile-friendly test" },
      { name: "Core Web Vitals (LCP)", status: "pass", detail: "1.2s (Good: < 2.5s)" },
      { name: "Core Web Vitals (FID)", status: "pass", detail: "12ms (Good: < 100ms)" },
      { name: "Core Web Vitals (CLS)", status: "pass", detail: "0.02 (Good: < 0.1)" },
      { name: "Page Load Speed", status: "pass", detail: "0.8s (Cloudflare CDN edge)" },
    ],
  },
  {
    category: "On-Page SEO",
    checks: [
      { name: "Title Tag", status: "pass", detail: "'TravelCRM Pro — AI-Powered CRM for Travel Agencies' (56 chars)" },
      { name: "Meta Description", status: "pass", detail: "158 chars, includes CTA and primary keyword" },
      { name: "H1 Tag", status: "pass", detail: "Single H1 with primary keyword" },
      { name: "Heading Hierarchy", status: "pass", detail: "H1 → H2 → H3, no skipped levels" },
      { name: "Image Alt Tags", status: "warn", detail: "2 images missing alt text", fix: "Add alt attributes to hero decorative images" },
      { name: "Internal Links", status: "pass", detail: "15 internal links, good link equity distribution" },
      { name: "Keyword Density", status: "pass", detail: "'travel CRM' appears 8 times (1.2% density)" },
      { name: "Content Length", status: "pass", detail: "2,400+ words on homepage (above 1,500 minimum)" },
    ],
  },
  {
    category: "Structured Data",
    checks: [
      { name: "SoftwareApplication", status: "pass", detail: "Valid schema with offers and ratings" },
      { name: "FAQPage", status: "pass", detail: "10 Q&As marked up for rich snippets" },
      { name: "Organization", status: "warn", detail: "Missing Organization schema", fix: "Add Organization JSON-LD with logo and social profiles" },
      { name: "BreadcrumbList", status: "warn", detail: "No breadcrumbs on sub-pages", fix: "Add BreadcrumbList schema to feature and blog pages" },
    ],
  },
  {
    category: "Social & OG Tags",
    checks: [
      { name: "Open Graph Title", status: "pass", detail: "Set correctly" },
      { name: "Open Graph Description", status: "pass", detail: "Set correctly" },
      { name: "Open Graph Image", status: "warn", detail: "og-image.png not yet uploaded", fix: "Create and upload 1200x630 branded OG image" },
      { name: "Twitter Card", status: "pass", detail: "summary_large_image configured" },
      { name: "Canonical URL", status: "pass", detail: "https://travelcrm.pro (correct)" },
    ],
  },
];

const mockKeywords: KeywordRank[] = [
  { keyword: "travel CRM", position: 14, change: 3, volume: 4400, url: "/" },
  { keyword: "travel agency software", position: 22, change: 5, volume: 3600, url: "/" },
  { keyword: "tour operator CRM", position: 8, change: 2, volume: 2400, url: "/" },
  { keyword: "CRM for travel agents", position: 11, change: -1, volume: 1900, url: "/" },
  { keyword: "itinerary builder software", position: 6, change: 4, volume: 480, url: "/#features" },
  { keyword: "travel quotation software", position: 15, change: 0, volume: 880, url: "/#features" },
  { keyword: "WhatsApp CRM travel", position: 4, change: 7, volume: 320, url: "/#features" },
  { keyword: "GST invoice travel agency", position: 9, change: 2, volume: 590, url: "/#pricing" },
  { keyword: "AI travel CRM", position: 3, change: 1, volume: 260, url: "/#ai" },
  { keyword: "travel CRM India", position: 7, change: 3, volume: 1200, url: "/" },
];

const mockContentIdeas: ContentIdea[] = [
  { title: "10 Best Travel CRM Software in 2026: Complete Comparison", keyword: "best travel CRM", volume: 720, difficulty: "medium", type: "comparison" },
  { title: "How AI is Revolutionizing Travel Agency Operations", keyword: "AI travel agency", volume: 480, difficulty: "easy", type: "pillar" },
  { title: "WhatsApp Marketing for Travel Agencies: 20 Ready Templates", keyword: "WhatsApp marketing travel", volume: 320, difficulty: "easy", type: "blog" },
  { title: "Complete Guide to GST Invoicing for Travel Companies", keyword: "GST invoice travel", volume: 590, difficulty: "easy", type: "pillar" },
  { title: "Travel Agency CRM vs Generic CRM: Why Specialization Matters", keyword: "travel agency CRM comparison", volume: 260, difficulty: "easy", type: "blog" },
  { title: "How to Create Professional Travel Itineraries in 5 Minutes", keyword: "create travel itinerary", volume: 1200, difficulty: "medium", type: "blog" },
];

// ── Component ─────────────────────────────────────────

export default function SeoPage() {
  const [running, setRunning] = useState(false);
  const [auditDone, setAuditDone] = useState(false);
  const [activeTab, setActiveTab] = useState<"audit" | "keywords" | "content">("audit");

  const runAudit = () => {
    setRunning(true);
    setTimeout(() => {
      setRunning(false);
      setAuditDone(true);
    }, 2500);
  };

  const totalChecks = mockAuditResults.reduce((acc, r) => acc + r.checks.length, 0);
  const passed = mockAuditResults.reduce(
    (acc, r) => acc + r.checks.filter((c) => c.status === "pass").length,
    0
  );
  const warnings = mockAuditResults.reduce(
    (acc, r) => acc + r.checks.filter((c) => c.status === "warn").length,
    0
  );
  const score = Math.round((passed / totalChecks) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SEO Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor, audit, and optimize your landing page SEO performance
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          {running ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Running Audit...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Run SEO Audit
            </>
          )}
        </button>
      </div>

      {/* Score cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="h-4 w-4" />
            SEO Score
          </div>
          <p className="mt-2 text-3xl font-bold text-green-600">{auditDone ? `${score}%` : "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{auditDone ? `${passed}/${totalChecks} checks passed` : "Run audit to see score"}</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            Avg. Position
          </div>
          <p className="mt-2 text-3xl font-bold">9.9</p>
          <p className="mt-1 text-xs text-green-600">+2.6 from last week</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Eye className="h-4 w-4" />
            Organic Impressions
          </div>
          <p className="mt-2 text-3xl font-bold">12.4K</p>
          <p className="mt-1 text-xs text-green-600">+18% this month</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="h-4 w-4" />
            Indexed Pages
          </div>
          <p className="mt-2 text-3xl font-bold">8</p>
          <p className="mt-1 text-xs text-muted-foreground">All pages indexed</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border bg-muted p-1">
        {[
          { key: "audit" as const, label: "SEO Audit", icon: Shield },
          { key: "keywords" as const, label: "Keyword Tracker", icon: Search },
          { key: "content" as const, label: "AI Content Ideas", icon: Bot },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Audit Tab */}
      {activeTab === "audit" && (
        <div className="space-y-6">
          {!auditDone ? (
            <div className="rounded-xl border bg-card p-12 text-center">
              <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No Audit Results Yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Click &quot;Run SEO Audit&quot; to analyze your landing page&apos;s SEO health
              </p>
            </div>
          ) : (
            mockAuditResults.map((section) => (
              <div key={section.category} className="rounded-xl border bg-card">
                <div className="border-b p-4">
                  <h3 className="font-semibold">{section.category}</h3>
                </div>
                <div className="divide-y">
                  {section.checks.map((check) => (
                    <div key={check.name} className="flex items-start gap-3 p-4">
                      {check.status === "pass" ? (
                        <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                      ) : check.status === "warn" ? (
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{check.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{check.detail}</p>
                        {check.fix && (
                          <p className="mt-1 text-xs text-amber-600">Fix: {check.fix}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Keywords Tab */}
      {activeTab === "keywords" && (
        <div className="rounded-xl border bg-card">
          <div className="border-b p-4">
            <h3 className="font-semibold">Target Keyword Rankings</h3>
            <p className="mt-1 text-xs text-muted-foreground">Updated daily via Google Search Console</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-4 font-medium">Keyword</th>
                  <th className="p-4 font-medium">Position</th>
                  <th className="p-4 font-medium">Change</th>
                  <th className="p-4 font-medium">Volume</th>
                  <th className="p-4 font-medium">URL</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {mockKeywords.map((kw) => (
                  <tr key={kw.keyword} className="hover:bg-muted/50">
                    <td className="p-4 font-medium">{kw.keyword}</td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          kw.position <= 3
                            ? "bg-green-100 text-green-700"
                            : kw.position <= 10
                            ? "bg-blue-100 text-blue-700"
                            : kw.position <= 20
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        #{kw.position}
                      </span>
                    </td>
                    <td className="p-4">
                      {kw.change > 0 ? (
                        <span className="text-green-600">+{kw.change}</span>
                      ) : kw.change < 0 ? (
                        <span className="text-red-600">{kw.change}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-4 text-muted-foreground">{kw.volume.toLocaleString()}/mo</td>
                    <td className="p-4">
                      <a href="#" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        {kw.url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Content Ideas Tab */}
      {activeTab === "content" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              AI-generated content ideas based on trending searches and keyword gaps
            </p>
            <button className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
              <Bot className="h-4 w-4" />
              Generate New Ideas
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mockContentIdeas.map((idea) => (
              <div key={idea.title} className="rounded-xl border bg-card p-5 transition-all hover:shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      idea.type === "pillar"
                        ? "bg-indigo-100 text-indigo-700"
                        : idea.type === "comparison"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {idea.type}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      idea.difficulty === "easy"
                        ? "bg-green-100 text-green-700"
                        : idea.difficulty === "medium"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {idea.difficulty}
                  </span>
                </div>
                <h4 className="text-sm font-semibold leading-snug">{idea.title}</h4>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Search className="h-3 w-3" />
                    {idea.keyword}
                  </span>
                  <span className="flex items-center gap-1">
                    <BarChart3 className="h-3 w-3" />
                    {idea.volume}/mo
                  </span>
                </div>
                <button className="mt-4 w-full rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                  Generate Draft with AI
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Automation Schedule */}
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Automated SEO Tasks</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { task: "SEO Audit", freq: "Daily at 6 AM", status: "active", next: "Tomorrow 6:00 AM" },
            { task: "Keyword Tracking", freq: "Daily at 8 AM", status: "active", next: "Tomorrow 8:00 AM" },
            { task: "Sitemap Refresh", freq: "Weekly (Monday)", status: "active", next: "Next Monday" },
            { task: "Content Ideas", freq: "Weekly (Friday)", status: "active", next: "This Friday" },
          ].map((item) => (
            <div key={item.task} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{item.task}</p>
                <span className="h-2 w-2 rounded-full bg-green-500" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.freq}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Next: {item.next}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
