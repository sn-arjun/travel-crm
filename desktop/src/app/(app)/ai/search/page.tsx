'use client';

import * as React from 'react';
import { Loader2, Search, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { aiApi, type NlQueryResult } from '@/lib/api/ai';

const EXAMPLE_QUERIES = [
  'How many leads did we get this month?',
  'What is our top performing destination?',
  'Show me all overdue follow-ups',
  'Which agent has the highest conversion rate?',
  'Total revenue from Bali trips this quarter',
  'List all leads from website source',
];

export default function SearchPage() {
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<NlQueryResult | null>(null);
  const [history, setHistory] = React.useState<NlQueryResult[]>([]);

  const handleSearch = async (searchQuery?: string) => {
    const q = (searchQuery || query).trim();
    if (!q) {
      toast.error('Please enter a question');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await aiApi.intelligence.nlQuery({ query: q });
      setResult(response.data);
      setHistory((prev) => [response.data, ...prev.slice(0, 9)]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process query';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (q: string) => {
    setQuery(q);
    handleSearch(q);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Natural Language Search</h1>
        <p className="text-muted-foreground mt-1">
          Ask questions about your CRM data in plain English
        </p>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ask anything about your CRM data..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={() => handleSearch()} disabled={loading || !query.trim()} className="gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          {loading && (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin mb-3" />
                  <p className="text-sm">Analyzing your question...</p>
                </div>
              </CardContent>
            </Card>
          )}

          {result && !loading && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Answer</CardTitle>
                <CardDescription>Query: &ldquo;{result.query}&rdquo;</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
                    {result.response}
                  </pre>
                </div>

                {result.data && Object.keys(result.data).length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-3">Data</p>
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/50">
                              <th className="text-left px-4 py-2 font-medium">Key</th>
                              <th className="text-left px-4 py-2 font-medium">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(result.data).map(([key, value]) => (
                              <tr key={key} className="border-t">
                                <td className="px-4 py-2 text-muted-foreground">{key}</td>
                                <td className="px-4 py-2 font-medium">
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {!result && !loading && (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <Search className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">Ask a question to get started</p>
                  <p className="text-xs mt-1">Try one of the example queries on the right</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* History */}
          {history.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Queries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {history.slice(1).map((item, idx) => (
                    <button
                      key={idx}
                      className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setQuery(item.query);
                        setResult(item);
                      }}
                    >
                      <p className="text-sm font-medium truncate">{item.query}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {item.response.slice(0, 100)}...
                      </p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Example Queries */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Example Queries</CardTitle>
            <CardDescription>Click any example to try it</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {EXAMPLE_QUERIES.map((q, idx) => (
                <button
                  key={idx}
                  className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
                  onClick={() => handleExampleClick(q)}
                >
                  <p className="text-sm">{q}</p>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
