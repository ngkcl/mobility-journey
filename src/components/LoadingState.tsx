import { Loader2 } from 'lucide-react';

type LoadingStateProps = {
  label: string;
  className?: string;
};

export default function LoadingState({ label, className }: LoadingStateProps) {
  return (
    <div className={`rounded-2xl border border-slate-800/70 bg-slate-900/70 p-8 text-center text-slate-300 flex flex-col items-center gap-3 ${className ?? ''}`}>
      <Loader2 className="h-5 w-5 animate-spin text-teal-300" />
      <span>{label}</span>
    </div>
  );
}
