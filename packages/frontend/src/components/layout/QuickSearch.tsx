import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, CalendarCheck, UserRound, FileText, ArrowRight, Stethoscope, Receipt, Package } from 'lucide-react';
import { apiClient as api } from '../../lib/api';

interface SearchResultItem { type: string; id: string; label: string; subtitle: string; link: string; }
interface SearchResult {
  patients: { type: string; id: string; label: string; subtitle: string; link: string }[];
  appointments: { type: string; id: string; label: string; subtitle: string; link: string }[];
  employees: { type: string; id: string; label: string; subtitle: string; link: string }[];
  doctors: { type: string; id: string; label: string; subtitle: string; link: string }[];
  invoices: { type: string; id: string; label: string; subtitle: string; link: string }[];
  inventory: { type: string; id: string; label: string; subtitle: string; link: string }[];
}

export default function QuickSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const flatResults = results
    ? [...results.patients, ...results.appointments, ...results.employees, ...results.doctors, ...results.invoices, ...results.inventory]
    : [];

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(null);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!query || query.length < 2) { setResults(null); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get('/search', { params: { q: query } });
        setResults(r.data.data);
        setSelectedIndex(0);
      } catch { setResults(null); }
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback((item: SearchResultItem) => {
    onClose();
    navigate(item.link);
  }, [navigate, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && flatResults[selectedIndex]) { handleSelect(flatResults[selectedIndex]); }
    if (e.key === 'Escape') { onClose(); }
  };

  const typeIcons: Record<string, any> = { patient: Users, appointment: CalendarCheck, employee: UserRound, doctor: Stethoscope, invoice: Receipt, inventory: Package };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search patients, doctors, invoices, inventory..."
              className="flex-1 bg-transparent border-none outline-none text-sm placeholder-gray-400 dark:text-gray-200"
            />
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">ESC</span>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && <p className="text-center text-sm text-gray-400 py-4">Searching...</p>}

            {!loading && query.length >= 2 && flatResults.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">No results for "{query}"</p>
            )}

            {results?.patients.map((item, i) => (
              <SearchItem key={item.id} item={item} icon={Users} selected={selectedIndex === i} onSelect={() => handleSelect(item)} />
            ))}
            {results?.appointments.map((item, i) => (
              <SearchItem key={item.id} item={item} icon={CalendarCheck} selected={selectedIndex === i + (results?.patients?.length || 0)} onSelect={() => handleSelect(item)} />
            ))}
            {results?.employees.map((item, i) => (
              <SearchItem key={item.id} item={item} icon={UserRound} selected={selectedIndex === i + (results?.patients?.length || 0) + (results?.appointments?.length || 0)} onSelect={() => handleSelect(item)} />
            ))}
            {results?.doctors.map((item, i) => (
              <SearchItem key={item.id} item={item} icon={Stethoscope} selected={selectedIndex === i + (results?.patients?.length || 0) + (results?.appointments?.length || 0) + (results?.employees?.length || 0)} onSelect={() => handleSelect(item)} />
            ))}
            {results?.invoices.map((item, i) => (
              <SearchItem key={item.id} item={item} icon={Receipt} selected={selectedIndex === i + (results?.patients?.length || 0) + (results?.appointments?.length || 0) + (results?.employees?.length || 0) + (results?.doctors?.length || 0)} onSelect={() => handleSelect(item)} />
            ))}
            {results?.inventory.map((item, i) => (
              <SearchItem key={item.id} item={item} icon={Package} selected={selectedIndex === i + (results?.patients?.length || 0) + (results?.appointments?.length || 0) + (results?.employees?.length || 0) + (results?.doctors?.length || 0) + (results?.invoices?.length || 0)} onSelect={() => handleSelect(item)} />
            ))}
          </div>

          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex gap-4 text-xs text-gray-400">
            <span>↑↓ Navigate</span>
            <span>↵ Open</span>
            <span>ESC Close</span>
          </div>
        </div>
      </div>
    </>
  );
}

function SearchItem({ item, icon: Icon, selected, onSelect }: { item: SearchResultItem; icon: typeof Search; selected: boolean; onSelect: () => void }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${selected ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
      onClick={onSelect}
    >
      <Icon className="w-4 h-4 text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate dark:text-gray-200">{item.label}</p>
        <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
      </div>
      <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
    </div>
  );
}
